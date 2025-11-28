require('dotenv').config();
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const TwitchBot = require('./bot.js');
const ffmpeg = require('fluent-ffmpeg');
const http = require('http');
const ip = require('ip');
const mdns = require('mdns-js');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const { autoUpdater } = require('electron-updater');
const WebSocket = require('ws');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
if (app.isPackaged) {
  ffmpeg.setFfmpegPath(path.join(process.resourcesPath, 'ffmpeg.exe'));
  ffmpeg.setFfprobePath(path.join(process.resourcesPath, 'ffprobe.exe'));
} else {
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
}

const UPDATE_CHECK_INTERVAL = 900000;
const DEFAULT_WIDGET_PORT = 8087;

let mainWindow;
let cssEditorWindow = null;
let bot;
let mediaServer;
let widgetServer;
let widgetServerPort = 0;
let wss;
let currentlyPlayingPath = null;
let updateCheckTimer = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'MeoMeoBot Control Panel',
        minWidth: 1000,
        minHeight: 700
    });
    Menu.setApplicationMenu(null);
    mainWindow.loadFile('index.html');
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
    bot = new TwitchBot();
    setupBotEvents();
    autoConnectBot();
}

function openCssEditorWindow(widgetName = 'chat') {
    if (cssEditorWindow) {
        cssEditorWindow.focus();
        cssEditorWindow.webContents.send('load-css-editor', { widgetName });
        return;
    }

    cssEditorWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Editeur CSS Widget',
        parent: mainWindow,
        modal: true,
        show: false,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    cssEditorWindow.loadFile('css_editor.html');
    cssEditorWindow.setMenu(null);

    cssEditorWindow.on('ready-to-show', () => {
        cssEditorWindow.show();
        cssEditorWindow.webContents.send('load-css-editor', { widgetName });
    });

    cssEditorWindow.on('closed', () => {
        cssEditorWindow = null;
    });
}
ipcMain.handle('open-css-editor', (event, widgetName) => openCssEditorWindow(widgetName));

app.whenReady().then(() => {
    createWindow();
    startMediaServer();
    startWidgetServer();
    mainWindow.webContents.on('did-finish-load', () => {
        if (app.isPackaged) {
            autoUpdater.checkForUpdates();
            startUpdateCheckLoop();
        } else {
            mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
        }
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    if (mediaServer) mediaServer.close();
    if (widgetServer) widgetServer.close();
    if (updateCheckTimer) clearInterval(updateCheckTimer);
});

ipcMain.on('window-control', (event, action) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;
    switch (action) {
        case 'minimize': window.minimize(); break;
        case 'maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); break;
        case 'close': window.close(); break;
    }
});

function startUpdateCheckLoop() {
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
        if (app.isPackaged) {
            console.log('[AUTO-UPDATER] Vérification des mises à jour (15 min)...');
            autoUpdater.checkForUpdates();
        }
    }, UPDATE_CHECK_INTERVAL);
}

autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-status-check', { status: 'checking' });
});

autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
    if (updateCheckTimer) clearInterval(updateCheckTimer);
});

autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
});

autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
});

autoUpdater.on('error', (err) => {
    console.error(`[AUTO-UPDATER ERROR] Erreur de mise à jour: ${err}`);
    mainWindow.webContents.send('update-status-check', { status: 'error' });
});

ipcMain.on('start-download', () => {
    autoUpdater.downloadUpdate();
    mainWindow.webContents.send('update-status-check', { status: 'downloading' });
});

ipcMain.on('quit-and-install', () => {
    autoUpdater.quitAndInstall();
});

function autoConnectBot() {
    const config = bot.getConfig();
    if (bot && config.channel && config.username && config.token) {
        setTimeout(() => bot.connect(), 1000);
    }
}

function setupBotEvents() {
    if (!bot) return;

    const safeSend = (channel, data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    };

    bot.onConnected = () => safeSend('bot-status', { connected: true, channel: bot.getConfig().channel });
    bot.onDisconnected = () => safeSend('bot-status', { connected: false });
    bot.onParticipantsUpdated = () => safeSend('participants-updated');
    bot.onParticipantAdded = (username) => safeSend('participant-added', { username });

    bot.onChatMessage = (messageData) => {
        sendChatToWidgets(messageData);
    };
}

app.on('window-all-closed', () => {
    if (bot) bot.disconnect();
    if (process.platform !== 'darwin') app.quit();
});

function sendChatToWidgets(messageData) {
    if (wss && wss.clients) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageData));
            }
        });
    }
}

