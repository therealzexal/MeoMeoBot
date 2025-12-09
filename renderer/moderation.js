import { showNotification, createDeleteControl, NOTIFICATIONS } from './ui.js';

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

        const span = document.createElement('span');
        span.textContent = word;

        const deleteControl = createDeleteControl(() => removeBannedWord(word));

        div.appendChild(span);
        div.appendChild(deleteControl);

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
        showNotification(NOTIFICATIONS.BANNED_WORD_ADDED.replace('{word}', word), 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.ADD.replace('{error}', error), 'error');
    }
}

async function removeBannedWord(word) {
    try {
        await window.api.invoke('remove-banned-word', word);
        loadBannedWords();
        showNotification(NOTIFICATIONS.BANNED_WORD_REMOVED.replace('{word}', word), 'info');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.DELETE.replace('{error}', error), 'error');
    }
}

export async function clearBannedWords() {
    try {
        await window.api.invoke('clear-banned-words');
        loadBannedWords();
        setStatus('clear-banned-words-status', NOTIFICATIONS.SUCCESS.CLEARED, 'success');
    } catch (error) {
        setStatus('clear-banned-words-status', NOTIFICATIONS.ERROR.CLEAR.replace('{error}', error), 'error');
        console.error(error);
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
        setStatus('auto-message-status', NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        setStatus('auto-message-status', NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

export async function saveClipConfig() {
    const cooldown = parseInt(document.getElementById('clipCooldown').value, 10);
    try {
        await window.api.invoke('save-config', { clipCooldown: cooldown });
        setStatus('clip-config-status', NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        setStatus('clip-config-status', NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

function setStatus(elementId, msg, type = 'success') {
    const statusMsg = document.getElementById(elementId);
    if (!statusMsg) return;

    statusMsg.textContent = msg;
    statusMsg.style.color = type === 'success' ? '#4ecca3' : '#e63946';
    statusMsg.style.opacity = '1';

    setTimeout(() => {
        statusMsg.style.opacity = '0';
        setTimeout(() => {
            statusMsg.textContent = '';
        }, 300);
    }, 2000);
}
