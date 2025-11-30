const tmi = require('tmi.js');
const configManager = require('./config/configManager');

class TwitchBot {
    constructor() {
        this.configManager = configManager;
        this.client = null;
        this.isConnected = false;
        this.messageCount = 0;
        this.appAccessToken = null;
        this.tokenExpiry = null;
        this.badgesWarningLogged = false;

        this.userId = null;
        this.clientId = null;
        this.clipCooldown = (this.getConfig().clipCooldown || 30) * 1000;
        this.onCooldown = false;
    }

    setClipCooldown(seconds) {
        this.clipCooldown = parseInt(seconds, 10) * 1000;
    }

    updateConfig(newConfig) {
        this.configManager.updateConfig(newConfig);
    }

    getConfig() { return this.configManager.getConfig() || {}; }
    getCommands() { return this.configManager.getCommands() || []; }
    getBannedWords() { return this.configManager.getBannedWords() || []; }
    getParticipants() { return this.configManager.getGiveawayParticipants() || []; }
    getParticipantsCount() { return this.getParticipants().length; }
    isGiveawayActive() { return this.configManager.isGiveawayActive(); }

    getWidgetConfig(widgetName) {
        return this.configManager.getWidgetConfig(widgetName);
    }

    saveWidgetConfig(widgetName, newConfig) {
        this.configManager.saveWidgetConfig(widgetName, newConfig);
    }

    async validateToken(token) {
        try {
            // Remove oauth: prefix if present for the API call header
            const cleanToken = token.replace('oauth:', '');
            const response = await fetch('https://id.twitch.tv/oauth2/validate', {
                headers: {
                    'Authorization': `OAuth ${cleanToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Token validation failed: ${response.statusText}`);
            }

            const data = await response.json();
            this.clientId = data.client_id;
            this.userId = data.user_id;
            console.log(`[AUTH] Token validé. ClientID: ${this.clientId}, UserID: ${this.userId}`);
            return true;
        } catch (error) {
            console.error('[AUTH] Erreur validation token:', error);
            return false;
        }
    }

    async banUser(broadcasterId, userId, duration, reason) {
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${this.userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: {
                        user_id: userId,
                        duration: duration,
                        reason: reason
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            console.log('[MOD] Helix Ban/Timeout success:', data);
            return true;
        } catch (error) {
            console.error('[MOD] Helix Ban/Timeout error:', error);
            throw error;
        }
    }

    async connect() {
        const config = this.getConfig();
        if (!config.channel || !config.username || !config.token) {
            console.error('Configuration de connexion manquante (canal, bot, token).');
            return;
        }

        if (this.client) {
            this.client.removeAllListeners();
            if (this.isConnected) {
                this.client.disconnect().catch(err => console.error('Erreur déconnexion:', err));
            }
        }

        const token = config.token.startsWith('oauth:') ? config.token : `oauth:${config.token}`;

        // Validate token first to get IDs
        await this.validateToken(token);

        this.client = new tmi.Client({
            options: { debug: false },
            connection: { secure: true, reconnect: true },
            identity: { username: config.username, password: token },
            channels: [config.channel]
        });

        this.client.on('message', (channel, tags, message, self) => {
            if (self) return;
            this.handleMessage(channel, tags, message);
        });
        this.client.on('connected', () => {
            this.isConnected = true;
            if (this.onConnected) this.onConnected();
        });
        this.client.on('disconnected', () => {
            this.isConnected = false;
            if (this.onDisconnected) this.onDisconnected();
        });

        this.client.connect().catch(console.error);
    }

    disconnect() {
        if (this.client) {
            this.client.disconnect();
        }
    }

    async deleteMessage(broadcasterId, messageId) {
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${this.userId}&message_id=${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) {
                const errorData = await response.json(); // Body might be empty for 204
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            console.log('[MOD] Helix Delete success');
            return true;
        } catch (error) {
            console.error('[MOD] Helix Delete error:', error);
            // Don't throw, just log
        }
    }

    async createClip(broadcasterId) {
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                const clipInfo = data.data[0];
                console.log('[CLIP] Clip created:', clipInfo);
                return clipInfo;
            }
            return null;
        } catch (error) {
            console.error('[CLIP] Error creating clip:', error);
            throw error;
        }
    }

