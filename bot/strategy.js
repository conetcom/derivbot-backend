const strategies = require("./strategies");

function getSignal(candles, strategy, state = {}) {

    const current = strategies[strategy];

    if (!current)
        return null;

    return current.handler(candles, state);

}

module.exports = {
    getSignal
};