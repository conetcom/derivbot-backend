const calculateSMA = require("../indicators/sma");
const buildSignal = require("../helpers/buildSignal");
const calculateRSI = require("../indicators/rsi");

/**
 * ============================================================
 * FOREX STRATEGY
 * Compatible con BOT ENGINE PRO
 * ============================================================
 *
 * Reglas:
 *
 * 1. Mínimo 25 velas
 * 2. Horario UTC 07:00 - 17:00
 * 3. Volatilidad mínima
 * 4. SMA 20 para tendencia
 * 5. Momentum de la última vela
 * 6. RSI 14
 *
 * CALL:
 *   - tendencia alcista
 *   - RSI < 60
 *   - cierre actual > cierre anterior
 *
 * PUT:
 *   - tendencia bajista
 *   - RSI > 40
 *   - cierre actual < cierre anterior
 *
 * ============================================================
 */

function forexStrategy(candles = [], state = {}) {

    // =========================================================
    // 1. HISTORIAL MÍNIMO
    // =========================================================

    if (!Array.isArray(candles) || candles.length < 25) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            trend: null,
            bos: false,
            pullback: false,
            momentum: false,

            strength: null,
            volatility: null,

            pattern: null,
            pctGreen: 0,
            pctRed: 0,

            callScore: 0,
            putScore: 0,

            total: 0,
            historyEdge: 0,
            historyDirection: null,

            sma: null
        });
    }


    // =========================================================
    // 2. ÚLTIMAS VELAS
    // =========================================================

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];


    if (!last || !prev) {
        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0
        });
    }


    // =========================================================
    // 3. HORARIO FOREX
    // UTC 07:00 - 17:00
    // =========================================================

    const hour = new Date().getUTCHours();

    if (hour < 7 || hour > 17) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            trend: null,
            volatility: null,

            callScore: 0,
            putScore: 0,

            sma: null
        });
    }


    // =========================================================
    // 4. VOLATILIDAD
    // =========================================================

    const last5 = candles.slice(-5);

    const highs = last5
        .map(c => Number(c.high))
        .filter(Number.isFinite);

    const lows = last5
        .map(c => Number(c.low))
        .filter(Number.isFinite);

    if (!highs.length || !lows.length) {
        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0
        });
    }

    const volatility =
        Math.max(...highs) -
        Math.min(...lows);


    // Volatilidad mínima
    if (volatility < 0.0005) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            volatility,

            callScore: 0,
            putScore: 0
        });
    }


    // =========================================================
    // 5. SMA 20
    // =========================================================

    const sma = calculateSMA(candles, 20);

    if (!Number.isFinite(Number(sma))) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            volatility,

            callScore: 0,
            putScore: 0,

            sma: null
        });
    }


    // =========================================================
    // 6. TENDENCIA
    // =========================================================

    const trendUp =
        Number(last.close) > Number(sma) &&
        Number(prev.close) > Number(sma);

    const trendDown =
        Number(last.close) < Number(sma) &&
        Number(prev.close) < Number(sma);

    const trend =
        trendUp
            ? "UP"
            : trendDown
                ? "DOWN"
                : "SIDE";


    // =========================================================
    // 7. MOMENTUM
    // =========================================================

    const body =
        Math.abs(
            Number(last.close) -
            Number(last.open)
        );

    const range =
        Number(last.high) -
        Number(last.low);


    if (!Number.isFinite(range) || range <= 0) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            trend,
            volatility,

            callScore: 0,
            putScore: 0,

            sma
        });
    }


    const strength = body / range;

    const momentum = strength >= 0.5;


    // Si la vela no tiene suficiente fuerza
    if (!momentum) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            trend,

            momentum: false,
            strength,

            volatility,

            callScore: 0,
            putScore: 0,

            sma
        });
    }


    // =========================================================
    // 8. RSI 14
    // =========================================================

    const rsi = calculateRSI(candles, 14);

    if (!Number.isFinite(Number(rsi))) {

        return buildSignal({
            strategy: "Forex Estrategia",
            signal: null,
            score: 0,

            trend,
            momentum: true,
            strength,

            volatility,

            callScore: 0,
            putScore: 0,

            sma
        });
    }


    // =========================================================
    // 9. SCORES
    // =========================================================

    let callScore = 0;
    let putScore = 0;


    // =========================================================
    // CALL
    // =========================================================

    if (trendUp) {
        callScore += 3;
    }

    if (rsi < 60) {
        callScore += 2;
    }

    if (Number(last.close) > Number(prev.close)) {
        callScore += 2;
    }

    if (strength >= 0.65) {
        callScore += 2;
    }


    // =========================================================
    // PUT
    // =========================================================

    if (trendDown) {
        putScore += 3;
    }

    if (rsi > 40) {
        putScore += 2;
    }

    if (Number(last.close) < Number(prev.close)) {
        putScore += 2;
    }

    if (strength >= 0.65) {
        putScore += 2;
    }


    // =========================================================
    // 10. PATRÓN
    // =========================================================

    const pattern =
        last.close >= last.open
            ? "GREEN"
            : "RED";


    // =========================================================
    // 11. SEÑAL
    // =========================================================

    let signal = null;
    let score = 0;


    if (
        callScore >= 7 &&
        callScore > putScore
    ) {

        signal = "CALL";
        score = callScore;

    } else if (
        putScore >= 7 &&
        putScore > callScore
    ) {

        signal = "PUT";
        score = putScore;
    }


    // =========================================================
    // 12. RESULTADO
    // =========================================================

    return buildSignal({

        strategy: "Forex Estrategia",

        signal,

        score,

        trend,

        bos: false,

        pullback: false,

        momentum: true,

        strength,

        volatility,

        pattern,

        pctGreen: 0,

        pctRed: 0,

        callScore,

        putScore,

        total: candles.length,

        historyEdge: 0,

        historyDirection: null,

        sma,

        rsi
    });
}


module.exports = forexStrategy;