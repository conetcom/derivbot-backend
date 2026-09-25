// ============================================================
// SMA STRATEGY V5
// ============================================================
//
// OBJETIVO:
//
// Detectar tendencias mediante MA10 / MA50.
//
// Dentro de una misma tendencia:
//
//    1. Detectar tendencia
//    2. Esperar alejamiento
//    3. Detectar retroceso
//    4. Detectar acercamiento a MA10 / MA50
//    5. Encontrar mínimo del retroceso
//    6. Detectar recuperación
//    7. Confirmar vela
//    8. Entrar CALL / PUT
//    9. Rearmar detector
//   10. Permitir otra operación sin nuevo cruce
//
// ============================================================


// ============================================================
// CONFIG
// ============================================================

const CONFIG = {

    // Moving averages
    FAST_MA: 10,
    SLOW_MA: 50,

    // Rango promedio
    RANGE_PERIOD: 10,

    // --------------------------------------------------------
    // DISTANCIA
    // --------------------------------------------------------

    // Distancia máxima para considerar que el precio
    // está dentro de la zona de retroceso.
    //
    // Se mide en ATR/rango promedio.
    //
    // Ejemplo:
    //
    // distance = 0.50
    //
    // significa que el precio está a aproximadamente
    // medio rango promedio de la MA.
    //
    RETRACEMENT_MAX_DISTANCE: 1.50,

    // Zona considerada cercana a MA10
    MA10_ZONE_DISTANCE: 1.00,

    // Zona considerada cercana a MA50
    MA50_ZONE_DISTANCE: 0.75,

    // --------------------------------------------------------
    // CONFIRMACIÓN
    // --------------------------------------------------------

    MIN_CANDLE_STRENGTH: 0.25,

    // --------------------------------------------------------
    // SEPARACIÓN ENTRE OPERACIONES
    // --------------------------------------------------------

    MIN_CANDLES_BETWEEN_TRADES: 2,

    // null = ilimitadas
    MAX_TRADES_PER_TREND: null,

    // --------------------------------------------------------
    // LOOKBACK
    // --------------------------------------------------------

    RETRACEMENT_LOOKBACK: 4,

    // --------------------------------------------------------
    // RECHAZO
    // --------------------------------------------------------

    MA_REJECTION_ENABLED: true,

    // Fuerza mínima de la vela que confirma
    MA_REJECTION_MIN_STRENGTH: 0.20,

    // No exigimos tocar exactamente MA10
    MA_REJECTION_REQUIRE_TOUCH: false,

    // --------------------------------------------------------
    // CONTINUACIÓN
    // --------------------------------------------------------

    CONTINUATION_LOOKBACK: 3,

    // --------------------------------------------------------
    // DEBUG
    // --------------------------------------------------------

    DEBUG: true
};


// ============================================================
// UTILIDADES
// ============================================================

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(value, decimals = 4) {

    const factor = Math.pow(10, decimals);

    return Math.round(value * factor) / factor;
}


// ============================================================
// SMA EN ÍNDICE ESPECÍFICO
// ============================================================

function smaAt(candles, index, period) {

    if (
        !Array.isArray(candles) ||
        index < period - 1
    ) {
        return null;
    }

    let sum = 0;

    for (
        let i = index - period + 1;
        i <= index;
        i++
    ) {

        sum += number(candles[i]?.close);
    }

    return sum / period;
}


// ============================================================
// RANGO PROMEDIO
// ============================================================

function averageRangeAt(
    candles,
    index,
    period = 10
) {

    if (
        !Array.isArray(candles) ||
        index < 0
    ) {
        return 0;
    }

    const start = Math.max(
        0,
        index - period + 1
    );

    let total = 0;
    let count = 0;

    for (
        let i = start;
        i <= index;
        i++
    ) {

        const high = number(candles[i]?.high);
        const low = number(candles[i]?.low);

        const range = high - low;

        if (range > 0) {

            total += range;
            count++;
        }
    }

    return count
        ? total / count
        : 0;
}


// ============================================================
// FUERZA DE VELA
// ============================================================

function candleStrength(candle) {

    const open = number(candle?.open);
    const close = number(candle?.close);
    const high = number(candle?.high);
    const low = number(candle?.low);

    const range = high - low;

    if (range <= 0) {
        return 0;
    }

    const body = Math.abs(close - open);

    return body / range;
}


