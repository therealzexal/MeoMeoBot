const defaultCss = {
    chat: `body {
    background: transparent;
    overflow: hidden;
    font-family: sans-serif;
    margin: 0;
    padding: 0;
    color: white;
}

#chat-container {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100vh;
    width: 500px;
    padding: 10px 10px 24px 10px;
    gap: 10px;
    box-sizing: border-box;
}

.msg-group {
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    animation: slideInBottom 0.3s ease-out forwards;
    word-wrap: break-word;
}

.msg-header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    flex-wrap: wrap;
}

.msg-username {
    font-weight: 700;
}

.msg-badges {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-img {
    width: 18px;
    height: 18px;
    object-fit: contain;
}

.msg-messages {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.msg-line {
    color: #e7eef5;
    line-height: 1.4;
}

.msg-line img {
    vertical-align: middle;
}

@keyframes slideInBottom {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}`,
    spotify: `body {
    background: transparent;
    margin: 0;
    padding: 0;
    font-family: "Inter", "Segoe UI", sans-serif;
    color: #f5f7fb;
    overflow: hidden;
}

#spotify-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    transition: opacity 0.35s ease;
}

#spotify-wrapper.is-hidden {
    opacity: 0;
    pointer-events: none;
}

.spotify-card {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 12px;
    padding: 14px;
    border-radius: 16px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
    color: #f5f7fb;
    max-width: 520px;
    box-sizing: border-box;
}

.spotify-cover {
    width: 140px;
    height: 140px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    background: #111;
}

.spotify-infos {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.spotify-title {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
}

.spotify-artist {
    font-size: 16px;
    color: #cdd7e5;
}

.spotify-album {
    font-size: 14px;
    color: #9fb4d1;
}

.pill {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 12px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #d3deef;
}`,
    'emote-wall': `body {
    background: transparent;
    overflow: hidden;
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
}

.emote {
    position: absolute;
    will-change: transform, opacity;
    pointer-events: none;
}`
};

const cssClasses = {
    chat: [
        { class: '.msg-group', desc: 'Conteneur principal d\'un groupe de messages d\'un utilisateur' },
        { class: '.msg-header', desc: 'En-tête contenant le nom et les badges' },
        { class: '.msg-username', desc: 'Nom de l\'utilisateur' },
        { class: '.msg-badges', desc: 'Conteneur des badges' },
        { class: '.badge-img', desc: 'Image d\'un badge' },
        { class: '.msg-messages', desc: 'Conteneur des lignes de message' },
        { class: '.msg-line', desc: 'Une ligne de message individuelle' },
        { class: '.user-<username>', desc: 'Classe dynamique pour cibler un utilisateur spécifique (ex: .user-alice)' },
        { class: 'var(--user-color)', desc: 'Couleur du pseudo de l\'utilisateur' },
        { class: 'var(--user-color-soft)', desc: 'Couleur du pseudo avec transparence (0.15)' },
        { class: 'var(--text-primary)', desc: 'Couleur du texte des messages' },
        { class: 'var(--text-shadow)', desc: 'Ombre portée du texte' }
    ],
    spotify: [
        { class: '#spotify-wrapper', desc: 'Conteneur principal centré' },
        { class: '.spotify-card', desc: 'Carte contenant la pochette et les infos' },
        { class: '.spotify-cover', desc: 'Image de la pochette d\'album' },
        { class: '.spotify-infos', desc: 'Conteneur des informations textuelles' },
        { class: '.spotify-title', desc: 'Titre' },
        { class: '.spotify-artist', desc: 'Nom de l\'artiste' },
        { class: '.spotify-album', desc: 'Nom de l\'album' },
        { class: '.pill', desc: 'Badge "En lecture"' },
        { class: 'var(--spotify-bg)', desc: 'Couleur de fond de la carte' },
        { class: 'var(--spotify-border)', desc: 'Bordure de la carte' },
        { class: 'var(--spotify-shadow)', desc: 'Ombre de la carte' },
        { class: 'var(--text-primary)', desc: 'Couleur du titre' },
        { class: 'var(--text-secondary)', desc: 'Couleur de l\'artiste' },
        { class: 'var(--text-tertiary)', desc: 'Couleur de l\'album' },
        { class: 'var(--pill-bg)', desc: 'Fond du badge "En lecture"' },
        { class: 'var(--pill-text)', desc: 'Texte du badge "En lecture"' }
    ],
    'emote-wall': [
        { class: '.emote', desc: 'Image d\'une emote flottante' }
    ]
};


