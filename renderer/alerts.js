import { NOTIFICATIONS, createRow, createInputGroup, createSliderGroup, createSelectGroup, createFilePickerGroup, showStatus } from './ui.js';
import { API } from './api.js';

let currentType = 'follow';
let currentConfig = {};
let widgetPort = 8097;

let sidebar;
let configForm;
let initialized = false;

const EVENT_TYPES = {
    'follow': { label: 'Follow', defaultText: '{username} suit la chaîne !', hasMessage: false },
    'sub': { label: 'Sub', defaultText: '{username} s\'est abonné !', hasMessage: false },
    'subgift': { label: 'Subgift', defaultText: '{username} a offert {amount} sub{s} !', hasMessage: false },
    'resub': { label: 'Re-Sub', defaultText: '{username} s\'est réabonné ({months} mois) !', hasMessage: true },
    'donation': { label: 'Dons', defaultText: '{username} a fait un don de {amount} !', hasMessage: true },
    'cheer': { label: 'Bits', defaultText: '{username} a envoyé {amount} bits !', hasMessage: true },
    'raid': { label: 'Raid', defaultText: 'Raid de {username} !', hasMessage: false },
    'hypetrain': { label: 'Hype Train', defaultText: 'Hype Train Niveau {amount} !', hasMessage: false }
};

const alertsWidget = API.createWidgetHelper('alerts');

function init() {
    if (initialized) return;
    initialized = true;

    sidebar = document.querySelector('.alerts-sidebar');
    configForm = document.getElementById('alert-config-form');

    setupPreview();

    updateSidebarState();
    renderForm(currentType);

    alertsWidget.onRefresh((globalConfig, appConfig) => {
        currentConfig = globalConfig || {};

        if (appConfig && appConfig.alertsWidgetPort && appConfig.alertsWidgetPort !== 49968) {
            widgetPort = appConfig.alertsWidgetPort;
        } else {
            widgetPort = 8097;
        }

        if (currentType && currentType !== 'themes') updatePreview(currentType);
        else if (currentType === 'themes') updateGlobalThemePreview(currentConfig.customCSS);

        updateSidebarState();
        if (currentType === 'themes') {
            renderThemesTab();
        } else {
            renderForm(currentType);
        }
    });

    const saveBtn = document.getElementById('saveAlertsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveConfig);

    const testBtn = document.getElementById('testAlertBtn');
    if (testBtn) testBtn.addEventListener('click', triggerTest);

    const typeBtns = document.querySelectorAll('.alert-type-btn');
    typeBtns.forEach(btn => {
        const type = btn.dataset.type;
        if (type) {
            btn.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    switchType(type);
                }
            });

            const checkbox = btn.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    updateConfig(type, 'enabled', e.target.checked);
                });
            }
        }
    });
}



function updateSidebarState() {
    document.querySelectorAll('.alert-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === currentType);
    });

    Object.keys(EVENT_TYPES).forEach(type => {
        const checkbox = document.getElementById(`check-${type}`);
        if (checkbox) {
            const typeConfig = currentConfig[type] || {};
            checkbox.checked = typeConfig.enabled !== false;
        }
    });
}

function switchType(type) {
    currentType = type;
    updateSidebarState();
    if (type === 'themes') {
        renderThemesTab();
    } else {
        renderForm(type);
        updatePreview(type);
    }
}

const DEFAULT_CSS = `
.alert-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}
.alert-image {
    max-width: 600px;
    margin-bottom: 20px;
}
.alert-image img {
    width: 100%;
    display: block;
    filter: drop-shadow(0 5px 15px rgba(0, 0, 0, 0.5));
}
.alert-text {
    font-size: 24px;
    font-weight: 900;
    color: white;
    line-height: 1.2;
}
.alert-message {
    font-size: 32px;
    font-weight: 700;
    color: #eee;
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
    margin-top: 15px;
}
.alert-username {
    font-size: 22px;
    font-family: 'Road Rage', cursive !important;
    color: yellow;
    text-shadow: 4px 4px #000000;
}
`;

