import { setupTabs } from './tabs.js';
import { setupWindowControls, setupConfirmationOverlay, showNotification, updateUpdaterStatus } from './ui.js';
import { loadParticipants, startGiveaway, stopGiveaway, drawWinner, clearParticipants, saveGiveawayConfig } from './giveaway.js';
import { loadCommands, addCommand } from './commands.js';
import { loadBannedWords, addBannedWord, clearBannedWords, saveAutoMessage, saveClipConfig } from './moderation.js';
import { setupCast } from './cast.js';

window.editWidgetCss = (widgetName) => {
    window.api.invoke('open-css-editor', widgetName);
};

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    setupTabs();
    setupWindowControls();
    setupConfirmationOverlay();
    setupCast();
    setupEventListeners();

    await loadAllData();
    updateUpdaterStatus('checking');

    loadWidgetUrls();
    loadEmoteWallConfig();
    loadBadgePrefs();
    setupSubgoalsConfig();
}

async function loadAllData() {
    try {
        const config = await window.api.invoke('get-config');
        updateConfigForm(config);

        await loadCommands();
        await loadBannedWords();
        await loadParticipants();

        const status = await window.api.invoke('get-bot-status');
        updateBotStatus(status.connected ? 'connected' : 'disconnected');
    } catch (error) {
        showNotification(`Erreur critique au chargement: ${error.message || error}`, "error");
    }
}

function setupEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', connectBot);
    document.getElementById('disconnectBtn').addEventListener('click', disconnectBot);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);

    document.getElementById('addCommandBtn').addEventListener('click', addCommand);
    document.getElementById('newCommand').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('commandResponse').focus(); });
    document.getElementById('commandResponse').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCommand(); } });

    document.getElementById('saveGiveawayConfig').addEventListener('click', saveGiveawayConfig);
    document.getElementById('startGiveawayBtn').addEventListener('click', startGiveaway);
    document.getElementById('stopGiveawayBtn').addEventListener('click', stopGiveaway);
    document.getElementById('drawWinnerBtn').addEventListener('click', drawWinner);
    document.getElementById('clearParticipantsBtn').addEventListener('click', () => window.showConfirmation('Vider la liste des participants ?', clearParticipants));

    document.getElementById('saveAutoMessage').addEventListener('click', saveAutoMessage);
    document.getElementById('saveClipConfig').addEventListener('click', saveClipConfig);

    const addBannedWordBtn = document.getElementById('addBannedWordBtn');
    const newBannedWordInput = document.getElementById('newBannedWord');
    addBannedWordBtn.addEventListener('click', addBannedWord);
    newBannedWordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBannedWord(); } });
    document.getElementById('clearBannedWordsBtn').addEventListener('click', () => {
        window.showConfirmation('Vider toute la liste des mots bannis ? Cette action est irréversible.', clearBannedWords);
    });

    const saveBadgeBtn = document.getElementById('saveBadgePrefs');
    if (saveBadgeBtn) saveBadgeBtn.addEventListener('click', saveBadgePrefs);

    const resetChatConfigBtn = document.getElementById('resetChatConfigBtn');
    if (resetChatConfigBtn) {
        let resetTimeout;
        resetChatConfigBtn.addEventListener('click', async () => {
            if (!resetChatConfigBtn.classList.contains('confirming')) {
                resetChatConfigBtn.classList.add('confirming');
                const originalText = resetChatConfigBtn.textContent;
                resetChatConfigBtn.dataset.originalText = originalText;
                resetChatConfigBtn.textContent = 'Sûr ?';

                resetTimeout = setTimeout(() => {
                    resetChatConfigBtn.classList.remove('confirming');
                    resetChatConfigBtn.textContent = originalText;
                }, 3000);
                return;
            }

            clearTimeout(resetTimeout);
            resetChatConfigBtn.classList.remove('confirming');
            resetChatConfigBtn.textContent = resetChatConfigBtn.dataset.originalText || 'Reset Config';

            try {
                await window.api.invoke('reset-widget-config', 'chat');
                showNotification('Configuration du Tchat réinitialisée !', 'success');
            } catch (e) {
                showNotification('Erreur lors de la réinitialisation : ' + e, 'error');
            }
        });
    }

    const spotifyAuthBtn = document.getElementById('spotifyAuthBtn');
    if (spotifyAuthBtn) spotifyAuthBtn.addEventListener('click', startSpotifyAuth);

    const saveEmoteWallBtn = document.getElementById('saveEmoteWallConfig');
    if (saveEmoteWallBtn) saveEmoteWallBtn.addEventListener('click', saveEmoteWallConfig);

    const updateStatus = document.getElementById('updateStatus');
    updateStatus.addEventListener('click', (e) => {
        if (!e.target.closest('.update-popover') && (updateStatus.classList.contains('update-available') || updateStatus.classList.contains('downloaded'))) {
            updateStatus.classList.toggle('active');
        }
    });
    document.getElementById('update-confirm-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        window.api.send('update-action', 'install');
    });
    document.getElementById('update-deny-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        updateStatus.classList.remove('active');
    });

    window.api.on('bot-status', (status) => updateBotStatus(status.connected ? 'connected' : 'disconnected'));
    window.api.on('update-status-check', (data) => updateUpdaterStatus(data.status));
    window.api.on('update-available', () => updateUpdaterStatus('update-available'));
    window.api.on('update-downloaded', () => updateUpdaterStatus('downloaded'));
    window.api.on('notification', (msg, type) => showNotification(msg, type));
    window.api.on('participants-updated', () => loadParticipants());
}