let cssInput, maxMessagesInput, statusBar, nameLabel;
let currentWidget = 'chat';
let currentWidgetConfig = {};

function setStatus(msg, type) {
    if (!statusBar) return;
    statusBar.textContent = msg;
    statusBar.className = `css-editor-status ${type}`;
    setTimeout(() => {
        if (statusBar) {
            statusBar.textContent = '';
            statusBar.className = 'css-editor-status';
        }
    }, 3000);
}

async function loadThemes(widget) {
    try {
        const themes = await window.api.invoke('get-themes', widget);
        const configStr = await window.api.invoke('get-theme-config');
        const config = JSON.parse(configStr || '{}');
        const selector = document.getElementById('themeSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">Défaut</option>';
        themes.forEach(t => {
            const displayName = config[t] || t.replace('.css', '');
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = displayName;
            selector.appendChild(opt);
        });
    } catch (e) {
        console.error('Error loading themes:', e);
    }
}

function openConfigEditor() {
    const modal = document.getElementById('themeConfigModal');
    const container = document.getElementById('themeListContainer');
    container.innerHTML = '';

    const selector = document.getElementById('themeSelector');
    const options = Array.from(selector.options).filter(o => o.value);

    options.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'theme-config-row';

        const label = document.createElement('div');
        label.className = 'theme-config-filename';
        label.textContent = opt.value;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'theme-name-input';
        input.placeholder = 'Nom affiché';
        input.value = opt.text === opt.value.replace('.css', '') ? '' : opt.text;
        input.dataset.filename = opt.value;

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '5px';
        controls.style.marginLeft = '10px';

        const delBtn = document.createElement('button');
        delBtn.className = 'control-button';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        delBtn.title = 'Supprimer ce thème';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'control-button';
        confirmBtn.style.display = 'none';
        confirmBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#00b35f" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        confirmBtn.title = 'Confirmer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'control-button';
        cancelBtn.style.display = 'none';
        cancelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#e91916" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        cancelBtn.title = 'Annuler';

        delBtn.onclick = () => {
            delBtn.style.display = 'none';
            confirmBtn.style.display = 'flex';
            cancelBtn.style.display = 'flex';
        };

        cancelBtn.onclick = () => {
            confirmBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            delBtn.style.display = 'flex';
        };

        confirmBtn.onclick = async () => {
            try {
                const res = await window.api.invoke('delete-theme', currentWidget, opt.value);
                if (res.success) {
                    row.remove();
                    await loadThemes(currentWidget);
                    setStatus('Thème supprimé', 'ok');
                } else {
                    alert('Erreur suppression: ' + res.message);
                }
            } catch (e) {
                alert('Erreur: ' + e);
            }
        };

        controls.appendChild(delBtn);
        controls.appendChild(confirmBtn);
        controls.appendChild(cancelBtn);

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(controls);
        container.appendChild(row);
    });

    modal.style.display = 'flex';
}

async function loadWidgetConfig(widgetName) {
    if (widgetName) currentWidget = widgetName;
    if (nameLabel) {
        nameLabel.textContent = currentWidget === 'chat' ? 'du tchat' :
            currentWidget === 'spotify' ? 'de Spotify' :
                'du mur d\'emotes';
    }

    const maxRow = document.getElementById('maxMessagesRow');
    if (maxRow) {
        if (currentWidget === 'chat') {
            maxRow.style.display = 'block';
        } else {
            maxRow.style.display = 'none';
        }
    }

    try {
        const config = await window.api.invoke('get-widget-config', currentWidget);
        currentWidgetConfig = config || {};

        const savedCss = currentWidgetConfig.customCSS || '';
        if (cssInput) cssInput.value = savedCss;

        if (currentWidget === 'chat' && maxMessagesInput) {
            maxMessagesInput.value = currentWidgetConfig.maxMessages || 10;
        }

        await loadThemes(currentWidget);

        if (currentWidgetConfig.currentTheme) {
            const selector = document.getElementById('themeSelector');
            if (selector) {
                const options = Array.from(selector.options).map(o => o.value);
                if (options.includes(currentWidgetConfig.currentTheme)) {
                    selector.value = currentWidgetConfig.currentTheme;
                }
            }
        }

        renderPreview();
        updateCssGuide();
    } catch (e) {
        setStatus('Erreur chargement config: ' + e, 'err');
    }
}