function renderThemesTab() {
    configForm.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'alert-config-group';
    container.style.flex = '1';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';

    const textarea = document.createElement('textarea');
    textarea.className = 'css-editor-textarea';
    textarea.style.flex = '1';
    textarea.style.width = '100%';
    textarea.style.background = '#222';
    textarea.style.color = '#fff';
    textarea.style.border = '1px solid #444';
    textarea.style.padding = '10px';
    textarea.style.marginTop = '20px';
    textarea.style.marginBottom = '20px';
    textarea.style.resize = 'none';

    textarea.value = currentConfig.customCSS || DEFAULT_CSS;

    textarea.addEventListener('change', (e) => {
        currentConfig.customCSS = e.target.value;
    });

    let debounceTimer;
    textarea.addEventListener('input', (e) => {
        currentConfig.customCSS = e.target.value;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateGlobalThemePreview(currentConfig.customCSS);
        }, 500);
    });

    container.appendChild(textarea);

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '10px';
    btnContainer.style.marginBottom = '10px';
    container.appendChild(btnContainer);

    function showResetButton() {
        btnContainer.innerHTML = '';
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn btn-danger';
        resetBtn.textContent = 'Réinitialiser le thème (Défaut)';
        resetBtn.style.flex = '1';
        resetBtn.onclick = () => showConfirmation();
        btnContainer.appendChild(resetBtn);
    }

    function showConfirmation() {
        btnContainer.innerHTML = '';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.textContent = 'Confirmer ?';
        confirmBtn.style.flex = '1';
        confirmBtn.onclick = async () => {
            try {
                await API.widgets.resetConfig('alerts');
                currentConfig.customCSS = '';
                textarea.value = DEFAULT_CSS;
                updateGlobalThemePreview(DEFAULT_CSS);
                showStatus('alerts-status-msg', 'Thème réinitialisé avec succès', 'success');
                showResetButton();
            } catch (e) {
                console.error(e);
                showStatus('alerts-status-msg', 'Erreur lors de la réinitialisation', 'error');
                showResetButton();
            }
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.style.flex = '1';
        cancelBtn.onclick = () => showResetButton();

        btnContainer.appendChild(confirmBtn);
        btnContainer.appendChild(cancelBtn);
    }

    showResetButton();

    configForm.appendChild(container);

    updateGlobalThemePreview(currentConfig.customCSS || '');
}

function renderForm(type) {
    if (!configForm) return;
    configForm.innerHTML = '';

    const typeConfig = currentConfig[type] || {};
    const meta = EVENT_TYPES[type];

    const container = document.createElement('div');
    container.className = 'compact-container';

    const urlDisplay = document.createElement('div');
    urlDisplay.className = 'widget-url-display';
    urlDisplay.innerHTML = `<span style="color:var(--text-secondary); margin-right:5px;">Source OBS:</span> <code class="chat-widget-url">http://127.0.0.1:${widgetPort}/widget/alerts</code>`;
    container.appendChild(urlDisplay);

    container.appendChild(createInputGroup('Message', typeConfig.textTemplate || meta.defaultText, (val) => updateConfig(type, 'textTemplate', val)));

    const visualRow = createRow();
    visualRow.appendChild(createFilePickerGroup('Image', typeConfig.image, 'image', (val) => updateConfig(type, 'image', val)));
    visualRow.appendChild(createFilePickerGroup('Son', typeConfig.audio, 'audio', (val) => updateConfig(type, 'audio', val)));
    container.appendChild(visualRow);

    const settingsRow = createRow();
    settingsRow.appendChild(createSelectGroup('Disposition', typeConfig.layout || 'top', [
        { value: 'top', label: 'Image au-dessus' },
        { value: 'side', label: 'Image à gauche' }
    ], (val) => updateConfig(type, 'layout', val)));

    settingsRow.appendChild(createSliderGroup('Volume', typeConfig.volume !== undefined ? typeConfig.volume : 0.5, (val) => updateConfig(type, 'volume', parseFloat(val))));
    settingsRow.appendChild(createInputGroup('Durée (ms)', typeConfig.duration || 5000, (val) => updateConfig(type, 'duration', parseInt(val)), 'number'));
    container.appendChild(settingsRow);

    configForm.appendChild(container);
    updatePreview(type);
}

function updateConfig(type, key, value) {
    if (!currentConfig[type]) currentConfig[type] = {};
    currentConfig[type][key] = value;
    updatePreview(type);
}

