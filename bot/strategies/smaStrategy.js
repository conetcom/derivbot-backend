const { calculateSMA } = require("../indicators");

const CONFIG = {
    SMA_PERIOD: 8,
    MIN_CANDLES: 30,

    TREND_POINTS: 3,
    BOS_POINTS: 3,
    PULLBACK_POINTS: 2,
    MOMENTUM_POINTS: 2,
    STRONG_CANDLE_POINTS: 2,
    MEDIUM_CANDLE_POINTS: 1,
    VOLATILITY_POINTS: 1,

    STRONG_CANDLE: 0.70,
    MEDIUM_CANDLE: 0.55,

    MIN_VOLATILITY: 0.10,

    MIN_SCORE: 8,
    MIN_DIFF: 2
};

function buildSignal(signal, score) {
    return {
        signal,
        score,
        strategy: "sma"
    };
}

function smaStrategy(candles) {

    if (!candles || candles.length < CONFIG.MIN_CANDLES) {
        return {
            signal: null,
            score: 0,
            strategy: "sma"
        };
    }

    const sma = calculateSMA(candles, CONFIG.SMA_PERIOD);

    if (!sma) {
        return {
            signal: null,
            score: 0,
            strategy: "sma"
        };
    }

    const last = candles.at(-2);
    const prev = candles.at(-3);
    const prev2 = candles.at(-4);

    // ====================================
    // TENDENCIA
    // ====================================

    const trendUp =
        last.close > sma &&
        prev.close > sma;

    const trendDown =
        last.close < sma &&
        prev.close < sma;

    // ====================================
    // BREAK OF STRUCTURE
    // ====================================

    const highs = candles.slice(-10).map(c => c.high);
    const lows = candles.slice(-10).map(c => c.low);

    const prevHigh = Math.max(...highs.slice(0, -2));
    const prevLow = Math.min(...lows.slice(0, -2));

    const bosUp =
        last.close > prevHigh &&
        last.close > last.open;

    const bosDown =
        last.close < prevLow &&
        last.close < last.open;

    // ====================================
    // PULLBACK
    // ====================================

    const pullbackUp =
        prev.low <= sma &&
        prev.close > sma &&
        last.close > prev.close;

    const pullbackDown =
        prev.high >= sma &&
        prev.close < sma &&
        last.close < prev.close;

    // ====================================
    // MOMENTUM
    // ====================================

    const momentumUp =
        last.close > prev.close &&
        prev.close > prev2.close &&
        last.high > prev.high;

    const momentumDown =
        last.close < prev.close &&
        prev.close < prev2.close &&
        last.low < prev.low;

    // ====================================
    // FUERZA DE VELA
    // ====================================

    const body = Math.abs(last.close - last.open);
    const range = last.high - last.low;

    if (range === 0) {

        return {
            signal: null,
            score: 0,
            strategy: "sma"
        };

    }

    const strength = body / range;

    // ====================================
    // VOLATILIDAD
    // ====================================

    const last5 = candles.slice(-5);

    const volatility =
        Math.max(...last5.map(c => c.high)) -
        Math.min(...last5.map(c => c.low));

    if (volatility < CONFIG.MIN_VOLATILITY) {

        return {
            signal: null,
            score: 0,
            strategy: "sma"
        };

    }

    // ====================================
    // SCORE
    // ====================================

    let callScore = 0;
    let putScore = 0;

    const reasons = [];

    function addCall(points, reason) {
        callScore += points;
        reasons.push(`CALL +${points} ${reason}`);
    }

    function addPut(points, reason) {
        putScore += points;
        reasons.push(`PUT +${points} ${reason}`);
    }

    // Trend

    if (trendUp)
        addCall(CONFIG.TREND_POINTS, "Trend");

    if (trendDown)
        addPut(CONFIG.TREND_POINTS, "Trend");

    // BOS

    if (bosUp)
        addCall(CONFIG.BOS_POINTS, "BOS");

    if (bosDown)
        addPut(CONFIG.BOS_POINTS, "BOS");

    // Pullback

    if (pullbackUp)
        addCall(CONFIG.PULLBACK_POINTS, "Pullback");

    if (pullbackDown)
        addPut(CONFIG.PULLBACK_POINTS, "Pullback");

    // Momentum

    if (momentumUp)
        addCall(CONFIG.MOMENTUM_POINTS, "Momentum");

    if (momentumDown)
        addPut(CONFIG.MOMENTUM_POINTS, "Momentum");

    // Fuerza

    if (strength >= CONFIG.STRONG_CANDLE) {

        if (trendUp)
            addCall(CONFIG.STRONG_CANDLE_POINTS, "Strong Candle");

        if (trendDown)
            addPut(CONFIG.STRONG_CANDLE_POINTS, "Strong Candle");

    }
    else if (strength >= CONFIG.MEDIUM_CANDLE) {

        if (trendUp)
            addCall(CONFIG.MEDIUM_CANDLE_POINTS, "Medium Candle");

        if (trendDown)
            addPut(CONFIG.MEDIUM_CANDLE_POINTS, "Medium Candle");

    }

    // Volatilidad

    if (volatility >= CONFIG.MIN_VOLATILITY * 2) {

        if (trendUp)
            addCall(CONFIG.VOLATILITY_POINTS, "High Volatility");

        if (trendDown)
            addPut(CONFIG.VOLATILITY_POINTS, "High Volatility");

    }

    // Penalización

    if (trendUp && putScore > 0)
        putScore--;

    if (trendDown && callScore > 0)
        callScore--;

    // ====================================
    // DEBUG
    // ====================================

    console.log("=================================");
    console.log("📊 SMA STRATEGY");
    console.log("CALL:", callScore);
    console.log("PUT :", putScore);
    console.table(reasons);
    console.log("=================================");

    // ====================================
    // DECISIÓN
    // ====================================

    if (
        callScore >= CONFIG.MIN_SCORE &&
        (callScore - putScore) >= CONFIG.MIN_DIFF
    ) {

        return buildSignal(
            "CALL",
            callScore
        );

    }

    if (
        putScore >= CONFIG.MIN_SCORE &&
        (putScore - callScore) >= CONFIG.MIN_DIFF
    ) {

        return buildSignal(
            "PUT",
            putScore
        );

    }

    return {
        signal: null,
        score: 0,
        strategy: "sma"
    };

}

module.exports = smaStrategy;