function startMediaServer() {
    mediaServer = http.createServer((req, res) => {
        if (req.url === '/media' && currentlyPlayingPath) {
            const videoPath = currentlyPlayingPath;
            try {
                ffmpeg(videoPath)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .format('mp4')
                    .addOutputOptions([
                        '-preset ultrafast',
                        '-tune zerolatency',
                        '-movflags frag_keyframe+empty_moov',
                        '-b:v 500k'
                    ])
                    .on('error', (err) => {
                        console.error(`[FFMPEG STREAM ERROR] Échec du transcodage: ${err.message}`);
                        if (!res.headersSent) res.end();
                    })
                    .pipe(res, { end: true });
            } catch (e) {
                console.error(`[MEDIA SERVER ERROR] Erreur lors de la mise en place du stream: ${e.message}`);
                if (!res.headersSent) res.writeHead(404);
                res.end();
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    }).listen(0, () => {});
}

function resolveWidgetPort() {
    const storedPort = bot?.getConfig?.()?.widgetPort;
    const parsed = parseInt(storedPort, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
        return parsed;
    }
    console.warn(`[WIDGET PORT] Port invalide ou manquant (${storedPort}). Utilisation du port ${DEFAULT_WIDGET_PORT}.`);
    if (bot?.updateConfig) bot.updateConfig({ widgetPort: DEFAULT_WIDGET_PORT });
    return DEFAULT_WIDGET_PORT;
}

function startWidgetServer() {
    const portInitial = resolveWidgetPort();

    widgetServer = http.createServer((req, res) => {
        if (req.url === '/widget/chat') {
            const filePath = path.join(__dirname, 'chat_widget.html');
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
    }).listen(portInitial, () => {
        widgetServerPort = widgetServer.address().port;
        console.log(`Serveur Widget HTTP démarré sur port: ${widgetServerPort}`);

        if (widgetServerPort !== portInitial) {
            console.warn(`ATTENTION: Le port ${portInitial} était occupé. Le serveur utilise le port ${widgetServerPort}.`);
            bot.updateConfig({ widgetPort: widgetServerPort });
        }

        wss = new WebSocket.Server({ server: widgetServer });

        wss.on('connection', (ws) => {
            console.log('Nouveau client Widget connecté.');
            const chatConfig = bot.getWidgetConfig('chat');
            if (chatConfig) {
                ws.send(JSON.stringify({
                    type: 'config-update',
                    widget: 'chat',
                    config: chatConfig
                }));
            }
            ws.on('close', () => console.log('Client Widget déconnecté.'));
        });
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[WIDGET SERVER ERROR] Le port ${portInitial} est déjà utilisé. Changez 'widgetPort' ou libérez le port.`);
        } else {
            console.error(`[WIDGET SERVER ERROR] ${err.message}`);
        }
    });
}

ipcMain.handle('get-widget-config', (event, widgetName) => {
    return bot.getWidgetConfig(widgetName);
});
ipcMain.handle('save-widget-config', (event, widgetName, config) => {
    bot.saveWidgetConfig(widgetName, config);
    if (wss && wss.clients) {
        const payload = JSON.stringify({ type: 'config-update', widget: widgetName, config });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
    return { success: true };
});

ipcMain.handle('get-widget-url', async () => {
    const localIp = ip.address();
    return `http://${localIp}:${widgetServerPort}/widget/chat`;
});

ipcMain.handle('discover-devices', async () => {
    mainWindow.webContents.send('device-discovery-status', 'Recherche en cours...');
    const browser = mdns.createBrowser(mdns.tcp('googlecast'));
    const devices = [];
    browser.on('ready', () => browser.discover());
    browser.on('update', (service) => {
        if (service.fullname && !devices.some(d => d.host === service.host)) {
            devices.push({ name: service.fullname.replace('._googlecast._tcp.local', ''), host: service.host, port: service.port });
            mainWindow.webContents.send('cast-devices-found', devices);
        }
    });
    setTimeout(() => {
        try { browser.stop(); } catch(e) {}
        mainWindow.webContents.send('device-discovery-status', 'Recherche terminée.');
    }, 10000);
    return true;
});

ipcMain.handle('play-on-device', (event, { deviceHost, devicePort, videoPath }) => {
    currentlyPlayingPath = videoPath;
    const serverPort = mediaServer.address().port;
    const localIp = ip.address();
    const videoUrl = `http://${localIp}:${serverPort}/media`;

    const client = new Client();
    client.connect({ host: deviceHost, port: devicePort }, (err) => {
        if (err) {
            mainWindow.webContents.send('cast-status', { success: false, message: 'Impossible de se connecter à l\'appareil.' });
            return;
        }
        client.launch(DefaultMediaReceiver, (err, player) => {
            if (err) {
                mainWindow.webContents.send('cast-status', { success: false, message: 'Impossible de lancer le lecteur.' });
                client.close();
                return;
            }
            const media = { contentId: videoUrl, contentType: 'video/mp4', streamType: 'BUFFERED' };
            player.load(media, { autoplay: true }, (err) => {
                client.close();
                if (err) {
                    mainWindow.webContents.send('cast-status', { success: false, message: 'Impossible de charger la vidéo.' });
                } else {
                    mainWindow.webContents.send('cast-status', { success: true, message: 'Lecture démarrée.' });
                }
            });
        });
    });
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('get-videos', async (event, folderPath) => {
    if (!folderPath) return [];
    const validExtensions = ['.webp', '.mov', '.avi', '.mp4'];
    try {
        const files = await fs.promises.readdir(folderPath);
        const videos = files.filter(file => validExtensions.includes(path.extname(file).toLowerCase()));
        const cachePath = path.join(app.getPath('userData'), 'thumbnail_cache');
        if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath);

        const videoDataPromises = videos.map(async (videoFile) => {
            const fullVideoPath = path.join(folderPath, videoFile);
            const thumbnailFileName = `${path.basename(videoFile, path.extname(videoFile))}.png`;
            const thumbnailPath = path.join(cachePath, thumbnailFileName);

            let thumbnailData = null;

            if (!fs.existsSync(thumbnailPath)) {
                try {
                    await new Promise((resolve) => {
                        ffmpeg(fullVideoPath)
                            .on('end', resolve)
                            .on('error', (err) => {
                                console.error("\x1b[33m%s\x1B[0m", `[AVERTISSEMENT MINIATURE] échec pour ${videoFile}: ${err.message}. Utilisation d'un placeholder.`);
                                resolve();
                            })
                            .screenshots({ timestamps: ['1%'], filename: thumbnailFileName, folder: cachePath, size: '320x180' });
                    });
                } catch (e) {
                    console.error("\x1b[33m%s\x1b[0m", `[AVERTISSEMENT MINIATURE MAJEUR] échec total de la tentative pour ${videoFile}.`);
                }
            }

            if (fs.existsSync(thumbnailPath)) {
                try {
                    thumbnailData = await fs.promises.readFile(thumbnailPath, 'base64');
                } catch (e) {
                    thumbnailData = null;
                }
            }

            const placeholderSvgBase64 = 'PHN2ZyB3aWR0aD0zMjAiIGhlaWdodD0xODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjI0cHgiIGZpbGw9IiNmZmYiPlYgSUQnIEhBUyBUX0gVTlRTVlJPIFNWIi8+PC9zdmc+';

            const finalThumbnailData = thumbnailData
                ? `data:image/png;base64,${thumbnailData}`
                : `data:image/svg+xml;base64,${placeholderSvgBase64}`;

            return { fileName: videoFile, videoPath: fullVideoPath, thumbnailData: finalThumbnailData };
        });

        const results = await Promise.allSettled(videoDataPromises);
        const successfulVideos = [];
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                successfulVideos.push(result.value);
            } else if (result.status === 'rejected') {
                console.error("\x1b[31m%s\x1b[0m", `[ERREUR MINIATURE] ${result.reason}`);
            }
        });
        return successfulVideos;

    } catch (error) {
        console.error("\x1b[31m%s\x1b[0m", "[ERREUR MAJEURE] dans get-videos:", error);
        return { error: error.message };
    }
});

ipcMain.handle('connect-bot', async () => { try { await bot.connect(); return { success: true }; } catch (error) { return { success: false, error: error.message }; } });
ipcMain.handle('disconnect-bot', async () => { bot.disconnect(); return { success: true }; });
ipcMain.handle('get-config', () => bot.getConfig());
ipcMain.handle('update-config', (event, newConfig) => {
    bot.updateConfig(newConfig);
    if (newConfig.clipCooldown !== undefined) {
        bot.setClipCooldown(newConfig.clipCooldown);
    }
    if (newConfig.channel || newConfig.username || newConfig.token) {
        setTimeout(() => bot.connect(), 500);
    }
    return { success: true };
});
ipcMain.handle('get-commands', () => ({ commands: bot.getCommands() }));
ipcMain.handle('add-command', (event, command, response) => { bot.addCommand(command, response); return { success: true }; });
ipcMain.handle('remove-command', (event, command) => { bot.removeCommand(command); return { success: true }; });
ipcMain.handle('start-giveaway', () => { bot.startGiveaway(); return { success: true }; });
ipcMain.handle('stop-giveaway', () => { bot.stopGiveaway(); return { success: true }; });
ipcMain.handle('draw-winner', () => { const winner = bot.drawWinner(); return { success: true, winner }; });
ipcMain.handle('clear-participants', () => { bot.clearParticipants(); return { success: true }; });
ipcMain.handle('get-participants-count', () => ({ count: bot.getParticipantsCount(), participants: bot.getParticipants() }));
ipcMain.handle('get-banned-words', () => ({ bannedWords: bot.getBannedWords() }));
ipcMain.handle('add-banned-word', (event, word) => { const bannedWords = bot.addBannedWord(word); return { success: true, bannedWords }; });
ipcMain.handle('remove-banned-word', (event, word) => { const bannedWords = bot.removeBannedWord(word); return { success: true, bannedWords }; });
ipcMain.handle('clear-banned-words', async () => { if (bot) { bot.clearBannedWords(); return { success: true }; } return { success: false }; });