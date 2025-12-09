const { ipcRenderer } = require('electron');

let choices = [];
let widgetUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('close-btn').addEventListener('click', () => window.close());
    document.getElementById('addChoiceBtn').addEventListener('click', addChoice);
    document.getElementById('newChoiceInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addChoice();
    });
    document.getElementById('saveBtn').addEventListener('click', saveConfig);

    await loadConfig();
    await loadPreview();
});

async function loadConfig() {
    try {
        const config = await ipcRenderer.invoke('get-widget-config', 'roulette');
        choices = config.choices || [];
        renderChoices();
    } catch (e) {
        console.error('Error loading config:', e);
    }
}

async function loadPreview() {
    try {
        widgetUrl = await ipcRenderer.invoke('get-widget-url', 'roulette');
        const iframe = document.getElementById('preview-frame');
        if (iframe && widgetUrl) {
            iframe.src = widgetUrl;
        }
    } catch (e) {
        console.error('Error loading preview:', e);
    }
}

function renderChoices() {
    const list = document.getElementById('choicesList');
    list.innerHTML = '';

    choices.forEach((choice, index) => {
        const item = document.createElement('div');
        item.className = 'choice-item';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = choice;
        input.className = 'choice-input';
        input.onchange = (e) => updateChoice(index, e.target.value);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '✕';
        delBtn.onclick = () => removeChoice(index);

        item.appendChild(input);
        item.appendChild(delBtn);
        list.appendChild(item);
    });
}

function addChoice() {
    const input = document.getElementById('newChoiceInput');
    const value = input.value.trim();
    if (value) {
        choices.push(value);
        input.value = '';
        renderChoices();
    }
}

function removeChoice(index) {
    choices.splice(index, 1);
    renderChoices();
}

function updateChoice(index, value) {
    choices[index] = value;
}

async function saveConfig() {
    try {
        
        const cleanChoices = choices.map(c => c.trim()).filter(c => c.length > 0);

        await ipcRenderer.invoke('save-widget-config', 'roulette', { choices: cleanChoices });

        
        const iframe = document.getElementById('preview-frame');
        if (iframe) iframe.src = iframe.src; 

        
        const saveBtn = document.getElementById('saveBtn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Sauvegardé !';
        setTimeout(() => saveBtn.textContent = originalText, 2000);

    } catch (e) {
        console.error('Error saving config:', e);
    }
}