// ============================================================
// DIRECCIÓN VELA
// ============================================================

function isBullish(candle) {

    return number(candle?.close) >
           number(candle?.open);
}


function isBearish(candle) {

    return number(candle?.close) <
           number(candle?.open);
}


// ============================================================
// DATOS MA
// ============================================================

function getMAData(candles, index) {

    const ma10 = smaAt(
        candles,
        index,
        CONFIG.FAST_MA
    );

    const ma50 = smaAt(
        candles,
        index,
        CONFIG.SLOW_MA
    );

    if (
        ma10 == null ||
        ma50 == null
    ) {
        return null;
    }

    const avgRange =
        averageRangeAt(
            candles,
            index,
            CONFIG.RANGE_PERIOD
        );

    if (!avgRange) {
        return null;
    }

    const close =
        number(candles[index]?.close);

    const distance =
        Math.abs(close - ma10) /
        avgRange;

    return {

        ma10,

        ma50,

        close,

        avgRange,

        distance,

        aboveMA10:
            close > ma10,

        belowMA10:
            close < ma10,

        aboveMA50:
            close > ma50,

        belowMA50:
            close < ma50
    };
}


// ============================================================
// DETECTAR CROSS
// ============================================================

function detectCross(
    candles,
    index
) {

    if (index < CONFIG.SLOW_MA) {

        return null;
    }

    const current =
        getMAData(candles, index);

    const previous =
        getMAData(candles, index - 1);

    if (!current || !previous) {

        return null;
    }

    // CROSS ALCISTA

    if (
        previous.ma10 <= previous.ma50 &&
        current.ma10 > current.ma50
    ) {

        return "CALL";
    }

    // CROSS BAJISTA

    if (
        previous.ma10 >= previous.ma50 &&
        current.ma10 < current.ma50
    ) {

        return "PUT";
    }

    return null;
}


// ============================================================
// DETERMINAR TENDENCIA
// ============================================================

function getTrend(
    candles,
    index
) {

    const data =
        getMAData(candles, index);

    if (!data) {

        return null;
    }

    if (
        data.ma10 > data.ma50
    ) {

        return "CALL";
    }

    if (
        data.ma10 < data.ma50
    ) {

        return "PUT";
    }

    return null;
}


// ============================================================
// DISTANCIA EN ÍNDICE
// ============================================================

function getDistance(
    candles,
    index
) {

    const data =
        getMAData(candles, index);

    return data
        ? data.distance
        : null;
}


// ============================================================
// DETECTAR SI LA DISTANCIA ESTÁ AUMENTANDO
// ============================================================

function isDistanceExpanding(
    candles,
    index
) {

    if (index < 2) {

        return false;
    }

    const d0 =
        getDistance(candles, index);

    const d1 =
        getDistance(candles, index - 1);

    if (
        d0 == null ||
        d1 == null
    ) {

        return false;
    }

    return d0 > d1;
}


// ============================================================
// DETECTAR SI LA DISTANCIA ESTÁ DISMINUYENDO
// ============================================================

function isDistanceContracting(
    candles,
    index
) {

    if (index < 1) {

        return false;
    }

    const d0 =
        getDistance(candles, index);

    const d1 =
        getDistance(candles, index - 1);

    if (
        d0 == null ||
        d1 == null
    ) {

        return false;
    }

    return d0 < d1;
}


// ============================================================
// DETECTAR RETROCESO
// ============================================================
//
// El precio se está acercando a MA10.
//
// IMPORTANTE:
//
// No necesitamos que toque MA10.
//
// Incluso puede cruzarla.
//
// ============================================================