async function saveWidgetConfig() {
    try {
        if (!cssInput) return;
        const css = cssInput.value;
        const themeSelector = document.getElementById('themeSelector');
        const update = {
            customCSS: css,
            currentTheme: themeSelector ? themeSelector.value : ''
        };

        if (currentWidget === 'chat' && maxMessagesInput) {
            update.maxMessages = parseInt(maxMessagesInput.value, 10) || 10;
        }

        const result = await window.api.invoke('save-widget-config', currentWidget, update);
        if (result.success) {
            setStatus('Sauvegardé avec succès !', 'ok');
            const config = await window.api.invoke('get-widget-config', currentWidget);
            currentWidgetConfig = config || {};
        } else {
            setStatus('Erreur sauvegarde', 'err');
        }
    } catch (e) {
        setStatus('Erreur: ' + e, 'err');
    }
}

function getChatPreviewHtml(customCss, max) {
    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                ${defaultCss.chat}
                ${customCss}
            </style>
        </head>
        <body>
            <div id="chat-container"></div>
            <script>
                const container = document.getElementById('chat-container');
                const MAX_MESSAGES = ${max};

                const demo = [
                {u: 'Alice', c: '#6dd4ff', b: [{set: 'staff', version: '1' }], t: 'Hello world!' },
                {u: 'Bob', c: '#ff8b3d', b: [{set: 'moderator', version: '1' }], t: 'Ceci est un test.' },
                {u: 'Bob', c: '#ff8b3d', b: [{set: 'moderator', version: '1' }], t: 'Deuxieme ligne meme user.' },
                {u: 'Chloe', c: '#9b59b6', b: [], t: 'Nice overlay!' },
                {u: 'Eve', c: '#e67e22', b: [], t: 'Short msg.' }
                ];

                let lastUser = null;
                let lastGroup = null;
                let groupCounter = 0;

                function sanitizeClass(str) {
                    const clean = String(str || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                    return clean || 'user';
                }

                function computeColors(hexColor) {
                    const fallback = '#6dd4ff';
                    let c = (hexColor || '').trim();
                    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) c = fallback;
                    if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
                    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
                    return {solid: c, soft: 'rgba(' + r + ', ' + g + ', ' + b + ', 0.15)' };
                }

                function createBadge(entry) {
                    if (!entry || !entry.set || !entry.version) return null;
                    const img = document.createElement('img');
                    img.className = 'badge-img';
                    img.src = 'https://static-cdn.jtvnw.net/badges/v1/' + entry.set + '/' + entry.version + '/1';
                    img.alt = entry.set;
                    img.onerror = () => img.remove();
                    return img;
                }

                function addMessage(m) {
                    const colors = computeColors(m.c);
                    const sameUser = lastUser === m.u && lastGroup;
                    let group = lastGroup;

                    if (!sameUser) {
                        group = document.createElement('div');
                        const isEven = (groupCounter % 2) === 0;
                        const variant = (groupCounter % 3) + 1;
                        group.className = 'msg-group user-' + sanitizeClass(m.u) + ' group-' + (isEven ? 'even' : 'odd') + ' variant-' + variant;
                        groupCounter++;

                        group.style.setProperty('--user-color', colors.solid);
                        group.style.setProperty('--user-color-soft', colors.soft);

                        const header = document.createElement('div');
                        header.className = 'msg-header';

                        const name = document.createElement('span');
                        name.className = 'msg-username';
                        name.textContent = m.u;
                        name.style.color = colors.solid;

                        header.appendChild(name);

                        const badgesWrap = document.createElement('span');
                        badgesWrap.className = 'msg-badges';
                        (m.b || []).forEach(b => {
                            const node = createBadge(b);
                            if (node) badgesWrap.appendChild(node);
                        });

                        if (badgesWrap.children.length) header.appendChild(badgesWrap);

                        const messagesDiv = document.createElement('div');
                        messagesDiv.className = 'msg-messages';

                        group.appendChild(header);
                        group.appendChild(messagesDiv);
                        container.appendChild(group);

                        lastGroup = group;
                        lastUser = m.u;
                    }

                    const messagesDiv = group.querySelector('.msg-messages');
                    const line = document.createElement('div');
                    line.className = 'msg-line';
                    line.textContent = m.t;
                    messagesDiv.appendChild(line);

                    while (container.children.length > MAX_MESSAGES) {
                        container.removeChild(container.firstChild);
                    }
                }

                let i = 0;
                function loop() {
                    addMessage(demo[i]);
                    i = (i + 1) % demo.length;
                    setTimeout(loop, 2000);
                }
                loop();
            <\/script>
        </body>
    </html>`;
}

function getSpotifyPreviewHtml(customCss, config) {
    const title = "Song Title";
    const artist = "Artist Name";
    const album = "Album Name";
    const cover = "https://via.placeholder.com/140";

    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                ${defaultCss.spotify}
                ${customCss}
            </style>
        </head>
        <body>
            <div id="spotify-wrapper">
                <div class="spotify-card">
                    <img class="spotify-cover" src="${cover}" alt="cover">
                        <div class="spotify-infos">
                            <div class="pill">En lecture</div>
                            <div class="spotify-title">${title}</div>
                            <div class="spotify-artist">${artist}</div>
                            <div class="spotify-album">${album}</div>
                        </div>
                </div>
            </div>
        </body>
    </html>`;
}

