
let currentType = 'follow';
let currentConfig = {};
let widgetPort = 8093;

const sidebar = document.querySelector('.alerts-sidebar');
const configForm = document.getElementById('alert-config-form');
const previewContainer = document.getElementById('preview-alert-container');
const previewImage = document.getElementById('preview-image');
const previewText = document.getElementById('preview-text');
const previewMessage = document.getElementById('preview-message');
const statusMsg = document.getElementById('alerts-status-msg');

const EVENT_TYPES = {
    'follow': { label: 'Follow', defaultText: '{username} suit la chaîne !', hasMessage: false },
    'sub': { label: 'Abonnement', defaultText: '{username} s\'est abonné !', hasMessage: false },
    'raid': { label: 'Raid', defaultText: 'Raid de {username} !', hasMessage: false },
    'cheer': { label: 'Bits', defaultText: '{username} a envoyé {amount} bits !', hasMessage: true }
};

function init() {
    window.api.invoke('get-widget-config', 'alerts').then(globalConfig => {
        currentConfig = globalConfig || {};

        window.api.invoke('get-config').then(appConfig => {
            if (appConfig && appConfig.alertsWidgetPort) {
                widgetPort = appConfig.alertsWidgetPort;
            }
            renderSidebar();
            renderForm(currentType);
        });

        const saveBtn = document.getElementById('saveAlertsBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveConfig);

        const testBtn = document.getElementById('testAlertBtn');
        if (testBtn) testBtn.addEventListener('click', triggerTest);

    }).catch(err => {
        console.error(err);
    });
}

function showStatus(msg, type = 'success') {
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.style.color = type === 'success' ? 'var(--success)' : 'var(--danger)';
    statusMsg.style.opacity = '1';

    setTimeout(() => {
        statusMsg.style.opacity = '0';
        setTimeout(() => {
            statusMsg.textContent = '';
        }, 500);
    }, 2000);
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
}

function switchType(type) {
    currentType = type;
    renderSidebar();
    renderForm(type);
    updatePreview(type);
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
    urlDisplay.innerHTML = `<span style="color:var(--text-secondary); margin-right:5px;">Source OBS :</span> <code class="chat-widget-url">http://127.0.0.1:${widgetPort}/widget/alerts</code>`;
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

function createRow() {
    const div = document.createElement('div');
    div.className = 'form-row';
    return div;
}

function createInputGroup(label, value, onChange, type = 'text') {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.addEventListener('input', (e) => onChange(e.target.value));
    div.appendChild(input);
    return div;
}

function createSliderGroup(label, value, onChange) {
    const div = document.createElement('div');
    div.className = 'form-group';
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.innerHTML = `<label>${label}</label><span>${Math.round(value * 100)}%</span>`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = 0;
    input.max = 1;
    input.step = 0.05;
    input.value = value;
    input.style.width = '100%';
    input.addEventListener('input', (e) => {
        header.querySelector('span').textContent = `${Math.round(e.target.value * 100)}%`;
        onChange(e.target.value);
    });
    div.appendChild(header);
    div.appendChild(input);
    return div;
}

function createSelectGroup(label, value, options, onChange) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label>${label}</label>`;
    const select = document.createElement('select');
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === value) o.selected = true;
        select.appendChild(o);
    });
    select.addEventListener('change', (e) => onChange(e.target.value));
    div.appendChild(select);
    return div;
}

function createFilePickerGroup(label, value, type, onChange) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label>${label}</label>`;

    const container = document.createElement('div');
    container.className = 'file-picker-container';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.readOnly = true;
    input.placeholder = 'Aucun fichier';

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = '...';
    btn.onclick = async () => {
        const filters = type === 'image'
            ? [{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }]
            : [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }];

        try {
            const path = await window.api.invoke('open-file-dialog', filters);
            if (path) {
                const fileUri = `file://${path.replace(/\\/g, '/')}`;
                input.value = fileUri;
                onChange(fileUri);
            }
        } catch (e) {
            console.error(e);
        }
    };

    container.appendChild(input);
    container.appendChild(btn);
    div.appendChild(container);
    return div;
}

function updateConfig(type, key, value) {
    if (!currentConfig[type]) currentConfig[type] = {};
    currentConfig[type][key] = value;
    updatePreview(type);
}

function updatePreview(type) {
    if (!previewContainer) return;
    const config = currentConfig[type] || {};
    const meta = EVENT_TYPES[type];

    previewImage.innerHTML = '';
    previewText.textContent = '';
    previewMessage.textContent = '';
    previewContainer.className = '';

    if (config.layout === 'side') {
        previewContainer.style.flexDirection = 'row';
        previewContainer.style.alignItems = 'center';
        previewImage.style.marginRight = '20px';
    } else {
        previewContainer.style.flexDirection = 'column';
        previewImage.style.marginRight = '0';
    }

    if (config.image) {
        const img = document.createElement('img');
        img.src = config.image;
        img.style.maxWidth = '150px';
        img.style.maxHeight = '100px';
        previewImage.appendChild(img);
    } else {
        previewImage.textContent = '[IMG]';
        previewImage.style.color = '#777';
        previewImage.style.fontSize = '12px';
    }

    let text = config.textTemplate || meta.defaultText;
    text = text.replace('{username}', 'Pseudo');
    text = text.replace('{amount}', '100');
    previewText.textContent = text;
}

async function saveConfig() {
    try {
        await window.api.invoke('save-widget-config', 'alerts', currentConfig);
        showStatus('Sauvegardé !', 'success');
        return true;
    } catch (e) {
        console.error(e);
        showStatus('Erreur', 'error');
        return false;
    }
}

async function triggerTest() {
    try {
        const savedConfig = await window.api.invoke('get-widget-config', 'alerts');
        const config = (savedConfig && savedConfig[currentType]) ? savedConfig[currentType] : {};

        const dummyData = {
            type: currentType,
            username: 'TestUser',
            amount: 100,
            text: (config.textTemplate || EVENT_TYPES[currentType].defaultText).replace('{username}', 'TestUser').replace('{amount}', '100'),
            image: config.image,
            audio: config.audio,
            volume: config.volume,
            duration: config.duration,
            layout: config.layout
        };

        await window.api.invoke('trigger-alert-test', dummyData);
    } catch (e) {
        console.error(e);
        showStatus('Erreur Test', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}
