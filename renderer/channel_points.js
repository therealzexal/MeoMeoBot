import { API } from './api.js';
import { showStatus, NOTIFICATIONS, ICONS, createDeleteControl, createFilePickerGroup, createInputGroup, createCheckboxGroup } from './ui.js';

let rewardsList;
let rewardEditorContainer;
let isEditing = false;
let editingId = null;

let savedRewardSounds = {};
let savedRewardImages = {};

const DEFAULT_COLOR = '#00FF00';

function init() {
    rewardsList = document.getElementById('rewardsList');

    let existingEditor = document.getElementById('reward-editor-integrated');
    if (!existingEditor) {
        rewardEditorContainer = document.createElement('div');
        rewardEditorContainer.id = 'reward-editor-integrated';
        rewardEditorContainer.className = 'reward-editor-container hidden';
        if (rewardsList && rewardsList.parentNode) {
            rewardsList.parentNode.insertBefore(rewardEditorContainer, rewardsList);
        }
    } else {
        rewardEditorContainer = existingEditor;
    }

    const addBtn = document.getElementById('addRewardBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEditor());

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadRewards);


    const pointsTab = document.querySelector('.tab[data-tab="points"]');
    if (pointsTab) {
        pointsTab.addEventListener('click', () => {
            loadRewards();
            loadRewardSounds();
        });
    }

    loadRewardSounds();
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
        editBtn.innerHTML = ICONS.edit || '✎';
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

    rewardEditorContainer.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = isEditing ? 'Modifier la récompense' : 'Nouvelle récompense';
    title.style.marginBottom = '15px';
    title.style.borderBottom = '1px solid #444';
    title.style.paddingBottom = '10px';
    rewardEditorContainer.appendChild(title);

    const formFuncs = document.createElement('div');
    formFuncs.className = 'reward-form-grid';

    formFuncs.appendChild(createInputGroup('Nom', reward ? reward.title : '',
        (v) => { }, 'text', 'rewardNameInput'));

    formFuncs.appendChild(createInputGroup('Coût', reward ? reward.cost : 100,
        (v) => { }, 'number', 'rewardCostInput'));

    const promptVal = reward ? (reward.prompt || '') : '';
    // Custom textarea creation since createInputGroup is for inputs
    const promptDiv = document.createElement('div');
    promptDiv.className = 'form-group';
    promptDiv.innerHTML = '<label>Description (Prompt)</label>';
    const promptArea = document.createElement('textarea');
    promptArea.id = 'rewardPromptInput';
    promptArea.value = promptVal;
    promptArea.rows = 3;
    promptDiv.appendChild(promptArea);
    formFuncs.appendChild(promptDiv);

    const colorDiv = document.createElement('div');
    colorDiv.className = 'input-group';
    colorDiv.innerHTML = `<label>Couleur</label><input type="color" id="rewardColorInput" value="${reward ? reward.background_color : DEFAULT_COLOR}" style="width:100%; height:40px; padding:0; border:none;">`;
    formFuncs.appendChild(colorDiv);

    const hasCooldown = reward && reward.global_cooldown_setting && reward.global_cooldown_setting.is_enabled;
    const cooldownVal = hasCooldown ? reward.global_cooldown_setting.global_cooldown_seconds : 0;
    formFuncs.appendChild(createInputGroup('Cooldown Global (sec)', cooldownVal, (v) => { }, 'number', 'rewardCooldownInput'));

    const currentSound = (reward && savedRewardSounds[reward.id]) ? savedRewardSounds[reward.id] : '';
    formFuncs.appendChild(createFilePickerGroup('Son de l\'alerte', currentSound, 'audio', async (val) => {
    }, 'rewardSoundInput'));

    const currentImage = (reward && savedRewardImages[reward.id]) ? savedRewardImages[reward.id] : '';
    formFuncs.appendChild(createFilePickerGroup('Image de l\'alerte', currentImage, 'image', async (val) => {
    }, 'rewardImageInput'));

    rewardEditorContainer.appendChild(formFuncs);

    const checks = document.createElement('div');
    checks.style.display = 'flex';
    checks.style.gap = '20px';
    checks.style.marginTop = '15px';

    const enableCheck = document.createElement('div');
    enableCheck.innerHTML = `<label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="rewardEnabledInput" ${(!reward || reward.is_enabled) ? 'checked' : ''}> Activer la récompense</label>`;

    const inputCheck = document.createElement('div');
    inputCheck.innerHTML = `<label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="rewardUserInputInput" ${(reward && reward.is_user_input_required) ? 'checked' : ''}> Demander du texte (User Input)</label>`;

    checks.appendChild(enableCheck);
    checks.appendChild(inputCheck);
    rewardEditorContainer.appendChild(checks);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';
    btnRow.style.marginTop = '20px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.onclick = closeEditor;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = isEditing ? 'Sauvegarder' : 'Créer';
    saveBtn.onclick = saveReward;

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    rewardEditorContainer.appendChild(btnRow);

    rewardEditorContainer.classList.remove('hidden');
    rewardsList.classList.add('hidden');
}

function closeEditor() {
    if (rewardEditorContainer) {
        rewardEditorContainer.classList.add('hidden');
        rewardEditorContainer.innerHTML = '';
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

const style = document.createElement('style');
style.innerHTML = `
    .reward-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        padding: 10px 15px;
        margin-bottom: 8px;
        border-radius: 4px;
        transition: transform 0.2s;
    }
    .reward-card:hover {
        transform: translateX(2px);
    }
    .reward-details { flex: 1; }
    .reward-title { font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 8px; }
    .cost-badge { background: #9147ff; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; }
    .reward-sub { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
    .reward-actions { display: flex; gap: 5px; }
    
    .reward-editor-container {
        background: var(--bg-secondary);
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        border: 1px solid var(--border-color);
    }
    .hidden { display: none !important; }
    
    .reward-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', init);