function renderPreview() {
    const frame = document.getElementById('preview-frame');
    if (!frame) return;

    const css = (cssInput && cssInput.value || '').trim();
    const max = maxMessagesInput ? (parseInt(maxMessagesInput.value, 10) || 10) : 10;

    let html = '';
    if (currentWidget === 'spotify') {
        html = getSpotifyPreviewHtml(css, currentWidgetConfig);
    } else if (currentWidget === 'chat') {
        html = getChatPreviewHtml(css, max);
    } else {
        html = `<!DOCTYPE html><html><head><style>${defaultCss[currentWidget] || ''} ${css}</style></head><body><div style="color:white;padding:20px;">Aperçu non disponible pour ce widget</div></body></html>`;
    }

    frame.srcdoc = html;
}

function updateCssGuide() {
    const classes = cssClasses[currentWidget] || [];
    const cssGuideWidgetName = document.getElementById('cssGuideWidgetName');
    const cssGuideBody = document.getElementById('cssGuideBody');

    if (cssGuideWidgetName) cssGuideWidgetName.textContent = currentWidget;
    if (cssGuideBody) {
        cssGuideBody.innerHTML = classes.map(c => `
            <tr>
                <td class="class-name">${c.class}</td>
                <td class="description">${c.desc}</td>
            </tr>
        `).join('');
    }
}

function toggleCssGuide(show, shouldResize = false) {
    const cssGuidePanel = document.getElementById('cssGuidePanel');
    if (!cssGuidePanel) return;

    const isVisible = show !== undefined ? show : cssGuidePanel.style.display === 'none';

    if (shouldResize && isVisible !== (cssGuidePanel.style.display !== 'none')) {
        const delta = isVisible ? 350 : -350;
        window.api.invoke('resize-css-editor', delta);
    }

    cssGuidePanel.style.display = isVisible ? 'flex' : 'none';
    localStorage.setItem('cssGuideVisible', isVisible);
}

