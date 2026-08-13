const calculateSMA = require("../indicators/sma");
const buildSignal = require("../helpers/buildSignal");

const CONFIG = {

    // ==============================
    // SCORE
    // ==============================

    TREND_POINTS: 3,
    BOS_POINTS: 3,
    PULLBACK_POINTS: 2,
    MOMENTUM_POINTS: 2,

    STRONG_CANDLE: 2,
    MEDIUM_CANDLE: 1,

    MIN_SCORE: 8,
    MIN_DIFF: 2,

    HISTORY_MIN: 30,

    // ==============================
    // STRENGTH
    // ==============================

    MIN_LAST_STRENGTH: 0.65,

    STRONG_STRENGTH: 0.75,

    EXTREME_STRENGTH: 0.85,

    // ==============================
    // EXHAUSTION
    // ==============================

    // La última vela debe ser al menos
    // 50% más grande que las anteriores
    RANGE_EXPANSION: 1.50,

    // Expansión extrema
    EXTREME_RANGE_EXPANSION: 1.80,

    // Mecha mínima para considerar rechazo
    REJECTION_WICK: 0.20,

    // ==============================
    // EXTENSION
    // ==============================

    EXTENSION_LOOKBACK: 5,

    EXTENSION_UP: 0.85,

    EXTENSION_DOWN: 0.15,

    // ==============================
    // BOS
    // ==============================

    BOS_LOOKBACK: 6,

    // ==============================
    // PENALTIES
    // ==============================

    EXHAUSTION_PENALTY: 3,

    EXTENSION_PENALTY: 2,

    REJECTION_PENALTY: 2,

    // ==============================
    // HARD BLOCK
    // ==============================

    HARD_EXHAUSTION_STRENGTH: 0.85,

    HARD_EXHAUSTION_RANGE: 1.80

};


/**
 * ==========================================
 * SYNTHETIC PRO STRATEGY V2
 * ==========================================
 */
