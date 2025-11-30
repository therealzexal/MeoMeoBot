import { showNotification } from './ui.js';

export async function loadCommands() {
    try {
        const { commands } = await window.api.invoke('get-commands');
        const list = document.getElementById('commandsList');
        list.innerHTML = '';

        for (const [cmd, response] of Object.entries(commands)) {
            const div = document.createElement('div');
            div.className = 'list-item';

            const viewContainer = document.createElement('div');
            viewContainer.style.cssText = 'display: flex; align-items: center; gap: 15px; flex-grow: 1; overflow: hidden; margin-right: 10px; width: 100%;';

            const name = document.createElement('span');
            name.className = 'command-name';
            name.textContent = cmd;

            const resp = document.createElement('span');
            resp.className = 'command-response';
            resp.textContent = response;

            viewContainer.appendChild(name);
            viewContainer.appendChild(resp);

            const editContainer = document.createElement('div');
            editContainer.className = 'inline-edit-container';
            editContainer.style.display = 'none';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'inline-edit-input cmd-name';
            nameInput.value = cmd;

            const respInput = document.createElement('input');
            respInput.type = 'text';
            respInput.className = 'inline-edit-input cmd-response';
            respInput.value = response;

            editContainer.appendChild(nameInput);
            editContainer.appendChild(respInput);

            const controls = document.createElement('div');
            controls.className = 'controls';

            const editBtn = document.createElement('button');
            editBtn.className = 'control-button';
            editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'control-button';
            saveBtn.style.display = 'none';
            saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#00b35f" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';

            const delBtn = document.createElement('button');
            delBtn.className = 'control-button';
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'control-button';
            cancelBtn.style.display = 'none';
            cancelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#e91916" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

            editBtn.onclick = () => {
                viewContainer.style.display = 'none';
                editContainer.style.display = 'flex';
                editBtn.style.display = 'none';
                delBtn.style.display = 'none';
                saveBtn.style.display = 'flex';
                cancelBtn.style.display = 'flex';
            };

            cancelBtn.onclick = () => {
                viewContainer.style.display = 'flex';
                editContainer.style.display = 'none';
                editBtn.style.display = 'flex';
                delBtn.style.display = 'flex';
                saveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                nameInput.value = cmd;
                respInput.value = response;
            };

            saveBtn.onclick = async () => {
                const newCmd = nameInput.value.trim();
                const newResp = respInput.value.trim();
                if (!newCmd || !newResp) return;

                const finalCmd = newCmd.startsWith('!') ? newCmd : `!${newCmd}`;

                try {
                    if (finalCmd !== cmd) {
                        await window.api.invoke('remove-command', cmd);
                    }
                    await window.api.invoke('add-command', finalCmd, newResp);
                    showNotification('Commande modifiée', 'success');
                    loadCommands();
                } catch (e) {
                    showNotification('Erreur modification: ' + e, 'error');
                }
            };

            const confirmDelBtn = document.createElement('button');
            confirmDelBtn.className = 'control-button';
            confirmDelBtn.style.display = 'none';
            confirmDelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#00b35f" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            confirmDelBtn.title = 'Confirmer suppression';

            const cancelDelBtn = document.createElement('button');
            cancelDelBtn.className = 'control-button';
            cancelDelBtn.style.display = 'none';
            cancelDelBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#e91916" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            cancelDelBtn.title = 'Annuler';

            delBtn.onclick = () => {
                editBtn.style.display = 'none';
                delBtn.style.display = 'none';
                confirmDelBtn.style.display = 'flex';
                cancelDelBtn.style.display = 'flex';
            };

            cancelDelBtn.onclick = () => {
                confirmDelBtn.style.display = 'none';
                cancelDelBtn.style.display = 'none';
                editBtn.style.display = 'flex';
                delBtn.style.display = 'flex';
            };

            confirmDelBtn.onclick = () => removeCommand(cmd);

            controls.appendChild(editBtn);
            controls.appendChild(saveBtn);
            controls.appendChild(cancelBtn);
            controls.appendChild(delBtn);
            controls.appendChild(confirmDelBtn);
            controls.appendChild(cancelDelBtn);

            div.appendChild(viewContainer);
            div.appendChild(editContainer);
            div.appendChild(controls);
            list.appendChild(div);
        }
    } catch (error) {
        console.error('Erreur chargement commandes:', error);
    }
}

export async function addCommand() {
    const cmdInput = document.getElementById('newCommand');
    const respInput = document.getElementById('commandResponse');
    const cmd = cmdInput.value.trim();
    const resp = respInput.value.trim();

    if (!cmd || !resp) {
        showNotification('Remplissez la commande et la réponse.', 'error');
        return;
    }

    const finalCmd = cmd.startsWith('!') ? cmd : `!${cmd}`;

    try {
        await window.api.invoke('add-command', finalCmd, resp);
        cmdInput.value = '';
        respInput.value = '';
        loadCommands();
        showNotification(`Commande ${finalCmd} ajoutée`, 'success');
    } catch (error) {
        showNotification('Erreur ajout commande: ' + error, 'error');
    }
}

async function removeCommand(command) {
    try {
        await window.api.invoke('remove-command', command);
        loadCommands();
        showNotification(`Commande ${command} supprimée`, 'info');
    } catch (error) {
        showNotification('Erreur suppression: ' + error, 'error');
    }
}
