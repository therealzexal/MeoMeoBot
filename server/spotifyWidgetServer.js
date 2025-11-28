const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const fetch = require('node-fetch');

function createSpotifyWidgetServer(bot, {
    defaultPort = 8090,
    scopes = 'user-read-currently-playing user-read-playback-state',
    pollInterval = 5000
} = {}) {
    let server = null;
    let port = 0;
    let wss = null;
    let spotifyAuthState = null;
    let spotifyPollTimer = null;
    let currentSpotifyTrack = null;

    const scopeParam = encodeURIComponent(scopes);

    const resolvePort = () => {
        const storedPort = bot?.getConfig?.()?.spotifyWidgetPort;
        const parsed = parseInt(storedPort, 10);
        if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
            return parsed;
        }
        if (bot?.updateConfig) bot.updateConfig({ spotifyWidgetPort: defaultPort });
        return defaultPort;
    };

    const getCredentials = () => {
        const cfg = bot?.getConfig?.() || {};
        return {
            clientId: process.env.SPOTIFY_CLIENT_ID || cfg.spotifyClientId || '',
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || cfg.spotifyClientSecret || ''
        };
    };

    const getStoredTokens = () => {
        const cfg = bot?.getConfig?.() || {};
        return {
            accessToken: cfg.spotifyAccessToken || '',
            refreshToken: cfg.spotifyRefreshToken || '',
            expiry: cfg.spotifyTokenExpiry || 0
        };
    };

    const storeTokens = ({ accessToken, refreshToken, expiresIn }) => {
        const expiry = Date.now() + (expiresIn * 1000) - 60000;
        bot.updateConfig({
            spotifyAccessToken: accessToken || '',
            spotifyRefreshToken: refreshToken || getStoredTokens().refreshToken || '',
            spotifyTokenExpiry: expiry
        });
    };

    const getRedirectUri = (portValue) => {
        const safePort = portValue || port || resolvePort();
        return `http://127.0.0.1:${safePort}/auth/spotify/callback`;
    };

    const ensureAccessToken = async () => {
        const creds = getCredentials();
        const tokens = getStoredTokens();
        if (!creds.clientId || !creds.clientSecret || !tokens.refreshToken) return null;
        if (tokens.accessToken && tokens.expiry && tokens.expiry > Date.now()) {
            return tokens.accessToken;
        }
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken
        });
        const resp = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
            },
            body
        });
        if (!resp.ok) throw new Error(`Spotify refresh failed: ${resp.status}`);
        const data = await resp.json();
        storeTokens({
            accessToken: data.access_token,
            refreshToken: data.refresh_token || tokens.refreshToken,
            expiresIn: data.expires_in || 3600
        });
        return getStoredTokens().accessToken;
    };

    const fetchCurrentTrack = async () => {
        let token;
        try {
            token = await ensureAccessToken();
        } catch (err) {
            console.error('[SPOTIFY] Refresh token error:', err.message);
            return null;
        }
        if (!token) return null;

        const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.status === 204) return null;
        if (resp.status === 401) {
            bot.updateConfig({ spotifyAccessToken: '' });
            return null;
        }
        if (!resp.ok) {
            console.warn('[SPOTIFY] current track fetch failed', resp.status);
            return null;
        }
        const data = await resp.json();
        if (!data || !data.item) return null;

        const track = data.item;
        const title = track.name || 'Titre du morceau';
        const artist = (track.artists || []).map(a => a.name).join(', ') || 'Artiste';
        const album = (track.album && track.album.name) || 'Album';
        const coverUrl = (track.album && track.album.images && track.album.images[0] && track.album.images[0].url) || '';

        return { trackTitle: title, trackArtist: artist, trackAlbum: album, coverUrl };
    };

    const broadcastConfig = (config) => {
        if (wss && wss.clients) {
            const payload = JSON.stringify({ type: 'config-update', widget: 'spotify', config });
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            });
        }
    };

    const updateTrackConfig = (trackData) => {
        if (!trackData) return;
        const current = bot.getWidgetConfig('spotify') || {};
        const next = { ...current, ...trackData };
        bot.saveWidgetConfig('spotify', next);
        currentSpotifyTrack = next;
        broadcastConfig(next);
    };

    const startPolling = () => {
        if (spotifyPollTimer) clearInterval(spotifyPollTimer);
        const tokens = getStoredTokens();
        if (!tokens.refreshToken && !tokens.accessToken) return;
        spotifyPollTimer = setInterval(async () => {
            try {
                const track = await fetchCurrentTrack();
                if (track) updateTrackConfig(track);
            } catch (err) {
                console.warn('[SPOTIFY] Polling error', err.message);
            }
        }, pollInterval);
    };

    const stopPolling = () => {
        if (spotifyPollTimer) clearInterval(spotifyPollTimer);
    };

    const handleRequest = async (req, res, portInitial) => {
        if (req.url === '/widget/spotify') {
            const filePath = path.join(__dirname, '..', 'spotify_widget.html');
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error loading widget file');
                }

                const spotifyConfig = bot.getWidgetConfig('spotify') || {};
                const customCSS = spotifyConfig.customCSS || '';
                const initialConfig = {
                    title: spotifyConfig.trackTitle || 'Titre du morceau',
                    artist: spotifyConfig.trackArtist || 'Artiste',
                    album: spotifyConfig.trackAlbum || 'Album',
                    coverUrl: spotifyConfig.coverUrl || ''
                };

                let content = data.replace('/* CUSTOM_CSS_PLACEHOLDER */', customCSS);
                content = content.replace('const INITIAL_CONFIG = {};', `const INITIAL_CONFIG = ${JSON.stringify(initialConfig)};`);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            });
        } else if (req.url.startsWith('/auth/spotify/login')) {
            const creds = getCredentials();
            if (!creds.clientId || !creds.clientSecret) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                return res.end('Spotify Client ID/Secret manquants. Configurez-les dans la config ou les variables d environnement.');
            }
            const state = crypto.randomBytes(16).toString('hex');
            spotifyAuthState = state;
            const redirectUri = getRedirectUri(portInitial);
            const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(creds.clientId)}&scope=${scopeParam}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
            res.writeHead(302, { Location: authUrl });
            res.end();
        } else if (req.url.startsWith('/auth/spotify/callback')) {
            const creds = getCredentials();
            const urlObj = new URL(req.url, getRedirectUri(portInitial));
            const code = urlObj.searchParams.get('code');
            const state = urlObj.searchParams.get('state');
            if (!code || !state || state !== spotifyAuthState) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                return res.end('Etat invalide ou code manquant.');
            }
            spotifyAuthState = null;
            try {
                const redirectUri = getRedirectUri(portInitial);
                const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
                    },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri
                    })
                });
                if (!tokenResp.ok) throw new Error(`HTTP ${tokenResp.status}`);
                const tokenData = await tokenResp.json();
                storeTokens({
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    expiresIn: tokenData.expires_in || 3600
                });
                startPolling();
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><p>Connexion Spotify reussie. Vous pouvez fermer cette fenetre.</p><script>window.close();</script></body></html>');
            } catch (err) {
                console.error('[SPOTIFY AUTH] Callback error', err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Erreur lors de la connexion Spotify.');
            }
        } else {
            res.statusCode = 404;
            res.end('Widget Not Found');
        }
    };

    const start = () => {
        currentSpotifyTrack = bot.getWidgetConfig('spotify') || null;
        const portInitial = resolvePort();

        server = http.createServer((req, res) => handleRequest(req, res, portInitial))
            .listen(portInitial, () => {
                port = server.address().port;
                if (port !== portInitial) {
                    bot.updateConfig({ spotifyWidgetPort: port });
                }

                wss = new WebSocket.Server({ server });

                wss.on('connection', (ws) => {
                    const spotifyConfig = bot.getWidgetConfig('spotify');
                    if (spotifyConfig) {
                        ws.send(JSON.stringify({
                            type: 'config-update',
                            widget: 'spotify',
                            config: spotifyConfig
                        }));
                    }
                    if (currentSpotifyTrack) {
                        ws.send(JSON.stringify({
                            type: 'config-update',
                            widget: 'spotify',
                            config: currentSpotifyTrack
                        }));
                    }
                });

                startPolling();
            })
            .on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`[SPOTIFY WIDGET SERVER ERROR] Le port ${portInitial} est déjà utilisé. Changez 'spotifyWidgetPort' ou libérez le port.`);
                } else {
                    console.error(`[SPOTIFY WIDGET SERVER ERROR] ${err.message}`);
                }
            });
    };

    const stop = () => {
        if (server) server.close();
        if (wss) wss.close();
        stopPolling();
    };

    const broadcastCustomConfig = (config) => broadcastConfig(config);
    const getUrl = (localIp) => `http://${localIp}:${port}/widget/spotify`;
    const getLoginUrl = () => `http://127.0.0.1:${port || defaultPort}/auth/spotify/login`;

    return {
        start,
        stop,
        broadcastConfig: broadcastCustomConfig,
        getPort: () => port,
        getRedirectUri: () => getRedirectUri(),
        getLoginUrl,
        getUrl
    };
}

module.exports = { createSpotifyWidgetServer };
