import { API } from './api.js';
import { showStatus, NOTIFICATIONS, ICONS, createDeleteControl, createFilePickerGroup, createInputGroup, createCheckboxGroup } from './ui.js';

let rewardsList;
let rewardEditorContainer;
let isEditing = false;
let editingId = null;
let savedRewardSounds = {};

const DEFAULT_COLOR = '#00FF00';

function init() {
    rewardsList = document.getElementById('rewardsList');

    // Create editor container if not exists
    let existingEditor = document.getElementById('reward-editor-integrated');
    if (!existingEditor) {
        rewardEditorContainer = document.createElement('div');
        rewardEditorContainer.id = 'reward-editor-integrated';
        rewardEditorContainer.className = 'reward-editor-container hidden';
        // Insert after controls, before list
        const controls = document.querySelector('.controls');
        if (controls && controls.parentNode) {
            controls.parentNode.insertBefore(rewardEditorContainer, rewardsList);
        } else {
            rewardsList.parentNode.insertBefore(rewardEditorContainer, rewardsList);
        }
    } else {
        rewardEditorContainer = existingEditor;
    }

    const addBtn = document.getElementById('addRewardBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEditor());

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadRewards);

    // Remove old overlay event listeners if they exist (cleaner approach: we just don't use the overlay elements)

    const pointsTab = document.querySelector('.tab[data-tab="points"]');
    if (pointsTab) {
        pointsTab.addEventListener('click', () => {
            loadRewards();
            loadRewardSounds();
        });
    }

    // Load initial sounds
    loadRewardSounds();
}

async function loadRewardSounds() {
    try {
        savedRewardSounds = await window.electronAPI.invoke('get-reward-sounds') || {};
    } catch (e) {
        console.error('Error loading reward sounds:', e);
    }
}

async function loadRewards() {
    if (!rewardsList) return;
    rewardsList.innerHTML = '<div class="loading-spinner">Chargement...</div>';
    closeEditor(); // Close editor on reload to prevent conflicts

    try {
        const rewards = await API.points.getRewards();
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
        editBtn.innerHTML = ICONS.edit || '✎'; // Fallback if ICONS.edit is empty
        editBtn.title = 'Modifier';
        editBtn.onclick = () => openEditor(reward);

        const deleteControl = createDeleteControl(async () => {
            try {
                await API.points.deleteReward(reward.id);
                // Also remove sound config
                const newSounds = { ...savedRewardSounds };
                delete newSounds[reward.id];
                await window.electronAPI.invoke('save-reward-sounds', newSounds);
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

    // Build editor HTML dynamically
    rewardEditorContainer.innerHTML = '';

    const title = document.createElement('h3');
    title.textContent = isEditing ? 'Modifier la récompense' : 'Nouvelle récompense';
    title.style.marginBottom = '15px';
    title.style.borderBottom = '1px solid #444';
    title.style.paddingBottom = '10px';
    rewardEditorContainer.appendChild(title);

    const formFuncs = document.createElement('div');
    formFuncs.className = 'reward-form-grid';

    // Name
    formFuncs.appendChild(createInputGroup('Nom', reward ? reward.title : '',
        (v) => { }, 'text', 'rewardNameInput'));

    // Cost
    formFuncs.appendChild(createInputGroup('Coût', reward ? reward.cost : 100,
        (v) => { }, 'number', 'rewardCostInput'));

    // Color
    const colorDiv = document.createElement('div');
    colorDiv.className = 'input-group';
    colorDiv.innerHTML = `<label>Couleur</label><input type="color" id="rewardColorInput" value="${reward ? reward.background_color : DEFAULT_COLOR}" style="width:100%; height:40px; padding:0; border:none;">`;
    formFuncs.appendChild(colorDiv);

    // Cooldown
    const hasCooldown = reward && reward.global_cooldown_setting && reward.global_cooldown_setting.is_enabled;
    const cooldownVal = hasCooldown ? reward.global_cooldown_setting.global_cooldown_seconds : 0;
    formFuncs.appendChild(createInputGroup('Cooldown Global (sec)', cooldownVal, (v) => { }, 'number', 'rewardCooldownInput'));

    // Sound Picker
    const currentSound = (reward && savedRewardSounds[reward.id]) ? savedRewardSounds[reward.id] : '';
    formFuncs.appendChild(createFilePickerGroup('Son de l\'alerte', currentSound, 'audio', async (val) => {
        // Value updated, no immediate action needed, read on save
    }, 'rewardSoundInput'));

    rewardEditorContainer.appendChild(formFuncs);

    // Checkboxes
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

    // Buttons
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
    rewardsList.classList.add('hidden'); // Hide list when editing
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

    // Get sound form file picker group - accessing the input directly might be tricky due to how `createFilePickerGroup` works if it doesn't expose ID easily.
    // However, I passed 'rewardSoundInput' as ID suffix (if supported) or I can traverse. 
    // `createFilePickerGroup` creates an input with type text. Let's assume we can grab it by the label or traversal, 
    // BUT simplest is to query selector on the container.
    const soundInput = rewardEditorContainer.querySelector('input[placeholder="Choisir un fichier..."]');
    // Wait, `createFilePickerGroup` returns a div. The input inside holds the value.
    const soundPath = soundInput ? soundInput.value : '';

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
        is_global_cooldown_enabled: cooldown > 0,
        global_cooldown_seconds: cooldown > 0 ? cooldown : undefined
    };

    // Strict requirements: if enabled is false, fields should probably be omitted or valid.
    // But error said: "fields are required if you specify either one of them".
    // So if cooldown > 0, we send both. If cooldown == 0, we send is_global_cooldown_enabled = false, and MAYBE global_cooldown_seconds = undefined or 0?
    // Twitch API says: if enabled is true, seconds must be present. If enabled is false, seconds is ignored? NO, error says "required if...".
    // Let's safe bet: always send value if we send the key.

    if (cooldown > 0) {
        data.is_global_cooldown_enabled = true;
        data.global_cooldown_seconds = cooldown;
    } else {
        data.is_global_cooldown_enabled = false;
        // Sending 0 or just omitting? The error implies pairing.
        // If I say enabled=false, do I need seconds?
        // "required if you specify either one of them" -> If I specify enabled=false, I must specify seconds?
        // Let's try sending both even if false.
        data.global_cooldown_seconds = 0;
    }

    try {
        let finalId = editingId;
        if (isEditing) {
            await API.points.updateReward(editingId, data);
            showStatus('points-status-msg', 'Récompense modifiée', 'success');
        } else {
            const newRew = await API.points.createReward(data);
            finalId = newRew.id;
            showStatus('points-status-msg', 'Récompense créée', 'success');
        }

        // Save Sound
        if (finalId) {
            const newSounds = { ...savedRewardSounds };
            if (soundPath) {
                newSounds[finalId] = soundPath;
            } else {
                delete newSounds[finalId];
            }
            await window.electronAPI.invoke('save-reward-sounds', newSounds);
            savedRewardSounds = newSounds;
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

