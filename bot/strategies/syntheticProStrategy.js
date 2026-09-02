const calculateSMA = require('../indicators/sma');
const buildSignal = require("../helpers/buildSignal");

const CONFIG = {

    // ===============================
    // SCORE
    // ===============================

    TREND_POINTS: 3,
    BOS_POINTS: 3,
    PULLBACK_POINTS: 2,
    MOMENTUM_POINTS: 2,

    STRONG_CANDLE: 2,
    MEDIUM_CANDLE: 1,

    MIN_SCORE: 8,
    MIN_DIFF: 2,

    // ===============================
    // HISTORIAL
    // ===============================

    HISTORY_MIN: 30,

    // Diferencia mínima entre CALL y PUT
    // Ejemplo:
    // 50/50  -> NO TRADE
    // 55/45  -> NO TRADE
    // 60/40  -> NO TRADE
    // 65/35  -> permitido
    HISTORY_MIN_EDGE: 15,
     PATTERN_MIN: 10,

    // Edge fuerte
    HISTORY_STRONG_EDGE: 30,

    // ===============================
    // CONTROL DE RIESGO
    // ===============================

    MAX_MARTINGALE: 3,

    MAX_CONSECUTIVE_LOSSES: 3,

    COOLDOWN_MS: 5 * 60 * 1000,

    // Exigir estadísticas históricas
    REQUIRE_HISTORY: true,

    // ===============================
    // VELA
    // ===============================

    MIN_LAST_STRENGTH: 0.65,

    // ===============================
    // REVERSIÓN
    // ===============================

    ENABLE_REVERSAL: false

};


/**
 * ============================================================
 * SYNTHETIC PRO STRATEGY
 * ============================================================
 */
