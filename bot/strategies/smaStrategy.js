const buildSignal = require("../helpers/buildSignal");

/*
============================================================
SMA STRATEGY V4 - MODO PRUEBA
============================================================

Mantiene:

- MA10 / MA50
- CROSS
- EARLY_TREND
- PULLBACK
- CONTINUATION
- múltiples operaciones por tendencia
- separación entre operaciones

NUEVO:

MA10_REJECTION

Busca:

IMPULSO
   ↓
RETROCESO
   ↓
PRECIO SE ACERCA A MA10
   ↓
RECHAZO
   ↓
CONTINUACIÓN
   ↓
ENTRADA

MODO PRUEBA:

Se redujo el rigor del detector MA10_REJECTION
para poder observarlo funcionando en tiempo real.

============================================================
*/


const CONFIG = {

    /*
    ========================================================
    MEDIAS
    ========================================================
    */

    FAST_MA: 10,
    SLOW_MA: 50,


    /*
    ========================================================
    RANGO
    ========================================================
    */

    RANGE_PERIOD: 10,


    /*
    ========================================================
    EARLY TREND
    ========================================================
    */

    EARLY_DISTANCE_MAX: 1.5,


    /*
    ========================================================
    PULLBACK NORMAL
    ========================================================
    */

    PULLBACK_DISTANCE: 0.50,


    /*
    ========================================================
    FUERZA GENERAL
    ========================================================
    */

    MIN_CANDLE_STRENGTH: 0.45,


    /*
    ========================================================
    SEPARACIÓN ENTRE OPERACIONES
    ========================================================

    2 = mínimo dos velas entre entradas.
    */

    MIN_CANDLES_BETWEEN_TRADES: 2,


    /*
    ========================================================
    OPERACIONES POR TENDENCIA
    ========================================================

    null = ilimitadas
    */

    MAX_TRADES_PER_TREND: null,


    /*
    ========================================================
    LOOKBACK
    ========================================================
    */

    DISTANCE_LOOKBACK: 2,

    CONTINUATION_LOOKBACK: 3,

    EARLY_TREND_CANDLES: 3,


    /*
    ========================================================
    MA10 REJECTION - MODO PRUEBA
    ========================================================

    MUCHO MENOS ESTRICTO QUE V4 ORIGINAL.
    */

    MA10_REJECTION_ENABLED: true,

    /*
    Distancia máxima del cierre respecto a MA10,
    expresada en rangos promedio.

    1.00 = permite estar hasta un rango promedio
    de distancia.
    */

    MA10_REJECTION_DISTANCE: 1.00,


    /*
    Tolerancia de toque de MA10.

    0.50 = permitimos que la mecha quede hasta
    50% del rango promedio separada de MA10.
    */

    MA10_TOUCH_TOLERANCE: 0.50,


    /*
    Fuerza mínima de la vela de rechazo.

    MODO PRUEBA:

    0.25
    */

    MA10_REJECTION_MIN_STRENGTH: 0.25,


    /*
    ========================================================
    DEBUG
    ========================================================
    */

    DEBUG: true
};


/*
============================================================
UTILIDAD NUMBER
============================================================
*/

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


/*
============================================================
ROUND
============================================================
*/

function round(value, decimals = 4) {

    const factor =
        Math.pow(10, decimals);

    return Math.round(
        number(value) * factor
    ) / factor;
}


/*
============================================================
CALCULATE SMA
============================================================
*/

function calculateSMA(candles, period) {

    if (!Array.isArray(candles)) {
        return null;
    }

    if (candles.length < period) {
        return null;
    }

    const slice =
        candles.slice(-period);

    const values =
        slice.map(c =>
            number(c.close)
        );

    if (values.length < period) {
        return null;
    }

    const sum =
        values.reduce(
            (acc, value) =>
                acc + value,
            0
        );

    return sum / period;
}


/*
============================================================
SMA EN ÍNDICE

No utiliza velas futuras.
============================================================
*/

function smaAt(
    candles,
    index,
    period
) {

    if (
        !Array.isArray(candles) ||
        index < period - 1
    ) {
        return null;
    }

    const start =
        index - period + 1;

    let sum = 0;

    for (
        let i = start;
        i <= index;
        i++
    ) {

        sum += number(
            candles[i].close
        );
    }

    return sum / period;
}


