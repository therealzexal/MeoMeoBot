const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

function createChatWidgetServer(bot, defaultPort = 8087) {
    let server = null;
    let port = 0;
    let wss = null;

    const resolvePort = () => {
        const storedPort = bot?.getConfig?.()?.widgetPort;
        const parsed = parseInt(storedPort, 10);
        if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
            return parsed;
        }
        if (bot?.updateConfig) bot.updateConfig({ widgetPort: defaultPort });
        return defaultPort;
    };

    const handleRequest = (req, res) => {
        if (req.url === '/widget/chat') {
            const filePath = path.join(__dirname, '..', 'chat_widget.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error loading widget file');
                }

                const chatConfig = bot.getWidgetConfig('chat');
                const customCSS = chatConfig.customCSS || '';
                const maxMessages = chatConfig.maxMessages || 10;
                const badgePrefs = chatConfig.badgePrefs || {
                    moderator: true, vip: true, subscriber: true,
                    founder: true, partner: true, staff: true, premium: true
                };

                let content = data.replace('/* CUSTOM_CSS_PLACEHOLDER */', customCSS);
                content = content.replace('const MAX_MESSAGES = 10;', `const MAX_MESSAGES = ${maxMessages};`);
                content = content.replace('const BADGE_PREFS = {};', `const BADGE_PREFS = ${JSON.stringify(badgePrefs)};`);

                const cfg = bot.getConfig ? bot.getConfig() : {};
                const clientId = process.env.TWITCH_CLIENT_ID || cfg.twitchClientId || '';
                const appToken = process.env.TWITCH_APP_TOKEN || cfg.twitchAppToken || '';
                content = content.replace('__TWITCH_CLIENT_ID__', clientId);
                content = content.replace('__TWITCH_APP_TOKEN__', appToken);

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
                bot.updateConfig({ widgetPort: port });
            }

            wss = new WebSocket.Server({ server });

            wss.on('connection', (ws) => {
                const chatConfig = bot.getWidgetConfig('chat');
                if (chatConfig) {
                    ws.send(JSON.stringify({
                        type: 'config-update',
                        widget: 'chat',
                        config: chatConfig
                    }));
                }
            });
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[WIDGET SERVER ERROR] Le port ${portInitial} est déjà utilisé. Changez 'widgetPort' ou libérez le port.`);
            } else {
                console.error(`[WIDGET SERVER ERROR] ${err.message}`);
            }
        });
    };

    const broadcastChat = (messageData) => {
        if (wss && wss.clients) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(messageData));
                }
            });
        }
    };

    const broadcastConfig = (config) => {
        if (wss && wss.clients) {
            const payload = JSON.stringify({ type: 'config-update', widget: 'chat', config });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            });
        }
    };

    const stop = () => {
        if (server) server.close();
        if (wss) wss.close();
    };

    const getUrl = (localIp) => `http://${localIp}:${port}/widget/chat`;

    return { start, stop, getPort: () => port, broadcastChat, broadcastConfig, getUrl };
}

module.exports = { createChatWidgetServer };
