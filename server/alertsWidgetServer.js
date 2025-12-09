const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

function createAlertsWidgetServer(bot, defaultPort = 8093) {
    let server = null;
    let port = 0;
    let wss = null;
    let alertQueue = [];
    let isPlaying = false;

    const resolvePort = () => {
        const storedPort = bot?.getConfig?.()?.alertsWidgetPort;
        const parsed = parseInt(storedPort, 10);
        if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
            return parsed;
        }
        if (bot?.updateConfig) bot.updateConfig({ alertsWidgetPort: defaultPort });
        return defaultPort;
    };

    const handleRequest = (req, res) => {
        if (req.url === '/widget/alerts') {
            const filePath = path.join(__dirname, '..', 'widgets', 'alerts_widget.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error loading widget file');
                }
                const config = bot.getWidgetConfig('alerts') || {};
                const customCSS = config.customCSS || '';
                const content = data.replace('/* __CUSTOM_CSS__ */', customCSS);

                res.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                });
                res.end(content);
            });
        } else if (req.url.startsWith('/widget/assets/')) {
            const assetName = req.url.replace('/widget/assets/', '');
            const assetPath = path.join(__dirname, '..', 'widgets', 'assets', assetName);

            if (!path.resolve(assetPath).startsWith(path.resolve(path.join(__dirname, '..', 'widgets', 'assets')))) {
                res.statusCode = 403;
                return res.end('Forbidden');
            }

            fs.readFile(assetPath, (err, data) => {
                if (err) {
                    res.statusCode = 404;
                    return res.end('Asset Not Found');
                }
                const ext = path.extname(assetPath).toLowerCase();
                const mimeTypes = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.webm': 'video/webm',
                    '.mp3': 'audio/mpeg',
                    '.wav': 'audio/wav',
                    '.ogg': 'audio/ogg'
                };
                res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
                res.end(data);
            });
        } else if (req.url.startsWith('/local-file')) {
            const url = new URL(req.url, `http://127.0.0.1:${port}`);
            const filePath = url.searchParams.get('path');

            if (!filePath) {
                res.statusCode = 400;
                return res.end('No path specified');
            }

            
            fs.stat(filePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    res.statusCode = 404;
                    return res.end('File not found');
                }

                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end('Error reading file');
                    }
                    const ext = path.extname(filePath).toLowerCase();
                    const mimeTypes = {
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif',
                        '.svg': 'image/svg+xml',
                        '.webm': 'video/webm',
                        '.mp3': 'audio/mpeg',
                        '.wav': 'audio/wav',
                        '.ogg': 'audio/ogg'
                    };
                    res.writeHead(200, {
                        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(data);
                });
            });
        } else {
            res.statusCode = 404;
            res.end('Widget Not Found');
        }
    };

    const processQueue = () => {
        if (isPlaying || alertQueue.length === 0) return;

        const nextAlert = alertQueue.shift();
        isPlaying = true;

        console.log(`[ALERTS] Broadcasting alert: ${nextAlert.type}`);
        broadcast({ type: 'alert', alert: nextAlert });
    };

    const addToQueue = (alertData) => {
        console.log(`[ALERTS] Added to queue: ${alertData.type}`);
        alertQueue.push(alertData);
        processQueue();
    };

    const skipCurrent = () => {
        broadcast({ type: 'skip' });
        isPlaying = false;
        processQueue();
    };

    const broadcast = (data) => {
        if (wss && wss.clients) {
            const payload = JSON.stringify(data);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            });
        }
    };

    const start = (onPortChanged) => {
        const portInitial = resolvePort();
        const onListening = () => {
            port = server.address().port;
            if (port !== portInitial) {
                bot.updateConfig({ alertsWidgetPort: port });
            }

            console.log(`Alerts Widget Server running on port ${port}`);

            if (onPortChanged && typeof onPortChanged === 'function') {
                onPortChanged(port);
            }

            wss = new WebSocket.Server({ server });

            wss.on('connection', (ws) => {
                console.log('[ALERTS] Client connected');

                const config = bot.getWidgetConfig('alerts');
                if (config) {
                    ws.send(JSON.stringify({ type: 'config-update', config }));
                }

                ws.on('message', (message) => {
                    try {
                        const data = JSON.parse(message);
                        if (data.type === 'alert-finished') {
                            console.log('[ALERTS] Alert finished');
                            isPlaying = false;
                            processQueue();
                        }
                    } catch (e) {
                        console.error('[ALERTS] Error parsing message:', e);
                    }
                });
            });
        };

        server = http.createServer(handleRequest);
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[ALERTS] Port ${portInitial} in use, trying random port...`);
                server = http.createServer(handleRequest);
                server.listen(0, onListening);
            } else {
                console.error(`[ALERTS SERVER ERROR] ${err.message}`);
            }
        });

        server.listen(portInitial, onListening);
    };

    const stop = () => {
        if (server) server.close();
        if (wss) wss.close();
    };

    const getUrl = (localIp) => `http://${localIp}:${port}/widget/alerts`;

    return { start, stop, getPort: () => port, addToQueue, skipCurrent, broadcast, getUrl };
}

module.exports = { createAlertsWidgetServer };
