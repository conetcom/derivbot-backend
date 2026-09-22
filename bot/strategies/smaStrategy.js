const buildSignal = require("../helpers/buildSignal");

/*
============================================================
 SYNTHETIC PRO V2
 Trend + Extension + Pullback + Breakout + Reversal
============================================================

 PRINCIPIOS

 1. MA10 = movimiento rápido
 2. MA50 = estructura principal
 3. Precio vs MA10
 4. Precio vs MA50
 5. Pendiente MA10
 6. Pendiente MA50
 7. Distancia normalizada a MA50
 8. Extensión
 9. Pullback a MA10
10. Rechazo de MA10
11. Breakout / BOS
12. Reversión
13. Fuerza de vela
14. Patrón histórico

 TIPOS DE ENTRADA

 CONTINUATION
 BREAKOUT
 REVERSAL
 NO TRADE

 IMPORTANTE

 El martingale NO decide la dirección del mercado.
 El botEngine/riskManager continúa manejando el riesgo.
============================================================
*/


const CONFIG = {

    HISTORY_MIN: 50,

    PATTERN_MIN: 10,

    REQUIRE_HISTORY: true,

    HISTORY_MIN_EDGE: 15,

    // Medias
    MA_FAST: 10,
    MA_SLOW: 50,

    // Velas utilizadas para calcular pendiente
    MA_SLOPE_LOOKBACK: 3,

    // Rango medio
    RANGE_LOOKBACK: 10,

    // Extensión respecto a MA50
    EXTENSION_MIN: 1.50,

    // Precio considerado cerca de MA10
    MA10_NEAR_MULTIPLIER: 0.35,

    // Fuerza mínima de última vela
    MIN_LAST_STRENGTH: 0.55,

    // BOS
    BOS_LOOKBACK: 6,

    // Compatibilidad con botEngine
    MAX_MARTINGALE: 3,
    MAX_CONSECUTIVE_LOSSES: 3,
    COOLDOWN_MS: 5 * 60 * 1000,

    // Reversiones
    ENABLE_REVERSAL: true,
    REVERSAL_EXTENSION: 1.50,

    DEBUG: true
};


// ============================================================
// UTILIDADES
// ============================================================

function num(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(value, decimals = 4) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return 0;
    }

    return Number(n.toFixed(decimals));
}


// ============================================================
// SMA
// ============================================================

function sma(candles, period) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {
        return null;
    }

    const slice = candles.slice(-period);

    let sum = 0;

    for (const candle of slice) {

        const close = Number(candle?.close);

        if (!Number.isFinite(close)) {
            return null;
        }

        sum += close;
    }

    return sum / period;
}


// ============================================================
// RANGO PROMEDIO
// ============================================================

function averageRange(candles, period) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {
        return null;
    }

    const slice = candles.slice(-period);

    let total = 0;
    let count = 0;

    for (const candle of slice) {

        const high = Number(candle?.high);
        const low = Number(candle?.low);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {
            continue;
        }

        const range = high - low;

        if (range <= 0) {
            continue;
        }

        total += range;
        count++;
    }

    return count > 0
        ? total / count
        : null;
}


// ============================================================
// FUERZA DE VELA
// ============================================================

function candleStrength(candle) {

    if (!candle) {
        return 0;
    }

    const open = Number(candle.open);
    const close = Number(candle.close);
    const high = Number(candle.high);
    const low = Number(candle.low);

    if (
        !Number.isFinite(open) ||
        !Number.isFinite(close) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low)
    ) {
        return 0;
    }

    const range = high - low;

    if (range <= 0) {
        return 0;
    }

    return Math.min(
        1,
        Math.abs(close - open) / range
    );
}


// ============================================================
// COLOR DE VELA
// ============================================================

function candleColor(candle) {

    const open = Number(candle?.open);
    const close = Number(candle?.close);

    if (
        !Number.isFinite(open) ||
        !Number.isFinite(close)
    ) {
        return "N";
    }

    if (close > open) {
        return "G";
    }

    if (close < open) {
        return "R";
    }

    return "N";
}


function bullish(candle) {

    return Number(candle?.close) >
           Number(candle?.open);
}


