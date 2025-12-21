
const api = window.api;

let currentState = {
    weekStart: new Date(),
    startSunday: false,
    bgImage: null,
    title: "STREAM SCHEDULE",
    events: {}
};

const els = {
    prevWeekBtn: document.getElementById('planning-prev-week'),
    nextWeekBtn: document.getElementById('planning-next-week'),
    weekLabel: document.getElementById('planning-week-label'),
    titleInput: document.getElementById('planning-title-input'),
    startSundayCheck: document.getElementById('planning-start-sunday'),
    bgInput: document.getElementById('planning-bg-input'),
    bgPickBtn: document.getElementById('planning-bg-pick-btn'),
    saveTwitchBtn: document.getElementById('planning-save-twitch-btn'),
    exportBtn: document.getElementById('planning-export-btn'),
    dayTabs: document.querySelectorAll('.day-tab'),
    editorDayTitle: document.getElementById('editor-day-title'),
    addSegmentBtn: document.getElementById('add-segment-btn'),
    segmentsList: document.getElementById('segments-list'),
    previewCard: document.getElementById('planning-preview-card'),
    previewTitle: document.getElementById('preview-title'),
    previewDates: document.getElementById('preview-dates'),
    previewGrid: document.getElementById('planning-grid'),
    previewBg: document.querySelector('.planning-card-bg')
};

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JS_TO_MON_INDEX = [6, 0, 1, 2, 3, 4, 5];

export function initPlanning() {
    setupEventListeners();
    initWeek();
    renderAll();
    loadTwitchSchedule();
}

function setupEventListeners() {
    els.prevWeekBtn.addEventListener('click', () => changeWeek(-7));
    els.nextWeekBtn.addEventListener('click', () => changeWeek(7));

    els.titleInput.addEventListener('input', (e) => {
        currentState.title = e.target.value;
        renderHeader();
    });

    els.startSundayCheck.addEventListener('change', (e) => {
        currentState.startSunday = e.target.checked;
        renderAll();
    });

    els.bgPickBtn.addEventListener('click', async () => {
        const path = await api.invoke('open-file-dialog', [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]);
        if (path) {
            currentState.bgImage = path;
            els.bgInput.value = path;
            renderHeader();
        }
    });

    els.dayTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.day-tab.active').classList.remove('active');
            tab.classList.add('active');
            renderEditor();
        });
    });

    els.addSegmentBtn.addEventListener('click', () => {
        const activeDayIndex = parseInt(document.querySelector('.day-tab.active').dataset.day);
        const dateKey = getDateKeyForDayIndex(activeDayIndex);

        if (!currentState.events[dateKey]) currentState.events[dateKey] = [];

        currentState.events[dateKey].push({
            id: null,
            startTime: "20:00",
            duration: 120,
            category: { name: "Just Chatting", boxArtUrl: "" },
            title: "Stream du soir"
        });

        renderEditor();
        renderPreviewGrid();
    });

    els.exportBtn.addEventListener('click', async () => {
        const card = els.previewCard;

        card.style.transform = 'none';
        card.style.position = 'fixed';
        card.style.top = '0';
        card.style.left = '0';
        card.style.zIndex = '9999';

        await new Promise(r => setTimeout(r, 100));

        const captureRect = { x: 0, y: 0, width: 1280, height: 720 };
        const res = await api.invoke('save-planning-image', captureRect);

        // Restore
        card.style.transform = originalTransform;
        card.style.position = 'relative';
        card.style.zIndex = 'auto';

        if (res.success) {
            alert('Image sauvegardée !');
        }
    });

    els.saveTwitchBtn.addEventListener('click', syncToTwitch);
}


function initWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    currentState.weekStart = monday;
}

function changeWeek(days) {
    const newDate = new Date(currentState.weekStart);
    newDate.setDate(newDate.getDate() + days);
    currentState.weekStart = newDate;

    currentState.events = {};

    renderAll();
    loadTwitchSchedule();
}

function getDateForDayIndex(index) {
    const d = new Date(currentState.weekStart);
    d.setDate(d.getDate() + index);
    return d;
}

function getDateKeyForDayIndex(index) {
    const d = getDateForDayIndex(index);
    return d.toISOString().split('T')[0];
}

