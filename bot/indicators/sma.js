function calculateSMA(candles, period = 8) {
    if (!candles || candles.length < period) return null;

    const slice = candles.slice(-period);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);

    return sum / period;
}

module.exports = calculateSMA;