function detectRetracement(
    candles,
    index,
    direction
) {

    if (index < 3) {

        return {
            detected: false
        };
    }

    const current =
        getMAData(candles, index);

    const previous =
        getMAData(candles, index - 1);

    const previous2 =
        getMAData(candles, index - 2);

    const previous3 =
        getMAData(candles, index - 3);

    if (
        !current ||
        !previous ||
        !previous2 ||
        !previous3
    ) {

        return {
            detected: false
        };
    }


    // --------------------------------------------------------
    // Tendencia
    // --------------------------------------------------------

    const trend =
        direction === "CALL"
            ? current.ma10 > current.ma50
            : current.ma10 < current.ma50;


    if (!trend) {

        return {
            detected: false,
            reason: "NO_TREND"
        };
    }


    // --------------------------------------------------------
    // Distancias
    // --------------------------------------------------------

    const d0 = current.distance;
    const d1 = previous.distance;
    const d2 = previous2.distance;
    const d3 = previous3.distance;


    // --------------------------------------------------------
    // El precio viene acercándose
    // --------------------------------------------------------

    const approaching =
        d1 < d2 ||
        d2 < d3;


    // --------------------------------------------------------
    // Está entrando en zona MA10
    // --------------------------------------------------------

    const nearMA10 =
        Math.min(
            d0,
            d1,
            d2
        ) <= CONFIG.MA10_ZONE_DISTANCE;


    // --------------------------------------------------------
    // También permitimos retroceso hasta MA50
    // --------------------------------------------------------

    const close =
        current.close;

    const nearMA50 =
        Math.abs(
            close - current.ma50
        ) /
        current.avgRange
        <= CONFIG.MA50_ZONE_DISTANCE;


    // --------------------------------------------------------
    // Retroceso válido
    // --------------------------------------------------------

    const detected =
        approaching &&
        (
            nearMA10 ||
            nearMA50
        );


    return {

        detected,

        trend,

        approaching,

        nearMA10,

        nearMA50,

        distance: round(d0, 3),

        previousDistance:
            round(d1, 3),

        distance2:
            round(d2, 3),

        distance3:
            round(d3, 3),

        ma10:
            current.ma10,

        ma50:
            current.ma50
    };
}


// ============================================================
// ENCONTRAR MÍNIMO DEL RETROCESO
// ============================================================
//
// Ejemplo:
//
// 0.90
// 0.65
// 0.42
// 0.30   <- mínimo
// 0.38   <- empieza recuperación
//
// ============================================================