async function connectBot() {
    try {
        const result = await window.api.invoke('connect-bot');
        if (result.success) showNotification('Bot connecté !', 'success');
        else showNotification('Erreur connexion: ' + result.error, 'error');
    } catch (e) { showNotification('Erreur IPC: ' + e, 'error'); }
}

async function disconnectBot() {
    try {
        await window.api.invoke('disconnect-bot');
        showNotification('Bot déconnecté.', 'info');
    } catch (e) { showNotification('Erreur déconnexion: ' + e, 'error'); }
}

async function saveConfig() {
    const config = {
        username: document.getElementById('botUsername').value,
        token: document.getElementById('oauthToken').value,
        channel: document.getElementById('channelName').value,
        twitchClientId: document.getElementById('twitchClientId').value,
        twitchAppToken: document.getElementById('twitchAppToken').value,
        spotifyClientId: document.getElementById('spotifyClientId').value,
        spotifyClientSecret: document.getElementById('spotifyClientSecret').value
    };
    try {
        await window.api.invoke('save-config', config);
        showNotification('Configuration sauvegardée', 'success');
    } catch (e) { showNotification('Erreur sauvegarde: ' + e, 'error'); }
}



function updateConfigForm(config) {
    if (!config) return;
    document.getElementById('botUsername').value = config.username || '';
    document.getElementById('oauthToken').value = config.token || '';
    document.getElementById('channelName').value = config.channel || '';
    document.getElementById('twitchClientId').value = config.twitchClientId || '';
    document.getElementById('twitchAppToken').value = config.twitchAppToken || '';
    document.getElementById('spotifyClientId').value = config.spotifyClientId || '';
    document.getElementById('spotifyClientSecret').value = config.spotifyClientSecret || '';

    document.getElementById('giveawayCommand').value = config.giveawayCommand || '!giveaway';
    document.getElementById('giveawayStartMessage').value = config.giveawayStartMessage !== undefined ? config.giveawayStartMessage : 'Le giveaway commence ! Tapez !giveaway pour participer.';
    document.getElementById('giveawayStopMessage').value = config.giveawayStopMessage !== undefined ? config.giveawayStopMessage : 'Le giveaway est terminé !';
    document.getElementById('giveawayWinMessage').value = config.giveawayWinMessage !== undefined ? config.giveawayWinMessage : 'Félicitations {winner} !';

    document.getElementById('autoMessage').value = config.autoMessage || '';
    document.getElementById('autoMessageInterval').value = config.autoMessageInterval || 10;
    document.getElementById('clipCooldown').value = config.clipCooldown || 30;
}

function updateBotStatus(status) {
    const el = document.getElementById('connectionStatus');
    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('span:not(.status-dot)');

    el.className = 'status';
    if (status === 'connected') {
        el.classList.add('connected');
        text.textContent = 'Connecté';
    } else {
        el.classList.add('disconnected');
        text.textContent = 'Déconnecté';
    }
}

async function loadWidgetUrls() {
    try {
        const urls = await window.api.invoke('get-widget-urls');
        if (document.getElementById('widgetUrlDisplay')) document.getElementById('widgetUrlDisplay').textContent = urls.chat;
        if (document.getElementById('spotifyWidgetUrlDisplay')) document.getElementById('spotifyWidgetUrlDisplay').textContent = urls.spotify;
        if (document.getElementById('emoteWallWidgetUrlDisplay')) document.getElementById('emoteWallWidgetUrlDisplay').textContent = urls.emoteWall;
        if (document.getElementById('subgoalsWidgetUrlDisplay')) document.getElementById('subgoalsWidgetUrlDisplay').textContent = urls.subgoals;
        if (document.getElementById('subgoalsListWidgetUrlDisplay')) document.getElementById('subgoalsListWidgetUrlDisplay').textContent = urls.subgoalsList;
    } catch (e) { console.error('Erreur URLs widgets', e); }
}