async function loadTwitchSchedule() {
    els.saveTwitchBtn.textContent = "⏳ Sync...";
    try {
        const schedule = await api.invoke('twitch-get-schedule');

        if (schedule && schedule.segments) {
            for (let i = 0; i < 7; i++) {
                currentState.events[getDateKeyForDayIndex(i)] = [];
            }

            schedule.segments.forEach(seg => {
                const d = new Date(seg.start_time);
                const dateKey = d.toISOString().split('T')[0];

                if (currentState.events[dateKey]) {
                    const h = d.getHours().toString().padStart(2, '0');
                    const m = d.getMinutes().toString().padStart(2, '0');

                    let duration = 60;
                    if (seg.end_time) {
                        const end = new Date(seg.end_time);
                        duration = Math.round((end - d) / 60000);
                    }

                    currentState.events[dateKey].push({
                        id: seg.id,
                        startTime: `${h}:${m}`,
                        duration: duration,
                        category: {
                            id: seg.category ? seg.category.id : null,
                            name: seg.category ? seg.category.name : 'Unknown',
                            boxArtUrl: seg.category ? seg.category.box_art_url : ''
                        },
                        title: seg.title
                    });
                }
            });
        }
    } catch (e) {
        console.error("Failed to load schedule", e);
    } finally {
        els.saveTwitchBtn.innerHTML = '<span class="icon">📡</span> Sync Twitch';
        renderAll();
    }
}


function renderAll() {
    renderHeader();
    renderEditor();
    renderPreviewGrid();
}

function renderHeader() {
    const start = new Date(currentState.weekStart);
    if (currentState.startSunday) {
        start.setDate(start.getDate() - 1);
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const fmt = (d) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    const rangeStr = `${fmt(start)} - ${fmt(end)}`;

    els.weekLabel.textContent = rangeStr;
    els.previewDates.textContent = rangeStr;

    els.previewTitle.textContent = currentState.title;

    if (currentState.bgImage) {
        els.previewBg.style.backgroundImage = `url('file://${currentState.bgImage.replace(/\\/g, '/')}')`;
    } else {
        els.previewBg.style.backgroundImage = 'none';
        els.previewBg.style.background = 'linear-gradient(45deg, #1a1a1a, #2a2a2a)';
    }
}

function renderPreviewGrid() {
    els.previewGrid.innerHTML = '';

    let order = [0, 1, 2, 3, 4, 5, 6];
    if (currentState.startSunday) {
        order = [6, 0, 1, 2, 3, 4, 5];
    }

    order.forEach(dayIndex => {
        const dateKey = getDateKeyForDayIndex(dayIndex);
        const dayEvents = currentState.events[dateKey] || [];

        const col = document.createElement('div');
        col.className = 'planning-col';

        const header = document.createElement('div');
        header.className = 'planning-col-header';
        header.textContent = DAYS_FR[dayIndex];

        const content = document.createElement('div');
        content.className = 'planning-col-content';

        dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));

        dayEvents.forEach(evt => {
            const card = document.createElement('div');
            card.className = 'preview-event';

            const img = document.createElement('img');
            img.className = 'preview-event-image';
            let url = evt.category.boxArtUrl;
            if (url) {
                url = url.replace('{width}', '285').replace('{height}', '380');
            } else {
                url = 'assets/no-art.jpg';
            }
            img.src = url;

            const info = document.createElement('div');
            info.className = 'preview-event-info';

            const time = document.createElement('div');
            time.className = 'preview-event-time';
            time.textContent = evt.startTime;

            const game = document.createElement('div');
            game.className = 'preview-event-game';
            game.textContent = evt.category.name;

            const title = document.createElement('div');
            title.className = 'preview-event-title';
            title.textContent = evt.title;

            info.appendChild(time);
            info.appendChild(game);
            info.appendChild(title);

            card.appendChild(img);
            card.appendChild(info);

            content.appendChild(card);
        });

        col.appendChild(header);
        col.appendChild(content);

        els.previewGrid.appendChild(col);
    });
}