/*
============================================================
RANGO PROMEDIO
============================================================
*/

function averageRangeAt(
    candles,
    index,
    period
) {

    if (
        !Array.isArray(candles) ||
        index < 0
    ) {
        return null;
    }

    const start =
        Math.max(
            0,
            index - period + 1
        );

    const ranges = [];

    for (
        let i = start;
        i <= index;
        i++
    ) {

        const high =
            number(candles[i].high);

        const low =
            number(candles[i].low);

        const range =
            high - low;

        if (range > 0) {
            ranges.push(range);
        }
    }

    if (!ranges.length) {
        return null;
    }

    const total =
        ranges.reduce(
            (sum, value) =>
                sum + value,
            0
        );

    return total / ranges.length;
}


/*
============================================================
FUERZA DE VELA
============================================================

0 = cuerpo pequeño
1 = cuerpo ocupa todo el rango
============================================================
*/

function candleStrength(candle) {

    if (!candle) {
        return 0;
    }

    const open =
        number(candle.open);

    const close =
        number(candle.close);

    const high =
        number(candle.high);

    const low =
        number(candle.low);

    const range =
        high - low;

    if (range <= 0) {
        return 0;
    }

    const body =
        Math.abs(
            close - open
        );

    return body / range;
}


/*
============================================================
DIRECCIÓN DE VELA
============================================================
*/

function isBullish(candle) {

    return (
        number(candle.close) >
        number(candle.open)
    );
}


function isBearish(candle) {

    return (
        number(candle.close) <
        number(candle.open)
    );
}


/*
============================================================
DATOS MA10 / MA50
============================================================
*/

