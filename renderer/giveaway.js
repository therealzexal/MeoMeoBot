import { showNotification } from './ui.js';

export async function loadParticipants() {
    try {
        const participants = await window.api.invoke('get-participants');
        updateParticipantsList(participants);

        const isActive = await window.api.invoke('is-giveaway-active');
        updateGiveawayStatus(isActive);
    } catch (error) {
        console.error('Erreur chargement participants:', error);
    }
}

function updateParticipantsList(participants) {
    const list = document.getElementById('participantsList');
    const count = document.getElementById('participantsCount');
    list.innerHTML = '';
    count.textContent = `${participants.length} participants`;

    participants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = p;
        list.appendChild(div);
    });
}

function updateGiveawayStatus(isActive) {
    const startBtn = document.getElementById('startGiveawayBtn');
    const stopBtn = document.getElementById('stopGiveawayBtn');

    if (isActive) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}

export async function startGiveaway() {
    try {
        await window.api.invoke('start-giveaway');
        showNotification('Giveaway démarré !', 'success');
        updateGiveawayStatus(true);
        loadParticipants();
    } catch (error) {
        showNotification('Erreur démarrage giveaway: ' + error, 'error');
    }
}

export async function stopGiveaway() {
    try {
        await window.api.invoke('stop-giveaway');
        showNotification('Giveaway arrêté.', 'info');
        updateGiveawayStatus(false);
    } catch (error) {
        showNotification('Erreur arrêt giveaway: ' + error, 'error');
    }
}

export async function drawWinner() {
    try {
        const result = await window.api.invoke('draw-winner');
        const winner = result.winner;
        const display = document.getElementById('winnerDisplay');
        if (winner) {
            display.textContent = `🏆 Vainqueur : ${winner} !`;
            display.classList.add('animate-winner');
            showNotification(`Vainqueur : ${winner}`, 'success');
        } else {
            display.textContent = 'Aucun participant...';
            showNotification('Aucun participant pour le tirage.', 'error');
        }
    } catch (error) {
        showNotification('Erreur tirage: ' + error, 'error');
    }
}

export async function clearParticipants() {
    try {
        await window.api.invoke('clear-participants');
        loadParticipants();
        document.getElementById('winnerDisplay').textContent = '';
        showNotification('Liste des participants vidée.', 'info');
    } catch (error) {
        showNotification('Erreur nettoyage: ' + error, 'error');
    }
}

export async function saveGiveawayConfig() {
    const command = document.getElementById('giveawayCommand').value;
    const startMsg = document.getElementById('giveawayStartMessage').value;
    const stopMsg = document.getElementById('giveawayStopMessage').value;

    try {
        await window.api.invoke('save-config', {
            giveawayCommand: command,
            giveawayStartMessage: startMsg,
            giveawayStopMessage: stopMsg
        });
        showNotification('Configuration Giveaway sauvegardée', 'success');
    } catch (error) {
        showNotification('Erreur sauvegarde: ' + error, 'error');
    }
}