function init() {
    cssInput = document.getElementById('customCss');
    maxMessagesInput = document.getElementById('maxMessages');
    statusBar = document.getElementById('statusBar');
    nameLabel = document.getElementById('widgetNameLabel');

    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveWidgetConfig);

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const themeSelector = document.getElementById('themeSelector');
            const filename = themeSelector ? themeSelector.value : '';

            if (filename) {
                try {
                    const content = await window.api.invoke('get-theme-content', filename);
                    if (cssInput) cssInput.value = content;
                    setStatus('Thème rechargé', 'ok');
                } catch (err) {
                    setStatus('Erreur rechargement: ' + err, 'err');
                }
            } else {
                if (cssInput) cssInput.value = '';
                setStatus('Remis à zéro', 'ok');
            }
            renderPreview();
        });
    }

    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => window.close());

    if (cssInput) cssInput.addEventListener('input', renderPreview);
    if (maxMessagesInput) maxMessagesInput.addEventListener('input', renderPreview);

    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.addEventListener('change', async (e) => {
            const filename = e.target.value;
            if (!filename) {

                if (cssInput) cssInput.value = '';
                renderPreview();
                return;
            }
            try {
                const content = await window.api.invoke('get-theme-content', filename);
                if (cssInput) cssInput.value = content;
                renderPreview();
            } catch (err) {
                alert('Erreur chargement thème: ' + err);
            }
        });
    }

    const editThemeConfigBtn = document.getElementById('editThemeConfigBtn');
    if (editThemeConfigBtn) editThemeConfigBtn.addEventListener('click', openConfigEditor);

    const importThemeBtn = document.getElementById('importThemeBtn');
    if (importThemeBtn) {
        importThemeBtn.addEventListener('click', async () => {
            try {
                const result = await window.api.invoke('import-theme', currentWidget);
                if (result.success) {
                    setStatus(result.message, 'ok');
                    loadThemes(currentWidget);
                } else {
                    setStatus(result.message || 'Import annulé', 'info');
                }
            } catch (error) {
                setStatus(`Erreur lors de l'importation du thème: ${error.message}`, 'err');
            }
        });
    }

    const saveAsThemeBtn = document.getElementById('saveAsThemeBtn');
    if (saveAsThemeBtn) {
        saveAsThemeBtn.addEventListener('click', () => {
            const newThemeModal = document.getElementById('newThemeModal');
            const newThemeNameInput = document.getElementById('newThemeNameInput');
            if (newThemeNameInput) newThemeNameInput.value = '';
            if (newThemeModal) newThemeModal.style.display = 'flex';
            if (newThemeNameInput) newThemeNameInput.focus();
        });
    }

    const cancelNewThemeBtn = document.getElementById('cancelNewThemeBtn');
    if (cancelNewThemeBtn) {
        cancelNewThemeBtn.addEventListener('click', () => {
            const newThemeModal = document.getElementById('newThemeModal');
            if (newThemeModal) newThemeModal.style.display = 'none';
        });
    }

    const confirmNewThemeBtn = document.getElementById('confirmNewThemeBtn');
    if (confirmNewThemeBtn) {
        confirmNewThemeBtn.addEventListener('click', async () => {
            const newThemeNameInput = document.getElementById('newThemeNameInput');
            const name = newThemeNameInput ? newThemeNameInput.value.trim() : '';
            if (!name) return;

            try {
                const cssContent = cssInput ? cssInput.value : '';
                const result = await window.api.invoke('create-theme', currentWidget, name, cssContent);
                if (result.success) {
                    setStatus(`Thème "${name}" créé avec succès !`, 'ok');
                    await loadThemes(currentWidget);
                    const selector = document.getElementById('themeSelector');
                    if (selector) selector.value = result.filename;
                    const newThemeModal = document.getElementById('newThemeModal');
                    if (newThemeModal) newThemeModal.style.display = 'none';
                }
            } catch (e) {
                setStatus('Erreur création thème: ' + e, 'err');
            }
        });
    }

    const closeThemeConfigBtn = document.getElementById('closeThemeConfigBtn');
    if (closeThemeConfigBtn) {
        closeThemeConfigBtn.addEventListener('click', () => {
            const modal = document.getElementById('themeConfigModal');
            if (modal) modal.style.display = 'none';
        });
    }

    const saveThemeConfigBtn = document.getElementById('saveThemeConfigBtn');
    if (saveThemeConfigBtn) {
        saveThemeConfigBtn.addEventListener('click', async () => {
            try {
                const configStr = await window.api.invoke('get-theme-config');
                const fullConfig = JSON.parse(configStr || '{}');

                const inputs = document.querySelectorAll('.theme-name-input');
                inputs.forEach(input => {
                    const filename = input.dataset.filename;
                    const name = input.value.trim();
                    if (filename) {
                        if (name) {
                            fullConfig[filename] = name;
                        } else {
                            delete fullConfig[filename];
                        }
                    }
                });

                await window.api.invoke('save-theme-config', JSON.stringify(fullConfig, null, 2));
                const modal = document.getElementById('themeConfigModal');
                if (modal) modal.style.display = 'none';
                loadThemes(currentWidget);
                setStatus('Configuration des thèmes sauvegardée', 'ok');
            } catch (e) { alert('Erreur sauvegarde: ' + e); }
        });
    }

    const cssGuideBtn = document.getElementById('cssGuideBtn');
    if (cssGuideBtn) cssGuideBtn.addEventListener('click', () => toggleCssGuide(undefined, true));

    const closeCssGuideBtn = document.getElementById('closeCssGuideBtn');
    if (closeCssGuideBtn) closeCssGuideBtn.addEventListener('click', () => toggleCssGuide(false, true));

    // Initial load
    loadWidgetConfig().then(() => {
        renderPreview();
        updateCssGuide();

        const savedState = localStorage.getItem('cssGuideVisible');
        if (savedState === 'true') {
            const needsResize = window.outerWidth < 1100;
            toggleCssGuide(true, needsResize);
        }
    });
}

window.api.on('load-css-editor', ({ widgetName }) => {
    if (cssInput) {
        loadWidgetConfig(widgetName).then(() => {
            renderPreview();
            updateCssGuide();
        });
    } else {
        currentWidget = widgetName;
    }
});

document.addEventListener('DOMContentLoaded', init);