function bearish(candle) {

    return Number(candle?.close) <
           Number(candle?.open);
}


// ============================================================
// PENDIENTE DE MA
// ============================================================

function maSlope(candles, period, lookback) {

    if (
        !Array.isArray(candles) ||
        candles.length <
        period + lookback
    ) {
        return null;
    }

    const current = sma(
        candles,
        period
    );

    const previous = sma(
        candles.slice(0, -lookback),
        period
    );

    if (
        current === null ||
        previous === null
    ) {
        return null;
    }

    return current - previous;
}


// ============================================================
// SEÑAL NEUTRAL
// ============================================================

function neutralSignal(extra = {}) {

    return buildSignal({

        strategy: "synthetic_pro",

        signal: null,

        score: 0,

        trend: false,

        bos: false,

        pullback: false,

        momentum: false,

        strength: 0,

        pattern: null,

        pctGreen: null,

        pctRed: null,

        total: 0,

        historyEdge: 0,

        historyDirection: null,

        callScore: 0,

        putScore: 0,

        sma: null,

        ...extra
    });
}


// ============================================================
// SYNTHETIC PRO V2
// ============================================================

function smaStrategy(
    candles,
    state = {}
) {

    // ========================================================
    // VALIDACIÓN
    // ========================================================

    if (
        !Array.isArray(candles) ||
        candles.length < CONFIG.HISTORY_MIN
    ) {

        if (CONFIG.DEBUG) {

            console.log(
                "⛔ SYNTHETIC V2 - HISTORIAL INSUFICIENTE",
                {
                    actual: candles?.length || 0,
                    minimo: CONFIG.HISTORY_MIN
                }
            );
        }

        return neutralSignal({
            total: candles?.length || 0
        });
    }


    // ========================================================
    // COOLDOWN
    // ========================================================

    const now = Date.now();

    const cooldownUntil =
        num(
            state?.cooldownUntil,
            0
        );

    if (
        cooldownUntil > 0 &&
        now < cooldownUntil
    ) {

        if (CONFIG.DEBUG) {

            console.log(
                "⏸️ SYNTHETIC V2 - COOLDOWN"
            );
        }

        return neutralSignal();
    }


    // ========================================================
    // PÉRDIDAS CONSECUTIVAS
    // ========================================================

    const consecutiveLosses =
        num(
            state?.consecutiveLosses,
            0
        );

    if (
        consecutiveLosses >=
        CONFIG.MAX_CONSECUTIVE_LOSSES
    ) {

        console.log(
            "🛑 SYNTHETIC V2 - MÁXIMO DE PÉRDIDAS",
            consecutiveLosses
        );

        return neutralSignal();
    }


    // ========================================================
    // MARTINGALE
    //
    // SOLO BLOQUEO DE SEGURIDAD.
    // NO PARTICIPA EN LA DIRECCIÓN.
    // ========================================================

    const martingale =
        num(
            state?.risk?.martingaleStep,
            0
        );

    if (
        martingale >
        CONFIG.MAX_MARTINGALE
    ) {

        console.log(
            "🛑 SYNTHETIC V2 - MARTINGALE MÁXIMO",
            martingale
        );

        return neutralSignal();
    }


    // ========================================================
    // ÚLTIMAS VELAS
    // ========================================================

    const last = candles.at(-1);
    const prev = candles.at(-2);
    const prev2 = candles.at(-3);
    const prev3 = candles.at(-4);

    if (
        !last ||
        !prev ||
        !prev2 ||
        !prev3
    ) {
        return neutralSignal();
    }


    // ========================================================
    // MA10 / MA50
    // ========================================================

    const ma10 =
        sma(
            candles,
            CONFIG.MA_FAST
        );

    const ma50 =
        sma(
            candles,
            CONFIG.MA_SLOW
        );

    const ma10Slope =
        maSlope(
            candles,
            CONFIG.MA_FAST,
            CONFIG.MA_SLOPE_LOOKBACK
        );

    const ma50Slope =
        maSlope(
            candles,
            CONFIG.MA_SLOW,
            CONFIG.MA_SLOPE_LOOKBACK
        );

    if (
        ma10 === null ||
        ma50 === null ||
        ma10Slope === null ||
        ma50Slope === null
    ) {

        console.log(
            "⛔ SYNTHETIC V2 - MA NO DISPONIBLES"
        );

        return neutralSignal();
    }


    // ========================================================
    // PRECIO
    // ========================================================

    const price =
        num(last.close);

    const previousPrice =
        num(prev.close);


    // ========================================================
    // RANGO
    // ========================================================

    const avgRange =
        averageRange(
            candles,
            CONFIG.RANGE_LOOKBACK
        );

    if (
        !avgRange ||
        avgRange <= 0
    ) {

        return neutralSignal({
            sma: ma10
        });
    }


    // ========================================================
    // DISTANCIA A MA10 / MA50
    // ========================================================

    const distanceMA10 =
        Math.abs(
            price - ma10
        );

    const distanceMA50 =
        Math.abs(
            price - ma50
        );

    const normalizedMA10 =
        distanceMA10 /
        avgRange;

    const normalizedMA50 =
        distanceMA50 /
        avgRange;


    // ========================================================
    // POSICIÓN DEL PRECIO
    // ========================================================

    const aboveMA10 =
        price > ma10;

    const belowMA10 =
        price < ma10;

    const aboveMA50 =
        price > ma50;

    const belowMA50 =
        price < ma50;


    // ========================================================
    // ESTRUCTURA ALCISTA
    // ========================================================

    const bullishStructure =
        ma10 > ma50 &&
        ma10Slope > 0;


    // ========================================================
    // ESTRUCTURA BAJISTA
    // ========================================================

    const bearishStructure =
        ma10 < ma50 &&
        ma10Slope < 0;


    // ========================================================
    // TENDENCIA ALCISTA
    // ========================================================

    const bullishTrend =
        bullishStructure &&
        aboveMA10 &&
        ma50Slope >= 0;


    // ========================================================
    // TENDENCIA BAJISTA
    // ========================================================

    const bearishTrend =
        bearishStructure &&
        belowMA10 &&
        ma50Slope <= 0;


    // ========================================================
    // EXTENSIÓN
    // ========================================================

    const bullishExtension =
        aboveMA50 &&
        normalizedMA50 >=
        CONFIG.EXTENSION_MIN;

    const bearishExtension =
        belowMA50 &&
        normalizedMA50 >=
        CONFIG.EXTENSION_MIN;


    // ========================================================
    // EXTENSIÓN DE LA VELA ANTERIOR
    //
    // Esto permite detectar reversión.
    // ========================================================

    const previousDistanceMA50 =
        Math.abs(
            previousPrice - ma50
        );

    const previousNormalizedMA50 =
        previousDistanceMA50 /
        avgRange;

    const previousBullishExtension =
        previousPrice > ma50 &&
        previousNormalizedMA50 >=
        CONFIG.REVERSAL_EXTENSION;

    const previousBearishExtension =
        previousPrice < ma50 &&
        previousNormalizedMA50 >=
        CONFIG.REVERSAL_EXTENSION;


    // ========================================================
    // MOMENTUM
    //
    // Informativo.
    // No es requisito de entrada.
    // ========================================================

    const momentumUp =
        price > previousPrice &&
        previousPrice >
        Number(prev2.close);

    const momentumDown =
        price < previousPrice &&
        previousPrice <
        Number(prev2.close);


    // ========================================================
    // PULLBACK HACIA MA10
    // ========================================================

    const pullbackUp =
        bullishStructure &&
        Number(prev.low) <= ma10 &&
        price > ma10;

    const pullbackDown =
        bearishStructure &&
        Number(prev.high) >= ma10 &&
        price < ma10;


    // ========================================================
    // RECHAZO MA10
    // ========================================================

    const strengthLast =
        candleStrength(last);

    const strengthPrev =
        candleStrength(prev);

    const strengthPrev2 =
        candleStrength(prev2);

    const avgStrength =
        (
            strengthLast +
            strengthPrev +
            strengthPrev2
        ) / 3;


    const bullishRejectionMA10 =
        pullbackUp &&
        bullish(last) &&
        price > ma10 &&
        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH;


    const bearishRejectionMA10 =
        pullbackDown &&
        bearish(last) &&
        price < ma10 &&
        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH;


    // ========================================================
    // PROXIMIDAD MA10
    // ========================================================

    const nearMA10 =
        normalizedMA10 <=
        CONFIG.MA10_NEAR_MULTIPLIER;


    // ========================================================
    // BOS
    // ========================================================

    const bosCandles =
        candles.slice(
            -CONFIG.BOS_LOOKBACK,
            -1
        );

    let previousHigh = null;
    let previousLow = null;

    if (bosCandles.length > 0) {

        previousHigh =
            Math.max(
                ...bosCandles.map(
                    candle =>
                        num(candle.high)
                )
            );

        previousLow =
            Math.min(
                ...bosCandles.map(
                    candle =>
                        num(candle.low)
                )
            );
    }


    const bosUp =
        Number.isFinite(previousHigh) &&
        price > previousHigh;


    const bosDown =
        Number.isFinite(previousLow) &&
        price < previousLow;


    // ========================================================
    // PATRÓN
    // ========================================================

    const pattern =
        candleColor(prev2) +
        candleColor(prev) +
        candleColor(last);


    if (
        pattern.includes("N")
    ) {

        return neutralSignal({
            pattern,
            sma: ma10
        });
    }


    // ========================================================
    // HISTORIAL
    // ========================================================

    const stats =
        state?.stats || {};

    const currentStats =
        stats?.[pattern] || null;


    let historyValid = false;

    let historyTotal = 0;

    let pctGreen = 0;

    let pctRed = 0;

    let historyEdge = 0;

    let historyDirection = null;


    if (currentStats) {

        historyTotal =
            num(
                currentStats.total,
                0
            );

        pctGreen =
            Number(
                currentStats.pctGreen
            );

        pctRed =
            Number(
                currentStats.pctRed
            );


        // ----------------------------------------------------
        // FALLBACK
        // ----------------------------------------------------

        if (
            !Number.isFinite(pctGreen) ||
            !Number.isFinite(pctRed)
        ) {

            const green =
                num(
                    currentStats.green,
                    0
                );

            const red =
                num(
                    currentStats.red,
                    0
                );

            const total =
                green + red;

            if (total > 0) {

                pctGreen =
                    (green / total) * 100;

                pctRed =
                    (red / total) * 100;

            } else {

                pctGreen = 0;
                pctRed = 0;
            }
        }


        if (
            historyTotal >=
            CONFIG.PATTERN_MIN
        ) {

            historyValid = true;
        }


        if (
            pctGreen >
            pctRed
        ) {

            historyDirection =
                "CALL";

            historyEdge =
                pctGreen -
                pctRed;

        } else if (
            pctRed >
            pctGreen
        ) {

            historyDirection =
                "PUT";

            historyEdge =
                pctRed -
                pctGreen;

        } else {

            historyDirection =
                null;

            historyEdge =
                0;
        }
    }


    historyEdge =
        round(
            historyEdge,
            2
        );

    pctGreen =
        round(
            pctGreen,
            2
        );

    pctRed =
        round(
            pctRed,
            2
        );


    // ========================================================
    // HISTORIAL COMO CONFIRMACIÓN
    // ========================================================

    const historySupportsCall =
        historyValid &&
        historyDirection === "CALL" &&
        historyEdge >=
        CONFIG.HISTORY_MIN_EDGE;


    const historySupportsPut =
        historyValid &&
        historyDirection === "PUT" &&
        historyEdge >=
        CONFIG.HISTORY_MIN_EDGE;


    // ========================================================
    // BLOQUEO HISTÓRICO
    // ========================================================

    if (
        CONFIG.REQUIRE_HISTORY &&
        !historyValid
    ) {

        console.log(
            "⛔ SYNTHETIC V2 - HISTORIAL INSUFICIENTE",
            {
                pattern,
                historyTotal
            }
        );

        return neutralSignal({

            pattern,

            pctGreen,

            pctRed,

            total:
                historyTotal,

            historyEdge,

            historyDirection,

            strength:
                avgStrength,

            trend:
                bullishStructure ||
                bearishStructure,

            bos:
                bosUp ||
                bosDown,

            pullback:
                pullbackUp ||
                pullbackDown,

            momentum:
                momentumUp ||
                momentumDown,

            sma:
                ma10
        });
    }


    if (
        CONFIG.REQUIRE_HISTORY &&
        historyEdge <
        CONFIG.HISTORY_MIN_EDGE
    ) {

        console.log(
            "⛔ SYNTHETIC V2 - EDGE HISTÓRICO BAJO",
            {
                pattern,
                historyEdge,
                minimo:
                    CONFIG.HISTORY_MIN_EDGE
            }
        );

        return neutralSignal({

            pattern,

            pctGreen,

            pctRed,

            total:
                historyTotal,

            historyEdge,

            historyDirection,

            strength:
                avgStrength,

            trend:
                bullishStructure ||
                bearishStructure,

            bos:
                bosUp ||
                bosDown,

            pullback:
                pullbackUp ||
                pullbackDown,

            momentum:
                momentumUp ||
                momentumDown,

            sma:
                ma10
        });
    }


    // ========================================================
    // CONTINUACIÓN ALCISTA
    //
    // TENDENCIA
    // +
    // PULLBACK MA10
    // +
    // RECHAZO
    // +
    // HISTORIAL CALL
    // ========================================================

    const continuationCall =
        bullishTrend &&
        pullbackUp &&
        bullishRejectionMA10 &&
        historySupportsCall;


    // ========================================================
    // CONTINUACIÓN BAJISTA
    // ========================================================

    const continuationPut =
        bearishTrend &&
        pullbackDown &&
        bearishRejectionMA10 &&
        historySupportsPut;


    // ========================================================
    // BREAKOUT ALCISTA
    //
    // Permite aprovechar movimientos fuertes aunque no exista
    // un pullback perfecto.
    // ========================================================

    const breakoutCall =
        bullishTrend &&
        bosUp &&
        bullish(last) &&
        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH &&
        historySupportsCall;


    // ========================================================
    // BREAKOUT BAJISTA
    // ========================================================

    const breakoutPut =
        bearishTrend &&
        bosDown &&
        bearish(last) &&
        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH &&
        historySupportsPut;


    // ========================================================
    // REVERSIÓN ALCISTA
    //
    // Precio previamente muy alejado debajo de MA50.
    //
    // Luego:
    //
    // 1. Recupera MA10
    // 2. Vela alcista
    // 3. Fuerza suficiente
    // 4. Historial CALL
    // ========================================================

    const bullishReversal =
        CONFIG.ENABLE_REVERSAL &&

        previousBearishExtension &&

        price > ma10 &&

        bullish(last) &&

        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH &&

        historySupportsCall;


    // ========================================================
    // REVERSIÓN BAJISTA
    // ========================================================

    const bearishReversal =
        CONFIG.ENABLE_REVERSAL &&

        previousBullishExtension &&

        price < ma10 &&

        bearish(last) &&

        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH &&

        historySupportsPut;


    // ========================================================
    // FASE DEL MERCADO
    // ========================================================

    let marketPhase =
        "RANGE";


    if (
        bullishTrend
    ) {

        marketPhase =
            bullishExtension
                ? "BULLISH_EXTENSION"
                : "BULLISH_TREND";

    } else if (
        bearishTrend
    ) {

        marketPhase =
            bearishExtension
                ? "BEARISH_EXTENSION"
                : "BEARISH_TREND";

    } else if (
        bullishStructure
    ) {

        marketPhase =
            "BULLISH_TRANSITION";

    } else if (
        bearishStructure
    ) {

        marketPhase =
            "BEARISH_TRANSITION";

    } else if (
        aboveMA10 &&
        aboveMA50
    ) {

        marketPhase =
            "ABOVE_MA";

    } else if (
        belowMA10 &&
        belowMA50
    ) {

        marketPhase =
            "BELOW_MA";
    }


    // ========================================================
    // SEÑAL FINAL
    // ========================================================

    let finalSignal = null;

    let entryType = null;


    // --------------------------------------------------------
    // CONTINUATION CALL
    // --------------------------------------------------------

    if (
        continuationCall
    ) {

        finalSignal =
            "CALL";

        entryType =
            "CONTINUATION";
    }


    // --------------------------------------------------------
    // CONTINUATION PUT
    // --------------------------------------------------------

    else if (
        continuationPut
    ) {

        finalSignal =
            "PUT";

        entryType =
            "CONTINUATION";
    }


    // --------------------------------------------------------
    // BREAKOUT CALL
    // --------------------------------------------------------

    else if (
        breakoutCall
    ) {

        finalSignal =
            "CALL";

        entryType =
            "BREAKOUT";
    }


    // --------------------------------------------------------
    // BREAKOUT PUT
    // --------------------------------------------------------

    else if (
        breakoutPut
    ) {

        finalSignal =
            "PUT";

        entryType =
            "BREAKOUT";
    }


    // --------------------------------------------------------
    // REVERSAL CALL
    // --------------------------------------------------------

    else if (
        bullishReversal
    ) {

        finalSignal =
            "CALL";

        entryType =
            "REVERSAL";
    }


    // --------------------------------------------------------
    // REVERSAL PUT
    // --------------------------------------------------------

    else if (
        bearishReversal
    ) {

        finalSignal =
            "PUT";

        entryType =
            "REVERSAL";
    }


    // ========================================================
    // EVITAR CONTRA TENDENCIA
    // ========================================================

    if (
        finalSignal === "CALL" &&
        bearishTrend
    ) {

        finalSignal = null;

        entryType = null;
    }


    if (
        finalSignal === "PUT" &&
        bullishTrend
    ) {

        finalSignal = null;

        entryType = null;
    }


    // ========================================================
    // SCORE INFORMATIVO
    //
    // IMPORTANTE:
    //
    // El score NO decide la entrada.
    //
    // Se mantiene para compatibilidad con:
    //
    // - dashboard
    // - trade_statistics
    // - botEngine
    // ========================================================

    let callScore = 0;

    let putScore = 0;


    if (
        bullishTrend
    ) {
        callScore += 3;
    }


    if (
        bearishTrend
    ) {
        putScore += 3;
    }


    if (
        pullbackUp
    ) {
        callScore += 2;
    }


    if (
        pullbackDown
    ) {
        putScore += 2;
    }


    if (
        bosUp
    ) {
        callScore += 2;
    }


    if (
        bosDown
    ) {
        putScore += 2;
    }


    if (
        bullishReversal
    ) {
        callScore += 4;
    }


    if (
        bearishReversal
    ) {
        putScore += 4;
    }


    if (
        historySupportsCall
    ) {
        callScore += 2;
    }


    if (
        historySupportsPut
    ) {
        putScore += 2;
    }


    if (
        strengthLast >=
        CONFIG.MIN_LAST_STRENGTH
    ) {

        if (
            bullish(last)
        ) {

            callScore++;

        } else if (
            bearish(last)
        ) {

            putScore++;
        }
    }


    const score =
        Math.max(
            callScore,
            putScore
        );


    // ========================================================
    // DEBUG
    // ========================================================

    if (
        CONFIG.DEBUG
    ) {

        console.log(
            "================================================"
        );

        console.log(
            "🧠 SYNTHETIC PRO V2"
        );

        console.log(
            "================================================"
        );

        console.log({

            signal:
                finalSignal,

            entryType,

            marketPhase,

            pattern,

            price:
                round(price),

            ma10:
                round(ma10),

            ma50:
                round(ma50),

            ma10Slope:
                round(ma10Slope),

            ma50Slope:
                round(ma50Slope),

            avgRange:
                round(avgRange),

            distanceMA10:
                round(distanceMA10),

            distanceMA50:
                round(distanceMA50),

            normalizedMA10:
                round(normalizedMA10),

            normalizedMA50:
                round(normalizedMA50),

            bullishTrend,

            bearishTrend,

            bullishStructure,

            bearishStructure,

            bullishExtension,

            bearishExtension,

            pullbackUp,

            pullbackDown,

            bullishRejectionMA10,

            bearishRejectionMA10,

            bosUp,

            bosDown,

            momentumUp,

            momentumDown,

            strengthLast:
                round(strengthLast),

            avgStrength:
                round(avgStrength),

            historyTotal,

            pctGreen,

            pctRed,

            historyDirection,

            historyEdge,

            historySupportsCall,

            historySupportsPut,

            callScore,

            putScore,

            martingale,

            consecutiveLosses
        });

        console.log(
            "================================================"
        );
    }


    // ========================================================
    // NO TRADE
    // ========================================================

    if (
        !finalSignal
    ) {

        console.log(
            "⚪ SYNTHETIC V2 → NO TRADE",
            {
                marketPhase,
                pattern,
                historyDirection,
                historyEdge,
                callScore,
                putScore
            }
        );


        const result =
            buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score,

                trend:
                    bullishStructure ||
                    bearishStructure,

                bos:
                    bosUp ||
                    bosDown,

                pullback:
                    pullbackUp ||
                    pullbackDown,

                momentum:
                    momentumUp ||
                    momentumDown,

                strength:
                    avgStrength,

                pattern,

                pctGreen,

                pctRed,

                total:
                    historyTotal,

                historyEdge,

                historyDirection,

                callScore,

                putScore,

                sma:
                    ma10
            });


        return {

            ...result,

            ma10:
                round(ma10),

            ma50:
                round(ma50),

            ma10Slope:
                round(ma10Slope),

            ma50Slope:
                round(ma50Slope),

            avgRange:
                round(avgRange),

            distanceMA10:
                round(distanceMA10),

            distanceMA50:
                round(distanceMA50),

            normalizedMA10:
                round(normalizedMA10),

            normalizedMA50:
                round(normalizedMA50),

            marketPhase,

            entryType,

            continuationCall,

            continuationPut,

            breakoutCall,

            breakoutPut,

            bullishReversal,

            bearishReversal,

            bullishExtension,

            bearishExtension,

            nearMA10
        };
    }


    // ========================================================
    // SEÑAL FINAL
    // ========================================================

    console.log(
        finalSignal === "CALL"
            ? "🟢🟢🟢 SYNTHETIC V2 → CALL"
            : "🔴🔴🔴 SYNTHETIC V2 → PUT"
    );

    console.log(
        "📌 ENTRY TYPE:",
        entryType
    );

    console.log(
        "📌 MARKET PHASE:",
        marketPhase
    );


    const result =
        buildSignal({

            strategy:
                "synthetic_pro",

            signal:
                finalSignal,

            score,

            trend:
                finalSignal === "CALL"
                    ? bullishStructure
                    : bearishStructure,

            bos:
                finalSignal === "CALL"
                    ? bosUp
                    : bosDown,

            pullback:
                finalSignal === "CALL"
                    ? pullbackUp
                    : pullbackDown,

            momentum:
                finalSignal === "CALL"
                    ? momentumUp
                    : momentumDown,

            strength:
                avgStrength,

            pattern,

            pctGreen,

            pctRed,

            total:
                historyTotal,

            historyEdge,

            historyDirection,

            callScore,

            putScore,

            sma:
                ma10
        });


    return {

        ...result,

        // =====================================================
        // METADATA PARA BOT ENGINE / DASHBOARD / DB
        // =====================================================

        ma10:
            round(ma10),

        ma50:
            round(ma50),

        ma10Slope:
            round(ma10Slope),

        ma50Slope:
            round(ma50Slope),

        avgRange:
            round(avgRange),

        distanceMA10:
            round(distanceMA10),

        distanceMA50:
            round(distanceMA50),

        normalizedMA10:
            round(normalizedMA10),

        normalizedMA50:
            round(normalizedMA50),

        marketPhase,

        entryType,

        continuationCall,

        continuationPut,

        breakoutCall,

        breakoutPut,

        bullishReversal,

        bearishReversal,

        bullishExtension,

        bearishExtension,

        nearMA10
    };
}


// ============================================================
// EXPORT
// ============================================================

module.exports =
    smaStrategy;