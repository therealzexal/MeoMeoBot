export function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(() => {
        notif.remove();
    }, 3000);
}

export function setupConfirmationOverlay() {
    const overlay = document.getElementById('confirmationOverlay');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');
    let currentCallback = null;

    window.showConfirmation = (message, callback) => {
        document.getElementById('confirmationMessage').textContent = message;
        currentCallback = callback;
        overlay.classList.add('active');
    };

    confirmYes.onclick = () => {
        if (currentCallback) currentCallback();
        overlay.classList.remove('active');
        currentCallback = null;
    };

    confirmNo.onclick = () => {
        overlay.classList.remove('active');
        currentCallback = null;
    };
}

export function setupWindowControls() {
    document.getElementById('minimize-btn').addEventListener('click', () => window.api.send('window-control', 'minimize'));
    document.getElementById('maximize-btn').addEventListener('click', () => window.api.send('window-control', 'maximize'));
    document.getElementById('close-btn').addEventListener('click', () => window.api.send('window-control', 'close'));
}

export function updateUpdaterStatus(status) {
    const statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;

    statusEl.className = 'status';
    statusEl.classList.add(status);

    const textEl = statusEl.querySelector('.update-text-label');
    if (status === 'checking') textEl.textContent = 'Recherche de mises à jour...';
    if (status === 'up-to-date') textEl.textContent = 'À jour';
    if (status === 'update-available') textEl.textContent = 'Mise à jour disponible';
    if (status === 'downloading') textEl.textContent = 'Téléchargement...';
    if (status === 'downloaded') textEl.textContent = 'Prêt à installer';
    if (status === 'error') textEl.textContent = 'Erreur maj';
}