function detectRejection(
    candles,
    index,
    direction
) {

    if (
        !CONFIG.MA_REJECTION_ENABLED ||
        index < 4
    ) {

        return {
            detected: false
        };
    }

    const current =
        getMAData(candles, index);

    const previous =
        getMAData(candles, index - 1);

    const previous2 =
        getMAData(candles, index - 2);

    const previous3 =
        getMAData(candles, index - 3);

    const previous4 =
        getMAData(candles, index - 4);


    if (
        !current ||
        !previous ||
        !previous2 ||
        !previous3 ||
        !previous4
    ) {

        return {
            detected: false
        };
    }


    // --------------------------------------------------------
    // DISTANCIAS
    // --------------------------------------------------------

    const d0 = current.distance;
    const d1 = previous.distance;
    const d2 = previous2.distance;
    const d3 = previous3.distance;
    const d4 = previous4.distance;


    // --------------------------------------------------------
    // TENDENCIA
    // --------------------------------------------------------

    const trend =
        direction === "CALL"
            ? current.ma10 > current.ma50
            : current.ma10 < current.ma50;


    if (!trend) {

        return {
            detected: false,
            reason: "TREND_INVALID"
        };
    }


    // --------------------------------------------------------
    // BUSCAR MÍNIMO
    // --------------------------------------------------------
    //
    // d2 o d1 puede ser el punto más cercano.
    //
    // --------------------------------------------------------

    const minDistance =
        Math.min(
            d1,
            d2,
            d3
        );


    // --------------------------------------------------------
    // ESTUVO CERCA DE LAS MEDIAS
    // --------------------------------------------------------

    const nearMA =
        minDistance <=
        CONFIG.RETRACEMENT_MAX_DISTANCE;


    // --------------------------------------------------------
    // HUBO ACERCAMIENTO
    // --------------------------------------------------------

    const approaching =
        d2 < d3 ||
        d3 < d4;


    // --------------------------------------------------------
    // AHORA SE ESTÁ ALEJANDO
    // --------------------------------------------------------
    //
    // Esta es la parte crítica.
    //
    // Antes:
    //
    // 0.62 -> 0.36
    //
    // NO entra.
    //
    // Ahora:
    //
    // 0.62 -> 0.36 -> 0.22 -> 0.31
    //
    // sí puede haber rechazo.
    //
    // --------------------------------------------------------

    const recovering =
        d0 > d1;


    // --------------------------------------------------------
    // EL PRECIO ESTUVO CERCA
    // Y AHORA SE RECUPERA
    // --------------------------------------------------------

    const recoveryFromMinimum =
        d1 <= d2 ||
        d1 <= d3;


    // --------------------------------------------------------
    // VELA ACTUAL
    // --------------------------------------------------------

    const currentCandle =
        candles[index];

    const bullish =
        isBullish(currentCandle);

    const bearish =
        isBearish(currentCandle);


    const directionCandle =
        direction === "CALL"
            ? bullish
            : bearish;


    // --------------------------------------------------------
    // FUERZA
    // --------------------------------------------------------

    const strength =
        candleStrength(currentCandle);


    const strengthValid =
        strength >=
        CONFIG.MA_REJECTION_MIN_STRENGTH;


    // --------------------------------------------------------
    // POSICIÓN RESPECTO A MA50
    // --------------------------------------------------------
    //
    // No obligamos a que el precio esté por encima
    // de MA10.
    //
    // Esto permite exactamente el caso que mostraste:
    //
    // MA10 > MA50
    // precio atraviesa MA10
    // precio incluso toca/atraviesa MA50
    // después recupera.
    //
    // --------------------------------------------------------

    const priceDistanceToMA50 =
        Math.abs(
            current.close -
            current.ma50
        ) /
        current.avgRange;


    const nearMA50 =
        priceDistanceToMA50 <=
        CONFIG.MA50_ZONE_DISTANCE;


    // --------------------------------------------------------
    // TOQUE OPCIONAL
    // --------------------------------------------------------

    let touchedMA = false;

    if (direction === "CALL") {

        touchedMA =
            current.low <= current.ma10;

    } else {

        touchedMA =
            current.high >= current.ma10;
    }


    // --------------------------------------------------------
    // SI REQUIRE_TOUCH ESTÁ ACTIVO
    // --------------------------------------------------------

    if (
        CONFIG.MA_REJECTION_REQUIRE_TOUCH &&
        !touchedMA
    ) {

        return {

            detected: false,

            direction,

            trend,

            approaching,

            nearMA,

            recovering,

            directionCandle,

            strength,

            touchedMA,

            reason: "NO_TOUCH"
        };
    }


    // --------------------------------------------------------
    // RECHAZO
    // --------------------------------------------------------

    const rejection =
        approaching &&
        nearMA &&
        recovering &&
        recoveryFromMinimum &&
        directionCandle &&
        strengthValid;


    // --------------------------------------------------------
    // DETECTADO
    // --------------------------------------------------------

    const detected =
        rejection;


    return {

        detected,

        direction,

        trend,

        approaching,

        nearMA,

        nearMA50,

        recovering,

        recoveryFromMinimum,

        directionCandle,

        bullish,

        bearish,

        touchedMA,

        strengthValid,

        strength,

        ma10:
            current.ma10,

        ma50:
            current.ma50,

        close:
            current.close,

        distance:
            round(d0, 3),

        previousDistance:
            round(d1, 3),

        distance2:
            round(d2, 3),

        distance3:
            round(d3, 3),

        distance4:
            round(d4, 3),

        minDistance:
            round(minDistance, 3),

        priceDistanceToMA50:
            round(
                priceDistanceToMA50,
                3
            ),

        rejection
    };
}


// ============================================================
// CONTINUACIÓN
// ============================================================

function detectContinuation(
    candles,
    index,
    direction
) {

    if (index < 3) {

        return false;
    }

    const current =
        candles[index];

    const previous =
        candles[index - 1];

    const previous2 =
        candles[index - 2];


    const ma =
        getMAData(
            candles,
            index
        );

    if (!ma) {

        return false;
    }


    const bullish =
        isBullish(current);

    const bearish =
        isBearish(current);


    const previousBullish =
        isBullish(previous);

    const previousBearish =
        isBearish(previous);


    if (direction === "CALL") {

        return (
            ma.ma10 > ma.ma50 &&
            ma.close > ma.ma10 &&
            (
                bullish ||
                previousBullish
            )
        );
    }


    if (direction === "PUT") {

        return (
            ma.ma10 < ma.ma50 &&
            ma.close < ma.ma10 &&
            (
                bearish ||
                previousBearish
            )
        );
    }


    return false;
}


// ============================================================
// CONFIRMAR DIRECCIÓN
// ============================================================