function setupPreview() {
    const container = document.getElementById('alert-preview-container');
    if (!container) return;

    if (!container.shadowRoot) {
        container.attachShadow({ mode: 'open' });
    }
    const shadow = container.shadowRoot;
    shadow.innerHTML = '';

    const structuralStyle = document.createElement('style');
    structuralStyle.textContent = `
        :host { display: block; width: 100%; height: 100%; position: relative; overflow: hidden; font-family: 'Inter', sans-serif; }
        * { box-sizing: border-box; }
        .alert-box {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center;
            width: 100%; height: 100%; pointer-events: none;
            opacity: 0;
        }
        .alert-content { pointer-events: auto; }
        img { max-width: 100%; height: auto; }
    `;
    shadow.appendChild(structuralStyle);

    const fontContainer = document.createElement('div');
    fontContainer.style.display = 'none';
    fontContainer.innerHTML = '';
    shadow.appendChild(fontContainer);

    const themeStyle = document.createElement('style');
    themeStyle.id = 'theme-style';
    shadow.appendChild(themeStyle);

    const wrapper = document.createElement('div');
    wrapper.id = 'alert-wrapper';
    wrapper.className = 'alert-box';
    wrapper.innerHTML = `
        <div id="alert-image-container" class="alert-image"></div>
        <div class="alert-content">
            <div id="alert-text" class="alert-text"></div>
            <div id="alert-message" class="alert-message"></div>
        </div>
        <audio id="alert-audio"></audio>
    `;
    shadow.appendChild(wrapper);

    connectPreviewWebSocket(shadow);
}

function connectPreviewWebSocket(shadow) {
    const ws = new WebSocket(`ws://127.0.0.1:${widgetPort}`);
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'alert') {
                if (data.alert.type === 'reward-redemption') return;
                playShadowAlert(shadow, data.alert);
            } else if (data.type === 'skip') {
                const wrapper = shadow.getElementById('alert-wrapper');
                if (wrapper) wrapper.style.opacity = '0';
            }
        } catch (e) { console.error(e); }
    };
}

