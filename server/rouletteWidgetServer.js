const BaseWidgetServer = require('./BaseWidgetServer');

class RouletteWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'roulette');
    }

    transformHtml(html) {
        const config = this.bot.getWidgetConfig('roulette') || {};
        const customCSS = config.customCSS || '';
        const choices = JSON.stringify(config.choices || []);

        let content = html.replace('/* __CUSTOM_CSS__ */', customCSS);
        content = content.replace('const INITIAL_CHOICES = [];', `const INITIAL_CHOICES = ${choices};`);
        return content;
    }

    onConnection(ws) {
        const config = this.bot.getWidgetConfig('roulette');
        if (config) {
            ws.send(JSON.stringify({
                type: 'config-update',
                widget: 'roulette',
                config: config
            }));
        }
    }

    broadcastConfig(config) {
        this.broadcast({ type: 'config-update', widget: 'roulette', config });
    }

    broadcastSpin(winnerIndex, angle) {
        this.broadcast({ type: 'spin', winnerIndex, angle });
    }
}

function createRouletteWidgetServer(bot, defaultPort = 8092) {
    return new RouletteWidgetServer(bot, defaultPort);
}

module.exports = { createRouletteWidgetServer };
