import { API } from './api.js';
import { showStatus, NOTIFICATIONS, ICONS, createDeleteControl } from './ui.js';

let rewardsList;
let rewardEditorOverlay;
let isEditing = false;
let editingId = null;

const DEFAULT_COLOR = '#00FF00';

function init() {
    rewardsList = document.getElementById('rewardsList');
    rewardEditorOverlay = document.getElementById('reward-editor-overlay');

    const addBtn = document.getElementById('addRewardBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEditor());

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadRewards);

    const saveBtn = document.getElementById('saveRewardBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveReward);

    const cancelBtn = document.getElementById('cancelRewardBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);


    const pointsTab = document.querySelector('.tab[data-tab="points"]');
    if (pointsTab) {
        pointsTab.addEventListener('click', () => {
            loadRewards();
        });
    }
}

async function loadRewards() {
    if (!rewardsList) return;
    rewardsList.innerHTML = '<div class="loading-spinner">Chargement...</div>';

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

        const title = document.createElement('div');
        title.className = 'reward-title';
        title.innerHTML = `<strong>${reward.title}</strong> <span class="cost-badge">${reward.cost} pts</span>`;

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
        editBtn.innerHTML = ICONS.edit;
        editBtn.onclick = () => openEditor(reward);

        const deleteControl = createDeleteControl(async () => {
            try {
                await API.points.deleteReward(reward.id);
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
    if (!rewardEditorOverlay) return;

    isEditing = !!reward;
    editingId = reward ? reward.id : null;

    document.getElementById('reward-editor-title').textContent = isEditing ? 'Modifier Récompense' : 'Nouvelle Récompense';
    document.getElementById('rewardName').value = reward ? reward.title : '';
    document.getElementById('rewardCost').value = reward ? reward.cost : 100;
    document.getElementById('rewardColor').value = reward ? reward.background_color : DEFAULT_COLOR;

    const hasCooldown = reward && reward.global_cooldown_setting && reward.global_cooldown_setting.is_enabled;
    document.getElementById('rewardGlobalCooldown').value = hasCooldown ? reward.global_cooldown_setting.global_cooldown_seconds : 0;

    document.getElementById('rewardIsEnabled').checked = reward ? reward.is_enabled : true;
    document.getElementById('rewardUserInput').checked = reward ? reward.is_user_input_required : false;

    rewardEditorOverlay.classList.add('active');
}

function closeEditor() {
    if (rewardEditorOverlay) rewardEditorOverlay.classList.remove('active');
    isEditing = false;
    editingId = null;
}

async function saveReward() {
    const title = document.getElementById('rewardName').value.trim();
    const cost = parseInt(document.getElementById('rewardCost').value, 10);
    const color = document.getElementById('rewardColor').value;
    const cooldown = parseInt(document.getElementById('rewardGlobalCooldown').value, 10);
    const isEnabled = document.getElementById('rewardIsEnabled').checked;
    const userInput = document.getElementById('rewardUserInput').checked;

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

    try {
        if (isEditing) {
            await API.points.updateReward(editingId, data);
            showStatus('points-status-msg', 'Récompense modifiée', 'success');
        } else {
            await API.points.createReward(data);
            showStatus('points-status-msg', 'Récompense créée', 'success');
        }
        closeEditor();
        loadRewards();
    } catch (e) {
        console.error(e);
        showStatus('points-status-msg', NOTIFICATIONS.ERROR.SAVE, 'error');
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
    }
    .reward-details {
        flex: 1;
    }
    .reward-title {
        font-weight: 500;
        font-size: 14px;
        display: flex;
        align-items: center;
    }
    .cost-badge {
        background: #9147ff;
        color: white;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        margin-left: 8px;
    }
    .reward-sub {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 4px;
    }
    .reward-actions {
        display: flex;
        gap: 5px;
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', init);