function renderEditor() {
    const activeTab = document.querySelector('.day-tab.active');
    const dayIndex = parseInt(activeTab.dataset.day);

    els.editorDayTitle.textContent = DAYS_FR[dayIndex];
    els.segmentsList.innerHTML = '';

    const dateKey = getDateKeyForDayIndex(dayIndex);
    const events = currentState.events[dateKey] || [];

    if (events.length === 0) {
        els.segmentsList.innerHTML = '<div class="empty-state">Aucun stream prévu ce jour.</div>';
        return;
    }

    events.forEach((evt, idx) => {
        const div = document.createElement('div');
        div.className = 'segment-item';

        div.innerHTML = `
            <button class="segment-delete-btn" title="Supprimer">×</button>
            <div class="segment-header">
                <span>Segment ${idx + 1}</span>
            </div>
            <div class="segment-time-inputs">
                <input type="time" class="inp-start" value="${evt.startTime}">
                <span>min:</span>
                <input type="number" class="inp-dur" value="${evt.duration}">
            </div>
            <div class="segment-game-search">
                <input type="text" class="segment-game-input" placeholder="Jeu/Catégorie..." value="${evt.category.name}">
                <div class="game-search-results"></div>
            </div>
            <input type="text" class="segment-title-input" placeholder="Titre du stream" value="${evt.title}">
        `;

        const inpStart = div.querySelector('.inp-start');
        const inpDur = div.querySelector('.inp-dur');
        const inpGame = div.querySelector('.segment-game-input');
        const inpTitle = div.querySelector('.segment-title-input');
        const resultsBox = div.querySelector('.game-search-results');
        const deleteBtn = div.querySelector('.segment-delete-btn');

        inpStart.addEventListener('change', (e) => {
            evt.startTime = e.target.value;
            renderPreviewGrid();
        });

        inpDur.addEventListener('change', (e) => {
            evt.duration = parseInt(e.target.value);
        });

        inpTitle.addEventListener('input', (e) => {
            evt.title = e.target.value;
            renderPreviewGrid();
        });

        deleteBtn.addEventListener('click', () => {
            currentState.events[dateKey].splice(idx, 1);
            renderEditor();
            renderPreviewGrid();
        });

        let searchTimer;
        inpGame.addEventListener('input', (e) => {
            const query = e.target.value;
            evt.category.name = query;

            clearTimeout(searchTimer);
            if (query.length < 3) {
                resultsBox.classList.remove('active');
                return;
            }

            searchTimer = setTimeout(async () => {
                const results = await api.invoke('twitch-search-categories', query);

                resultsBox.innerHTML = '';
                if (results && results.length > 0) {
                    results.forEach(game => {
                        const r = document.createElement('div');
                        r.className = 'game-result-item';
                        const boxUrl = game.box_art_url.replace('{width}', '40').replace('{height}', '50');
                        r.innerHTML = `<img src="${boxUrl}" class="game-result-img"><span class="game-result-name">${game.name}</span>`;

                        r.addEventListener('click', () => {
                            evt.category.id = game.id;
                            evt.category.name = game.name;
                            evt.category.boxArtUrl = game.box_art_url;
                            inpGame.value = game.name;
                            resultsBox.classList.remove('active');
                            renderPreviewGrid();
                        });

                        resultsBox.appendChild(r);
                    });
                    resultsBox.classList.add('active');
                } else {
                    resultsBox.classList.remove('active');
                }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!div.contains(e.target)) {
                resultsBox.classList.remove('active');
            }
        });

        els.segmentsList.appendChild(div);
    });
}


async function syncToTwitch() {
    if (!confirm("Attention: Cette action va mettre à jour votre planning Twitch officiel pour la semaine visible. Continuer ?")) return;

    els.saveTwitchBtn.disabled = true;
    els.saveTwitchBtn.textContent = "Updating...";


    try {
        const schedule = await api.invoke('twitch-get-schedule');
        const existingSegments = schedule ? schedule.segments : [];

        const existingMap = new Map();
        existingSegments.forEach(s => existingMap.set(s.id, s));

        const processedIds = new Set();

        for (let i = 0; i < 7; i++) {
            const dateKey = getDateKeyForDayIndex(i);
            const events = currentState.events[dateKey] || [];

            for (const evt of events) {
                const fullStartTime = new Date(`${dateKey}T${evt.startTime}:00`);

                const payload = {
                    start_time: fullStartTime.toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    duration: evt.duration.toString(),
                    category_id: evt.category.id,
                    title: evt.title,
                    is_recurring: false
                };

                if (evt.id && existingMap.has(evt.id)) {
                    await api.invoke('twitch-update-schedule-segment', evt.id, payload);
                    processedIds.add(evt.id);
                } else {
                    await api.invoke('twitch-create-schedule-segment', payload);
                }
            }
        }

        const weekStart = getDateForDayIndex(0);
        const weekEnd = getDateForDayIndex(6);
        weekEnd.setHours(23, 59, 59, 999);

        for (const seg of existingSegments) {
            const segDate = new Date(seg.start_time);
            if (segDate >= weekStart && segDate <= weekEnd) {
                if (!processedIds.has(seg.id)) {
                    await api.invoke('twitch-delete-schedule-segment', seg.id);
                }
            }
        }

        alert("Planning synchronisé avec succès !");
        loadTwitchSchedule();

    } catch (e) {
        console.error("Sync failed", e);
        alert("Erreur lors de la synchro: " + e.message);
    } finally {
        els.saveTwitchBtn.disabled = false;
        els.saveTwitchBtn.innerHTML = '<span class="icon">📡</span> Sync Twitch';
    }
}
