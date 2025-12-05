require('dotenv').config();
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const TwitchBot = require('./bot.js');
const ffmpeg = require('fluent-ffmpeg');
const http = require('http');
const os = require('os');
const { Bonjour } = require('bonjour-service');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const { autoUpdater } = require('electron-updater');
const WebSocket = require('ws');
const { createChatWidgetServer } = require('./server/chatWidgetServer');

const { createSpotifyWidgetServer } = require('./server/spotifyWidgetServer');
const { createSubgoalsWidgetServer } = require('./server/subgoalsWidgetServer');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
if (app.isPackaged) {
    ffmpeg.setFfmpegPath(path.join(process.resourcesPath, 'ffmpeg.exe'));
    ffmpeg.setFfprobePath(path.join(process.resourcesPath, 'ffprobe.exe'));
} else {
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);
}

const UPDATE_CHECK_INTERVAL = 800000;
const DEFAULT_WIDGET_PORT = 8087;
const DEFAULT_SPOTIFY_WIDGET_PORT = 8090;
const DEFAULT_SUBGOALS_WIDGET_PORT = 8091;

let mainWindow;
let cssEditorWindow = null;
let bot;
let mediaServer;
let chatServer;
let spotifyServer;
let subgoalsServer;
let currentlyPlayingPath = null;
let updateCheckTimer = null;
let bonjourInstance = null;

async function reloadThemeContent() {
    const widgets = ['chat', 'spotify', 'subgoals', 'emote-wall'];
    const userThemesDir = path.join(app.getPath('userData'), 'themes');
    const builtInThemesDir = app.isPackaged
        ? path.join(app.getAppPath(), 'widgets/themes')
        : path.join(__dirname, 'widgets/themes');

    for (const widget of widgets) {
        const config = bot.getWidgetConfig(widget);
        if (config && config.currentTheme) {
            const filename = config.currentTheme;
            let themeContent = '';

            // Try user theme first
            const userThemePath = path.join(userThemesDir, filename);
            if (fs.existsSync(userThemePath)) {
                themeContent = await fs.promises.readFile(userThemePath, 'utf8');
            } else {
                // Try built-in theme
                const builtInThemePath = path.join(builtInThemesDir, filename);
                if (fs.existsSync(builtInThemePath)) {
                    themeContent = await fs.promises.readFile(builtInThemePath, 'utf8');
                }
            }

            if (themeContent) {
                config.customCSS = themeContent;
                bot.saveWidgetConfig(widget, config);
                console.log(`[THEME] Reloaded content for ${widget} from ${filename}`);
            }
        }
    }
}

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

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
    // bot initialized in app.whenReady
    setupBotEvents();
    autoConnectBot();
}