function getMAData(
    candles,
    index
) {

    const ma10 =
        smaAt(
            candles,
            index,
            CONFIG.FAST_MA
        );

    const ma50 =
        smaAt(
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

    const close =
        number(
            candles[index].close
        );

    const avgRange =
        averageRangeAt(
            candles,
            index,
            CONFIG.RANGE_PERIOD
        );

    const distance =
        avgRange > 0
            ? Math.abs(
                ma10 - ma50
            ) / avgRange
            : 0;

    return {

        ma10,

        ma50,

        close,

        avgRange,

        distance,

        direction:
            ma10 > ma50
                ? "CALL"
                : ma10 < ma50
                    ? "PUT"
                    : null
    };
}


/*
============================================================
DETECT CROSS
============================================================
*/

function detectCross(
    candles,
    index
) {

    if (
        index <
        CONFIG.SLOW_MA + 1
    ) {
        return null;
    }

    const currentMA10 =
        smaAt(
            candles,
            index,
            CONFIG.FAST_MA
        );

    const currentMA50 =
        smaAt(
            candles,
            index,
            CONFIG.SLOW_MA
        );

    const previousMA10 =
        smaAt(
            candles,
            index - 1,
            CONFIG.FAST_MA
        );

    const previousMA50 =
        smaAt(
            candles,
            index - 1,
            CONFIG.SLOW_MA
        );

    if (
        currentMA10 == null ||
        currentMA50 == null ||
        previousMA10 == null ||
        previousMA50 == null
    ) {
        return null;
    }


    /*
    ========================================================
    CROSS ALCISTA
    ========================================================
    */

    if (
        previousMA10 <= previousMA50 &&
        currentMA10 > currentMA50
    ) {

        return "CALL";
    }


    /*
    ========================================================
    CROSS BAJISTA
    ========================================================
    */

    if (
        previousMA10 >= previousMA50 &&
        currentMA10 < currentMA50
    ) {

        return "PUT";
    }

    return null;
}


/*
============================================================
BUSCAR ÚLTIMO CROSS
============================================================
*/

function findLatestCross(
    candles,
    index
) {

    const maxLookback =
        Math.min(
            20,
            index - CONFIG.SLOW_MA
        );

    for (
        let offset = 0;
        offset <= maxLookback;
        offset++
    ) {

        const testIndex =
            index - offset;

        const cross =
            detectCross(
                candles,
                testIndex
            );

        if (cross) {

            return {

                direction: cross,

                index: testIndex
            };
        }
    }

    return null;
}


/*
============================================================
DISTANCIA MA10 / MA50 CRECIENDO
============================================================
*/

function isDistanceExpanding(
    candles,
    index
) {

    if (
        index <
        CONFIG.DISTANCE_LOOKBACK
    ) {
        return false;
    }

    const current =
        getMAData(
            candles,
            index
        );

    const previous =
        getMAData(
            candles,
            index -
            CONFIG.DISTANCE_LOOKBACK
        );

    if (
        !current ||
        !previous
    ) {
        return false;
    }

    return (
        current.distance >
        previous.distance
    );
}


/*
============================================================
CAMBIO DE DISTANCIA
============================================================
*/

function getDistanceChange(
    candles,
    index
) {

    if (
        index <
        CONFIG.DISTANCE_LOOKBACK
    ) {
        return 0;
    }

    const current =
        getMAData(
            candles,
            index
        );

    const previous =
        getMAData(
            candles,
            index -
            CONFIG.DISTANCE_LOOKBACK
        );

    if (
        !current ||
        !previous
    ) {
        return 0;
    }

    return (
        current.distance -
        previous.distance
    );
}


/*
============================================================
PULLBACK V3
============================================================
*/

function detectPullback(
    candles,
    direction
) {

    const i =
        candles.length - 1;

    if (
        i <
        CONFIG.SLOW_MA + 3
    ) {
        return false;
    }

    const current =
        candles[i];

    const previous =
        candles[i - 1];

    const previous2 =
        candles[i - 2];

    const ma10 =
        smaAt(
            candles,
            i,
            CONFIG.FAST_MA
        );

    const avgRange =
        averageRangeAt(
            candles,
            i,
            CONFIG.RANGE_PERIOD
        );

    if (
        ma10 == null ||
        !avgRange
    ) {
        return false;
    }


    /*
    ========================================================
    CALL
    ========================================================
    */

    if (direction === "CALL") {

        const currentClose =
            number(current.close);

        const previousClose =
            number(previous.close);

        const previous2Close =
            number(previous2.close);


        const currentAboveMA =
            currentClose > ma10;

        const previousAboveMA =
            previousClose > ma10;


        const previousDistance =
            Math.abs(
                previousClose -
                ma10
            );


        const wasAway =
            previousDistance >
            avgRange *
            CONFIG.PULLBACK_DISTANCE;


        const currentNear =
            Math.abs(
                currentClose -
                ma10
            ) <=
            avgRange *
            CONFIG.PULLBACK_DISTANCE;


        const bullish =
            isBullish(current);


        const slowing =
            previousClose <=
            previous2Close ||
            !isBullish(previous);


        return (
            currentAboveMA &&
            previousAboveMA &&
            wasAway &&
            currentNear &&
            bullish &&
            slowing
        );
    }


    /*
    ========================================================
    PUT
    ========================================================
    */

    if (direction === "PUT") {

        const currentClose =
            number(current.close);

        const previousClose =
            number(previous.close);

        const previous2Close =
            number(previous2.close);


        const currentBelowMA =
            currentClose < ma10;

        const previousBelowMA =
            previousClose < ma10;


        const previousDistance =
            Math.abs(
                previousClose -
                ma10
            );


        const wasAway =
            previousDistance >
            avgRange *
            CONFIG.PULLBACK_DISTANCE;


        const currentNear =
            Math.abs(
                currentClose -
                ma10
            ) <=
            avgRange *
            CONFIG.PULLBACK_DISTANCE;


        const bearish =
            isBearish(current);


        const slowing =
            previousClose >=
            previous2Close ||
            !isBearish(previous);


        return (
            currentBelowMA &&
            previousBelowMA &&
            wasAway &&
            currentNear &&
            bearish &&
            slowing
        );
    }

    return false;
}


/*
============================================================
MA10 REJECTION V4 - MODO PRUEBA
============================================================

Esta es la función nueva.

Busca:

PUT:

    caída
      ↓
    retroceso
      ↓
    acercamiento MA10
      ↓
    rechazo
      ↓
    PUT

CALL:

    subida
      ↓
    retroceso
      ↓
    acercamiento MA10
      ↓
    rechazo
      ↓
    CALL
============================================================
*/

function detectMA10Rejection(
    candles,
    direction
) {

    if (
        !CONFIG.MA10_REJECTION_ENABLED
    ) {

        return {
            detected: false
        };
    }


    if (
        !Array.isArray(candles) ||
        candles.length <
        CONFIG.SLOW_MA + 5
    ) {

        return {
            detected: false
        };
    }


    const i =
        candles.length - 1;


    const current =
        candles[i];

    const previous =
        candles[i - 1];

    const previous2 =
        candles[i - 2];

    const previous3 =
        candles[i - 3];


    /*
    ========================================================
    MA10
    ========================================================
    */

    const ma10Current =
        smaAt(
            candles,
            i,
            CONFIG.FAST_MA
        );

    const ma10Previous =
        smaAt(
            candles,
            i - 1,
            CONFIG.FAST_MA
        );

    const ma10Previous2 =
        smaAt(
            candles,
            i - 2,
            CONFIG.FAST_MA
        );


    /*
    ========================================================
    MA50
    ========================================================
    */

    const ma50Current =
        smaAt(
            candles,
            i,
            CONFIG.SLOW_MA
        );


    if (
        ma10Current == null ||
        ma10Previous == null ||
        ma10Previous2 == null ||
        ma50Current == null
    ) {

        return {
            detected: false
        };
    }


    /*
    ========================================================
    RANGO PROMEDIO
    ========================================================
    */

    const avgRange =
        averageRangeAt(
            candles,
            i,
            CONFIG.RANGE_PERIOD
        );


    if (
        !avgRange ||
        avgRange <= 0
    ) {

        return {
            detected: false
        };
    }


    /*
    ========================================================
    DATOS VELA ACTUAL
    ========================================================
    */

    const open =
        number(current.open);

    const close =
        number(current.close);

    const high =
        number(current.high);

    const low =
        number(current.low);


    const previousClose =
        number(previous.close);

    const previous2Close =
        number(previous2.close);

    const previous3Close =
        number(previous3.close);


    /*
    ========================================================
    FUERZA
    ========================================================
    */

    const strength =
        candleStrength(current);


    /*
    ========================================================
    DISTANCIA ACTUAL A MA10
    ========================================================
    */

    const distanceCurrent =
        Math.abs(
            close -
            ma10Current
        ) / avgRange;


    /*
    ========================================================
    DISTANCIA ANTERIOR
    ========================================================
    */

    const distancePrevious =
        Math.abs(
            previousClose -
            ma10Previous
        ) / avgRange;


    /*
    ========================================================
    DISTANCIA ANTERIOR 2
    ========================================================
    */

    const distancePrevious2 =
        Math.abs(
            previous2Close -
            ma10Previous2
        ) / avgRange;


    /*
    ========================================================
    PUT
    ========================================================
    */

    if (direction === "PUT") {

        /*
        Tendencia bajista.
        */

        if (
            ma10Current >=
            ma50Current
        ) {

            return {
                detected: false
            };
        }


        /*
        Precio debajo de MA10.
        */

        const belowMA10 =
            close <
            ma10Current;


        /*
        Precio cerca de MA10.
        */

        const closeToMA10 =
            distanceCurrent <=
            CONFIG.MA10_REJECTION_DISTANCE;


        /*
        La mecha llegó cerca de MA10.
        */

        const touchedMA10 =
            high >=
            ma10Current -
            avgRange *
            CONFIG.MA10_TOUCH_TOLERANCE;


        /*
        Vela bajista.
        */

        const bearish =
            close <
            open;


        /*
        ====================================================
        DETECTAR RETROCESO
        ====================================================

        Permitimos varias formas:

        1. La distancia disminuyó.

        2. La vela anterior cerró más arriba.

        3. La vela anterior a esa también cerró más arriba.
        */

        const pullbackDetected =
            distancePrevious <
            distancePrevious2 ||

            previousClose >
            previous2Close ||

            previous2Close >
            previous3Close;


        /*
        ====================================================
        RECHAZO
        ====================================================
        */

        const rejection =
            belowMA10 &&
            closeToMA10 &&
            touchedMA10 &&
            bearish;


        /*
        ====================================================
        RESULTADO
        ====================================================
        */

        const detected =
            rejection &&
            pullbackDetected &&
            strength >=
            CONFIG.MA10_REJECTION_MIN_STRENGTH;


        /*
        ====================================================
        DEBUG
        ====================================================
        */

        if (CONFIG.DEBUG) {

            console.log(
                "🔎 MA10 REJECTION TEST PUT:",
                {

                    ma10:
                        round(
                            ma10Current,
                            5
                        ),

                    ma50:
                        round(
                            ma50Current,
                            5
                        ),

                    close:
                        round(
                            close,
                            5
                        ),

                    distance:
                        round(
                            distanceCurrent,
                            3
                        ),

                    previousDistance:
                        round(
                            distancePrevious,
                            3
                        ),

                    closeToMA10,

                    touchedMA10,

                    belowMA10,

                    bearish,

                    pullbackDetected,

                    strength:
                        round(
                            strength,
                            3
                        ),

                    minStrength:
                        CONFIG
                            .MA10_REJECTION_MIN_STRENGTH,

                    rejection,

                    detected
                }
            );
        }


        if (detected) {

            return {

                detected: true,

                direction: "PUT",

                type:
                    "MA10_REJECTION",

                distanceToMA10:
                    round(
                        distanceCurrent,
                        3
                    ),

                previousDistance:
                    round(
                        distancePrevious,
                        3
                    ),

                strength:
                    round(
                        strength,
                        3
                    ),

                ma10:
                    round(
                        ma10Current,
                        5
                    ),

                ma50:
                    round(
                        ma50Current,
                        5
                    ),

                reason:
                    "Retroceso hacia MA10 + rechazo bajista"
            };
        }
    }


    /*
    ========================================================
    CALL
    ========================================================
    */

    if (direction === "CALL") {

        /*
        Tendencia alcista.
        */

        if (
            ma10Current <=
            ma50Current
        ) {

            return {
                detected: false
            };
        }


        /*
        Precio encima de MA10.
        */

        const aboveMA10 =
            close >
            ma10Current;


        /*
        Cerca de MA10.
        */

        const closeToMA10 =
            distanceCurrent <=
            CONFIG.MA10_REJECTION_DISTANCE;


        /*
        La mecha llegó cerca de MA10.
        */

        const touchedMA10 =
            low <=
            ma10Current +
            avgRange *
            CONFIG.MA10_TOUCH_TOLERANCE;


        /*
        Vela alcista.
        */

        const bullish =
            close >
            open;


        /*
        ====================================================
        DETECTAR RETROCESO
        ====================================================
        */

        const pullbackDetected =
            distancePrevious <
            distancePrevious2 ||

            previousClose <
            previous2Close ||

            previous2Close <
            previous3Close;


        /*
        ====================================================
        RECHAZO
        ====================================================
        */

        const rejection =
            aboveMA10 &&
            closeToMA10 &&
            touchedMA10 &&
            bullish;


        /*
        ====================================================
        RESULTADO
        ====================================================
        */

        const detected =
            rejection &&
            pullbackDetected &&
            strength >=
            CONFIG.MA10_REJECTION_MIN_STRENGTH;


        /*
        ====================================================
        DEBUG
        ====================================================
        */

        if (CONFIG.DEBUG) {

            console.log(
                "🔎 MA10 REJECTION TEST CALL:",
                {

                    ma10:
                        round(
                            ma10Current,
                            5
                        ),

                    ma50:
                        round(
                            ma50Current,
                            5
                        ),

                    close:
                        round(
                            close,
                            5
                        ),

                    distance:
                        round(
                            distanceCurrent,
                            3
                        ),

                    previousDistance:
                        round(
                            distancePrevious,
                            3
                        ),

                    closeToMA10,

                    touchedMA10,

                    aboveMA10,

                    bullish,

                    pullbackDetected,

                    strength:
                        round(
                            strength,
                            3
                        ),

                    minStrength:
                        CONFIG
                            .MA10_REJECTION_MIN_STRENGTH,

                    rejection,

                    detected
                }
            );
        }


        if (detected) {

            return {

                detected: true,

                direction: "CALL",

                type:
                    "MA10_REJECTION",

                distanceToMA10:
                    round(
                        distanceCurrent,
                        3
                    ),

                previousDistance:
                    round(
                        distancePrevious,
                        3
                    ),

                strength:
                    round(
                        strength,
                        3
                    ),

                ma10:
                    round(
                        ma10Current,
                        5
                    ),

                ma50:
                    round(
                        ma50Current,
                        5
                    ),

                reason:
                    "Retroceso hacia MA10 + rechazo alcista"
            };
        }
    }


    return {
        detected: false
    };
}


/*
============================================================
CONTINUATION
============================================================
*/

function detectContinuation(
    candles,
    direction
) {

    const i =
        candles.length - 1;

    if (
        i <
        CONFIG.SLOW_MA +
        CONFIG.CONTINUATION_LOOKBACK
    ) {

        return false;
    }


    const current =
        candles[i];

    const previous =
        candles[i - 1];

    const previous2 =
        candles[i - 2];


    const ma10 =
        smaAt(
            candles,
            i,
            CONFIG.FAST_MA
        );

    const ma50 =
        smaAt(
            candles,
            i,
            CONFIG.SLOW_MA
        );


    if (
        ma10 == null ||
        ma50 == null
    ) {

        return false;
    }


    /*
    ========================================================
    CALL
    ========================================================
    */

    if (direction === "CALL") {

        if (ma10 <= ma50) {
            return false;
        }

        const close =
            number(current.close);

        const previousClose =
            number(previous.close);

        const previous2Close =
            number(previous2.close);


        const aboveMA10 =
            close >
            ma10;


        const bullish =
            isBullish(current);


        const previousBullish =
            isBullish(previous);


        const impulse =
            close >
            previousClose &&
            previousClose >=
            previous2Close;


        return (
            aboveMA10 &&
            bullish &&
            previousBullish &&
            impulse
        );
    }


    /*
    ========================================================
    PUT
    ========================================================
    */

    if (direction === "PUT") {

        if (ma10 >= ma50) {
            return false;
        }

        const close =
            number(current.close);

        const previousClose =
            number(previous.close);

        const previous2Close =
            number(previous2.close);


        const belowMA10 =
            close <
            ma10;


        const bearish =
            isBearish(current);


        const previousBearish =
            isBearish(previous);


        const impulse =
            close <
            previousClose &&
            previousClose <=
            previous2Close;


        return (
            belowMA10 &&
            bearish &&
            previousBearish &&
            impulse
        );
    }


    return false;
}


/*
============================================================
CONFIRMAR DIRECCIÓN
============================================================
*/

function directionConfirmed(
    candles,
    direction
) {

    const current =
        candles[
            candles.length - 1
        ];


    const ma10 =
        smaAt(
            candles,
            candles.length - 1,
            CONFIG.FAST_MA
        );


    const ma50 =
        smaAt(
            candles,
            candles.length - 1,
            CONFIG.SLOW_MA
        );


    if (
        ma10 == null ||
        ma50 == null
    ) {

        return false;
    }


    const close =
        number(current.close);


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
            ma10 > ma50 &&
            close > ma10 &&
            isBullish(current)
        );
    }


    if (direction === "PUT") {

        return (
            ma10 < ma50 &&
            close < ma10 &&
            isBearish(current)
        );
    }


    return false;
}