function directionConfirmed(
    candles,
    index,
    direction
) {

    const current =
        candles[index];

    const ma =
        getMAData(
            candles,
            index
        );

    if (!ma) {

        return false;
    }

    const strength =
        candleStrength(current);


    if (
        strength <
        CONFIG.MIN_CANDLE_STRENGTH
    ) {

        return false;
    }


    if (direction === "CALL") {

        return (
            ma.ma10 > ma.ma50 &&
            isBullish(current)
        );
    }


    if (direction === "PUT") {

        return (
            ma.ma10 < ma.ma50 &&
            isBearish(current)
        );
    }


    return false;
}


// ============================================================
// STATE
// ============================================================

function initializeState(state) {

    if (!state.smaStrategy) {

        state.smaStrategy = {

            trendDirection: null,

            trendStartIndex: null,

            lastCrossIndex: null,

            lastEntryIndex: null,

            lastEntryType: null,

            tradesInTrend: 0,

            // ------------------------------------------------
            // NUEVO
            // ------------------------------------------------

            rejectionArmed: false,

            rejectionDirection: null,

            rejectionMinDistance: null,

            rejectionMinIndex: null,

            lastSignalIndex: null
        };
    }

    return state.smaStrategy;
}


// ============================================================
// ACTUALIZAR TENDENCIA
// ============================================================

function updateTrendState(
    candles,
    index,
    state
) {

    const strategyState =
        initializeState(state);


    const cross =
        detectCross(
            candles,
            index
        );


    const trend =
        getTrend(
            candles,
            index
        );


    // --------------------------------------------------------
    // NUEVO CROSS
    // --------------------------------------------------------

    if (cross) {

        strategyState.trendDirection =
            cross;

        strategyState.trendStartIndex =
            index;

        strategyState.lastCrossIndex =
            index;

        strategyState.tradesInTrend =
            0;

        strategyState.lastEntryIndex =
            null;

        strategyState.lastEntryType =
            null;

        strategyState.rejectionArmed =
            false;

        strategyState.rejectionDirection =
            null;

        strategyState.rejectionMinDistance =
            null;

        strategyState.rejectionMinIndex =
            null;

        if (CONFIG.DEBUG) {

            console.log(
                "🔄 SMA CROSS:",
                {
                    index,
                    direction: cross
                }
            );
        }
    }


    // --------------------------------------------------------
    // SI NO TENEMOS TENDENCIA
    // --------------------------------------------------------

    if (!strategyState.trendDirection) {

        strategyState.trendDirection =
            trend;

        if (trend) {

            strategyState.trendStartIndex =
                index;
        }
    }


    // --------------------------------------------------------
    // SI MA10 / MA50 CAMBIARON DE LADO
    // --------------------------------------------------------

    if (
        trend &&
        strategyState.trendDirection &&
        trend !== strategyState.trendDirection
    ) {

        strategyState.trendDirection =
            trend;

        strategyState.trendStartIndex =
            index;

        strategyState.tradesInTrend =
            0;

        strategyState.rejectionArmed =
            false;

        strategyState.rejectionDirection =
            null;

        strategyState.rejectionMinDistance =
            null;

        strategyState.rejectionMinIndex =
            null;

        if (CONFIG.DEBUG) {

            console.log(
                "🔄 SMA TREND CAMBIÓ:",
                {
                    index,
                    direction: trend
                }
            );
        }
    }


    return strategyState;
}


// ============================================================
// CAN ENTER
// ============================================================

function canEnter(
    index,
    state
) {

    const strategyState =
        initializeState(state);


    // --------------------------------------------------------
    // SEPARACIÓN ENTRE OPERACIONES
    // --------------------------------------------------------

    if (
        strategyState.lastEntryIndex != null
    ) {

        const candlesSinceLastEntry =
            index -
            strategyState.lastEntryIndex;


        if (
            candlesSinceLastEntry <
            CONFIG.MIN_CANDLES_BETWEEN_TRADES
        ) {

            return false;
        }
    }


    // --------------------------------------------------------
    // MÁXIMO POR TENDENCIA
    // --------------------------------------------------------

    if (
        CONFIG.MAX_TRADES_PER_TREND != null &&
        strategyState.tradesInTrend >=
        CONFIG.MAX_TRADES_PER_TREND
    ) {

        return false;
    }


    return true;
}


// ============================================================
// REGISTER ENTRY
// ============================================================

