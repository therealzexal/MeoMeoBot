import { NOTIFICATIONS, createRow, createInputGroup, createSliderGroup, createSelectGroup, createFilePickerGroup, showStatus } from './ui.js';
import { API } from './api.js';

let currentType = 'follow';
let currentConfig = {};
let widgetPort = 8097;

let sidebar;
let configForm;
let previewFrame;
let scalerWrapper;



const EVENT_TYPES = {
    'follow': { label: 'Follow', defaultText: '{username} suit la chaîne !', hasMessage: false },
    'sub': { label: 'Sub', defaultText: '{username} s\'est abonné !', hasMessage: false },
    'resub': { label: 'Re-Sub', defaultText: '{username} s\'est réabonné ({months} mois) !', hasMessage: true },
    'donation': { label: 'Dons', defaultText: '{username} a fait un don de {amount} !', hasMessage: true },
    'cheer': { label: 'Bits', defaultText: '{username} a envoyé {amount} bits !', hasMessage: true },
    'raid': { label: 'Raid', defaultText: 'Raid de {username} !', hasMessage: false }
};


const alertsWidget = API.createWidgetHelper('alerts');

function init() {
    sidebar = document.querySelector('.alerts-sidebar');
    configForm = document.getElementById('alert-config-form');
    previewFrame = document.getElementById('preview-frame');
    scalerWrapper = document.getElementById('preview-frame-wrapper');

    if (scalerWrapper && scalerWrapper.parentElement) {
        updatePreviewScale();
        const resizeObserver = new ResizeObserver(() => {
            updatePreviewScale();
        });
        resizeObserver.observe(scalerWrapper.parentElement);
    }




    renderSidebar();
    renderForm(currentType);

    alertsWidget.onRefresh((globalConfig, appConfig) => {
        currentConfig = globalConfig || {};


        if (appConfig && appConfig.alertsWidgetPort && appConfig.alertsWidgetPort !== 49968) {
            widgetPort = appConfig.alertsWidgetPort;
        } else {
            widgetPort = 8097;
        }

        const urlCode = document.getElementById('alertsWidgetUrlDisplay');
        if (urlCode) {
            urlCode.textContent = `http://127.0.0.1:${widgetPort}/widget/alerts`;
        }

        if (currentType && currentType !== 'themes') updatePreview(currentType);
        else if (currentType === 'themes') updateGlobalThemePreview(currentConfig.customCSS);



        renderSidebar();
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


    function updatePreviewScale() {
        if (!scalerWrapper) return;
        const parent = scalerWrapper.parentElement;
        if (!parent) return;

        const parentWidth = parent.clientWidth;
        parent.style.height = `${parentWidth * 9 / 16}px`;

        const targetWidth = 640;
        const scale = parentWidth / targetWidth;

        scalerWrapper.style.transformOrigin = 'center center';
        scalerWrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
        scalerWrapper.style.top = '50%';
        scalerWrapper.style.left = '50%';
    }



    function renderSidebar() {
        if (!sidebar) return;
        sidebar.innerHTML = '';

        Object.keys(EVENT_TYPES).forEach(type => {
            const meta = EVENT_TYPES[type];
            const isActive = type === currentType;
            const typeConfig = currentConfig[type] || {};
            const isEnabled = typeConfig.enabled !== false;

            const btn = document.createElement('div');
            btn.className = `alert-type-btn ${isActive ? 'active' : ''}`;
            btn.dataset.type = type;

            btn.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    switchType(type);
                }
            };

            const label = document.createElement('span');
            label.textContent = meta.label;

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = isEnabled;
            toggle.onclick = (e) => {
                updateConfig(type, 'enabled', e.target.checked);
            };

            btn.appendChild(label);
            btn.appendChild(toggle);
            sidebar.appendChild(btn);
        });

        const themeBtn = document.createElement('div');
        themeBtn.className = `alert-type-btn ${currentType === 'themes' ? 'active' : ''}`;
        themeBtn.onclick = () => switchType('themes');
        themeBtn.innerHTML = '<span>Thèmes Global</span>';
        sidebar.appendChild(themeBtn);
    }

    function switchType(type) {
        currentType = type;
        renderSidebar();
        if (type === 'themes') {
            renderThemesTab();
        } else {
            renderForm(type);
            updatePreview(type);
        }
    }

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


        const legacyPattern = /\.alert-text\s*\{\s*font-size:\s*1\.5em;/;
        if (currentConfig.customCSS && legacyPattern.test(currentConfig.customCSS)) {
            currentConfig.customCSS = `
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
    font-size: 36px;
    font-weight: 900;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}
.alert-message {
    font-size: 24px;
    font-weight: 700;
    color: #eee;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    margin-top: 10px;
}
`;
        }

        textarea.value = currentConfig.customCSS || `
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
    font-size: 36px;
    font-weight: 900;
    color: white;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
}
.alert-message {
    font-size: 24px;
    font-weight: 700;
    color: #eee;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    margin-top: 10px;
}
`;
        textarea.addEventListener('change', (e) => {
            if (!currentConfig.globalTheme) currentConfig.globalTheme = '';
            currentConfig.globalTheme = e.target.value;
        });

        textarea.addEventListener('input', (e) => {
            if (!currentConfig.customCSS) currentConfig.customCSS = '';
            currentConfig.customCSS = e.target.value;
            updateGlobalThemePreview(currentConfig.customCSS);
        });

        container.appendChild(textarea);
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

    function updatePreview(type) {
        if (!previewFrame) return;
        const config = currentConfig[type] || {};
        const meta = EVENT_TYPES[type];








        const css = currentConfig.customCSS || '';
        const html = getAlertsPreviewHtml(type, config, css, meta);

        previewFrame.srcdoc = html;
    }

    function updateGlobalThemePreview(css) {


        const sampleType = 'follow';
        const config = currentConfig[sampleType] || {};
        const meta = EVENT_TYPES[sampleType];

        const html = getAlertsPreviewHtml(sampleType, config, css, meta);
        if (previewFrame) previewFrame.srcdoc = html;
    }

    function getAlertsPreviewHtml(type, config, css, meta) {
        const defaultCSS = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: 'Inter', sans-serif; }
        
        #alert-container {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center;
            transition: opacity 0.3s;
        }

        /* Animation Classes */
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
        .alert-text { font-size: 12px; font-weight: 900; color: white; text-shadow: 0 2px 4px rgba(0,0,0,0.8); line-height: 1.2; }
        .alert-message { font-size: 12px; font-weight: 700; color: #eee; text-shadow: 0 2px 4px rgba(0,0,0,0.8); margin-top: 10px; }
        .alert-image { max-width: 600px; margin-bottom: 20px; }
        .alert-image img { width: 100%; display: block; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5)); }
    `;


        let text = config.textTemplate || meta.defaultText;
        text = text.replace('{username}', 'Pseudo');
        text = text.replace('{amount}', '100');
        text = text.replace('{months}', '12');

        const layoutClass = config.layout === 'side' ? 'layout-side-by-side' : '';

        let imageHtml = '';
        if (config.image) {
            imageHtml = `<div id="alert-image" class="alert-image"><img src="${config.image}"></div>`;
        } else {
            imageHtml = `<div id="alert-image" class="alert-image" style="font-size:48px; color:#777;">[IMG]</div>`;
        }

        let messageHtml = '';
        if (meta.hasMessage || config.message) {
            messageHtml = `<div id="alert-message" class="alert-message">Ceci est un message de test.</div>`;
        }


        const script = `
        const container = document.getElementById('alert-container');
        const imgContainer = document.querySelector('#alert-image');
        const textContainer = document.getElementById('alert-text');
        const msgContainer = document.getElementById('alert-message');
        const audio = document.getElementById('alert-audio');
        
        const ws = new WebSocket('ws://127.0.0.1:${widgetPort}');
        ws.onopen = () => console.log('Preview Connected to WS');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'alert') {
                    playAlert(data.alert);
                } else if (data.type === 'skip') {
                     container.style.opacity = '0';
                }
            } catch(e) { console.error(e); }
        };

        function playAlert(alert) {
             container.className = 'alert-box';
             container.classList.remove('animate-in', 'animate-out');
             void container.offsetWidth; // Reflow

             const imgWrapper = document.getElementById('alert-image');
             imgWrapper.innerHTML = '';
             if (alert.image) {
                const img = document.createElement('img');
                img.src = alert.image;
                imgWrapper.appendChild(img);
             }

             document.getElementById('alert-text').innerHTML = alert.text || '';
             document.getElementById('alert-message').innerHTML = alert.message || '';

             if (alert.layout === 'side') container.classList.add('layout-side-by-side');

             if (alert.audio) {
                 audio.src = alert.audio;
                 audio.volume = alert.volume !== undefined ? alert.volume : 0.5;
                 audio.play().catch(e => console.log(e));
             }

             container.style.opacity = '1';
             container.classList.add('animate-in');
             
             setTimeout(() => {
                 container.classList.remove('animate-in');
                 container.classList.add('animate-out');
             }, alert.duration || 5000);
        }
    `;

        return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            ${defaultCSS}
            ${css}
        </style>
    </head>
    <body>
        <div id="alert-container" class="alert-box ${layoutClass}">
            ${imageHtml}
            <div id="alert-text-wrapper">
                <div id="alert-text" class="alert-text">${text}</div>
                ${messageHtml}
            </div>
        </div>
        <audio id="alert-audio"></audio>
        <script>${script}</script>
    </body>
    </html>`;
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
                text: (config.textTemplate || EVENT_TYPES[currentType].defaultText).replace('{username}', 'Zexal').replace('{amount}', '100'),
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
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}