function openCssEditorWindow(widgetName = 'chat') {
    if (cssEditorWindow) {
        cssEditorWindow.focus();
        cssEditorWindow.webContents.send('load-css-editor', { widgetName });
        return;
    }

    const config = bot.getConfig ? bot.getConfig() : {};
    const bounds = config.cssEditorBounds || { width: 900, height: 720 };

    cssEditorWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        title: 'Editeur CSS Widget',
        parent: mainWindow,
        modal: false,
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

    cssEditorWindow.on('close', () => {
        if (bot.updateConfig) {
            const bounds = cssEditorWindow.getBounds();
            bot.updateConfig({ cssEditorBounds: bounds });
        }
    });

    cssEditorWindow.on('closed', () => {
        cssEditorWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
ipcMain.handle('open-css-editor', (event, widgetName) => openCssEditorWindow(widgetName));

let subgoalsConfigWindow = null;
function openSubgoalsConfigWindow() {
    if (subgoalsConfigWindow) {
        subgoalsConfigWindow.focus();
        return;
    }

    subgoalsConfigWindow = new BrowserWindow({
        width: 900,
        height: 600,
        title: 'Configuration Subgoals',
        parent: mainWindow,
        modal: false,
        show: false,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    subgoalsConfigWindow.loadFile('subgoals_config.html');
    subgoalsConfigWindow.setMenu(null);

    subgoalsConfigWindow.on('ready-to-show', () => {
        subgoalsConfigWindow.show();
    });

    subgoalsConfigWindow.on('closed', () => {
        subgoalsConfigWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

ipcMain.handle('open-subgoals-config', () => openSubgoalsConfigWindow());

ipcMain.handle('resize-css-editor', (event, widthDelta) => {
    if (cssEditorWindow) {
        const bounds = cssEditorWindow.getBounds();
        const newWidth = bounds.width + widthDelta;
        const newX = bounds.x - Math.floor(widthDelta / 2);
        cssEditorWindow.setBounds({
            x: newX,
            y: bounds.y,
            width: newWidth,
            height: bounds.height
        });
    }
});

app.whenReady().then(async () => {
    bot = new TwitchBot();
    try {
        await reloadThemeContent();
    } catch (e) {
        console.error('Failed to reload theme content:', e);
    }
    createWindow();
    startMediaServer();

    chatServer = createChatWidgetServer(bot, DEFAULT_WIDGET_PORT);
    spotifyServer = createSpotifyWidgetServer(bot, {
        defaultPort: DEFAULT_SPOTIFY_WIDGET_PORT
    });
    subgoalsServer = createSubgoalsWidgetServer(bot, DEFAULT_SUBGOALS_WIDGET_PORT);

    chatServer.start();
    spotifyServer.start();
    subgoalsServer.start();

    setTimeout(() => {
        const reloadMsg = { type: 'reload' };
        if (chatServer) chatServer.broadcastChat(reloadMsg);
        if (spotifyServer) spotifyServer.broadcast(reloadMsg);
        if (subgoalsServer) subgoalsServer.broadcast(reloadMsg);
        console.log('[APP] Sent reload signal to all widgets');
    }, 5000);

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
    if (chatServer) chatServer.stop();
    if (spotifyServer) spotifyServer.stop();
    if (subgoalsServer) subgoalsServer.stop();
    if (bonjourInstance) {
        try { bonjourInstance.destroy(); } catch (e) { }
    }
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

    bot.onSubCountUpdate = (count) => {
        if (subgoalsServer) subgoalsServer.broadcastSubUpdate(count);
    };
}

app.on('window-all-closed', () => {
    if (bot) bot.disconnect();
    if (process.platform !== 'darwin') app.quit();
});

function sendChatToWidgets(messageData) {
    if (chatServer) {
        chatServer.broadcastChat(messageData);
    }
}

function startMediaServer() {
    mediaServer = http.createServer((req, res) => {
        if (req.url === '/media' && currentlyPlayingPath) {
            const videoPath = currentlyPlayingPath;
            const ext = path.extname(videoPath).toLowerCase();
            const isCompatible = ['.mp4', '.m4v', '.webm'].includes(ext);

            if (isCompatible) {
                try {
                    const stat = fs.statSync(videoPath);
                    const fileSize = stat.size;
                    const range = req.headers.range;

                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                        const chunksize = (end - start) + 1;
                        const file = fs.createReadStream(videoPath, { start, end });
                        const head = {
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunksize,
                            'Content-Type': 'video/mp4',
                        };
                        res.writeHead(206, head);
                        file.pipe(res);
                    } else {
                        const head = {
                            'Content-Length': fileSize,
                            'Content-Type': 'video/mp4',
                        };
                        res.writeHead(200, head);
                        fs.createReadStream(videoPath).pipe(res);
                    }
                } catch (err) {
                    console.error(`[MEDIA SERVER ERROR] Direct stream error: ${err.message}`);
                    if (!res.headersSent) res.writeHead(500);
                    res.end();
                }
            } else {
                try {
                    ffmpeg(videoPath)
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .format('mp4')
                        .addOutputOptions([
                            '-preset ultrafast',
                            '-tune zerolatency',
                            '-movflags frag_keyframe+empty_moov',
                            '-b:v 2500k',
                            '-maxrate 2500k',
                            '-bufsize 5000k'
                        ])
                        .on('error', (err) => {
                            if (err.message !== 'Output stream closed') {
                                console.error(`[FFMPEG STREAM ERROR] Transcoding failed: ${err.message}`);
                            }
                            if (!res.headersSent) res.end();
                        })
                        .pipe(res, { end: true });
                } catch (e) {
                    console.error(`[MEDIA SERVER ERROR] Transcoding setup error: ${e.message}`);
                    if (!res.headersSent) res.writeHead(404);
                    res.end();
                }
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    }).listen(0, () => {
        console.log(`Media server started on port ${mediaServer.address().port}`);
    });
}

ipcMain.handle('get-widget-config', (event, widgetName) => {
    return bot.getWidgetConfig(widgetName);
});
ipcMain.handle('save-widget-config', (event, widgetName, config) => {
    bot.saveWidgetConfig(widgetName, config);

    if (widgetName === 'spotify' && spotifyServer) {
        spotifyServer.broadcastConfig(config);
    } else if (widgetName === 'subgoals' && subgoalsServer) {
        subgoalsServer.broadcastConfig(config, 'subgoals');
    } else if (widgetName === 'subgoals-list' && subgoalsServer) {
        subgoalsServer.broadcastConfig(config, 'subgoals-list');
    } else if (widgetName === 'chat' && chatServer) {
        chatServer.broadcastConfig(config);
    } else if (chatServer) {
        if (widgetName === 'emote-wall') {
            chatServer.broadcastConfig(config, widgetName);
        }
    }
    return { success: true };
});

ipcMain.handle('reset-widget-config', async (event, widgetName) => {
    const config = bot.getWidgetConfig(widgetName) || {};
    const userThemesDir = path.join(app.getPath('userData'), 'themes');

    if (config.currentTheme) {
        const themePath = path.join(userThemesDir, config.currentTheme);
        try {
            if (fs.existsSync(themePath)) {
                await fs.promises.unlink(themePath);
                console.log(`[RESET] Deleted stale theme file: ${themePath}`);
            }
        } catch (e) {
            console.error(`[RESET] Error deleting theme file: ${e.message}`);
        }
    }

    delete config.customCSS;
    delete config.currentTheme;

    bot.saveWidgetConfig(widgetName, config);
    if (widgetName === 'chat' && chatServer) {
        chatServer.broadcastConfig(config);
    } else if (widgetName === 'spotify' && spotifyServer) {
        spotifyServer.broadcastConfig(config);
    } else if (widgetName === 'subgoals' && subgoalsServer) {
        subgoalsServer.broadcastConfig(config);
    }

    return { success: true };
});

ipcMain.handle('get-themes', async (event, widgetType) => {
    const userThemesDir = path.join(app.getPath('userData'), 'themes');
    const builtInThemesDir = path.join(__dirname, 'widgets/themes');
    const configPath = path.join(userThemesDir, 'themes.json');

    const prefix = widgetType === 'subgoals' ? 'sub_' : widgetType + '_';

    if (!fs.existsSync(userThemesDir)) {
        fs.mkdirSync(userThemesDir, { recursive: true });
    }

    let themeConfig = {};
    try {
        if (fs.existsSync(configPath)) {
            const content = await fs.promises.readFile(configPath, 'utf8');
            themeConfig = JSON.parse(content);
        }
    } catch (e) { console.error('Error reading theme config:', e); }

    const allThemes = new Set();

    try {
        if (fs.existsSync(userThemesDir)) {
            const userFiles = await fs.promises.readdir(userThemesDir);
            userFiles.filter(f => f.endsWith('.css') && f.startsWith(prefix))
                .forEach(f => allThemes.add(f));
        }
    } catch (e) { console.error('Error reading user themes:', e); }

    try {
        if (fs.existsSync(builtInThemesDir)) {
            const builtInFiles = await fs.promises.readdir(builtInThemesDir);
            builtInFiles.filter(f => f.endsWith('.css') && f.startsWith(prefix))
                .forEach(f => allThemes.add(f));
        }
    } catch (e) { console.error('Error reading built-in themes:', e); }

    return Array.from(allThemes);
});

ipcMain.handle('get-theme-content', async (event, filename) => {
    const userThemesDir = path.join(app.getPath('userData'), 'themes');
    const builtInThemesDir = path.join(__dirname, 'widgets/themes');

    const userThemePath = path.join(userThemesDir, filename);
    const builtInThemePath = path.join(builtInThemesDir, filename);

    if (fs.existsSync(userThemePath)) {
        if (!path.resolve(userThemePath).startsWith(path.resolve(userThemesDir))) {
            throw new Error('Invalid theme path');
        }
        return await fs.promises.readFile(userThemePath, 'utf8');
    }

    if (fs.existsSync(builtInThemePath)) {
        if (!path.resolve(builtInThemePath).startsWith(path.resolve(builtInThemesDir))) {
            throw new Error('Invalid theme path');
        }
        return await fs.promises.readFile(builtInThemePath, 'utf8');
    }

    throw new Error('Theme not found');
});

ipcMain.handle('get-theme-config', async () => {
    const themesDir = path.join(app.getPath('userData'), 'themes');
    const configPath = path.join(themesDir, 'themes.json');

    const defaultThemeNames = {
        'chat_christmas.css': 'Noël',
        'chat_retro_terminal.css': 'Matrix',
        'chat_bubble_pop.css': 'meoMessage',
        'chat_neon_cyberpunk.css': 'Cyberpunk',
        'chat_soso_base.css': 'Soso Défaut',
        'spotify_soso_base.css': 'Défaut',
        'sub_candycane.css': 'Candy Cane'
    };

    let userConfig = {};
    try {
        if (fs.existsSync(configPath)) {
            const content = await fs.promises.readFile(configPath, 'utf8');
            userConfig = JSON.parse(content);
        }
    } catch (e) { }

    const finalConfig = { ...defaultThemeNames, ...userConfig };
    return JSON.stringify(finalConfig);
});

ipcMain.handle('save-theme-config', async (event, content) => {
    const themesDir = path.join(app.getPath('userData'), 'themes');
    if (!fs.existsSync(themesDir)) fs.mkdirSync(themesDir, { recursive: true });
    const configPath = path.join(themesDir, 'themes.json');
    await fs.promises.writeFile(configPath, content, 'utf8');
    return { success: true };
});

ipcMain.handle('create-theme', async (event, widgetType, themeName, content) => {
    if (!widgetType || !themeName) return { success: false, message: 'Missing arguments' };

    const safeName = themeName.replace(/[^a-z0-9_-]/gi, '_');
    const filename = `${widgetType}_${safeName}.css`;
    const themesDir = path.join(app.getPath('userData'), 'themes');
    const destPath = path.join(themesDir, filename);

    if (!fs.existsSync(themesDir)) fs.mkdirSync(themesDir, { recursive: true });

    try {
        await fs.promises.writeFile(destPath, content, 'utf8');

        const configPath = path.join(themesDir, 'themes.json');
        let config = {};
        try {
            if (fs.existsSync(configPath)) {
                config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
            }
        } catch (e) { }

        config[filename] = themeName;
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

        return { success: true, filename };
    } catch (e) {
        console.error('Error creating theme:', e);
        throw e;
    }
});

ipcMain.handle('delete-theme', async (event, widgetType, filename) => {
    const userThemesDir = path.join(app.getPath('userData'), 'themes');
    const builtInThemesDir = path.join(__dirname, 'widgets/themes');

    const userThemePath = path.join(userThemesDir, filename);
    const builtInThemePath = path.join(builtInThemesDir, filename);
    const configPath = path.join(userThemesDir, 'themes.json');

    try {
        if (fs.existsSync(userThemePath)) {
            await fs.promises.unlink(userThemePath);

            let config = {};
            try {
                if (fs.existsSync(configPath)) {
                    config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
                }
            } catch (e) { }

            if (config[filename]) {
                delete config[filename];
                await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            }

            return { success: true };
        } else if (fs.existsSync(builtInThemePath)) {
            return { success: false, message: 'Impossible de supprimer un thème natif.' };
        } else {
            return { success: false, message: 'Thème introuvable.' };
        }
    } catch (e) {
        console.error('Error deleting theme:', e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('import-theme', async (event, widgetType) => {
    const { dialog } = require('electron');
    const { filePaths } = await dialog.showOpenDialog({
        title: 'Importer un thème CSS',
        filters: [{ name: 'Fichiers CSS', extensions: ['css'] }],
        properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) return { success: false, message: 'Annulé' };

    const srcPath = filePaths[0];
    let filename = path.basename(srcPath);

    if (widgetType && !filename.startsWith(widgetType + '_')) {
        filename = `${widgetType}_${filename}`;
    }

    const themesDir = path.join(app.getPath('userData'), 'themes');
    const destPath = path.join(themesDir, filename);

    if (!fs.existsSync(themesDir)) fs.mkdirSync(themesDir, { recursive: true });

    try {
        await fs.promises.copyFile(srcPath, destPath);
        return { success: true, filename, message: 'Thème importé !' };
    } catch (e) {
        console.error('Error importing theme:', e);
        throw e;
    }
});

ipcMain.handle('get-widget-url', async (event, widgetName = 'chat') => {
    const localIp = getLocalIp();
    if (widgetName === 'spotify' && spotifyServer) {
        return spotifyServer.getUrl(localIp);
    }
    if (widgetName === 'subgoals' && subgoalsServer) {
        return subgoalsServer.getUrl(localIp);
    }
    return chatServer ? chatServer.getUrl(localIp, widgetName) : '';
});

ipcMain.handle('get-widget-urls', async () => {
    const localIp = getLocalIp();
    return {
        chat: chatServer ? chatServer.getUrl(localIp, 'chat') : '',
        spotify: spotifyServer ? spotifyServer.getUrl(localIp) : '',
        emoteWall: chatServer ? chatServer.getUrl(localIp, 'emote-wall') : '',
        subgoals: subgoalsServer ? subgoalsServer.getUrl(localIp) : '',
        subgoalsList: subgoalsServer ? subgoalsServer.getUrl(localIp) + '-list' : ''
    };
});

ipcMain.handle('get-badge-prefs', () => {
    const config = bot.getWidgetConfig('chat') || {};
    return config.badgePrefs || {};
});

ipcMain.handle('save-badge-prefs', (event, prefs) => {
    bot.saveWidgetConfig('chat', { badgePrefs: prefs });
    if (chatServer) chatServer.broadcastConfig({ badgePrefs: prefs });
    return { success: true };
});

ipcMain.handle('spotify-start-auth', async () => {
    if (!spotifyServer) return { success: false };
    const url = spotifyServer.getLoginUrl();
    shell.openExternal(url);
    return { url };
});

ipcMain.handle('spotify-redirect-uri', async () => {
    if (!spotifyServer) return '';
    return spotifyServer.getRedirectUri();
});

ipcMain.handle('discover-devices', async () => {
    mainWindow.webContents.send('device-discovery-status', 'Recherche en cours...');

    if (bonjourInstance) {
        try { bonjourInstance.destroy(); } catch (e) { }
    }
    bonjourInstance = new Bonjour();

    const devices = [];
    const browser = bonjourInstance.find({ type: 'googlecast' });

    browser.on('up', (service) => {
        if (service.name && !devices.some(d => d.host === service.referer.address)) {
            devices.push({
                name: service.name,
                host: service.referer.address,
                port: service.port
            });
            mainWindow.webContents.send('cast-devices-found', devices);
        }
    });

    setTimeout(() => {
        try {
            browser.stop();

        } catch (e) { }
        mainWindow.webContents.send('device-discovery-status', 'Recherche terminée.');
    }, 10000);
    return true;
});

ipcMain.handle('play-on-device', (event, { deviceHost, devicePort, videoPath }) => {
    currentlyPlayingPath = videoPath;
    const serverPort = mediaServer.address().port;
    const localIp = getLocalIp();
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
ipcMain.handle('get-participants', () => bot.getParticipants());
ipcMain.handle('is-giveaway-active', () => bot.isGiveawayActive());
ipcMain.handle('save-config', (event, config) => {
    bot.updateConfig(config);
    if (config.clipCooldown !== undefined) bot.setClipCooldown(config.clipCooldown);
    if (config.channel || config.username || config.token) setTimeout(() => bot.connect(), 500);
    return { success: true };
});
ipcMain.handle('start-spotify-auth', async () => {
    if (!spotifyServer) return { success: false };
    const url = spotifyServer.getLoginUrl();
    shell.openExternal(url);
    return { url };
});

ipcMain.handle('get-participants-count', () => ({ count: bot.getParticipantsCount(), participants: bot.getParticipants() }));
ipcMain.handle('get-banned-words', () => ({ bannedWords: bot.getBannedWords() }));
ipcMain.handle('add-banned-word', (event, word) => { const bannedWords = bot.addBannedWord(word); return { success: true, bannedWords }; });
ipcMain.handle('remove-banned-word', (event, word) => { const bannedWords = bot.removeBannedWord(word); return { success: true, bannedWords }; });
ipcMain.handle('clear-banned-words', async () => { if (bot) { bot.clearBannedWords(); return { success: true }; } return { success: false }; });
ipcMain.handle('get-bot-status', () => ({ connected: bot.isConnected, channel: bot.getConfig().channel }));
ipcMain.handle('open-external-url', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('get-sub-count', async () => {
    if (bot && bot.fetchSubCount) {
        const count = await bot.fetchSubCount();
        return { count };
    }
    return { count: 0 };
});

ipcMain.handle('simulate-sub', () => {
    if (bot && bot.simulateSub) {
        bot.simulateSub();
        return { success: true };
    }
    return { success: false };
});