/*
============================================================
INICIALIZAR STATE
============================================================
*/

function initializeState(state) {

    if (!state.smaStrategy) {

        state.smaStrategy = {

            trendDirection: null,

            lastCrossIndex: -1,

            lastEntryIndex: -999,

            lastEntryType: null,

            tradesInTrend: 0,

            trendStartedAt: null
        };
    }

    return state.smaStrategy;
}


/*
============================================================
ACTUALIZAR TENDENCIA
============================================================
*/

function updateTrendState(
    candles,
    state,
    index
) {

    const strategyState =
        initializeState(state);


    const cross =
        detectCross(
            candles,
            index
        );


    /*
    ========================================================
    NUEVO CROSS
    ========================================================
    */

    if (cross) {

        strategyState.trendDirection =
            cross;

        strategyState.lastCrossIndex =
            index;

        strategyState.tradesInTrend =
            0;

        strategyState.trendStartedAt =
            Date.now();


        if (CONFIG.DEBUG) {

            console.log(
                "📊 SMA V4 - NUEVO CROSS:",
                {

                    direction:
                        cross,

                    index
                }
            );
        }

        return cross;
    }


    /*
    ========================================================
    TODAVÍA NO TENEMOS TENDENCIA
    ========================================================
    */

    if (
        !strategyState.trendDirection
    ) {

        const current =
            getMAData(
                candles,
                index
            );

        if (current) {

            strategyState.trendDirection =
                current.direction;

            strategyState.lastCrossIndex =
                index;

            strategyState.trendStartedAt =
                Date.now();
        }
    }


    return (
        strategyState.trendDirection
    );
}


