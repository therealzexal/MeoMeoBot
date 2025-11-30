import { showNotification } from './ui.js';

export async function loadBannedWords() {
    try {
        const response = await window.api.invoke('get-banned-words');
        updateBannedWordsList(response.bannedWords || []);
    } catch (error) {
        console.error('Erreur chargement mots bannis:', error);
    }
}

function updateBannedWordsList(words) {
    const list = document.getElementById('bannedWordsList');
    list.innerHTML = '';

    words.forEach(word => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span>${word}</span>
            <div class="controls">
                <button class="control-button delete-btn" title="Supprimer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                <button class="control-button confirm-btn" style="display: none;" title="Confirmer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#00b35f" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </button>
                <button class="control-button cancel-btn" style="display: none;" title="Annuler">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#e91916" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        `;

        const delBtn = div.querySelector('.delete-btn');
        const confirmBtn = div.querySelector('.confirm-btn');
        const cancelBtn = div.querySelector('.cancel-btn');

        delBtn.onclick = () => {
            delBtn.style.display = 'none';
            confirmBtn.style.display = 'inline-flex';
            cancelBtn.style.display = 'inline-flex';
        };

        cancelBtn.onclick = () => {
            confirmBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            delBtn.style.display = 'inline-flex';
        };

        confirmBtn.onclick = () => removeBannedWord(word);

        list.appendChild(div);
    });
}

export async function addBannedWord() {
    const input = document.getElementById('newBannedWord');
    const word = input.value.trim();
    if (!word) return;

    try {
        await window.api.invoke('add-banned-word', word);
        input.value = '';
        loadBannedWords();
        showNotification(`Mot "${word}" banni`, 'success');
    } catch (error) {
        showNotification('Erreur ajout mot banni: ' + error, 'error');
    }
}

async function removeBannedWord(word) {
    try {
        await window.api.invoke('remove-banned-word', word);
        loadBannedWords();
        showNotification(`Mot "${word}" débanni`, 'info');
    } catch (error) {
        showNotification('Erreur suppression: ' + error, 'error');
    }
}

export async function clearBannedWords() {
    try {
        await window.api.invoke('clear-banned-words');
        loadBannedWords();
        showNotification('Liste des mots bannis vidée', 'info');
    } catch (error) {
        showNotification('Erreur nettoyage: ' + error, 'error');
    }
}

export async function saveAutoMessage() {
    const message = document.getElementById('autoMessage').value;
    const interval = parseInt(document.getElementById('autoMessageInterval').value, 10);

    try {
        await window.api.invoke('save-config', {
            autoMessage: message,
            autoMessageInterval: interval
        });
        showNotification('Message auto sauvegardé', 'success');
    } catch (error) {
        showNotification('Erreur sauvegarde: ' + error, 'error');
    }
}

export async function saveClipConfig() {
    const cooldown = parseInt(document.getElementById('clipCooldown').value, 10);
    try {
        await window.api.invoke('save-config', { clipCooldown: cooldown });
        showNotification('Config Clip sauvegardée', 'success');
    } catch (error) {
        showNotification('Erreur sauvegarde: ' + error, 'error');
    }
}