function transformLocalPath(path) {
    if (!path) return path;
    if (path.startsWith('http')) return path;

    try {
        let rawPath = path;
        if (rawPath.startsWith('file://')) {
            rawPath = rawPath.replace(/^file:\/\//, '');
        }

        try { rawPath = decodeURIComponent(rawPath); } catch (e) {
            console.error('[Preview] Decode error', e);
        }

        if (navigator.platform.toUpperCase().indexOf('WIN') >= 0 || rawPath.match(/^\/[a-zA-Z]:/)) {
            if (rawPath.startsWith('/')) rawPath = rawPath.substring(1);
        }

        return `http://127.0.0.1:${widgetPort}/local-file?path=${encodeURIComponent(rawPath)}`;
    } catch (e) {
        console.error('[Preview] Path transform error', e);
        return path;
    }
}

function playShadowAlert(shadow, alert) {
    const wrapper = shadow.getElementById('alert-wrapper');
    const imgContainer = shadow.getElementById('alert-image-container');
    const textContainer = shadow.getElementById('alert-text');
    const msgContainer = shadow.getElementById('alert-message');
    const audio = shadow.getElementById('alert-audio');

    if (!wrapper) return;

    wrapper.className = 'alert-box';
    wrapper.classList.remove('animate-in', 'animate-out');
    void wrapper.offsetWidth;

    imgContainer.innerHTML = '';
    if (alert.image) {
        let imgPath = transformLocalPath(alert.image);
        const img = document.createElement('img');
        img.src = imgPath;
        img.onerror = (e) => console.error('[Preview] Image load failed:', e);
        imgContainer.appendChild(img);
    } else {
        imgContainer.innerHTML = '<div style="font-size:48px; color:#777;">[IMG]</div>';
    }

    textContainer.innerHTML = (alert.text || '')
        .replace('{username}', '<span class="alert-username">Pseudo</span>')
        .replace('{amount}', '<span class="alert-amount">100</span>')
        .replace('{months}', '<span class="alert-months">12</span>')
        .replace('{s}', 's');

    msgContainer.innerHTML = alert.message || '';

    if (alert.layout === 'side') wrapper.classList.add('layout-side-by-side');

    if (alert.audio) {
        audio.src = transformLocalPath(alert.audio);
        audio.volume = alert.volume !== undefined ? alert.volume : 0.5;
        audio.play().catch(e => console.error('[Preview] Audio play failed:', e));
    } else {
        audio.src = '';
    }

    wrapper.style.opacity = '1';
    wrapper.classList.add('animate-in');

    const duration = alert.duration || 5000;
    setTimeout(() => {
        wrapper.classList.remove('animate-in');
        wrapper.classList.add('animate-out');
        if (!audio.paused) {
            let fadeOut = setInterval(() => {
                if (audio.volume > 0.05) {
                    audio.volume = Math.max(0, audio.volume - 0.05);
                } else {
                    clearInterval(fadeOut);
                    audio.pause();
                    audio.currentTime = 0;
                }
            }, 50);
        }
    }, duration);
}

function updatePreview(type) {
    setupPreview();
    const container = document.getElementById('alert-preview-container');
    if (!container || !container.shadowRoot) return;

    const css = currentConfig.customCSS || '';
    const shadow = container.shadowRoot;
    const themeStyle = shadow.getElementById('theme-style') || shadow.querySelector('#preview-scaler #theme-style');

    const defaultThemeCSS = `
        .animate-in { animation: bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
        .animate-out { animation: fadeOut 0.5s ease forwards; }

        @keyframes bounceIn {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
            70% { transform: translate(-50%, -50%) scale(0.9); }
            100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            to { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }

        .layout-side-by-side { flex-direction: row !important; }
        .layout-side-by-side .alert-image { margin-right: 20px; margin-bottom: 0; }
        
        .alert-text { 
            font-size: 24px; 
            font-weight: 900; 
            color: white; 
            text-shadow: 0 4px 8px rgba(0,0,0,0.8); 
            line-height: 1.2; 
        }
        .alert-message { 
            font-size: 16px; 
            font-weight: 700; 
            color: #eee; 
            text-shadow: 0 4px 8px rgba(0,0,0,0.8); 
            margin-top: 15px; 
        }
        .alert-image { max-width: 600px; margin-bottom: 30px; }
        .alert-image img { width: 100%; display: block; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5)); }
        
        .alert-username {
            font-size: 32px;
            font-family: 'Road Rage', cursive;
            color: yellow;
            letter-spacing: 0.2rem;
            text-shadow: 4px 4px #000000;
        }
    `;

    if (themeStyle) {
        themeStyle.textContent = css || defaultThemeCSS;
    }
}

function updateGlobalThemePreview(css) {
    const container = document.getElementById('alert-preview-container');
    if (!container) return;

    if (!container.shadowRoot) setupPreview();

    const shadow = container.shadowRoot;
    const themeStyle = shadow.getElementById('theme-style') || shadow.querySelector('#preview-scaler #theme-style');

    if (themeStyle) {
        const defaultThemeCSS = `
            .animate-in { animation: bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
            .animate-out { animation: fadeOut 0.5s ease forwards; }

            @keyframes bounceIn {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
                50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
                70% { transform: translate(-50%, -50%) scale(0.9); }
                100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
            @keyframes fadeOut {
                from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                to { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            }

            .layout-side-by-side { flex-direction: row !important; }
            .layout-side-by-side .alert-image { margin-right: 20px; margin-bottom: 0; }
            
            .alert-box {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
            }
            .alert-image {
                max-width: 600px;
                margin-bottom: 30px;
            }
            .alert-image img {
                width: 100%;
                display: block;
                filter: drop-shadow(0 5px 15px rgba(0, 0, 0, 0.5));
            }
            .alert-text {
                font-size: 24px;
                font-weight: 900;
                color: white;
                line-height: 1.2;
            }
            .alert-message {
                font-size: 32px;
                font-weight: 700;
                color: #eee;
                text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
                margin-top: 15px;
            }
            .alert-username {
                font-size: 22px;
                font-family: 'Road Rage', cursive !important;
                font-weight: 400 !important;
                font-style: normal;
                color: yellow;
                text-transform: uppercase;
                letter-spacing: 0.2rem;
                text-shadow: 4px 4px #000000;
            }
        `;
        themeStyle.textContent = css || defaultThemeCSS;
    }
}

async function saveConfig() {
    try {
        await API.widgets.saveConfig('alerts', currentConfig);
        showStatus('alerts-status-msg', NOTIFICATIONS.SUCCESS.SAVED, 'success');
        return true;
    } catch (e) {
        console.error(e);
        showStatus('alerts-status-msg', NOTIFICATIONS.ERROR.SAVE, 'error');
        return false;
    }
}

async function triggerTest() {
    try {
        const savedConfig = await API.widgets.getConfig('alerts');
        const config = (savedConfig && savedConfig[currentType]) ? savedConfig[currentType] : {};

        const dummyData = {
            type: currentType,
            username: 'TestUser',
            amount: 100,
            text: (config.textTemplate || EVENT_TYPES[currentType].defaultText)
                .replace('{username}', '<span class="alert-username">Zexal</span>')
                .replace('{amount}', '<span class="alert-amount">100</span>')
                .replace('{months}', '<span class="alert-months">12</span>')
                .replace('{s}', 's'),
            image: config.image,
            audio: config.audio,
            volume: config.volume,
            duration: config.duration,
            layout: config.layout
        };

        await API.alerts.triggerTest(dummyData);
    } catch (e) {
        console.error(e);
        showStatus('alerts-status-msg', 'Erreur Test', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}