function rsiStrategy(candles, state = {}) {

    const stats = state.stats || {};

    // ==========================================
    // VALIDACIÓN
    // ==========================================

    if (!candles || candles.length < 30) {

        return buildSignal({
            strategy: "synthetic_pro",
            signal: null,
            score: 0
        });

    }

    // ==========================================
    // SMA
    // ==========================================

    const sma = calculateSMA(candles, 12);

    if (!sma) {

        return buildSignal({
            strategy: "synthetic_pro",
            signal: null,
            score: 0
        });

    }

    // ==========================================
    // ÚLTIMAS VELAS
    // ==========================================

    const last = candles.at(-2);
    const prev = candles.at(-3);
    const prev2 = candles.at(-4);
    const prev3 = candles.at(-5);

    if (!last || !prev || !prev2 || !prev3) {

        return buildSignal({
            strategy: "synthetic_pro",
            signal: null,
            score: 0
        });

    }

    // ==========================================
    // HELPER STRENGTH
    // ==========================================

    function strength(candle) {

        const body =
            Math.abs(
                candle.close -
                candle.open
            );

        const range =
            candle.high -
            candle.low;

        if (range <= 0)
            return 0;

        return body / range;
    }

    // ==========================================
    // HELPER COLOR
    // ==========================================

    const color = candle =>
        candle.close > candle.open
            ? "G"
            : "R";

    // ==========================================
    // PATRÓN
    // ==========================================

    const pattern =
        color(prev2) +
        color(prev) +
        color(last);

    // ==========================================
    // STRENGTH
    // ==========================================

    const strengthPrev2 =
        strength(prev2);

    const strengthPrev =
        strength(prev);

    const lastStrength =
        strength(last);

    const avgStrength =
        (
            strengthPrev2 +
            strengthPrev +
            lastStrength
        ) / 3;

    // ==========================================
    // RANGOS
    // ==========================================

    const lastRange =
        last.high -
        last.low;

    const prevRange =
        prev.high -
        prev.low;

    const prev2Range =
        prev2.high -
        prev2.low;

    const prev3Range =
        prev3.high -
        prev3.low;

    if (lastRange <= 0) {

        return buildSignal({
            strategy: "synthetic_pro",
            signal: null,
            score: 0,
            strength: avgStrength,
            pattern,
            sma
        });

    }

    // ==========================================
    // RANGO PROMEDIO ANTERIOR
    // ==========================================

    const avgPreviousRange =
        (
            prevRange +
            prev2Range +
            prev3Range
        ) / 3;

    const rangeExpansion =
        avgPreviousRange > 0
            ? lastRange / avgPreviousRange
            : 0;

    // ==========================================
    // CUERPO
    // ==========================================

    const lastBody =
        Math.abs(
            last.close -
            last.open
        );

    const bodyPercent =
        lastRange > 0
            ? lastBody / lastRange
            : 0;

    // ==========================================
    // MECHAS
    // ==========================================

    const upperWick =
        last.high -
        Math.max(
            last.open,
            last.close
        );

    const lowerWick =
        Math.min(
            last.open,
            last.close
        ) -
        last.low;

    const upperWickPct =
        lastRange > 0
            ? upperWick / lastRange
            : 0;

    const lowerWickPct =
        lastRange > 0
            ? lowerWick / lastRange
            : 0;

    // ==========================================
    // TENDENCIA
    // ==========================================

    const trendUp =
        last.close > sma &&
        prev.close > sma;

    const trendDown =
        last.close < sma &&
        prev.close < sma;

    // ==========================================
    // MOMENTUM
    // ==========================================

    const momentumUp =
        last.close > prev.close &&
        prev.close > prev2.close;

    const momentumDown =
        last.close < prev.close &&
        prev.close < prev2.close;

    // ==========================================
    // MOMENTUM ACELERADO
    // ==========================================

    const momentumMove1 =
        last.close -
        prev.close;

    const momentumMove2 =
        prev.close -
        prev2.close;

    const momentumAccelerationUp =
        momentumMove1 >
        momentumMove2;

    const momentumAccelerationDown =
        Math.abs(momentumMove1) >
        Math.abs(momentumMove2);

    // ==========================================
    // PULLBACK
    // ==========================================

    const pullbackUp =
        trendUp &&
        prev.low <= sma &&
        last.close > sma &&
        last.close > prev.high;

    const pullbackDown =
        trendDown &&
        prev.high >= sma &&
        last.close < sma &&
        last.close < prev.low;

    // ==========================================
    // BOS
    // ==========================================

    const structureCandles =
        candles.slice(
            -(CONFIG.BOS_LOOKBACK + 2),
            -2
        );

    const structureHighs =
        structureCandles.map(
            c => c.high
        );

    const structureLows =
        structureCandles.map(
            c => c.low
        );

    const prevHigh =
        structureHighs.length
            ? Math.max(...structureHighs)
            : null;

    const prevLow =
        structureLows.length
            ? Math.min(...structureLows)
            : null;

    const bosUp =
        prevHigh !== null &&
        last.close > prevHigh;

    const bosDown =
        prevLow !== null &&
        last.close < prevLow;

    // ==========================================
    // BOS CONFIRMADO
    // ==========================================

    const previousCloseBeforeBreak =
        prev.close;

    const bosUpConfirmed =
        bosUp &&
        previousCloseBeforeBreak <= prevHigh;

    const bosDownConfirmed =
        bosDown &&
        previousCloseBeforeBreak >= prevLow;

    // ==========================================
    // EXTENSIÓN DEL MOVIMIENTO
    // ==========================================

    const extensionCandles =
        candles.slice(
            -(CONFIG.EXTENSION_LOOKBACK + 1),
            -1
        );

    const extensionHighs =
        extensionCandles.map(
            c => c.high
        );

    const extensionLows =
        extensionCandles.map(
            c => c.low
        );

    const highestRecent =
        extensionHighs.length
            ? Math.max(...extensionHighs)
            : last.high;

    const lowestRecent =
        extensionLows.length
            ? Math.min(...extensionLows)
            : last.low;

    const recentRange =
        highestRecent -
        lowestRecent;

    let positionInRange = 0.5;

    if (recentRange > 0) {

        positionInRange =
            (
                last.close -
                lowestRecent
            ) /
            recentRange;

    }

    const extensionUp =
        positionInRange >=
        CONFIG.EXTENSION_UP;

    const extensionDown =
        positionInRange <=
        CONFIG.EXTENSION_DOWN;

    // ==========================================
    // VELA ANORMALMENTE GRANDE
    // ==========================================

    const bullishExpansion =
        last.close > last.open &&
        rangeExpansion >=
        CONFIG.RANGE_EXPANSION;

    const bearishExpansion =
        last.close < last.open &&
        rangeExpansion >=
        CONFIG.RANGE_EXPANSION;

    // ==========================================
    // RECHAZO
    // ==========================================

    const bearishRejection =
        last.close > last.open &&
        upperWickPct >=
        CONFIG.REJECTION_WICK;

    const bullishRejection =
        last.close < last.open &&
        lowerWickPct >=
        CONFIG.REJECTION_WICK;

    // ==========================================
    // POSIBLE AGOTAMIENTO ALCISTA
    // ==========================================

    const bullishExhaustion =
        last.close > last.open &&
        lastStrength >=
        CONFIG.EXTREME_STRENGTH &&
        rangeExpansion >=
        CONFIG.RANGE_EXPANSION;

    // ==========================================
    // POSIBLE AGOTAMIENTO BAJISTA
    // ==========================================

    const bearishExhaustion =
        last.close < last.open &&
        lastStrength >=
        CONFIG.EXTREME_STRENGTH &&
        rangeExpansion >=
        CONFIG.RANGE_EXPANSION;

    // ==========================================
    // AGOTAMIENTO EXTREMO
    // ==========================================

    const extremeBullishExhaustion =
        trendUp &&
        momentumUp &&
        lastStrength >=
        CONFIG.HARD_EXHAUSTION_STRENGTH &&
        rangeExpansion >=
        CONFIG.HARD_EXHAUSTION_RANGE &&
        extensionUp;

    const extremeBearishExhaustion =
        trendDown &&
        momentumDown &&
        lastStrength >=
        CONFIG.HARD_EXHAUSTION_STRENGTH &&
        rangeExpansion >=
        CONFIG.HARD_EXHAUSTION_RANGE &&
        extensionDown;

    // ==========================================
    // SCORE
    // ==========================================

    let callScore = 0;
    let putScore = 0;

    const reasons = [];

    // ==========================================
    // HELPERS
    // ==========================================

    function addCall(points, reason) {

        callScore += points;

        reasons.push(
            `CALL +${points} ${reason}`
        );

    }

    function addPut(points, reason) {

        putScore += points;

        reasons.push(
            `PUT +${points} ${reason}`
        );

    }

    // ==========================================
    // TREND
    // ==========================================

    if (trendUp)
        addCall(
            CONFIG.TREND_POINTS,
            "Trend"
        );

    if (trendDown)
        addPut(
            CONFIG.TREND_POINTS,
            "Trend"
        );

    // ==========================================
    // BOS
    // ==========================================

    if (bosUpConfirmed)
        addCall(
            CONFIG.BOS_POINTS,
            "BOS Confirmado"
        );

    if (bosDownConfirmed)
        addPut(
            CONFIG.BOS_POINTS,
            "BOS Confirmado"
        );

    // ==========================================
    // PULLBACK
    // ==========================================

    if (pullbackUp)
        addCall(
            CONFIG.PULLBACK_POINTS,
            "Pullback Confirmado"
        );

    if (pullbackDown)
        addPut(
            CONFIG.PULLBACK_POINTS,
            "Pullback Confirmado"
        );

    // ==========================================
    // MOMENTUM
    // ==========================================

    if (momentumUp)
        addCall(
            CONFIG.MOMENTUM_POINTS,
            "Momentum"
        );

    if (momentumDown)
        addPut(
            CONFIG.MOMENTUM_POINTS,
            "Momentum"
        );

    // ==========================================
    // ACELERACIÓN
    // ==========================================

    if (
        momentumUp &&
        momentumAccelerationUp
    ) {

        addCall(
            1,
            "Momentum Acelerando"
        );

    }

    if (
        momentumDown &&
        momentumAccelerationDown
    ) {

        addPut(
            1,
            "Momentum Acelerando"
        );

    }

    // ==========================================
    // STRENGTH
    // ==========================================

    if (
        avgStrength >=
        CONFIG.STRONG_STRENGTH
    ) {

        if (trendUp)
            addCall(
                CONFIG.STRONG_CANDLE,
                "Strong Candles"
            );

        if (trendDown)
            addPut(
                CONFIG.STRONG_CANDLE,
                "Strong Candles"
            );

    }

    else if (
        avgStrength >=
        0.55
    ) {

        if (trendUp)
            addCall(
                CONFIG.MEDIUM_CANDLE,
                "Medium Candles"
            );

        if (trendDown)
            addPut(
                CONFIG.MEDIUM_CANDLE,
                "Medium Candles"
            );

    }

    // ==========================================
    // HISTORIAL
    // ==========================================

    const currentStats =
        stats[pattern];

    if (
        currentStats &&
        currentStats.total >=
        CONFIG.HISTORY_MIN
    ) {

        const pctGreen =
            Number(
                currentStats.pctGreen || 0
            );

        const pctRed =
            Number(
                currentStats.pctRed || 0
            );

        if (pctGreen > pctRed) {

            const edge =
                pctGreen -
                pctRed;

            if (edge >= 10)
                addCall(1, "History");

            if (edge >= 20)
                addCall(1, "History Edge");

            if (edge >= 30)
                addCall(1, "History Strong Edge");

        }

        else if (pctRed > pctGreen) {

            const edge =
                pctRed -
                pctGreen;

            if (edge >= 10)
                addPut(1, "History");

            if (edge >= 20)
                addPut(1, "History Edge");

            if (edge >= 30)
                addPut(1, "History Strong Edge");

        }

    }

    // ==========================================
    // PENALTY:
    // EXTENSIÓN ALCISTA
    // ==========================================

    if (
        extensionUp &&
        trendUp
    ) {

        callScore -=
            CONFIG.EXTENSION_PENALTY;

        reasons.push(
            `CALL -${CONFIG.EXTENSION_PENALTY} Precio extendido`
        );

    }

    // ==========================================
    // PENALTY:
    // EXTENSIÓN BAJISTA
    // ==========================================

    if (
        extensionDown &&
        trendDown
    ) {

        putScore -=
            CONFIG.EXTENSION_PENALTY;

        reasons.push(
            `PUT -${CONFIG.EXTENSION_PENALTY} Precio extendido`
        );

    }

    // ==========================================
    // PENALTY:
    // AGOTAMIENTO ALCISTA
    // ==========================================

    if (bullishExhaustion) {

        callScore -=
            CONFIG.EXHAUSTION_PENALTY;

        reasons.push(
            `CALL -${CONFIG.EXHAUSTION_PENALTY} Posible agotamiento alcista`
        );

    }

    // ==========================================
    // PENALTY:
    // AGOTAMIENTO BAJISTA
    // ==========================================

    if (bearishExhaustion) {

        putScore -=
            CONFIG.EXHAUSTION_PENALTY;

        reasons.push(
            `PUT -${CONFIG.EXHAUSTION_PENALTY} Posible agotamiento bajista`
        );

    }

    // ==========================================
    // PENALTY:
    // RECHAZO ALCISTA
    // ==========================================

    if (
        bearishRejection &&
        extensionUp
    ) {

        callScore -=
            CONFIG.REJECTION_PENALTY;

        reasons.push(
            `CALL -${CONFIG.REJECTION_PENALTY} Rechazo superior`
        );

    }

    // ==========================================
    // PENALTY:
    // RECHAZO BAJISTA
    // ==========================================

    if (
        bullishRejection &&
        extensionDown
    ) {

        putScore -=
            CONFIG.REJECTION_PENALTY;

        reasons.push(
            `PUT -${CONFIG.REJECTION_PENALTY} Rechazo inferior`
        );

    }

    // ==========================================
    // EVITAR SCORES NEGATIVOS
    // ==========================================

    callScore =
        Math.max(
            0,
            callScore
        );

    putScore =
        Math.max(
            0,
            putScore
        );

    // ==========================================
    // DEBUG COMPLETO
    // ==========================================

    console.log(
        "=========================================="
    );

    console.log(
        "🚀 SYNTHETIC PRO V2"
    );

    console.log(
        "Pattern:",
        pattern
    );

    console.log(
        "SMA:",
        sma
    );

    console.log(
        "CALL:",
        callScore
    );

    console.log(
        "PUT:",
        putScore
    );

    console.log(
        "Strength:",
        lastStrength
    );

    console.log(
        "Avg Strength:",
        avgStrength
    );

    console.log(
        "Range Expansion:",
        rangeExpansion
    );

    console.log(
        "Upper Wick %:",
        upperWickPct
    );

    console.log(
        "Lower Wick %:",
        lowerWickPct
    );

    console.log(
        "Position Range:",
        positionInRange
    );

    console.log(
        "Trend Up:",
        trendUp
    );

    console.log(
        "Trend Down:",
        trendDown
    );

    console.log(
        "BOS Up:",
        bosUp
    );

    console.log(
        "BOS Down:",
        bosDown
    );

    console.log(
        "BOS Up Confirmed:",
        bosUpConfirmed
    );

    console.log(
        "BOS Down Confirmed:",
        bosDownConfirmed
    );

    console.log(
        "Pullback Up:",
        pullbackUp
    );

    console.log(
        "Pullback Down:",
        pullbackDown
    );

    console.log(
        "Momentum Up:",
        momentumUp
    );

    console.log(
        "Momentum Down:",
        momentumDown
    );

    console.log(
        "Momentum Accel Up:",
        momentumAccelerationUp
    );

    console.log(
        "Momentum Accel Down:",
        momentumAccelerationDown
    );

    console.log(
        "Extension Up:",
        extensionUp
    );

    console.log(
        "Extension Down:",
        extensionDown
    );

    console.log(
        "Bullish Exhaustion:",
        bullishExhaustion
    );

    console.log(
        "Bearish Exhaustion:",
        bearishExhaustion
    );

    console.log(
        "Extreme Bullish Exhaustion:",
        extremeBullishExhaustion
    );

    console.log(
        "Extreme Bearish Exhaustion:",
        extremeBearishExhaustion
    );

    console.table(reasons);

    console.log(
        "=========================================="
    );

    // ==========================================
    // DATA COMÚN PARA buildSignal
    // ==========================================

    const signalData = {

        strategy: "synthetic_pro",

        trend:
            trendUp ||
            trendDown,

        bos:
            bosUpConfirmed ||
            bosDownConfirmed,

        pullback:
            pullbackUp ||
            pullbackDown,

        momentum:
            momentumUp ||
            momentumDown,

        strength:
            avgStrength,

        pattern,

        pctGreen:
            currentStats?.pctGreen,

        pctRed:
            currentStats?.pctRed,

        callScore,

        putScore,

        sma

    };

    // ==========================================
    // HARD BLOCK:
    // AGOTAMIENTO ALCISTA EXTREMO
    // ==========================================

    if (extremeBullishExhaustion) {

        console.log(
            "🛑 CALL BLOQUEADO: AGOTAMIENTO ALCISTA EXTREMO",
            {
                lastStrength,
                rangeExpansion,
                positionInRange
            }
        );

        return buildSignal({
            ...signalData,
            signal: null,
            score: putScore
        });

    }

    // ==========================================
    // HARD BLOCK:
    // AGOTAMIENTO BAJISTA EXTREMO
    // ==========================================

    if (extremeBearishExhaustion) {

        console.log(
            "🛑 PUT BLOQUEADO: AGOTAMIENTO BAJISTA EXTREMO",
            {
                lastStrength,
                rangeExpansion,
                positionInRange
            }
        );

        return buildSignal({
            ...signalData,
            signal: null,
            score: callScore
        });

    }

    // ==========================================
    // CALL
    // ==========================================

    if (
        callScore >=
        CONFIG.MIN_SCORE &&

        (callScore - putScore) >=
        CONFIG.MIN_DIFF
    ) {

        // --------------------------------------
        // ÚLTIMA VELA DEBE SER ALCISTA
        // --------------------------------------

        if (
            last.close <= last.open ||
            lastStrength <
            CONFIG.MIN_LAST_STRENGTH
        ) {

            console.log(
                "❌ CALL descartado: última vela no confirma",
                {
                    lastStrength,
                    callScore
                }
            );

            return buildSignal({
                ...signalData,
                signal: null,
                score: putScore
            });

        }

        // --------------------------------------
        // REVERSIÓN / AGOTAMIENTO
        // --------------------------------------

        if (
            bullishExhaustion &&
            extensionUp
        ) {

            console.log(
                "🛑 CALL descartado: posible reversión",
                {
                    callScore,
                    lastStrength,
                    avgStrength,
                    rangeExpansion,
                    pattern,
                    extensionUp
                }
            );

            return buildSignal({
                ...signalData,
                signal: null,
                score: putScore
            });

        }

        // --------------------------------------
        // VELA CLIMÁTICA
        // --------------------------------------

        if (
            bullishExpansion &&
            extensionUp &&
            bearishRejection
        ) {

            console.log(
                "🛑 CALL descartado: vela climática + rechazo",
                {
                    callScore,
                    rangeExpansion,
                    upperWickPct,
                    positionInRange
                }
            );

            return buildSignal({
                ...signalData,
                signal: null,
                score: putScore
            });

        }

        // --------------------------------------
        // CALL
        // --------------------------------------

        console.log(
            "🟢 CALL CONFIRMADO",
            {
                callScore,
                putScore,
                difference:
                    callScore -
                    putScore,
                strength: lastStrength,
                avgStrength,
                pattern,
                bosUpConfirmed,
                pullbackUp,
                momentumUp,
                extensionUp
            }
        );

        return buildSignal({
            ...signalData,
            signal: "PUT",
            score: callScore
        });

    }

    // ==========================================
    // PUT
    // ==========================================

    if (
        putScore >=
        CONFIG.MIN_SCORE &&

        (putScore - callScore) >=
        CONFIG.MIN_DIFF
    ) {

        // --------------------------------------
        // ÚLTIMA VELA DEBE SER BAJISTA
        // --------------------------------------

        if (
            last.close >= last.open ||
            lastStrength <
            CONFIG.MIN_LAST_STRENGTH
        ) {

            console.log(
                "❌ PUT descartado: última vela no confirma",
                {
                    lastStrength,
                    putScore
                }
            );

            return buildSignal({
                ...signalData,
                signal: null,
                score: callScore
            });

        }

        // --------------------------------------
        // REVERSIÓN / AGOTAMIENTO
        // --------------------------------------

        if (
            bearishExhaustion &&
            extensionDown
        ) {

            console.log(
                "🛑 PUT descartado: posible reversión",
                {
                    putScore,
                    lastStrength,
                    avgStrength,
                    rangeExpansion,
                    pattern,
                    extensionDown
                }
            );

            return buildSignal({
                ...signalData,
                signal: null,
                score: callScore
            });

        }

        // --------------------------------------
        // VELA CLIMÁTICA
        // --------------------------------------

        if (
            bearishExpansion &&
            extensionDown &&
            bullishRejection
        ) {

            console.log(
                "🛑 PUT descartado: vela climática + rechazo",
                {
                    putScore,
                    rangeExpansion,
                    lowerWickPct,
                    positionInRange
                }
            );

            return buildSignal({
                ...signalData,
                signal: null,
                score: callScore
            });

        }

        // --------------------------------------
        // PUT
        // --------------------------------------

        console.log(
            "🔴 PUT CONFIRMADO",
            {
                putScore,
                callScore,
                difference:
                    putScore -
                    callScore,
                strength: lastStrength,
                avgStrength,
                pattern,
                bosDownConfirmed,
                pullbackDown,
                momentumDown,
                extensionDown
            }
        );

        return buildSignal({
            ...signalData,
            signal: "CALL",
            score: putScore
        });

    }

    // ==========================================
    // SIN SEÑAL
    // ==========================================

    console.log(
        "⚪ SIN SEÑAL",
        {
            callScore,
            putScore,
            difference:
                Math.abs(
                    callScore -
                    putScore
                )
        }
    );

    return buildSignal({
        ...signalData,
        signal: null,
        score:
            Math.max(
                callScore,
                putScore
            )
    });

}

module.exports = rsiStrategy;