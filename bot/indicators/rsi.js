function calculateRSI(candles, period = 14) {

    if (candles.length < period + 1)
        return null;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {

        const diff = candles[i].close - candles[i - 1].close;

        if (diff > 0)
            gains += diff;
        else
            losses -= diff;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0)
        return 100;

    const rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
}

module.exports = calculateRSI;