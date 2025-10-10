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

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
if (app.isPackaged) {
  ffmpeg.setFfmpegPath(path.join(process.resourcesPath, 'ffmpeg.exe'));
  ffmpeg.setFfprobePath(path.join(process.resourcesPath, 'ffprobe.exe'));
} else {
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
}

let mainWindow;
let bot;
let mediaServer;
let currentlyPlayingPath = null;

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

app.whenReady().then(() => {
    createWindow();
    startMediaServer();
    mainWindow.webContents.on('did-finish-load', () => {
        if (app.isPackaged) {
            autoUpdater.checkForUpdates();
        }
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    if (mediaServer) mediaServer.close();
});

ipcMain.on('window-control', (event, action) => {
    if (!mainWindow) return;
    switch (action) {
        case 'minimize': mainWindow.minimize(); break;
        case 'maximize': mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); break;
        case 'close': mainWindow.close(); break;
    }
});

autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
});
autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
});
ipcMain.on('start-download', () => {
    autoUpdater.downloadUpdate();
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
    bot.onConnected = () => mainWindow.webContents.send('bot-status', { connected: true, channel: bot.getConfig().channel });
    bot.onDisconnected = () => mainWindow.webContents.send('bot-status', { connected: false });
    bot.onParticipantsUpdated = () => mainWindow.webContents.send('participants-updated');
    bot.onParticipantAdded = (username) => mainWindow.webContents.send('participant-added', { username });
}

app.on('window-all-closed', () => {
    if (bot) bot.disconnect();
    if (process.platform !== 'darwin') app.quit();
});

function startMediaServer() {
    mediaServer = http.createServer((req, res) => {
        if (req.url === '/media' && currentlyPlayingPath) {
            const videoPath = currentlyPlayingPath;
            try {
                res.writeHead(200, { 'Content-Type': 'video/mp4' });
                ffmpeg(videoPath)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .format('mp4')
                    .addOutputOptions(['-preset veryfast', '-tune zerolatency', '-movflags frag_keyframe+empty_moov'])
                    .on('error', (err, stdout, stderr) => {
                        if (!res.headersSent) res.end();
                    })
                    .pipe(res, { end: true });
            } catch (e) {
                if (!res.headersSent) res.writeHead(404);
                res.end();
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    }).listen(0, () => {});
}

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
            player.load(media, { autoplay: true }, (err, status) => {
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
            if (!fs.existsSync(thumbnailPath)) {
                await new Promise((resolve, reject) => {
                    ffmpeg(fullVideoPath)
                        .on('end', resolve)
                        .on('error', (err, stdout, stderr) => {
                            const detailedError = new Error(`Échec FFmpeg pour ${videoFile}: ${err.message}\n${stderr}`);
                            reject(detailedError);
                        })
                        .screenshots({ timestamps: ['1%'], filename: thumbnailFileName, folder: cachePath, size: '320x180' });
                });
            }
            if (fs.existsSync(thumbnailPath)) {
                const thumbnailData = await fs.promises.readFile(thumbnailPath, 'base64');
                return { fileName: videoFile, videoPath: fullVideoPath, thumbnailData: `data:image/png;base64,${thumbnailData}` };
            }
            return null;
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
ipcMain.handle('update-config', (event, newConfig) => { bot.updateConfig(newConfig); if (newConfig.channel || newConfig.username || newConfig.token) { setTimeout(() => bot.connect(), 500); } return { success: true }; });
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