/*
============================================================
CAN ENTER
============================================================
*/

function canEnter(
    state,
    index
) {

    const strategyState =
        initializeState(state);


    /*
    ========================================================
    SEPARACIÓN
    ========================================================
    */

    const candlesSinceLastEntry =
        index -
        strategyState.lastEntryIndex;


    if (
        candlesSinceLastEntry <
        CONFIG.MIN_CANDLES_BETWEEN_TRADES
    ) {

        return false;
    }


    /*
    ========================================================
    MÁXIMO POR TENDENCIA
    ========================================================
    */

    if (
        CONFIG.MAX_TRADES_PER_TREND !== null &&
        strategyState.tradesInTrend >=
        CONFIG.MAX_TRADES_PER_TREND
    ) {

        return false;
    }


    return true;
}


/*
============================================================
REGISTRAR ENTRADA
============================================================
*/

function registerEntry(
    state,
    index,
    entryType
) {

    const strategyState =
        initializeState(state);


    strategyState.lastEntryIndex =
        index;


    strategyState.lastEntryType =
        entryType;


    strategyState.tradesInTrend++;


    if (CONFIG.DEBUG) {

        console.log(
            "📈 SMA V4 - ENTRADA:",
            {

                direction:
                    strategyState
                        .trendDirection,

                entryType,

                candleIndex:
                    index,

                tradesInTrend:
                    strategyState
                        .tradesInTrend
            }
        );
    }
}