function syntheticProStrategy(candles, state = {}) {

    const stats = state.stats || {};


    // =========================================================
    // RESULTADO NEUTRAL
    // =========================================================

    const neutralSignal = (extra = {}) => {

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

            pctGreen: undefined,
            pctRed: undefined,

            callScore: 0,
            putScore: 0,

            sma: undefined,

            ...extra
        });

    };


    // =========================================================
    // VALIDACIÓN DE VELAS
    // =========================================================

    if (!candles || candles.length < CONFIG.HISTORY_MIN) {

        console.log(
            "⛔ SYNTHETIC PRO: historial de velas insuficiente",
            candles?.length
        );

        return neutralSignal();

    }


    // =========================================================
    // SMA
    // =========================================================

    const sma = calculateSMA(candles, 12);

    if (!sma) {

        console.log(
            "⛔ SYNTHETIC PRO: SMA no disponible"
        );

        return neutralSignal();

    }


    // =========================================================
    // CONTROL DE COOLDOWN
    // =========================================================

    const now = Date.now();

    if (
        state.cooldownUntil &&
        now < Number(state.cooldownUntil)
    ) {

        const remaining =
            Math.ceil(
                (Number(state.cooldownUntil) - now) / 1000
            );

        console.log(
            `⏸️ SYNTHETIC PRO: COOLDOWN ACTIVO (${remaining}s)`
        );

        return neutralSignal();

    }


    // =========================================================
    // CONTROL DE PÉRDIDAS CONSECUTIVAS
    // =========================================================

    const consecutiveLosses =
        Number(state.consecutiveLosses || 0);

    if (
        consecutiveLosses >= CONFIG.MAX_CONSECUTIVE_LOSSES
    ) {

        console.log(
            "🛑 SYNTHETIC PRO: demasiadas pérdidas consecutivas",
            consecutiveLosses
        );

        return neutralSignal();

    }


    // =========================================================
    // CONTROL DE MARTINGALE
    // =========================================================

    const martingale =
        Number(state.martingale ?? 0);

    if (
        martingale > CONFIG.MAX_MARTINGALE
    ) {

        console.log(
            "🛑 SYNTHETIC PRO: martingale máximo alcanzado",
            martingale
        );

        return neutralSignal();

    }


    // =========================================================
    // ÚLTIMAS VELAS
    // =========================================================

    const last = candles.at(-1);
    const prev = candles.at(-2);
    const prev2 = candles.at(-3);


    if (!last || !prev || !prev2) {

        return neutralSignal();

    }


    // =========================================================
    // FUERZA DE VELA
    // =========================================================

    function strength(c) {

        const body =
            Math.abs(c.close - c.open);

        const range =
            c.high - c.low;

        if (range <= 0) {
            return 0;
        }

        return body / range;

    }


    // =========================================================
    // COLOR
    // =========================================================

    const color = c => {

        if (c.close > c.open) {
            return "G";
        }

        if (c.close < c.open) {
            return "R";
        }

        return "N";

    };


    // =========================================================
    // PATRÓN
    // =========================================================

    const pattern =
        color(prev2) +
        color(prev) +
        color(last);


    // Si hay vela neutra no usamos patrón
    if (pattern.includes("N")) {

        console.log(
            "⛔ SYNTHETIC PRO: patrón inválido",
            pattern
        );

        return neutralSignal({
            pattern,
            sma
        });

    }


    // =========================================================
    // TENDENCIA
    // =========================================================

    const trendUp =
        last.close > sma &&
        prev.close > sma;

    const trendDown =
        last.close < sma &&
        prev.close < sma;


    // =========================================================
    // MOMENTUM
    // =========================================================

    const momentumUp =
        last.close > prev.close &&
        prev.close > prev2.close;

    const momentumDown =
        last.close < prev.close &&
        prev.close < prev2.close;


    // =========================================================
    // PULLBACK
    // =========================================================

    const pullbackUp =
        prev.low <= sma &&
        last.close > sma;

    const pullbackDown =
        prev.high >= sma &&
        last.close < sma;


    // =========================================================
    // BOS
    // =========================================================

    const previousCandles =
        candles.slice(-8, -2);

    const prevHigh =
        Math.max(
            ...previousCandles.map(c => c.high)
        );

    const prevLow =
        Math.min(
            ...previousCandles.map(c => c.low)
        );

    const bosUp =
        last.close > prevHigh;

    const bosDown =
        last.close < prevLow;


    // =========================================================
    // FUERZA PROMEDIO
    // =========================================================

    const avgStrength =
        (
            strength(prev2) +
            strength(prev) +
            strength(last)
        ) / 3;


    const lastStrength =
        strength(last);


    // =========================================================
    // SCORE
    // =========================================================

    let callScore = 0;
    let putScore = 0;

    const reasons = [];


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


    // =========================================================
    // TREND
    // =========================================================

    if (trendUp) {

        addCall(
            CONFIG.TREND_POINTS,
            "Trend"
        );

    }

    if (trendDown) {

        addPut(
            CONFIG.TREND_POINTS,
            "Trend"
        );

    }


    // =========================================================
    // BOS
    // =========================================================

    if (bosUp) {

        addCall(
            CONFIG.BOS_POINTS,
            "BOS"
        );

    }

    if (bosDown) {

        addPut(
            CONFIG.BOS_POINTS,
            "BOS"
        );

    }


    // =========================================================
    // PULLBACK
    // =========================================================

    if (pullbackUp) {

        addCall(
            CONFIG.PULLBACK_POINTS,
            "Pullback"
        );

    }

    if (pullbackDown) {

        addPut(
            CONFIG.PULLBACK_POINTS,
            "Pullback"
        );

    }


    // =========================================================
    // MOMENTUM
    // =========================================================

    if (momentumUp) {

        addCall(
            CONFIG.MOMENTUM_POINTS,
            "Momentum"
        );

    }

    if (momentumDown) {

        addPut(
            CONFIG.MOMENTUM_POINTS,
            "Momentum"
        );

    }


    // =========================================================
    // FUERZA DE VELAS
    // =========================================================

    if (avgStrength >= 0.75) {

        if (trendUp) {

            addCall(
                CONFIG.STRONG_CANDLE,
                "Strong Candles"
            );

        }

        if (trendDown) {

            addPut(
                CONFIG.STRONG_CANDLE,
                "Strong Candles"
            );

        }

    }

    else if (avgStrength >= 0.55) {

        if (trendUp) {

            addCall(
                CONFIG.MEDIUM_CANDLE,
                "Medium Candles"
            );

        }

        if (trendDown) {

            addPut(
                CONFIG.MEDIUM_CANDLE,
                "Medium Candles"
            );

        }

    }


    // =========================================================
    // ESTADÍSTICA HISTÓRICA
    // =========================================================

    const currentStats =
        stats[pattern];


    let historyEdge = 0;
    let historyDirection = null;

    let pctGreen;
    let pctRed;

    let historyValid = false;


    if (currentStats) {

    if (currentStats.total >= CONFIG.PATTERN_MIN) {

        if (
            currentStats.pctGreen >
            currentStats.pctRed
        ) {

            const edge =
                currentStats.pctGreen -
                currentStats.pctRed;

            if (edge >= 10)
                addCall(1, "History");

            if (edge >= 20)
                addCall(1, "History");

            if (edge >= 30)
                addCall(1, "History");

        } else {

            const edge =
                currentStats.pctRed -
                currentStats.pctGreen;

            if (edge >= 10)
                addPut(1, "History");

            if (edge >= 20)
                addPut(1, "History");

            if (edge >= 30)
                addPut(1, "History");

        }

    } else {

        console.log(
            "⚠️ HISTORIAL DEL PATRÓN INSUFICIENTE:",
            {
                pattern,
                total: currentStats.total,
                minimo: CONFIG.PATTERN_MIN
            }
        );

    }


            historyValid = true;


            // ==============================================
            // DIRECCIÓN HISTÓRICA
            // ==============================================

            if (pctGreen > pctRed) {

                historyDirection = "CALL";

                historyEdge =
                    pctGreen - pctRed;

            }

            else if (pctRed > pctGreen) {

                historyDirection = "PUT";

                historyEdge =
                    pctRed - pctGreen;

            }

            else {

                historyDirection = null;

                historyEdge = 0;

            }


            // ==============================================
            // SCORE HISTÓRICO
            // ==============================================

            if (
                historyDirection === "CALL" &&
                historyEdge >= 10
            ) {

                addCall(
                    1,
                    "History"
                );

            }

            if (
                historyDirection === "CALL" &&
                historyEdge >= 20
            ) {

                addCall(
                    1,
                    "History Strong"
                );

            }

            if (
                historyDirection === "CALL" &&
                historyEdge >= 30
            ) {

                addCall(
                    1,
                    "History Very Strong"
                );

            }


            if (
                historyDirection === "PUT" &&
                historyEdge >= 10
            ) {

                addPut(
                    1,
                    "History"
                );

            }

            if (
                historyDirection === "PUT" &&
                historyEdge >= 20
            ) {

                addPut(
                    1,
                    "History Strong"
                );

            }

            if (
                historyDirection === "PUT" &&
                historyEdge >= 30
            ) {

                addPut(
                    1,
                    "History Very Strong"
                );

            }

        }

    


    // =========================================================
    // FILTRO HISTÓRICO OBLIGATORIO
    // =========================================================

    if (CONFIG.REQUIRE_HISTORY) {

        if (!historyValid) {

            console.log(
                "⛔ NO TRADE: historial insuficiente",
                {
                    pattern,
                    total: currentStats?.total
                }
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: 0,

                trend: trendUp || trendDown,

                bos: bosUp || bosDown,

                pullback:
                    pullbackUp ||
                    pullbackDown,

                momentum:
                    momentumUp ||
                    momentumDown,

                strength: avgStrength,

                pattern,

                pctGreen,
                pctRed,

                callScore,
                putScore,

                sma

            });

        }


        // =====================================================
        // FILTRO 50/50 / EDGE BAJO
        // =====================================================

        if (
            historyEdge <
            CONFIG.HISTORY_MIN_EDGE
        ) {

            console.log(
                "⛔ NO TRADE: EDGE HISTÓRICO INSUFICIENTE",
                {
                    pattern,
                    pctGreen,
                    pctRed,
                    edge: historyEdge
                }
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: 0,

                trend: trendUp || trendDown,

                bos: bosUp || bosDown,

                pullback:
                    pullbackUp ||
                    pullbackDown,

                momentum:
                    momentumUp ||
                    momentumDown,

                strength: avgStrength,

                pattern,

                pctGreen,
                pctRed,

                callScore,
                putScore,

                sma

            });

        }

    }


    // =========================================================
    // PENALIZACIÓN CONTRARIA
    // =========================================================

    if (
        trendUp &&
        putScore > 0
    ) {

        putScore--;

        reasons.push(
            "PUT -1 Contrario a Trend"
        );

    }


    if (
        trendDown &&
        callScore > 0
    ) {

        callScore--;

        reasons.push(
            "CALL -1 Contrario a Trend"
        );

    }


    // =========================================================
    // DEBUG
    // =========================================================

    console.log(
        "========================================"
    );

    console.log(
        "SYNTHETIC PRO"
    );

    console.log(
        "Pattern:",
        pattern
    );

    console.log(
        "Trend:",
        trendUp
            ? "UP"
            : trendDown
                ? "DOWN"
                : "NEUTRAL"
    );

    console.log(
        "BOS:",
        bosUp
            ? "UP"
            : bosDown
                ? "DOWN"
                : "NONE"
    );

    console.log(
        "Momentum:",
        momentumUp
            ? "UP"
            : momentumDown
                ? "DOWN"
                : "NONE"
    );

    console.log(
        "Avg Strength:",
        avgStrength
    );

    console.log(
        "History:",
        pctGreen,
        "/",
        pctRed
    );

    console.log(
        "History Direction:",
        historyDirection
    );

    console.log(
        "History Edge:",
        historyEdge
    );

    console.log(
        "CALL SCORE:",
        callScore
    );

    console.log(
        "PUT SCORE:",
        putScore
    );

    console.log(
        "Martingale:",
        martingale
    );

    console.log(
        "Consecutive Losses:",
        consecutiveLosses
    );

    console.table(reasons);

    console.log(
        "========================================"
    );


    // =========================================================
    // DECISIÓN CALL
    // =========================================================

    if (

        callScore >= CONFIG.MIN_SCORE &&

        (callScore - putScore)
            >= CONFIG.MIN_DIFF

    ) {


        // =====================================================
        // VALIDACIÓN HISTÓRICA CALL
        // =====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyDirection !== "CALL"

        ) {

            console.log(
                "⛔ CALL BLOQUEADO: HISTORIA FAVORECE PUT",
                {
                    pattern,
                    pctGreen,
                    pctRed,
                    edge: historyEdge
                }
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: callScore,

                trend: trendUp,

                bos: bosUp,

                pullback: pullbackUp,

                momentum: momentumUp,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // CONFIRMACIÓN HISTÓRICA FUERTE
        // =====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyEdge <
            CONFIG.HISTORY_MIN_EDGE

        ) {

            console.log(
                "⛔ CALL BLOQUEADO: EDGE insuficiente",
                historyEdge
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: callScore,

                trend: trendUp,

                bos: bosUp,

                pullback: pullbackUp,

                momentum: momentumUp,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // CONFIRMACIÓN ÚLTIMA VELA
        // =====================================================

        if (

            last.close <= last.open ||

            lastStrength <
            CONFIG.MIN_LAST_STRENGTH

        ) {

            console.log(
                "⛔ CALL descartado: última vela débil",
                {
                    callScore,
                    lastStrength
                }
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: callScore,

                trend: trendUp,

                bos: bosUp,

                pullback: pullbackUp,

                momentum: momentumUp,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // REVERSIÓN CALL
        // =====================================================

        if (

            CONFIG.ENABLE_REVERSAL &&

            callScore >= 10 &&

            avgStrength >= 0.90 &&

            pattern === "GGG" &&

            pctGreen >= 75

        ) {

            console.log(
                "⚠️ CALL REVERSIÓN DETECTADA"
            );

            // IMPORTANTE:
            // No entramos CALL automáticamente.
            //
            // Una secuencia GGG muy fuerte puede estar
            // sobreextendida.
            //
            // Por seguridad se descarta.

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: callScore,

                trend: trendUp,

                bos: bosUp,

                pullback: pullbackUp,

                momentum: momentumUp,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // CALL FINAL
        // =====================================================

        console.log(
            "🟢 SIGNAL CALL",
            {
                callScore,
                putScore,
                historyEdge,
                pattern
            }
        );

        return buildSignal({

            strategy: "synthetic_pro",

            signal: "CALL",

            score: callScore,

            trend: trendUp,

            bos: bosUp,

            pullback: pullbackUp,

            momentum: momentumUp,

            strength: avgStrength,

            pattern,

            pctGreen,

            pctRed,

            callScore,

            putScore,

            sma

        });

    }


    // =========================================================
    // DECISIÓN PUT
    // =========================================================

    if (

        putScore >= CONFIG.MIN_SCORE &&

        (putScore - callScore)
            >= CONFIG.MIN_DIFF

    ) {


        // =====================================================
        // VALIDACIÓN HISTÓRICA PUT
        // =====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyDirection !== "PUT"

        ) {

            console.log(
                "⛔ PUT BLOQUEADO: HISTORIA FAVORECE CALL",
                {
                    pattern,
                    pctGreen,
                    pctRed,
                    edge: historyEdge
                }
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: putScore,

                trend: trendDown,

                bos: bosDown,

                pullback: pullbackDown,

                momentum: momentumDown,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // EDGE
        // =====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyEdge <
            CONFIG.HISTORY_MIN_EDGE

        ) {

            console.log(
                "⛔ PUT BLOQUEADO: EDGE insuficiente",
                historyEdge
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: putScore,

                trend: trendDown,

                bos: bosDown,

                pullback: pullbackDown,

                momentum: momentumDown,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // CONFIRMACIÓN ÚLTIMA VELA
        // =====================================================

        if (

            last.close >= last.open ||

            lastStrength <
            CONFIG.MIN_LAST_STRENGTH

        ) {

            console.log(
                "⛔ PUT descartado: última vela débil",
                {
                    putScore,
                    lastStrength
                }
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: putScore,

                trend: trendDown,

                bos: bosDown,

                pullback: pullbackDown,

                momentum: momentumDown,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // REVERSIÓN PUT
        // =====================================================

        if (

            CONFIG.ENABLE_REVERSAL &&

            putScore >= 10 &&

            avgStrength >= 0.90 &&

            pattern === "RRR" &&

            pctRed >= 75

        ) {

            console.log(
                "⚠️ PUT REVERSIÓN DETECTADA"
            );

            return buildSignal({

                strategy: "synthetic_pro",

                signal: null,

                score: putScore,

                trend: trendDown,

                bos: bosDown,

                pullback: pullbackDown,

                momentum: momentumDown,

                strength: avgStrength,

                pattern,

                pctGreen,

                pctRed,

                callScore,

                putScore,

                sma

            });

        }


        // =====================================================
        // PUT FINAL
        // =====================================================

        console.log(
            "🔴 SIGNAL PUT",
            {
                putScore,
                callScore,
                historyEdge,
                pattern
            }
        );

        return buildSignal({

            strategy: "synthetic_pro",

            signal: "PUT",

            score: putScore,

            trend: trendDown,

            bos: bosDown,

            pullback: pullbackDown,

            momentum: momentumDown,

            strength: avgStrength,

            pattern,

            pctGreen,

            pctRed,

            callScore,

            putScore,

            sma

        });

    }


    // =========================================================
    // SIN SEÑAL
    // =========================================================

    console.log(
        "⚪ NO TRADE",
        {
            pattern,
            callScore,
            putScore,
            historyEdge
        }
    );

    return buildSignal({

        strategy: "synthetic_pro",

        signal: null,

        score: Math.max(
            callScore,
            putScore
        ),

        trend:
            trendUp ||
            trendDown,

        bos:
            bosUp ||
            bosDown,

        pullback:
            pullbackUp ||
            pullbackDown,

        momentum:
            momentumUp ||
            momentumDown,

        strength: avgStrength,

        pattern,

        pctGreen,

        pctRed,

        callScore,

        putScore,

        sma

    });

}


module.exports = syntheticProStrategy;