const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

function createSubgoalsWidgetServer(bot, defaultPort = 8091) {
    let server = null;
    let port = 0;
    let wss = null;

    const resolvePort = () => {
        const storedPort = bot?.getConfig?.()?.subgoalsWidgetPort;
        const parsed = parseInt(storedPort, 10);
        if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
            return parsed;
        }
        if (bot?.updateConfig) bot.updateConfig({ subgoalsWidgetPort: defaultPort });
        return defaultPort;
    };

    const handleRequest = (req, res) => {
        if (req.url === '/widget/subgoals') {
            const filePath = path.join(__dirname, '..', 'widgets', 'subgoals_widget.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error loading widget file');
                }

                const config = bot.getWidgetConfig('subgoals') || {};
                const customCSS = config.customCSS || '';

                let content = data.replace('/* __CUSTOM_CSS__ */', customCSS);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            });
        } else if (req.url === '/widget/subgoals-list') {
            const filePath = path.join(__dirname, '..', 'widgets', 'subgoals_list_widget.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error loading widget file');
                }

                const config = bot.getWidgetConfig('subgoals-list') || {};
                const customCSS = config.customCSS || '';

                let content = data.replace('/* __CUSTOM_CSS__ */', customCSS);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            });
        } else {
            res.statusCode = 404;
            res.end('Widget Not Found');
        }
    };

    const start = () => {
        const portInitial = resolvePort();
        server = http.createServer(handleRequest).listen(portInitial, () => {
            port = server.address().port;
            if (port !== portInitial) {
                bot.updateConfig({ subgoalsWidgetPort: port });
            }

            console.log(`Subgoals Widget Server running on port ${port}`);

            wss = new WebSocket.Server({ server });

            wss.on('connection', (ws) => {
                const subgoalsConfig = bot.getWidgetConfig('subgoals');
                if (subgoalsConfig) {
                    ws.send(JSON.stringify({
                        type: 'config-update',
                        widget: 'subgoals',
                        config: subgoalsConfig
                    }));
                }
                const subgoalsListConfig = bot.getWidgetConfig('subgoals-list');
                if (subgoalsListConfig) {
                    ws.send(JSON.stringify({
                        type: 'config-update',
                        widget: 'subgoals-list',
                        config: subgoalsListConfig
                    }));
                }
            });
        }).on('error', (err) => {
            console.error(`[SUBGOALS SERVER ERROR] ${err.message}`);
        });
    };

    const broadcastSubUpdate = (count) => {
        if (wss && wss.clients) {
            const payload = JSON.stringify({ type: 'sub-update', count });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            });
        }
    };

    const broadcastConfig = (config, widgetType = 'subgoals') => {
        if (wss && wss.clients) {
            const payload = JSON.stringify({ type: 'config-update', widget: widgetType, config });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            });
        }
    };

    const broadcast = (data) => {
        if (wss && wss.clients) {
            const payload = JSON.stringify(data);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            });
        }
    };

    const stop = () => {
        if (server) server.close();
        if (wss) wss.close();
    };

    const getUrl = (localIp) => `http://${localIp}:${port}/widget/subgoals`;

    return { start, stop, getPort: () => port, broadcastSubUpdate, broadcastConfig, broadcast, getUrl };
}

module.exports = { createSubgoalsWidgetServer };