/*
============================================================
NEUTRAL
============================================================
*/

function neutral() {

    return {

        signal: null,

        score: 0,

        strategy: "sma",

        entryType: null
    };
}


/*
============================================================
SMA STRATEGY V4
============================================================
*/

function smaStrategy(
    candles,
    state = {}
) {

    /*
    ========================================================
    VALIDACIÓN
    ========================================================
    */

    if (
        !Array.isArray(candles) ||
        candles.length <
        CONFIG.SLOW_MA + 5
    ) {

        return neutral();
    }


    const index =
        candles.length - 1;


    /*
    ========================================================
    ACTUALIZAR TENDENCIA
    ========================================================
    */

    const direction =
        updateTrendState(
            candles,
            state,
            index
        );


    if (!direction) {
        return neutral();
    }


    /*
    ========================================================
    DATOS ACTUALES
    ========================================================
    */

    const current =
        getMAData(
            candles,
            index
        );


    if (!current) {
        return neutral();
    }


    /*
    ========================================================
    DISTANCIA MA10 / MA50
    ========================================================
    */

    const distance =
        current.distance;


    /*
    ========================================================
    PRIMERO:
    MA10 REJECTION
    ========================================================

    Lo evaluamos antes que las demás entradas para
    asegurarnos de que el nuevo patrón tenga prioridad.
    */

    const ma10Rejection =
        detectMA10Rejection(
            candles,
            direction
        );


    if (
        ma10Rejection.detected &&
        canEnter(
            state,
            index
        )
    ) {

        registerEntry(
            state,
            index,
            "MA10_REJECTION"
        );


        if (CONFIG.DEBUG) {

            console.log(
                "🎯🎯🎯 SMA V4 - MA10 REJECTION DETECTADO:",
                ma10Rejection
            );
        }


        const result =
            buildSignal({

                signal:
                    direction,

                score: 10,

                strategy:
                    "sma",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                entryType:
                    "MA10_REJECTION",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    round(
                        distance,
                        3
                    ),

                strength:
                    ma10Rejection.strength,

                rejectionDistance:
                    ma10Rejection
                        .distanceToMA10
            });


        return {

            ...result,

            signal:
                direction,

            entryType:
                "MA10_REJECTION",

            rejection:
                ma10Rejection
        };
    }


    /*
    ========================================================
    CONFIRMAR DIRECCIÓN
    ========================================================
    */

    const confirmed =
        directionConfirmed(
            candles,
            direction
        );


    /*
    ========================================================
    ESTADO
    ========================================================
    */

    const strategyState =
        initializeState(state);


    /*
    ========================================================
    SI NO ESTÁ CONFIRMADO
    ========================================================

    Permitimos solamente las primeras velas después
    del cruce.
    */

    if (!confirmed) {

        const candlesFromCross =
            index -
            strategyState.lastCrossIndex;


        if (
            candlesFromCross >
            CONFIG.EARLY_TREND_CANDLES
        ) {

            return neutral();
        }
    }


    /*
    ========================================================
    DISTANCIA EXPANDIÉNDOSE
    ========================================================
    */

    const distanceExpanding =
        isDistanceExpanding(
            candles,
            index
        );


    const distanceChange =
        getDistanceChange(
            candles,
            index
        );


    /*
    ========================================================
    1. CROSS
    ========================================================
    */

    const isCrossCandle =
        strategyState.lastCrossIndex ===
        index;


    if (
        isCrossCandle &&
        distance <=
        CONFIG.EARLY_DISTANCE_MAX &&
        distanceExpanding &&
        canEnter(
            state,
            index
        )
    ) {

        registerEntry(
            state,
            index,
            "CROSS"
        );


        const result =
            buildSignal({

                signal:
                    direction,

                score: 10,

                strategy:
                    "sma",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                entryType:
                    "CROSS",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    round(
                        distance,
                        3
                    ),

                distanceChange:
                    round(
                        distanceChange,
                        3
                    )
            });


        return {

            ...result,

            signal:
                direction,

            entryType:
                "CROSS"
        };
    }


    /*
    ========================================================
    2. EARLY TREND
    ========================================================
    */

    const candlesFromCross =
        index -
        strategyState.lastCrossIndex;


    const earlyTrend =
        strategyState.lastCrossIndex >= 0 &&
        candlesFromCross >= 1 &&
        candlesFromCross <=
        CONFIG.EARLY_TREND_CANDLES;


    if (
        earlyTrend &&
        distance <=
        CONFIG.EARLY_DISTANCE_MAX &&
        distanceExpanding &&
        confirmed &&
        canEnter(
            state,
            index
        )
    ) {

        registerEntry(
            state,
            index,
            "EARLY_TREND"
        );


        const result =
            buildSignal({

                signal:
                    direction,

                score: 9,

                strategy:
                    "sma",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                entryType:
                    "EARLY_TREND",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    round(
                        distance,
                        3
                    ),

                distanceChange:
                    round(
                        distanceChange,
                        3
                    )
            });


        return {

            ...result,

            signal:
                direction,

            entryType:
                "EARLY_TREND"
        };
    }


    /*
    ========================================================
    3. PULLBACK
    ========================================================
    */

    const pullback =
        detectPullback(
            candles,
            direction
        );


    if (
        pullback &&
        canEnter(
            state,
            index
        )
    ) {

        registerEntry(
            state,
            index,
            "PULLBACK"
        );


        const result =
            buildSignal({

                signal:
                    direction,

                score: 9,

                strategy:
                    "sma",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                entryType:
                    "PULLBACK",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    round(
                        distance,
                        3
                    )
            });


        return {

            ...result,

            signal:
                direction,

            entryType:
                "PULLBACK"
        };
    }


    /*
    ========================================================
    4. CONTINUATION
    ========================================================
    */

    const continuation =
        detectContinuation(
            candles,
            direction
        );


    if (
        continuation &&
        distance <=
        CONFIG.EARLY_DISTANCE_MAX &&
        distanceExpanding &&
        canEnter(
            state,
            index
        )
    ) {

        registerEntry(
            state,
            index,
            "CONTINUATION"
        );


        const result =
            buildSignal({

                signal:
                    direction,

                score: 8,

                strategy:
                    "sma",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                entryType:
                    "CONTINUATION",

                ma10:
                    current.ma10,

                ma50:
                    current.ma50,

                distance:
                    round(
                        distance,
                        3
                    ),

                distanceChange:
                    round(
                        distanceChange,
                        3
                    )
            });


        return {

            ...result,

            signal:
                direction,

            entryType:
                "CONTINUATION"
        };
    }


    /*
    ========================================================
    NINGUNA ENTRADA
    ========================================================
    */

    return neutral();
}


/*
============================================================
EXPORT
============================================================
*/

module.exports = smaStrategy;