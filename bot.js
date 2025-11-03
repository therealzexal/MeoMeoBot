const tmi = require('tmi.js');
const Store = require('electron-store');

class TwitchBot {
    constructor() {
        this.store = new Store({
            defaults: {
                config: {
                    channel: "",
                    username: "",
                    token: "",
                    autoMessageInterval: 40,
                    autoMessage: "",
                    giveawayCommand: "!giveaway",
                    giveawayStartMessage: "Giveaway ouvert ! Utilise !giveaway pour participer !",
                    giveawayStopMessage: "Giveaway fermé !",
                    giveawayWinMessage: "Félicitations @{winner}, tu as gagné le giveaway ! 🎉",
                    bannedWords: [],
                    castFolderPath: "",
                    clipCooldown: 60 
                },
                commands: {
                    "!discord": "Placeholder",
                    "!twitter": "Placeholder"
                },
                giveaway: {
                    isActive: false,
                    participants: []
                }
            }
        });
        this.client = null;
        this.isConnected = false;
        this.messageCount = 0;
        
        this.clipCooldown = this.getConfig().clipCooldown * 1000; 
        this.onCooldown = false;
    }

    setClipCooldown(seconds) {
        this.clipCooldown = parseInt(seconds, 10) * 1000;
    }
    
    getConfig() { return this.store.get('config'); }
    getCommands() { return this.store.get('commands'); }
    getBannedWords() { return this.store.get('config.bannedWords', []); }
    getParticipants() { return this.store.get('giveaway.participants', []); }
    getParticipantsCount() { return this.getParticipants().length; }
    isGiveawayActive() { return this.store.get('giveaway.isActive'); }

    connect() {
        const config = this.getConfig();
        if (!config.channel || !config.username || !config.token) {
            throw new Error('Configuration de connexion manquante (canal, bot, token).');
        }
        
        if (this.client) {
            this.client.removeAllListeners();
            if (this.isConnected) {
                this.client.disconnect();
            }
        }
        
        this.client = new tmi.Client({
            options: { debug: false },
            connection: { secure: true, reconnect: true },
            identity: { username: config.username, password: config.token },
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

    handleMessage(channel, tags, message) {
        if (this.containsBannedWords(message)) {
            this.client.deletemessage(channel, tags.id).catch(console.error);
            return;
        }
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
                    this.client.clip(channel)
                        .then((clipData) => {
                            console.log('Clip créé avec succès:', clipData); 
                        }).catch(err => {
                            console.error('Erreur lors de la création du clip:', err);
                            this.client.say(channel, `Désolé @${tags.username}, je n'ai pas pu créer le clip. (Le bot doit être Modérateur ou Editeur)`);
                        });
                    
                    this.onCooldown = true;
                    setTimeout(() => { this.onCooldown = false; }, this.clipCooldown);
                }
                return; 
            }

            if (this.isGiveawayActive() && command === config.giveawayCommand) {
                const participants = new Set(this.getParticipants());
                if (!participants.has(tags.username)) {
                    participants.add(tags.username);
                    this.store.set('giveaway.participants', [...participants]);
                    if (this.onParticipantAdded) this.onParticipantAdded(tags.username);
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

    updateConfig(newConfig) { 
        const currentConfig = this.getConfig();
        this.store.set('config', { ...currentConfig, ...newConfig }); 
    }
    
    addCommand(command, response) { this.store.set(`commands.${command}`, response); }
    removeCommand(command) { this.store.delete(`commands.${command}`); }
    
    addBannedWord(word) {
        const words = new Set(this.getBannedWords());
        words.add(word);
        this.store.set('config.bannedWords', [...words]);
        return [...words];
    }
    removeBannedWord(word) {
        const words = this.getBannedWords().filter(w => w !== word);
        this.store.set('config.bannedWords', words);
        return words;
    }
    clearBannedWords() {
        this.store.set('config.bannedWords', []);
    }

    startGiveaway() {
        this.store.set('giveaway', { isActive: true, participants: [] });
        const config = this.getConfig();
        if (config.giveawayStartMessage && this.client && this.isConnected) {
            this.client.say(config.channel, config.giveawayStartMessage);
        }
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }
    stopGiveaway() {
        this.store.set('giveaway.isActive', false);
        const config = this.getConfig();
        if (config.giveawayStopMessage && this.client && this.isConnected) {
            this.client.say(config.channel, config.giveawayStopMessage);
        }
    }
    drawWinner() {
        const participants = this.getParticipants();
        if (participants.length === 0) return null;
        const winner = participants[Math.floor(Math.random() * participants.length)];
        const config = this.getConfig();
        if (config.giveawayWinMessage && this.client && this.isConnected) {
            const winMessage = config.giveawayWinMessage.replace('{winner}', winner);
            setTimeout(() => {
                this.client.say(config.channel, winMessage);
            }, 3000);
        }
        return winner;
    }
    clearParticipants() {
        this.store.set('giveaway.participants', []);
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }
}

module.exports = TwitchBot;