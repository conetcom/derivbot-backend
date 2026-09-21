// ============================================================
// SYNTHETIC PRO STRATEGY - ACTIVE VERSION
// ============================================================
// Objetivo:
// - Aumentar cantidad de entradas
// - Mantener filtros de calidad
// - Reducir dependencia del momentum
// - Mantener validación histórica
// - Compatible con buildSignal / IntelligenceEngine
// ============================================================

function syntheticProStrategy(candles, state = {}) {

    // ========================================================
    // CONFIGURACIÓN
    // ========================================================

    const CONFIG = {

        // ----------------------------------------------------
        // MÍNIMO DE HISTORIAL
        // ----------------------------------------------------
        HISTORY_MIN: 30,

        // ----------------------------------------------------
        // PATRONES
        // ----------------------------------------------------
        PATTERN_MIN: 10,

        // ----------------------------------------------------
        // SCORE
        // ----------------------------------------------------
        // Antes: 8
        // Ahora: 7 para permitir más entradas
        MIN_SCORE: 7,

        // Diferencia mínima CALL vs PUT
        // Antes: 2
        // Ahora: 1
        MIN_DIFF: 1,

        // ----------------------------------------------------
        // PUNTOS
        // ----------------------------------------------------
        TREND_POINTS: 3,
        BOS_POINTS: 3,
        PULLBACK_POINTS: 2,

        // Momentum desactivado como fuente de puntos.
        // Lo seguimos calculando para análisis,
        // pero no aumenta el score.
        MOMENTUM_POINTS: 0,

        STRONG_CANDLE: 2,
        MEDIUM_CANDLE: 1,

        // ----------------------------------------------------
        // HISTORIAL
        // ----------------------------------------------------
        REQUIRE_HISTORY: true,

        // Antes: 15
        // Ahora: 10
        HISTORY_MIN_EDGE: 10,

        // Edge fuerte
        HISTORY_STRONG_EDGE: 20,

        // ----------------------------------------------------
        // FUERZA DE LA ÚLTIMA VELA
        // ----------------------------------------------------
        // Antes: 0.65
        // Ahora: 0.55
        MIN_LAST_STRENGTH: 0.55,

        // ----------------------------------------------------
        // RIESGO
        // ----------------------------------------------------
        MAX_MARTINGALE: 3,
        MAX_CONSECUTIVE_LOSSES: 3,

        // 5 minutos
        COOLDOWN_MS: 5 * 60 * 1000,

        // ----------------------------------------------------
        // REVERSIÓN
        // ----------------------------------------------------
        ENABLE_REVERSAL: false
    };


    // ========================================================
    // VALIDACIÓN DE CANDLES
    // ========================================================

    if (!Array.isArray(candles)) {
        return null;
    }

    if (candles.length < CONFIG.HISTORY_MIN) {
        return null;
    }


    // ========================================================
    // FUNCIONES AUXILIARES
    // ========================================================

    const num = (value, fallback = 0) => {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    };


    const safeBool = value => Boolean(value);


    // ========================================================
    // CANDLES
    // ========================================================

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    if (!last || !prev || !prev2) {
        return null;
    }


    // ========================================================
    // OHLC
    // ========================================================

    const lastOpen = num(last.open);
    const lastClose = num(last.close);
    const lastHigh = num(last.high);
    const lastLow = num(last.low);

    const prevOpen = num(prev.open);
    const prevClose = num(prev.close);

    const prev2Open = num(prev2.open);
    const prev2Close = num(prev2.close);


    // ========================================================
    // VALIDACIÓN BÁSICA
    // ========================================================

    const lastRange = Math.abs(lastHigh - lastLow);

    if (!Number.isFinite(lastRange) || lastRange <= 0) {
        return null;
    }


    // ========================================================
    // COLOR DE CANDLES
    // ========================================================

    const lastGreen = lastClose > lastOpen;
    const lastRed = lastClose < lastOpen;

    const prevGreen = prevClose > prevOpen;
    const prevRed = prevClose < prevOpen;

    const prev2Green = prev2Close > prev2Open;
    const prev2Red = prev2Close < prev2Open;


    // ========================================================
    // PATRÓN
    // ========================================================

    let pattern = "";

    pattern += lastGreen
        ? "G"
        : lastRed
            ? "R"
            : "N";

    pattern += prevGreen
        ? "G"
        : prevRed
            ? "R"
            : "N";

    pattern += prev2Green
        ? "G"
        : prev2Red
            ? "R"
            : "N";


    // Normalizamos para que el patrón sea cronológico
    // anterior -> actual.
    pattern = pattern.split("").reverse().join("");


    // ========================================================
    // SMA
    // ========================================================

    const SMA_PERIOD = 12;

    if (candles.length < SMA_PERIOD) {
        return null;
    }

    const smaValues = candles
        .slice(-SMA_PERIOD)
        .map(c => num(c.close))
        .filter(Number.isFinite);

    if (smaValues.length < SMA_PERIOD) {
        return null;
    }

    const sma =
        smaValues.reduce((sum, value) => sum + value, 0) /
        smaValues.length;


    // ========================================================
    // TENDENCIA
    // ========================================================

    const trendUp =
        lastClose > sma &&
        prevClose > sma;

    const trendDown =
        lastClose < sma &&
        prevClose < sma;


    // ========================================================
    // DIRECCIÓN DEL PRECIO
    // ========================================================

    const priceUp =
        lastClose > prevClose &&
        prevClose >= prev2Close;

    const priceDown =
        lastClose < prevClose &&
        prevClose <= prev2Close;


    // ========================================================
    // BODY / RANGE
    // ========================================================

    const body = Math.abs(lastClose - lastOpen);

    const strength =
        lastRange > 0
            ? body / lastRange
            : 0;


    // ========================================================
    // FUERZA DE CANDLE
    // ========================================================

    let candleStrengthPoints = 0;

    if (strength >= 0.70) {

        candleStrengthPoints =
            CONFIG.STRONG_CANDLE;

    } else if (strength >= 0.45) {

        candleStrengthPoints =
            CONFIG.MEDIUM_CANDLE;
    }


    // ========================================================
    // VOLATILIDAD
    // ========================================================

    const recentCandles =
        candles.slice(-5);

    const ranges = recentCandles
        .map(c =>
            Math.abs(
                num(c.high) -
                num(c.low)
            )
        )
        .filter(r => r > 0);

    if (!ranges.length) {
        return null;
    }

    const avgRange =
        ranges.reduce(
            (sum, value) => sum + value,
            0
        ) / ranges.length;


    const volatility =
        avgRange > 0
            ? lastRange / avgRange
            : 0;


    // ========================================================
    // FILTRO DE VOLATILIDAD
    // ========================================================

    if (volatility < 0.50) {
        return null;
    }


    // ========================================================
    // BOS
    // ========================================================

    const previousHighs = candles
        .slice(-10, -1)
        .map(c => num(c.high));

    const previousLows = candles
        .slice(-10, -1)
        .map(c => num(c.low));

    const highestPrevious =
        previousHighs.length
            ? Math.max(...previousHighs)
            : 0;

    const lowestPrevious =
        previousLows.length
            ? Math.min(...previousLows)
            : 0;


    const bosUp =
        lastClose > highestPrevious;

    const bosDown =
        lastClose < lowestPrevious;


    // ========================================================
    // PULLBACK
    // ========================================================

    const pullbackUp =
        trendUp &&
        (
            prevRed ||
            prev2Red
        ) &&
        lastGreen;

    const pullbackDown =
        trendDown &&
        (
            prevGreen ||
            prev2Green
        ) &&
        lastRed;


    // ========================================================
    // MOMENTUM
    // ========================================================
    // IMPORTANTE:
    // Lo calculamos pero NO suma puntos.
    // Esto permite seguir guardándolo en estadísticas.

    const momentumUp =
        lastClose > prevClose;

    const momentumDown =
        lastClose < prevClose;


    // ========================================================
    // SCORES
    // ========================================================

    let callScore = 0;
    let putScore = 0;


    // --------------------------------------------------------
    // TREND
    // --------------------------------------------------------

    if (trendUp) {
        callScore += CONFIG.TREND_POINTS;
    }

    if (trendDown) {
        putScore += CONFIG.TREND_POINTS;
    }


    // --------------------------------------------------------
    // BOS
    // --------------------------------------------------------

    if (bosUp) {
        callScore += CONFIG.BOS_POINTS;
    }

    if (bosDown) {
        putScore += CONFIG.BOS_POINTS;
    }


    // --------------------------------------------------------
    // PULLBACK
    // --------------------------------------------------------

    if (pullbackUp) {
        callScore += CONFIG.PULLBACK_POINTS;
    }

    if (pullbackDown) {
        putScore += CONFIG.PULLBACK_POINTS;
    }


    // --------------------------------------------------------
    // CANDLE STRENGTH
    // --------------------------------------------------------

    if (lastGreen) {

        callScore += candleStrengthPoints;

    }

    if (lastRed) {

        putScore += candleStrengthPoints;

    }


    // --------------------------------------------------------
    // MOMENTUM
    // --------------------------------------------------------
    // NO SUMA SCORE.
    //
    // Se conserva para:
    // - IntelligenceEngine
    // - trade_statistics
    // - análisis posterior
    //
    // --------------------------------------------------------


    // ========================================================
    // HISTORICAL STATS
    // ========================================================

    const stats =
        state?.stats ||
        state?.historicalStats ||
        null;


    let historyValid = false;

    let historyTotal = 0;

    let pctGreen = 0;

    let pctRed = 0;

    let historyEdge = 0;

    let historyDirection = null;


    // ========================================================
    // BUSCAR ESTADÍSTICA DEL PATRÓN
    // ========================================================

    const currentStats =
        stats?.[pattern] ||
        null;


    if (currentStats) {

        historyTotal =
            num(
                currentStats.total,
                num(currentStats.count, 0)
            );


        pctGreen =
            num(
                currentStats.pctGreen,
                num(currentStats.greenPct, 0)
            );


        pctRed =
            num(
                currentStats.pctRed,
                num(currentStats.redPct, 0)
            );


        // ----------------------------------------------------
        // Algunos sistemas pueden guardar wins/losses
        // en lugar de pctGreen/pctRed.
        // ----------------------------------------------------

        if (
            pctGreen === 0 &&
            pctRed === 0 &&
            historyTotal > 0
        ) {

            const green =
                num(
                    currentStats.green,
                    currentStats.wins,
                );

            const red =
                num(
                    currentStats.red,
                    currentStats.losses
                );

            const total =
                green + red;

            if (total > 0) {

                pctGreen =
                    (green / total) * 100;

                pctRed =
                    (red / total) * 100;
            }
        }


        // ----------------------------------------------------
        // Edge
        // ----------------------------------------------------

        historyEdge =
            Math.abs(
                pctGreen -
                pctRed
            );


        historyValid =
            historyTotal >= CONFIG.PATTERN_MIN;


        // ----------------------------------------------------
        // Dirección histórica
        // ----------------------------------------------------

        if (pctGreen > pctRed) {

            historyDirection = "CALL";

        } else if (pctRed > pctGreen) {

            historyDirection = "PUT";

        } else {

            historyDirection = null;
        }
    }


    // ========================================================
    // HISTORIAL OBLIGATORIO
    // ========================================================

    if (
        CONFIG.REQUIRE_HISTORY &&
        !historyValid
    ) {

        return null;
    }


    // ========================================================
    // EDGE MÍNIMO
    // ========================================================

    if (
        historyEdge <
        CONFIG.HISTORY_MIN_EDGE
    ) {

        return null;
    }


    // ========================================================
    // HISTORICAL SCORE
    // ========================================================
    // El historial no domina el score.
    // Solamente aporta información adicional.

    if (historyEdge >= 20) {

        if (historyDirection === "CALL") {

            callScore += 1;

        }

        if (historyDirection === "PUT") {

            putScore += 1;

        }

    } else if (historyEdge >= 10) {

        if (historyDirection === "CALL") {

            callScore += 1;

        }

        if (historyDirection === "PUT") {

            putScore += 1;

        }
    }


    // ========================================================
    // FILTRO DE FUERZA
    // ========================================================

    if (
        strength <
        CONFIG.MIN_LAST_STRENGTH
    ) {

        return null;
    }


    // ========================================================
    // DIFERENCIA ENTRE SCORES
    // ========================================================

    const scoreDifference =
        Math.abs(
            callScore -
            putScore
        );


    if (
        scoreDifference <
        CONFIG.MIN_DIFF
    ) {

        return null;
    }


    // ========================================================
    // COOLDOWN
    // ========================================================

    const now = Date.now();

    const lastTradeTime =
        num(
            state?.lastTradeTime,
            0
        );


    if (
        lastTradeTime > 0 &&
        now - lastTradeTime <
            CONFIG.COOLDOWN_MS
    ) {

        return null;
    }


    // ========================================================
    // LOSS STREAK
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

        return null;
    }


    // ========================================================
    // MARTINGALE
    // ========================================================

    const martingale =
        num(
            state?.martingale,
            state?.currentMartingale ?? 0
        );


    if (
        martingale >
        CONFIG.MAX_MARTINGALE
    ) {

        return null;
    }


    // ========================================================
    // SEÑAL FINAL
    // ========================================================

    let signal = null;

    let finalScore = 0;


    // ========================================================
    // CALL
    // ========================================================

    if (
        callScore >= CONFIG.MIN_SCORE &&
        callScore > putScore &&
        scoreDifference >= CONFIG.MIN_DIFF &&
        historyDirection === "CALL" &&
        historyEdge >= CONFIG.HISTORY_MIN_EDGE &&
        lastGreen &&
        strength >= CONFIG.MIN_LAST_STRENGTH
    ) {

        signal = "CALL";

        finalScore = callScore;
    }


    // ========================================================
    // PUT
    // ========================================================

    else if (
        putScore >= CONFIG.MIN_SCORE &&
        putScore > callScore &&
        scoreDifference >= CONFIG.MIN_DIFF &&
        historyDirection === "PUT" &&
        historyEdge >= CONFIG.HISTORY_MIN_EDGE &&
        lastRed &&
        strength >= CONFIG.MIN_LAST_STRENGTH
    ) {

        signal = "PUT";

        finalScore = putScore;
    }


    // ========================================================
    // REVERSAL
    // ========================================================

    if (
        !signal &&
        CONFIG.ENABLE_REVERSAL
    ) {

        if (
            callScore >= CONFIG.MIN_SCORE &&
            lastGreen &&
            strength >= CONFIG.MIN_LAST_STRENGTH
        ) {

            signal = "CALL";

            finalScore = callScore;
        }

        else if (
            putScore >= CONFIG.MIN_SCORE &&
            lastRed &&
            strength >= CONFIG.MIN_LAST_STRENGTH
        ) {

            signal = "PUT";

            finalScore = putScore;
        }
    }


    // ========================================================
    // SIN SEÑAL
    // ========================================================

    if (!signal) {

        return null;
    }


    // ========================================================
    // RESULTADO
    // ========================================================

    return {

        signal,

        score: finalScore,

        strategy: "synthetic_pro",

        callScore,

        putScore,

        pattern,

        pctGreen,

        pctRed,

        total: historyTotal,

        historyEdge,

        historyDirection,

        trend:
            signal === "CALL"
                ? trendUp
                : trendDown,

        bos:
            signal === "CALL"
                ? bosUp
                : bosDown,

        pullback:
            signal === "CALL"
                ? pullbackUp
                : pullbackDown,

        momentum:
            signal === "CALL"
                ? momentumUp
                : momentumDown,

        strength,

        volatility,

        sma,

        analysis: {

            trend:
                signal === "CALL"
                    ? trendUp
                    : trendDown,

            bos:
                signal === "CALL"
                    ? bosUp
                    : bosDown,

            pullback:
                signal === "CALL"
                    ? pullbackUp
                    : pullbackDown,

            momentum:
                signal === "CALL"
                    ? momentumUp
                    : momentumDown,

            strength,

            volatility,

            pattern,

            pctGreen,

            pctRed,

            callScore,

            putScore,

            total: historyTotal,

            historyEdge,

            historyDirection,

            sma
        },

        meta: {

            version: "active_v1",

            minScore:
                CONFIG.MIN_SCORE,

            minDiff:
                CONFIG.MIN_DIFF,

            historyMinEdge:
                CONFIG.HISTORY_MIN_EDGE,

            minLastStrength:
                CONFIG.MIN_LAST_STRENGTH,

            momentumPoints:
                CONFIG.MOMENTUM_POINTS,

            historyValid,

            historyTotal,

            historyEdge,

            historyDirection,

            priceUp,

            priceDown,

            trendUp,

            trendDown,

            bosUp,

            bosDown,

            pullbackUp,

            pullbackDown,

            momentumUp,

            momentumDown
        }
    };
}


module.exports = syntheticProStrategy;