const BaseWidgetServer = require('./BaseWidgetServer');
const path = require('path');
const fs = require('fs');

class SubgoalsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'subgoals');
    }

    transformHtml(html) {
        const config = this.bot.getWidgetConfig('subgoals') || {};
        const customCSS = config.customCSS || '';
        return html.replace('/* __CUSTOM_CSS__ */', customCSS);
    }

    handleCustomRoutes(req, res) {
        if (req.url === '/widget/subgoals-list') {
            this.serveSubgoalsList(req, res);
            return true;
        }
        return false;
    }

    serveSubgoalsList(req, res) {
        const filePath = path.join(__dirname, '..', 'widgets', 'subgoals_list_widget.html');
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.statusCode = 500;
                return res.end('Error loading widget file');
            }
            const config = this.bot.getWidgetConfig('subgoals-list') || {};
            const customCSS = config.customCSS || '';
            const content = data.replace('/* __CUSTOM_CSS__ */', customCSS);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    }

    onConnection(ws) {
        const subgoalsConfig = this.bot.getWidgetConfig('subgoals');
        if (subgoalsConfig) {
            ws.send(JSON.stringify({
                type: 'config-update',
                widget: 'subgoals',
                config: subgoalsConfig
            }));
        }
        const subgoalsListConfig = this.bot.getWidgetConfig('subgoals-list');
        if (subgoalsListConfig) {
            ws.send(JSON.stringify({
                type: 'config-update',
                widget: 'subgoals-list',
                config: subgoalsListConfig
            }));
        }
    }

    broadcastSubUpdate(count) {
        this.broadcast({ type: 'sub-update', count });
    }

    broadcastConfig(config, widgetType = 'subgoals') {
        this.broadcast({ type: 'config-update', widget: widgetType, config });
    }
}

function createSubgoalsWidgetServer(bot, defaultPort = 8091) {
    return new SubgoalsWidgetServer(bot, defaultPort);
}

module.exports = { createSubgoalsWidgetServer };