async function startSpotifyAuth() {
    try {
        await window.api.invoke('start-spotify-auth');
    } catch (e) { showNotification('Erreur Auth Spotify: ' + e, 'error'); }
}

async function loadBadgePrefs() {
    try {
        const prefs = await window.api.invoke('get-badge-prefs');
        renderBadgePrefs(prefs);
    } catch (e) { console.error('Erreur chargement badges', e); }
}

function renderBadgePrefs(prefs) {
    const container = document.getElementById('badgePrefs');
    if (!container) return;
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'badge-grid';

    const badges = [
        { id: 'moderator', label: 'Modérateur' },
        { id: 'vip', label: 'VIP' },
        { id: 'subscriber', label: 'Abonné' },
        { id: 'founder', label: 'Fondateur' },
        { id: 'partner', label: 'Partenaire' },
        { id: 'premium', label: 'Prime Gaming' }
    ];

    badges.forEach(badge => {
        const isChecked = prefs[badge.id] !== false;
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" data-badge="${badge.id}" ${isChecked ? 'checked' : ''}> ${badge.label}`;
        grid.appendChild(label);
    });

    container.appendChild(grid);
}

async function saveBadgePrefs() {
    const checkboxes = document.querySelectorAll('#badgePrefs input[type="checkbox"]');
    const prefs = {};
    checkboxes.forEach(cb => {
        prefs[cb.dataset.badge] = cb.checked;
    });
    try {
        await window.api.invoke('save-badge-prefs', prefs);
        showNotification('Préférences badges sauvegardées', 'success');
    } catch (e) { showNotification('Erreur sauvegarde badges: ' + e, 'error'); }
}

async function loadEmoteWallConfig() {
    try {
        const config = await window.api.invoke('get-widget-config', 'emote-wall');
        if (config) {
            if (document.getElementById('emoteWallMinSize')) document.getElementById('emoteWallMinSize').value = config.minSize || 24;
            if (document.getElementById('emoteWallMaxSize')) document.getElementById('emoteWallMaxSize').value = config.maxSize || 64;
            if (document.getElementById('emoteWallSpawnInterval')) document.getElementById('emoteWallSpawnInterval').value = config.spawnInterval || 100;
            if (document.getElementById('emoteWallDuration')) document.getElementById('emoteWallDuration').value = config.animationDuration || 5000;
        }
    } catch (e) { console.error('Erreur chargement Emote Wall config', e); }
}

async function saveEmoteWallConfig() {
    const config = {
        minSize: parseInt(document.getElementById('emoteWallMinSize').value, 10),
        maxSize: parseInt(document.getElementById('emoteWallMaxSize').value, 10),
        spawnInterval: parseInt(document.getElementById('emoteWallSpawnInterval').value, 10),
        animationDuration: parseInt(document.getElementById('emoteWallDuration').value, 10)
    };
    try {
        await window.api.invoke('save-widget-config', 'emote-wall', config);
        showNotification('Config Mur d\'Emotes sauvegardée', 'success');
    } catch (e) { showNotification('Erreur sauvegarde Emote Wall: ' + e, 'error'); }
}


let subgoalsSteps = [];

function setupSubgoalsConfig() {
    const configureBtn = document.getElementById('configureSubgoalsBtn');

    if (configureBtn) {
        configureBtn.addEventListener('click', async () => {
            await window.api.invoke('open-subgoals-config');
        });
    }
}

async function loadSubgoalsConfig() {
    try {
        const config = await window.api.invoke('get-widget-config', 'subgoals');
        if (config) {
            document.getElementById('subgoalsStartCount').value = config.startCount || 0;
            document.getElementById('subgoalsGoalCount').value = config.goalCount || 100;
            subgoalsSteps = config.steps || [];
            renderSubgoalsSteps();
        }
    } catch (e) { console.error('Erreur chargement Subgoals config', e); }
}

function renderSubgoalsSteps() {
    const container = document.getElementById('subgoalsStepsList');
    container.innerHTML = '';

    subgoalsSteps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span><strong>${step.count}</strong> : ${step.label}</span>
            <button class="btn-link delete-btn" data-index="${index}" title="Supprimer">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events: none;">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            subgoalsSteps.splice(idx, 1);
            renderSubgoalsSteps();
        });
    });
}

async function saveSubgoalsConfig() {
    const config = {
        startCount: parseInt(document.getElementById('subgoalsStartCount').value, 10),
        goalCount: parseInt(document.getElementById('subgoalsGoalCount').value, 10),
        steps: subgoalsSteps
    };
    try {
        await window.api.invoke('save-widget-config', 'subgoals', config);
        showNotification('Config Subgoals sauvegardée', 'success');
    } catch (e) { showNotification('Erreur sauvegarde Subgoals: ' + e, 'error'); }
}
