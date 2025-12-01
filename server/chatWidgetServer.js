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
            const filePath = path.join(__dirname, '..', 'widgets', 'chat_widget.html');
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
        } else if (req.url === '/widget/emote-wall') {
            const filePath = path.join(__dirname, '..', 'widgets', 'emote_wall_widget.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error loading widget file');
                }

                const cfg = bot.getConfig ? bot.getConfig() : {};
                const clientId = process.env.TWITCH_CLIENT_ID || cfg.twitchClientId || '';
                const appToken = process.env.TWITCH_APP_TOKEN || cfg.twitchAppToken || '';

                const emoteWallConfig = bot.getWidgetConfig('emote-wall') || {};
                const animationDuration = emoteWallConfig.animationDuration || 5000;
                const spawnInterval = emoteWallConfig.spawnInterval || 100;
                const minSize = emoteWallConfig.minSize || 32;
                const maxSize = emoteWallConfig.maxSize || 96;

                let content = data.replace('__TWITCH_CLIENT_ID__', clientId);
                content = content.replace('__TWITCH_APP_TOKEN__', appToken);
                content = content.replace('const ANIMATION_DURATION = 5000;', `const ANIMATION_DURATION = ${animationDuration};`);
                content = content.replace('const SPAWN_INTERVAL = 100;', `const SPAWN_INTERVAL = ${spawnInterval};`);
                content = content.replace('const MIN_SIZE = 32;', `const MIN_SIZE = ${minSize};`);
                content = content.replace('const MAX_SIZE = 96;', `const MAX_SIZE = ${maxSize};`);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            });
        } else if (req.url.startsWith('/widget/assets/')) {
            const assetName = req.url.replace('/widget/assets/', '');
            const assetPath = path.join(__dirname, '..', 'widgets', 'assets', assetName);


            if (!assetPath.startsWith(path.join(__dirname, '..', 'widgets', 'assets'))) {
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
                    '.svg': 'image/svg+xml'
                };

                res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
                res.end(data);
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

    const getUrl = (localIp, widgetType = 'chat') => `http://${localIp}:${port}/widget/${widgetType}`;

    return { start, stop, getPort: () => port, broadcastChat, broadcastConfig, getUrl };
}

module.exports = { createChatWidgetServer };
