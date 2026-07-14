const buildSignal = require("../helpers/buildSignal");
const CONFIG = {
    MIN_CANDLES: 12,

    SWEEP_POINTS: 4,
    REJECTION_POINTS: 2,
    CONFIRMATION_POINTS: 2,
    TREND_POINTS: 2,
    VOLATILITY_POINTS: 1,

    MIN_SCORE: 6,
    MIN_DIFF: 2,

    REJECTION_RATIO: 1.5,
    MIN_VOLATILITY: 0.10
};

function smartMoneyLiquidityStrategy(candles) {

    if (!candles || candles.length < CONFIG.MIN_CANDLES) {
        return {
            signal: null,
            score: 0,
            strategy: "liquidity"
        };
    }

    // ===============================
    // Velas cerradas
    // ===============================

    const last = candles.at(-2);
    const prev = candles.at(-3);

    // ===============================
    // Liquidez
    // ===============================

    const highs = candles.slice(-10, -2).map(c => c.high);
    const lows = candles.slice(-10, -2).map(c => c.low);

    const liquidityHigh = Math.max(...highs);
    const liquidityLow = Math.min(...lows);

    const sweepHigh =
        last.high > liquidityHigh &&
        last.close < liquidityHigh;

    const sweepLow =
        last.low < liquidityLow &&
        last.close > liquidityLow;

    // ===============================
    // Mechas
    // ===============================

    const upperWick =
        last.high - Math.max(last.open, last.close);

    const lowerWick =
        Math.min(last.open, last.close) - last.low;

    const body =
        Math.abs(last.close - last.open);

    if (body === 0) {
        return {
            signal: null,
            score: 0,
            strategy: "liquidity"
        };
    }

    const rejectionSell =
        upperWick >= body * CONFIG.REJECTION_RATIO;

    const rejectionBuy =
        lowerWick >= body * CONFIG.REJECTION_RATIO;

    // ===============================
    // Confirmación
    // ===============================

    const bearishConfirm =
        last.close < last.open &&
        prev.close < prev.open;

    const bullishConfirm =
        last.close > last.open &&
        prev.close > prev.open;

    // ===============================
    // Tendencia simple
    // ===============================

    const trendUp =
        last.close > prev.close;

    const trendDown =
        last.close < prev.close;

    // ===============================
    // Volatilidad
    // ===============================

    const recent = candles.slice(-5);

    const volatility =
        Math.max(...recent.map(c => c.high)) -
        Math.min(...recent.map(c => c.low));

    // ===============================
    // Score
    // ===============================

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

    // ===============================
    // Sweep
    // ===============================

    if (sweepLow)
        addCall(CONFIG.SWEEP_POINTS, "Liquidity Sweep");

    if (sweepHigh)
        addPut(CONFIG.SWEEP_POINTS, "Liquidity Sweep");

    // ===============================
    // Rechazo
    // ===============================

    if (rejectionBuy)
        addCall(CONFIG.REJECTION_POINTS, "Rejection");

    if (rejectionSell)
        addPut(CONFIG.REJECTION_POINTS, "Rejection");

    // ===============================
    // Confirmación
    // ===============================

    if (bullishConfirm)
        addCall(CONFIG.CONFIRMATION_POINTS, "Confirmation");

    if (bearishConfirm)
        addPut(CONFIG.CONFIRMATION_POINTS, "Confirmation");

    // ===============================
    // Tendencia
    // ===============================

    if (trendUp)
        addCall(CONFIG.TREND_POINTS, "Trend");

    if (trendDown)
        addPut(CONFIG.TREND_POINTS, "Trend");

    // ===============================
    // Volatilidad
    // ===============================

    if (volatility >= CONFIG.MIN_VOLATILITY * 2) {

        if (trendUp)
            addCall(CONFIG.VOLATILITY_POINTS, "Volatility");

        if (trendDown)
            addPut(CONFIG.VOLATILITY_POINTS, "Volatility");
    }

    // ===============================
    // Penalización
    // ===============================

    if (trendUp && putScore > 0)
        putScore--;

    if (trendDown && callScore > 0)
        callScore--;

    // ===============================
    // Debug
    // ===============================

    console.log("==============================");
    console.log("💧 LIQUIDITY STRATEGY");
    console.log("CALL:", callScore);
    console.log("PUT :", putScore);
    console.table(reasons);
    console.log("==============================");

    // ===============================
    // Decisión
    // ===============================

    if (
        callScore >= CONFIG.MIN_SCORE &&
        (callScore - putScore) >= CONFIG.MIN_DIFF
    ) {

       return buildSignal({

    strategy:"liquidity",

    signal:"CALL",

    score:CONFIG.MIN_SCORE,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

    
    volatility,



});

    }

    if (
        putScore >= CONFIG.MIN_SCORE &&
        (putScore - callScore) >= CONFIG.MIN_DIFF
    ) {

       return buildSignal({

    strategy:"synthetic_pro",

    signal:"PUT",

    score:CONFIG.MIN_SCORE,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

    
    volatility,



});

    }

    return buildSignal({

    strategy:"synthetic_pro",

    signal:null,

    score:0,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

   

    volatility,




});

}

module.exports = smartMoneyLiquidityStrategy;