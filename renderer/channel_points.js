import { API } from './api.js';
import { showStatus, NOTIFICATIONS, ICONS, createDeleteControl, createFilePickerGroup, createInputGroup, createCheckboxGroup, createSliderGroup } from './ui.js';


let rewardsList;
let rewardEditorContainer;
let isEditing = false;
let editingId = null;

let savedRewardSounds = {};
let savedRewardImages = {};



const DEFAULT_COLOR = '#00FF00';

function init() {
    rewardsList = document.getElementById('rewardsList');
    rewardEditorContainer = document.getElementById('reward-editor-static');

    const addBtn = document.getElementById('addRewardBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEditor());

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadRewards);

    const cancelBtn = document.getElementById('cancelRewardEditorBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);

    const saveBtn = document.getElementById('saveRewardEditorBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveReward);

    document.getElementById('rewardSoundPickBtn').addEventListener('click', async () => {
        try {
            const path = await API.openFileDialog([{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]);
            if (path) {
                document.getElementById('rewardSoundInput').value = `file://${path.replace(/\\/g, '/')}`;
            }
        } catch (e) { console.error(e); }
    });

    document.getElementById('rewardImagePickBtn').addEventListener('click', async () => {
        try {
            const path = await API.openFileDialog([{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }]);
            if (path) {
                document.getElementById('rewardImageInput').value = `file://${path.replace(/\\/g, '/')}`;
            }
        } catch (e) { console.error(e); }
    });


    const pointsTab = document.querySelector('.tab[data-tab="points"]');
    if (pointsTab) {
        pointsTab.addEventListener('click', () => {
            loadRewards();
            loadRewardSounds();
        });
    }

    loadRewardSounds();
    loadGlobalVolume();
}

async function loadGlobalVolume() {
    const vol = await window.api.invoke('get-points-global-volume');
    const container = document.querySelector('.points-header-controls');

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn && refreshBtn.parentNode) {
        let volContainer = document.getElementById('points-global-volume-container');
        if (!volContainer) {
            volContainer = document.createElement('div');
            volContainer.id = 'points-global-volume-container';
            volContainer.style.display = 'flex';
            volContainer.style.alignItems = 'center';
            volContainer.style.marginLeft = '15px';
            volContainer.style.gap = '10px';

            const label = document.createElement('span');
            label.textContent = 'Volume Global:';
            label.style.fontSize = '0.9em';
            label.style.color = 'var(--text-secondary)';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.05';
            slider.value = vol;
            slider.style.width = '100px';

            slider.addEventListener('input', async (e) => {
                await window.api.invoke('save-points-global-volume', parseFloat(e.target.value));
            });

            volContainer.appendChild(label);
            volContainer.appendChild(slider);
            refreshBtn.parentNode.insertBefore(volContainer, refreshBtn.nextSibling);
        }
    }
}

async function loadRewardSounds() {
    try {
        savedRewardSounds = await window.api.invoke('get-reward-sounds') || {};
        savedRewardImages = await window.api.invoke('get-reward-images') || {};


    } catch (e) {
        console.error('Error loading reward assets:', e);
    }
}

async function loadRewards() {
    if (!rewardsList) return;
    rewardsList.innerHTML = '<div class="loading-spinner">Chargement (Init)...</div>';
    closeEditor();

    try {
        rewardsList.innerHTML = '<div class="loading-spinner">Connexion au bot (IPC)...</div>';
        const rewards = await API.points.getRewards();
        rewardsList.innerHTML = '<div class="loading-spinner">Données reçues...</div>';
        renderRewards(rewards);
        showStatus('points-status-msg', 'Mise à jour réussie', 'success');
    } catch (e) {
        console.error(e);
        if (e.message && e.message.includes('partner or affiliate status')) {
            rewardsList.innerHTML = `
                <div class="empty-list" style="text-align: center; padding: 20px;">
                    <p><strong>Fonctionnalité indisponible</strong></p>
                    <p style="font-size: 0.9em; color: var(--text-secondary); margin-top: 10px;">
                        La gestion des points de chaîne nécessite le statut <strong>Affilié</strong> ou <strong>Partenaire</strong> Twitch.
                    </p>
                </div>`;
            showStatus('points-status-msg', 'Statut requis : Affilié/Partenaire', 'error');
        } else {
            rewardsList.innerHTML = '<div class="error-msg">Erreur lors du chargement des récompenses. Vérifiez la connexion du bot.</div>';
            showStatus('points-status-msg', 'Erreur chargement', 'error');
        }
    }
}

function renderRewards(rewards) {
    rewardsList.innerHTML = '';

    if (!rewards || rewards.length === 0) {
        rewardsList.innerHTML = '<div class="empty-list">Aucune récompense personnalisée trouvée.</div>';
        return;
    }

    rewards.sort((a, b) => a.cost - b.cost);

    rewards.forEach(reward => {
        const card = document.createElement('div');
        card.className = 'reward-card';
        card.style.borderLeft = `5px solid ${reward.background_color}`;

        const details = document.createElement('div');
        details.className = 'reward-details';

        const hasSound = savedRewardSounds[reward.id];
        const soundIcon = hasSound ? '<span title="Son configuré">🔊</span> ' : '';

        const title = document.createElement('div');
        title.className = 'reward-title';
        title.innerHTML = `${soundIcon}<strong>${reward.title}</strong> <span class="cost-badge">${reward.cost} pts</span>`;

        const sub = document.createElement('div');
        sub.className = 'reward-sub';
        const cooldownTxt = reward.global_cooldown_setting.is_enabled ? `${reward.global_cooldown_setting.global_cooldown_seconds}s` : 'Aucun';
        sub.textContent = `Cooldown: ${cooldownTxt} | Status: ${reward.is_enabled ? 'Activé' : 'Désactivé'}`;

        details.appendChild(title);
        details.appendChild(sub);

        const actions = document.createElement('div');
        actions.className = 'reward-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-secondary btn-sm';
        editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        editBtn.title = 'Modifier';
        editBtn.onclick = () => openEditor(reward);

        const deleteControl = createDeleteControl(async () => {
            try {
                await API.points.deleteReward(reward.id);
                const newSounds = { ...savedRewardSounds };
                delete newSounds[reward.id];
                await window.api.invoke('save-reward-sounds', newSounds);
                savedRewardSounds = newSounds;

                showStatus('points-status-msg', 'Récompense supprimée', 'success');
                loadRewards();
            } catch (e) {
                console.error(e);
                showStatus('points-status-msg', NOTIFICATIONS.ERROR.DELETE.replace('{error}', e.message), 'error');
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteControl);

        card.appendChild(details);
        card.appendChild(actions);
        rewardsList.appendChild(card);
    });
}

function openEditor(reward = null) {
    if (!rewardEditorContainer) return;

    isEditing = !!reward;
    editingId = reward ? reward.id : null;

    document.getElementById('reward-editor-title').textContent = isEditing ? 'Modifier la récompense' : 'Nouvelle récompense';
    document.getElementById('saveRewardEditorBtn').textContent = isEditing ? 'Sauvegarder' : 'Créer';

    document.getElementById('rewardNameInput').value = reward ? reward.title : '';
    document.getElementById('rewardCostInput').value = reward ? reward.cost : 100;
    document.getElementById('rewardPromptInput').value = reward ? (reward.prompt || '') : '';
    document.getElementById('rewardColorInput').value = reward ? reward.background_color : DEFAULT_COLOR;

    const hasCooldown = reward && reward.global_cooldown_setting && reward.global_cooldown_setting.is_enabled;
    document.getElementById('rewardCooldownInput').value = hasCooldown ? reward.global_cooldown_setting.global_cooldown_seconds : 0;

    document.getElementById('rewardEnabledInput').checked = (!reward || reward.is_enabled);
    document.getElementById('rewardUserInputInput').checked = (reward && reward.is_user_input_required);

    document.getElementById('rewardSoundInput').value = (reward && savedRewardSounds[reward.id]) ? savedRewardSounds[reward.id] : '';
    document.getElementById('rewardImageInput').value = (reward && savedRewardImages[reward.id]) ? savedRewardImages[reward.id] : '';

    rewardEditorContainer.classList.remove('hidden');
    rewardsList.classList.add('hidden');
}

function closeEditor() {
    if (rewardEditorContainer) {
        rewardEditorContainer.classList.add('hidden');
    }
    if (rewardsList) rewardsList.classList.remove('hidden');
    isEditing = false;
    editingId = null;
}

async function saveReward() {
    const title = document.getElementById('rewardNameInput').value.trim();
    const cost = parseInt(document.getElementById('rewardCostInput').value, 10);
    const color = document.getElementById('rewardColorInput').value;
    const cooldown = parseInt(document.getElementById('rewardCooldownInput').value, 10);
    const isEnabled = document.getElementById('rewardEnabledInput').checked;
    const userInput = document.getElementById('rewardUserInputInput').checked;


    const promptText = document.getElementById('rewardPromptInput').value.trim();

    const soundInput = document.getElementById('rewardSoundInput');
    const soundPath = soundInput ? soundInput.value : '';

    const imageInput = document.getElementById('rewardImageInput');
    const imagePath = imageInput ? imageInput.value : '';

    if (!title || cost < 1) {
        showStatus('points-status-msg', 'Nom et coût (>0) requis', 'error');
        return;
    }

    const data = {
        title: title,
        cost: cost,
        background_color: color,
        is_enabled: isEnabled,
        is_user_input_required: userInput,
        prompt: promptText,
        is_global_cooldown_enabled: cooldown > 0,
        global_cooldown_seconds: cooldown > 0 ? cooldown : undefined
    };


    if (cooldown > 0) {
        data.is_global_cooldown_enabled = true;
        data.global_cooldown_seconds = cooldown;
    } else {
        data.is_global_cooldown_enabled = false;
        data.global_cooldown_seconds = 0;
    }

    try {
        let finalId = editingId;
        if (isEditing) {
            try {
                await API.points.updateReward(editingId, data);
                showStatus('points-status-msg', 'Récompense modifiée', 'success');
            } catch (e) {
                const isForbidden = e.message && (e.message.includes('403') || e.message.includes('Forbidden'));
                if (isForbidden) {
                    console.warn('[POINTS] Cannot edit Twitch reward (not owned). Saving local config only.');
                    showStatus('points-status-msg', 'Réglages Twitch bloqués (externe), alerte sauvegardée', 'warning');
                } else {
                    throw e;
                }
            }
        } else {
            const newRew = await API.points.createReward(data);
            finalId = newRew.id;
            showStatus('points-status-msg', 'Récompense créée', 'success');
        }

        if (finalId) {
            const newSounds = { ...savedRewardSounds };
            if (soundPath) {
                newSounds[finalId] = soundPath;
            } else {
                delete newSounds[finalId];
            }
            await window.api.invoke('save-reward-sounds', newSounds);
            savedRewardSounds = newSounds;

            const newImages = { ...savedRewardImages };
            if (imagePath) {
                newImages[finalId] = imagePath;
            } else {
                delete newImages[finalId];
            }
            await window.api.invoke('save-reward-images', newImages);
            savedRewardImages = newImages;


        }


        closeEditor();
        loadRewards();
    } catch (e) {
        console.error(e);
        showStatus('points-status-msg', NOTIFICATIONS.ERROR.SAVE + ' ' + (e.message || ''), 'error');
    }
}



document.addEventListener('DOMContentLoaded', init);