function registerEntry(
    index,
    entryType,
    direction,
    state
) {

    const strategyState =
        initializeState(state);


    strategyState.lastEntryIndex =
        index;

    strategyState.lastEntryType =
        entryType;

    strategyState.tradesInTrend++;

    strategyState.lastSignalIndex =
        index;


    // --------------------------------------------------------
    // IMPORTANTE
    //
    // Después de una operación debemos REARMAR
    // el detector para permitir otro retroceso.
    // --------------------------------------------------------

    strategyState.rejectionArmed =
        false;

    strategyState.rejectionDirection =
        direction;

    strategyState.rejectionMinDistance =
        null;

    strategyState.rejectionMinIndex =
        null;
}


// ============================================================
// BUILD NEUTRAL
// ============================================================

function neutral() {

    return {

        signal: null,

        score: 0,

        strategy: "sma",

        entryType: null
    };
}


// ============================================================
// SMA STRATEGY
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
        candles.length <
        CONFIG.SLOW_MA + 5
    ) {

        return neutral();
    }


    const index =
        candles.length - 1;


    // ========================================================
    // STATE
    // ========================================================

    const strategyState =
        updateTrendState(
            candles,
            index,
            state
        );


    const direction =
        strategyState.trendDirection;


    if (!direction) {

        return neutral();
    }


    // ========================================================
    // ¿PODEMOS ENTRAR?
    // ========================================================

    if (
        !canEnter(
            index,
            state
        )
    ) {

        return neutral();
    }


    // ========================================================
    // DATOS ACTUALES
    // ========================================================

    const current =
        getMAData(
            candles,
            index
        );


    if (!current) {

        return neutral();
    }


    const currentCandle =
        candles[index];


    const strength =
        candleStrength(
            currentCandle
        );


    // ========================================================
    // 1. MA10 / MA50 REJECTION
    // ========================================================
    //
    // ESTA ES LA ENTRADA PRINCIPAL.
    //
    // NO NECESITA:
    //
    // ❌ tocar exactamente MA10
    // ❌ estar por encima de MA10 en CALL
    // ❌ estar por debajo de MA10 en PUT
    //
    // SÍ NECESITA:
    //
    // ✔ tendencia
    // ✔ retroceso
    // ✔ acercamiento
    // ✔ mínimo
    // ✔ recuperación
    // ✔ vela de confirmación
    //
    // ========================================================

    if (
        CONFIG.MA_REJECTION_ENABLED
    ) {

        const rejection =
            detectRejection(
                candles,
                index,
                direction
            );


        if (CONFIG.DEBUG) {

            console.log(
                `🔎 MA REJECTION TEST ${direction}:`,
                rejection
            );
        }


        if (
            rejection.detected
        ) {

            registerEntry(
                index,
                "MA_REJECTION",
                direction,
                state
            );


            return {

                signal:
                    direction,

                score: 10,

                strategy: "sma",

                entryType:
                    "MA_REJECTION",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                ma10:
                    rejection.ma10,

                ma50:
                    rejection.ma50,

                distance:
                    rejection.distance,

                strength:
                    rejection.strength,

                analysis:
                    rejection
            };
        }
    }


    // ========================================================
    // 2. PULLBACK
    // ========================================================

    const retracement =
        detectRetracement(
            candles,
            index,
            direction
        );


    if (
        retracement.detected
    ) {

        const confirmed =
            directionConfirmed(
                candles,
                index,
                direction
            );


        if (confirmed) {

            registerEntry(
                index,
                "PULLBACK",
                direction,
                state
            );


            return {

                signal:
                    direction,

                score: 8,

                strategy: "sma",

                entryType:
                    "PULLBACK",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    current.distance,

                strength
            };
        }
    }


    // ========================================================
    // 3. CONTINUACIÓN
    // ========================================================

    const continuation =
        detectContinuation(
            candles,
            index,
            direction
        );


    if (continuation) {

        const confirmed =
            directionConfirmed(
                candles,
                index,
                direction
            );


        if (confirmed) {

            registerEntry(
                index,
                "CONTINUATION",
                direction,
                state
            );


            return {

                signal:
                    direction,

                score: 7,

                strategy: "sma",

                entryType:
                    "CONTINUATION",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    current.distance,

                strength
            };
        }
    }


    // ========================================================
    // NO SIGNAL
    // ========================================================

    return neutral();
}


// ============================================================
// EXPORT
// ============================================================

module.exports = smaStrategy;