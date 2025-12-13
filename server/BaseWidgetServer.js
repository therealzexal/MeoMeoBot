const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

class BaseWidgetServer {
    constructor(bot, defaultPort, widgetName) {
        this.bot = bot;
        this.defaultPort = defaultPort;
        this.widgetName = widgetName;
        this.server = null;
        this.wss = null;
        this.port = 0;
        this.connections = new Set();
        this.configKey = `${widgetName}WidgetPort`;
    }

    start(onPortChanged) {
        if (this.server) return;

        this.port = this.resolvePort();
        this.server = http.createServer(this.handleRequest.bind(this));

        this.server.listen(this.port, () => {
            console.log(`[${this.widgetName.toUpperCase()}] Widget Server running on port ${this.port}`);
            this.initWebSocket();
            if (onPortChanged) onPortChanged();
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[${this.widgetName.toUpperCase()}] Port ${this.port} in use, trying random...`);
                this.port = 0;
                this.server.listen(0);
            } else {
                console.error(`[${this.widgetName.toUpperCase()}] Server error:`, err);
            }
        });
    }

    resolvePort() {
        return this.defaultPort;
    }

    getPort() {
        return this.port;
    }


    handleRequest(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.url.startsWith('/widget/assets/')) {
            return this.serveAsset(req, res);
        }

        if (req.url === `/widget/${this.widgetName}`) {
            return this.serveWidgetHtml(req, res);
        }


        if (req.url.startsWith('/local-file')) {
            return this.serveLocalFile(req, res);
        }

        if (this.handleCustomRoutes(req, res)) return;

        res.statusCode = 404;
        res.end('Not Found');
    }

    serveAsset(req, res) {
        const assetName = req.url.replace('/widget/assets/', '');
        const safeName = path.normalize(assetName).replace(/^(\.\.[\/\\])+/, '');
        const assetPath = path.join(__dirname, '..', 'widgets', 'assets', safeName);

        fs.readFile(assetPath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                return res.end('Asset Not Found');
            }

            const ext = path.extname(assetPath).toLowerCase();
            const mimeTypes = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav', '.ogg': 'audio/ogg'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(data);
        });
    }

    serveLocalFile(req, res) {
        const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
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
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webm': 'video/webm',
                    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
                };
                res.writeHead(200, {
                    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(data);
            });
        });
    }

    serveWidgetHtml(req, res) {
        const filePath = path.join(__dirname, '..', 'widgets', `${this.widgetName.replace('-', '_')}_widget.html`);
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.statusCode = 500;
                return res.end('Error loading widget file');
            }

            const content = this.transformHtml(data);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    }

    transformHtml(html) {
        return html;
    }

    handleCustomRoutes(req, res) {
        return false;
    }

    initWebSocket() {
        this.wss = new WebSocket.Server({ server: this.server });
        this.wss.on('connection', (ws) => {
            this.connections.add(ws);
            this.onConnection(ws);

            ws.on('close', () => {
                this.connections.delete(ws);
            });
        });
    }

    onConnection(ws) {

    }

    broadcast(data) {
        if (!this.wss) return;
        this.connections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }

    stop() {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    getUrl(localIp, widgetType) {
        
        
        const name = widgetType || this.widgetName;
        return `http://${localIp}:${this.port}/widget/${name}`;
    }
}

module.exports = BaseWidgetServer;
