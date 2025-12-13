const BaseWidgetServer = require('./BaseWidgetServer');

class AlertsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'alerts');
        this.alertQueue = [];
        this.isPlaying = false;
    }

    transformHtml(html) {
        const config = this.bot.getWidgetConfig('alerts') || {};
        const customCSS = config.customCSS || '';
        return html.replace('/* __CUSTOM_CSS__ */', customCSS);
    }

    onConnection(ws) {
        console.log('[ALERTS] Client connected');
        const config = this.bot.getWidgetConfig('alerts');
        if (config) {
            ws.send(JSON.stringify({ type: 'config-update', config }));
        }

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'alert-finished') {
                    console.log('[ALERTS] Alert finished');
                    this.isPlaying = false;
                    this.processQueue();
                }
            } catch (e) { console.error(e); }
        });
    }

    addToQueue(alertData) {
        console.log(`[ALERTS] Added to queue: ${alertData.type}`);
        this.alertQueue.push(alertData);
        this.processQueue();
    }

    processQueue() {
        if (this.isPlaying || this.alertQueue.length === 0) return;
        const nextAlert = this.alertQueue.shift();
        this.isPlaying = true;
        console.log(`[ALERTS] Broadcasting alert: ${nextAlert.type}`);
        this.broadcast({ type: 'alert', alert: nextAlert });
    }

    skipCurrent() {
        this.broadcast({ type: 'skip' });
        this.isPlaying = false;
        this.processQueue();
    }


    refresh() {
        this.broadcast({ type: 'reload' });
    }
}

function createAlertsWidgetServer(bot, defaultPort = 8097) {
    return new AlertsWidgetServer(bot, defaultPort);
}

module.exports = { createAlertsWidgetServer };