    async handleMessage(channel, tags, message) {
        if (this.containsBannedWords(message)) {
            if (this.userId && this.clientId && tags['room-id'] && tags['user-id']) {
                await this.deleteMessage(tags['room-id'], tags.id);
            }
            return;
        }

        try {
            await this.ensureAppAccessToken();
        } catch (err) {
            console.error(err);
        }

        const messageData = {
            type: 'chat',
            username: tags.username,
            displayName: tags['display-name'] || tags.username,
            text: message,
            color: tags.color || '#FFFFFF',
            badgesRaw: tags['badges-raw'] || '',
            badgesObj: tags.badges || null,
            emotes: tags.emotes || null,
            roomId: tags['room-id'] || null,
            apiAuth: {
                clientId: process.env.TWITCH_CLIENT_ID,
                token: this.appAccessToken
            }
        };

        if (this.onChatMessage) this.onChatMessage(messageData);

        const config = this.getConfig();
        this.messageCount++;
        if (config.autoMessage && this.messageCount >= config.autoMessageInterval) {
            this.client.say(channel, config.autoMessage);
            this.messageCount = 0;
        }
        if (message.startsWith('!')) {
            const command = message.split(' ')[0].toLowerCase();

            if (command === '!clip') {
                if (this.isConnected && !this.onCooldown) {
                    // Utilisation de l'API Helix pour créer le clip
                    if (tags['room-id']) {
                        this.createClip(tags['room-id'])
                            .then((clipData) => {
                                if (clipData) {
                                    // Le clip est créé, on envoie le lien d'édition ou l'ID
                                    // L'URL publique est généralement https://clips.twitch.tv/[id]
                                    // Mais elle peut mettre quelques secondes à être active.
                                    // On envoie l'URL directe.
                                    const clipUrl = `https://clips.twitch.tv/${clipData.id}`;
                                    this.client.say(channel, `🎬 Clip créé ! ${clipUrl}`);
                                } else {
                                    this.client.say(channel, `Erreur: Impossible de créer le clip.`);
                                }
                            })
                            .catch(err => {
                                console.error('[CLIP] Error:', err);
                                this.client.say(channel, `Erreur lors de la création du clip: ${err.message}`);
                            });
                    } else {
                        this.client.say(channel, `Erreur: Impossible de récupérer l'ID de la chaîne.`);
                    }

                    this.onCooldown = true;
                    setTimeout(() => { this.onCooldown = false; }, this.clipCooldown);
                }
                return;
            }

            const giveawayCommand = config.giveawayCommand || '!giveaway';
            if (this.isGiveawayActive() && command === giveawayCommand) {
                const participants = new Set(this.getParticipants());
                if (!participants.has(tags.username)) {
                    this.configManager.addGiveawayParticipant(tags.username);
                    if (this.onParticipantAdded) this.onParticipantAdded(tags.username);
                    if (this.onParticipantsUpdated) this.onParticipantsUpdated();
                }
                return;
            }

            const commands = this.getCommands();

            if (commands[command]) {
                this.client.say(channel, commands[command]);
            }
        }
    }

    containsBannedWords(message) {
        const lowerMessage = message.toLowerCase();
        return this.getBannedWords().some(word => lowerMessage.includes(word.toLowerCase()));
    }

    async ensureAppAccessToken() {
        if (this.appAccessToken && this.tokenExpiry > Date.now()) {
            return;
        }

        const cfg = this.getConfig();
        const configClientId = cfg.twitchClientId;
        const configAppToken = cfg.twitchAppToken;

        if (configClientId && configAppToken) {
            this.appAccessToken = configAppToken;
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);
            return;
        }

        const clientId = process.env.TWITCH_CLIENT_ID || configClientId;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            if (!this.badgesWarningLogged) {
                console.warn("Badges désactivés : fournissez TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET dans .env ou twitchClientId/twitchAppToken dans la config.");
                this.badgesWarningLogged = true;
            }
            return;
        }

        console.log("Génération d'un nouveau App Access Token Twitch...");
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Erreur de l'API Twitch: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        this.appAccessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    }

    addCommand(command, response) {
        this.configManager.setCommand(command, response);
    }

    removeCommand(command) {
        this.configManager.removeCommand(command);
    }

    addBannedWord(word) {
        this.configManager.addBannedWord(word);
        return this.getBannedWords();
    }

    removeBannedWord(word) {
        this.configManager.removeBannedWord(word);
        return this.getBannedWords();
    }

    clearBannedWords() {
        this.configManager.clearBannedWords();
    }

    startGiveaway() {
        this.configManager.setGiveawayActive(true);
        this.configManager.clearGiveawayParticipants();
        const config = this.getConfig();
        const startMsg = config.giveawayStartMessage || 'Le giveaway commence ! Tapez !giveaway pour participer.';
        if (startMsg && this.client && this.isConnected) {
            this.client.say(config.channel, startMsg);
        }
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }

    stopGiveaway() {
        this.configManager.setGiveawayActive(false);
        const config = this.getConfig();
        const stopMsg = config.giveawayStopMessage || 'Le giveaway est terminé !';
        if (stopMsg && this.client && this.isConnected) {
            this.client.say(config.channel, stopMsg);
        }
    }

    drawWinner() {
        const participants = this.getParticipants();
        if (participants.length === 0) return null;
        const winner = participants[Math.floor(Math.random() * participants.length)];
        const config = this.getConfig();
        const winMsgTemplate = config.giveawayWinMessage || 'Félicitations {winner} !';
        if (winMsgTemplate && this.client && this.isConnected) {
            const winMessage = winMsgTemplate.replace('{winner}', winner);
            setTimeout(() => {
                this.client.say(config.channel, winMessage);
            }, 3000);
        }
        return winner;
    }

    clearParticipants() {
        this.configManager.clearGiveawayParticipants();
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }
}

module.exports = TwitchBot;
