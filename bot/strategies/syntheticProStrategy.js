const calculateSMA = require('../indicators/sma');
const buildSignal = require("../helpers/buildSignal");


// ============================================================
// ⚙️ CONFIGURACIÓN SYNTHETIC PRO
// ============================================================

const CONFIG = {

    // ========================================================
    // SCORE
    // ========================================================

    TREND_POINTS: 3,

    BOS_POINTS: 3,

    PULLBACK_POINTS: 2,

    MOMENTUM_POINTS: 2,

    STRONG_CANDLE: 2,

    MEDIUM_CANDLE: 1,


    // ========================================================
    // SCORE MÍNIMO
    // ========================================================

    MIN_SCORE: 8,

    MIN_DIFF: 2,


    // ========================================================
    // HISTORIAL
    // ========================================================

    // Cantidad mínima GLOBAL de velas
    HISTORY_MIN: 30,

    // Cantidad mínima de apariciones del patrón
    //
    // Ejemplo:
    // RRG total = 12
    //
    // 12 >= 10 → se puede utilizar.
    //
    PATTERN_MIN: 10,


    // Diferencia mínima histórica
    //
    // 50 / 50  → NO TRADE
    // 55 / 45  → NO TRADE
    // 60 / 40  → NO TRADE
    // 65 / 35  → TRADE
    //
    HISTORY_MIN_EDGE: 15,


    // Edge fuerte
    HISTORY_STRONG_EDGE: 30,


    // ========================================================
    // RIESGO
    // ========================================================

    MAX_MARTINGALE: 3,

    MAX_CONSECUTIVE_LOSSES: 3,

    COOLDOWN_MS: 5 * 60 * 1000,


    // ========================================================
    // HISTORIAL OBLIGATORIO
    // ========================================================

    REQUIRE_HISTORY: true,


    // ========================================================
    // VELA
    // ========================================================

    MIN_LAST_STRENGTH: 0.65,


    // ========================================================
    // REVERSIÓN
    // ========================================================

    ENABLE_REVERSAL: false

};


// ============================================================
// 🧠 SYNTHETIC PRO STRATEGY
// ============================================================

function syntheticProStrategy(
    candles,
    state = {}
) {


    // ========================================================
    // STATS
    // ========================================================

    const stats =
        state?.stats || {};


    // ========================================================
    // RESULTADO NEUTRAL
    // ========================================================

    const neutralSignal = (
        extra = {}
    ) => {

        return buildSignal({

            strategy:
                "synthetic_pro",

            signal:
                null,

            score:
                0,


            // ----------------------------------------------
            // Indicadores
            // ----------------------------------------------

            trend:
                false,

            bos:
                false,

            pullback:
                false,

            momentum:
                false,


            // ----------------------------------------------
            // Fuerza
            // ----------------------------------------------

            strength:
                0,


            // ----------------------------------------------
            // Histórico
            // ----------------------------------------------

            pattern:
                null,

            pctGreen:
                null,

            pctRed:
                null,

            total:
                0,

            historyEdge:
                0,

            historyDirection:
                null,


            // ----------------------------------------------
            // Scores
            // ----------------------------------------------

            callScore:
                0,

            putScore:
                0,


            // ----------------------------------------------
            // SMA
            // ----------------------------------------------

            sma:
                null,


            ...extra

        });

    };


    // ========================================================
    // VALIDAR CANDLES
    // ========================================================

    if (
        !Array.isArray(candles) ||
        candles.length < CONFIG.HISTORY_MIN
    ) {

        console.log(
            "⛔ SYNTHETIC PRO: historial global insuficiente",
            {
                actual:
                    candles?.length || 0,

                minimo:
                    CONFIG.HISTORY_MIN
            }
        );


        return neutralSignal({

            total:
                candles?.length || 0

        });

    }


    // ========================================================
    // SMA
    // ========================================================

    const sma =
        calculateSMA(
            candles,
            12
        );


    if (
        sma === null ||
        sma === undefined ||
        !Number.isFinite(
            Number(sma)
        )
    ) {

        console.log(
            "⛔ SYNTHETIC PRO: SMA no disponible"
        );


        return neutralSignal();

    }


    // ========================================================
    // COOLDOWN
    // ========================================================

    const now =
        Date.now();


    const cooldownUntil =
        Number(
            state?.cooldownUntil || 0
        );


    if (
        cooldownUntil > 0 &&
        now < cooldownUntil
    ) {

        const remaining =
            Math.ceil(
                (
                    cooldownUntil -
                    now
                ) / 1000
            );


        console.log(
            `⏸️ SYNTHETIC PRO: COOLDOWN ACTIVO (${remaining}s)`
        );


        return neutralSignal({

            sma

        });

    }


    // ========================================================
    // PÉRDIDAS CONSECUTIVAS
    // ========================================================

    const consecutiveLosses =
        Number(
            state?.consecutiveLosses || 0
        );


    if (
        consecutiveLosses >=
        CONFIG.MAX_CONSECUTIVE_LOSSES
    ) {

        console.log(
            "🛑 SYNTHETIC PRO: demasiadas pérdidas consecutivas",
            {
                consecutiveLosses
            }
        );


        return neutralSignal({

            sma

        });

    }


    // ========================================================
    // MARTINGALE
    //
    // IMPORTANTE:
    //
    // botEngine utiliza:
    //
    // state.risk.martingaleStep
    //
    // No:
    //
    // state.martingale
    //
    // ========================================================

    const martingale =
        Number(
            state?.risk?.martingaleStep ?? 0
        );


    if (
        martingale >
        CONFIG.MAX_MARTINGALE
    ) {

        console.log(
            "🛑 SYNTHETIC PRO: martingale máximo alcanzado",
            {
                martingale,
                max:
                    CONFIG.MAX_MARTINGALE
            }
        );


        return neutralSignal({

            sma

        });

    }


    // ========================================================
    // ÚLTIMAS VELAS
    // ========================================================

    const last =
        candles.at(-1);

    const prev =
        candles.at(-2);

    const prev2 =
        candles.at(-3);


    if (
        !last ||
        !prev ||
        !prev2
    ) {

        console.log(
            "⛔ SYNTHETIC PRO: faltan velas"
        );


        return neutralSignal({

            sma

        });

    }


    // ========================================================
    // FUERZA DE VELA
    // ========================================================

    function strength(c) {

        if (!c) {
            return 0;
        }


        const open =
            Number(c.open);

        const close =
            Number(c.close);

        const high =
            Number(c.high);

        const low =
            Number(c.low);


        if (
            !Number.isFinite(open) ||
            !Number.isFinite(close) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {

            return 0;

        }


        const body =
            Math.abs(
                close -
                open
            );


        const range =
            high -
            low;


        if (
            range <= 0
        ) {

            return 0;

        }


        return (
            body /
            range
        );

    }


    // ========================================================
    // COLOR
    // ========================================================

    const color = c => {

        const open =
            Number(c.open);

        const close =
            Number(c.close);


        if (
            close > open
        ) {

            return "G";

        }


        if (
            close < open
        ) {

            return "R";

        }


        return "N";

    };


    // ========================================================
    // PATRÓN
    // ========================================================

    const pattern =
        color(prev2) +
        color(prev) +
        color(last);


    // ========================================================
    // PATRÓN INVÁLIDO
    // ========================================================

    if (
        pattern.includes("N")
    ) {

        console.log(
            "⛔ SYNTHETIC PRO: patrón inválido",
            pattern
        );


        return neutralSignal({

            pattern,

            sma

        });

    }


    // ========================================================
    // TENDENCIA
    // ========================================================

    const trendUp =
        Number(last.close) > Number(sma) &&
        Number(prev.close) > Number(sma);


    const trendDown =
        Number(last.close) < Number(sma) &&
        Number(prev.close) < Number(sma);


    // ========================================================
    // MOMENTUM
    // ========================================================

    const momentumUp =
        Number(last.close) >
        Number(prev.close) &&

        Number(prev.close) >
        Number(prev2.close);


    const momentumDown =
        Number(last.close) <
        Number(prev.close) &&

        Number(prev.close) <
        Number(prev2.close);


    // ========================================================
    // PULLBACK
    // ========================================================

    const pullbackUp =
        Number(prev.low) <=
        Number(sma) &&

        Number(last.close) >
        Number(sma);


    const pullbackDown =
        Number(prev.high) >=
        Number(sma) &&

        Number(last.close) <
        Number(sma);


    // ========================================================
    // BOS
    // ========================================================

    const previousCandles =
        candles.slice(
            -8,
            -2
        );


    let prevHigh =
        null;

    let prevLow =
        null;


    if (
        previousCandles.length > 0
    ) {

        prevHigh =
            Math.max(
                ...previousCandles.map(
                    c => Number(c.high)
                )
            );


        prevLow =
            Math.min(
                ...previousCandles.map(
                    c => Number(c.low)
                )
            );

    }


    const bosUp =
        Number.isFinite(prevHigh) &&
        Number(last.close) >
        prevHigh;


    const bosDown =
        Number.isFinite(prevLow) &&
        Number(last.close) <
        prevLow;


    // ========================================================
    // FUERZA
    // ========================================================

    const strengthPrev2 =
        strength(prev2);


    const strengthPrev =
        strength(prev);


    const strengthLast =
        strength(last);


    const avgStrength =
        (
            strengthPrev2 +
            strengthPrev +
            strengthLast
        ) / 3;


    // ========================================================
    // SCORE
    // ========================================================

    let callScore =
        0;


    let putScore =
        0;


    const reasons =
        [];


    // ========================================================
    // ADD CALL
    // ========================================================

    function addCall(
        points,
        reason
    ) {

        callScore +=
            Number(points);


        reasons.push(
            `CALL +${points} ${reason}`
        );

    }


    // ========================================================
    // ADD PUT
    // ========================================================

    function addPut(
        points,
        reason
    ) {

        putScore +=
            Number(points);


        reasons.push(
            `PUT +${points} ${reason}`
        );

    }


    // ========================================================
    // TREND
    // ========================================================

    if (
        trendUp
    ) {

        addCall(
            CONFIG.TREND_POINTS,
            "Trend"
        );

    }


    if (
        trendDown
    ) {

        addPut(
            CONFIG.TREND_POINTS,
            "Trend"
        );

    }


    // ========================================================
    // BOS
    // ========================================================

    if (
        bosUp
    ) {

        addCall(
            CONFIG.BOS_POINTS,
            "BOS"
        );

    }


    if (
        bosDown
    ) {

        addPut(
            CONFIG.BOS_POINTS,
            "BOS"
        );

    }


    // ========================================================
    // PULLBACK
    // ========================================================

    if (
        pullbackUp
    ) {

        addCall(
            CONFIG.PULLBACK_POINTS,
            "Pullback"
        );

    }


    if (
        pullbackDown
    ) {

        addPut(
            CONFIG.PULLBACK_POINTS,
            "Pullback"
        );

    }


    // ========================================================
    // MOMENTUM
    // ========================================================

    if (
        momentumUp
    ) {

        addCall(
            CONFIG.MOMENTUM_POINTS,
            "Momentum"
        );

    }


    if (
        momentumDown
    ) {

        addPut(
            CONFIG.MOMENTUM_POINTS,
            "Momentum"
        );

    }


    // ========================================================
    // FUERZA DE VELAS
    // ========================================================

    if (
        avgStrength >= 0.75
    ) {

        if (
            trendUp
        ) {

            addCall(
                CONFIG.STRONG_CANDLE,
                "Strong Candles"
            );

        }


        if (
            trendDown
        ) {

            addPut(
                CONFIG.STRONG_CANDLE,
                "Strong Candles"
            );

        }

    }

    else if (
        avgStrength >= 0.55
    ) {

        if (
            trendUp
        ) {

            addCall(
                CONFIG.MEDIUM_CANDLE,
                "Medium Candles"
            );

        }


        if (
            trendDown
        ) {

            addPut(
                CONFIG.MEDIUM_CANDLE,
                "Medium Candles"
            );

        }

    }


    

// =========================================================
// 🔒 FILTRO HISTÓRICO OBLIGATORIO
// =========================================================

if (CONFIG.REQUIRE_HISTORY) {

    // -----------------------------------------------------
    // HISTORIAL INSUFICIENTE
    // -----------------------------------------------------

    if (!historyValid) {

        console.log(
            "⛔ NO TRADE: HISTORIAL INSUFICIENTE",
            {
                pattern,
                total: historyTotal,
                minimo: CONFIG.PATTERN_MIN
            }
        );

        return buildSignal({

            strategy: "synthetic_pro",

            signal: null,

            score:
                Math.max(
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

            sma

        });

    }


    // -----------------------------------------------------
    // EDGE MÍNIMO
    // -----------------------------------------------------

    if (
        historyEdge <
        CONFIG.HISTORY_MIN_EDGE
    ) {

        console.log(
            "⛔ NO TRADE: EDGE HISTÓRICO INSUFICIENTE",
            {
                pattern,
                total: historyTotal,
                pctGreen,
                pctRed,
                direction:
                    historyDirection,
                edge:
                    Number(
                        historyEdge.toFixed(2)
                    ),
                minimo:
                    CONFIG.HISTORY_MIN_EDGE
            }
        );

        return buildSignal({

            strategy: "synthetic_pro",

            signal: null,

            score:
                Math.max(
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

            sma

        });

    }

}

    // ========================================================
    // PENALIZACIÓN CONTRARIA A LA TENDENCIA
    // ========================================================

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


    // ========================================================
    // 📊 DEBUG
    // ========================================================

    console.log(
        "=============================================="
    );


    console.log(
        "🧠 SYNTHETIC PRO"
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
        "Pullback:",
        pullbackUp
            ? "UP"
            : pullbackDown
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
        "Last Strength:",
        strengthLast
    );


    console.log(
        "History:",
        `${pctGreen}% / ${pctRed}%`
    );


    console.log(
        "History Total:",
        historyTotal
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


    console.table(
        reasons
    );


    console.log(
        "=============================================="
    );


    // ========================================================
    // 🟢 CALL
    // ========================================================

    if (

        callScore >=
        CONFIG.MIN_SCORE &&

        (
            callScore -
            putScore
        ) >=
        CONFIG.MIN_DIFF

    ) {


        // ====================================================
        // HISTORIA DEBE APOYAR CALL
        // ====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyDirection !==
            "CALL"

        ) {

            console.log(
                "⛔ CALL BLOQUEADO: HISTORIA NO APOYA CALL",
                {

                    pattern,

                    pctGreen,

                    pctRed,

                    historyDirection,

                    historyEdge

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    callScore,

                trend:
                    trendUp,

                bos:
                    bosUp,

                pullback:
                    pullbackUp,

                momentum:
                    momentumUp,

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

                sma

            });

        }


        // ====================================================
        // EDGE CALL
        // ====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyEdge <
            CONFIG.HISTORY_MIN_EDGE

        ) {

            console.log(
                "⛔ CALL BLOQUEADO: EDGE INSUFICIENTE",
                {

                    edge:
                        historyEdge,

                    minimo:
                        CONFIG.HISTORY_MIN_EDGE

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    callScore,

                trend:
                    trendUp,

                bos:
                    bosUp,

                pullback:
                    pullbackUp,

                momentum:
                    momentumUp,

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

                sma

            });

        }


        // ====================================================
        // ÚLTIMA VELA
        // ====================================================

        if (

            Number(last.close) <=
            Number(last.open) ||

            strengthLast <
            CONFIG.MIN_LAST_STRENGTH

        ) {

            console.log(
                "⛔ CALL DESCARTADO: ÚLTIMA VELA DÉBIL",
                {

                    callScore,

                    lastStrength:
                        strengthLast

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    callScore,

                trend:
                    trendUp,

                bos:
                    bosUp,

                pullback:
                    pullbackUp,

                momentum:
                    momentumUp,

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

                sma

            });

        }


        // ====================================================
        // REVERSIÓN CALL
        // ====================================================

        if (

            CONFIG.ENABLE_REVERSAL &&

            callScore >= 10 &&

            avgStrength >= 0.90 &&

            pattern === "GGG" &&

            pctGreen >= 75

        ) {

            console.log(
                "⚠️ CALL DESCARTADO POR POSIBLE REVERSIÓN",
                {

                    callScore,

                    avgStrength,

                    pattern,

                    pctGreen

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    callScore,

                trend:
                    trendUp,

                bos:
                    bosUp,

                pullback:
                    pullbackUp,

                momentum:
                    momentumUp,

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

                sma

            });

        }


        // ====================================================
        // 🚀 CALL FINAL
        // ====================================================

        console.log(
            "🟢🟢🟢 SIGNAL CALL 🟢🟢🟢"
        );


        console.log(
            {

                signal:
                    "CALL",

                callScore,

                putScore,

                pattern,

                pctGreen,

                pctRed,

                total:
                    historyTotal,

                historyEdge

            }
        );


        return buildSignal({

            strategy:
                "synthetic_pro",

            signal:
                "CALL",

            score:
                callScore,

            trend:
                trendUp,

            bos:
                bosUp,

            pullback:
                pullbackUp,

            momentum:
                momentumUp,

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

            sma

        });

    }


    // ========================================================
    // 🔴 PUT
    // ========================================================

    if (

        putScore >=
        CONFIG.MIN_SCORE &&

        (
            putScore -
            callScore
        ) >=
        CONFIG.MIN_DIFF

    ) {


        // ====================================================
        // HISTORIA DEBE APOYAR PUT
        // ====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyDirection !==
            "PUT"

        ) {

            console.log(
                "⛔ PUT BLOQUEADO: HISTORIA NO APOYA PUT",
                {

                    pattern,

                    pctGreen,

                    pctRed,

                    historyDirection,

                    historyEdge

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    putScore,

                trend:
                    trendDown,

                bos:
                    bosDown,

                pullback:
                    pullbackDown,

                momentum:
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

                sma

            });

        }


        // ====================================================
        // EDGE PUT
        // ====================================================

        if (

            CONFIG.REQUIRE_HISTORY &&

            historyEdge <
            CONFIG.HISTORY_MIN_EDGE

        ) {

            console.log(
                "⛔ PUT BLOQUEADO: EDGE INSUFICIENTE",
                {

                    edge:
                        historyEdge,

                    minimo:
                        CONFIG.HISTORY_MIN_EDGE

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    putScore,

                trend:
                    trendDown,

                bos:
                    bosDown,

                pullback:
                    pullbackDown,

                momentum:
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

                sma

            });

        }


        // ====================================================
        // ÚLTIMA VELA
        // ====================================================

        if (

            Number(last.close) >=
            Number(last.open) ||

            strengthLast <
            CONFIG.MIN_LAST_STRENGTH

        ) {

            console.log(
                "⛔ PUT DESCARTADO: ÚLTIMA VELA DÉBIL",
                {

                    putScore,

                    lastStrength:
                        strengthLast

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    putScore,

                trend:
                    trendDown,

                bos:
                    bosDown,

                pullback:
                    pullbackDown,

                momentum:
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

                sma

            });

        }


        // ====================================================
        // REVERSIÓN PUT
        // ====================================================

        if (

            CONFIG.ENABLE_REVERSAL &&

            putScore >= 10 &&

            avgStrength >= 0.90 &&

            pattern === "RRR" &&

            pctRed >= 75

        ) {

            console.log(
                "⚠️ PUT DESCARTADO POR POSIBLE REVERSIÓN",
                {

                    putScore,

                    avgStrength,

                    pattern,

                    pctRed

                }
            );


            return buildSignal({

                strategy:
                    "synthetic_pro",

                signal:
                    null,

                score:
                    putScore,

                trend:
                    trendDown,

                bos:
                    bosDown,

                pullback:
                    pullbackDown,

                momentum:
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

                sma

            });

        }


        // ====================================================
        // 🚀 PUT FINAL
        // ====================================================

        console.log(
            "🔴🔴🔴 SIGNAL PUT 🔴🔴🔴"
        );


        console.log(
            {

                signal:
                    "PUT",

                putScore,

                callScore,

                pattern,

                pctGreen,

                pctRed,

                total:
                    historyTotal,

                historyEdge

            }
        );


        return buildSignal({

            strategy:
                "synthetic_pro",

            signal:
                "PUT",

            score:
                putScore,

            trend:
                trendDown,

            bos:
                bosDown,

            pullback:
                pullbackDown,

            momentum:
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

            sma

        });

    }


    // ========================================================
    // ⚪ SIN SEÑAL
    // ========================================================

    console.log(
        "⚪ SYNTHETIC PRO: SIN SEÑAL",
        {

            pattern,

            callScore,

            putScore,

            historyDirection,

            historyEdge,

            pctGreen,

            pctRed,

            total:
                historyTotal

        }
    );


    return buildSignal({

        strategy:
            "synthetic_pro",

        signal:
            null,

        score:
            Math.max(
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

        sma

    });

}


// ============================================================
// EXPORT
// ============================================================

module.exports =
    syntheticProStrategy;