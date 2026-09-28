const buildSignal = require("../helpers/buildSignal");

/*
============================================================
SMA STRATEGY V4
============================================================

BASE V3:

- MA10
- MA50
- detección de cruces
- múltiples operaciones por tendencia
- CROSS
- EARLY_TREND
- PULLBACK
- CONTINUATION
- separación entre operaciones

NUEVO V4:

- MA10_PRE_REJECTION

La nueva entrada busca:

IMPULSO
   ↓
RETROCESO
   ↓
precio se acerca a MA10
   ↓
todavía NO rompe MA10
   ↓
entrada anticipada
   ↓
continuación

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
    DISTANCIA MA10 / MA50
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
    FUERZA DE VELA
    ========================================================
    */

    MIN_CANDLE_STRENGTH: 0.45,


    /*
    ========================================================
    SEPARACIÓN ENTRE OPERACIONES
    ========================================================
    */

    MIN_CANDLES_BETWEEN_TRADES: 2,


    /*
    ========================================================
    OPERACIONES POR TENDENCIA

    null = ilimitadas
    ========================================================
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
    MA10 REJECTION
    ========================================================
    */

    MA10_REJECTION_ENABLED: true,

    /*
    Distancia máxima del cierre respecto a MA10,
    expresada en rangos promedio.

    0.65 permite entrar un poco antes.
    */

    MA10_REJECTION_DISTANCE: 0.65,


    /*
    Permite que la mecha toque MA10.

    0.25 = 25% del rango promedio.
    */

    MA10_TOUCH_TOLERANCE: 0.25,


    /*
    Fuerza mínima para el rechazo confirmado.
    */

    MA10_REJECTION_MIN_STRENGTH: 0.45,


    /*
    ========================================================
    NUEVO V4

    PRE REJECTION

    No espera la vela contraria.

    Detecta el setup ANTES de la confirmación.
    ========================================================
    */

    MA10_PRE_REJECTION_ENABLED: true,

    /*
    Máxima distancia del precio a MA10
    para considerar que está llegando a la media.
    */

    MA10_PRE_REJECTION_DISTANCE: 0.65,


    /*
    Tolerancia para considerar que la mecha
    llegó a MA10.
    */

    MA10_PRE_REJECTION_TOUCH_TOLERANCE: 0.25,


    /*
    Mínimo número de velas del retroceso.

    Queremos detectar aproximadamente:

    vela 1 → retroceso
    vela 2 → retroceso
    vela 3 → llegada a MA10

    y entrar en la 3.
    */

    MA10_PRE_REJECTION_MIN_PULLBACK: 2,


    /*
    DEBUG
    */

    DEBUG: true
};


/*
============================================================
UTILIDADES
============================================================
*/

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(value, decimals = 4) {

    const factor =
        Math.pow(10, decimals);

    return Math.round(
        number(value) * factor
    ) / factor;
}


/*
============================================================
SMA
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

        sum +=
            number(
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
            number(
                candles[i].high
            );

        const low =
            number(
                candles[i].low
            );

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
DATOS MA
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
DETECTAR CRUCE
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
    CRUCE ALCISTA
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
    CRUCE BAJISTA
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
DISTANCIA MA10 / MA50 SEPARÁNDOSE
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
PULLBACK NORMAL
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
            currentClose >
            ma10;

        const previousAboveMA =
            previousClose >
            ma10;

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
            currentClose <
            ma10;

        const previousBelowMA =
            previousClose <
            ma10;

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
NUEVA FUNCIÓN V4

detectMA10PreRejection()

ESTA ES LA PARTE NUEVA.

NO espera la vela contraria.

Ejemplo PUT:

IMPULSO:

🟥
🟥
🟥

RETROCESO:

🟩
🟩
🟩 ← ENTRAMOS AQUÍ

Luego:

🟥
🟥

============================================================
*/

function detectMA10PreRejection(
    candles,
    direction
) {

    if (
        !CONFIG.MA10_PRE_REJECTION_ENABLED
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


    /*
    ========================================================
    NECESITAMOS AL MENOS:

    i-3
    i-2
    i-1
    i

    ========================================================
    */

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
        ma50Current == null
    ) {
        return {
            detected: false
        };
    }


    /*
    ========================================================
    RANGO
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
    PRECIOS
    ========================================================
    */

    const currentOpen =
        number(current.open);

    const currentClose =
        number(current.close);

    const currentHigh =
        number(current.high);

    const currentLow =
        number(current.low);

    const previousClose =
        number(previous.close);

    const previous2Close =
        number(previous2.close);

    const previous3Close =
        number(previous3.close);


    /*
    ========================================================
    DISTANCIA A MA10
    ========================================================
    */

    const distanceCurrent =
        Math.abs(
            currentClose -
            ma10Current
        ) / avgRange;


    const distancePrevious =
        Math.abs(
            previousClose -
            ma10Previous
        ) / avgRange;


    /*
    ========================================================
    EL PRECIO SE ESTÁ ACERCANDO A MA10
    ========================================================
    */

    const approachingMA10 =
        distanceCurrent <=
        distancePrevious;


    /*
    ========================================================
    ========================================================
    PUT
    ========================================================
    ========================================================
    */

    if (direction === "PUT") {

        /*
        ----------------------------------------------------
        MA10 debe estar debajo de MA50
        ----------------------------------------------------
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
        ----------------------------------------------------
        LAS DOS ÚLTIMAS VELAS DEBEN MOSTRAR RETROCESO
        ----------------------------------------------------

        No exigimos tres velas verdes.

        Esto es importante.

        Queremos poder entrar en la tercera vela
        cuando se acerca a MA10.

        ----------------------------------------------------
        */

        const previousWasBullish =
            previousClose >
            number(previous.open);


        const previous2WasBullish =
            previous2Close >
            number(previous2.open);


        /*
        ----------------------------------------------------
        EL RETROCESO VIENE DESDE ABAJO
        ----------------------------------------------------
        */

        const pullbackDirection =
            previousClose >
            previous2Close;


        /*
        ----------------------------------------------------
        PRECIO TODAVÍA DEBAJO DE MA10
        ----------------------------------------------------
        */

        const belowMA10 =
            currentClose <
            ma10Current;


        /*
        ----------------------------------------------------
        LA MECHA SE ACERCA A MA10
        ----------------------------------------------------
        */

        const touchedMA10 =
            currentHigh >=
            ma10Current -
            avgRange *
            CONFIG.MA10_PRE_REJECTION_TOUCH_TOLERANCE;


        /*
        ----------------------------------------------------
        CIERRE CERCA DE MA10
        ----------------------------------------------------
        */

        const closeToMA10 =
            distanceCurrent <=
            CONFIG.MA10_PRE_REJECTION_DISTANCE;


        /*
        ----------------------------------------------------
        NO QUEREMOS QUE HAYA RUPTURA DE MA10
        ----------------------------------------------------
        */

        const noBreak =
            currentClose <
            ma10Current;


        /*
        ----------------------------------------------------
        LA VELA ACTUAL PUEDE SER:

        🟩
        🟩
        🟩

        O incluso:

        🟩
        🟩
        🟥

        PERO TODAVÍA DEBE ESTAR DEBAJO DE MA10.
        ----------------------------------------------------
        */


        /*
        ----------------------------------------------------
        CONFIRMAR QUE REALMENTE HUBO RETROCESO

        No basta con estar cerca de MA10.
        ----------------------------------------------------
        */

        const realPullback =
            previous2Close >
            previous3Close ||
            previousClose >
            previous2Close;


        if (
            previousWasBullish &&
            previous2WasBullish &&
            pullbackDirection &&
            realPullback &&
            belowMA10 &&
            touchedMA10 &&
            closeToMA10 &&
            approachingMA10 &&
            noBreak
        ) {

            return {

                detected: true,

                direction: "PUT",

                type:
                    "MA10_PRE_REJECTION",

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
                    "Retroceso alcista hacia MA10 sin romperla"
            };
        }
    }


    /*
    ========================================================
    ========================================================
    CALL
    ========================================================
    ========================================================
    */

    if (direction === "CALL") {

        /*
        ----------------------------------------------------
        MA10 encima de MA50
        ----------------------------------------------------
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
        ----------------------------------------------------
        RETROCESO BAJISTA
        ----------------------------------------------------
        */

        const previousWasBearish =
            previousClose <
            number(previous.open);


        const previous2WasBearish =
            previous2Close <
            number(previous2.open);


        const pullbackDirection =
            previousClose <
            previous2Close;


        /*
        ----------------------------------------------------
        PRECIO TODAVÍA ENCIMA DE MA10
        ----------------------------------------------------
        */

        const aboveMA10 =
            currentClose >
            ma10Current;


        /*
        ----------------------------------------------------
        MECHA CERCA DE MA10
        ----------------------------------------------------
        */

        const touchedMA10 =
            currentLow <=
            ma10Current +
            avgRange *
            CONFIG.MA10_PRE_REJECTION_TOUCH_TOLERANCE;


        /*
        ----------------------------------------------------
        CIERRE CERCA DE MA10
        ----------------------------------------------------
        */

        const closeToMA10 =
            distanceCurrent <=
            CONFIG.MA10_PRE_REJECTION_DISTANCE;


        /*
        ----------------------------------------------------
        NO ROMPIÓ MA10
        ----------------------------------------------------
        */

        const noBreak =
            currentClose >
            ma10Current;


        /*
        ----------------------------------------------------
        CONFIRMAR RETROCESO
        ----------------------------------------------------
        */

        const realPullback =
            previous2Close <
            previous3Close ||
            previousClose <
            previous2Close;


        if (
            previousWasBearish &&
            previous2WasBearish &&
            pullbackDirection &&
            realPullback &&
            aboveMA10 &&
            touchedMA10 &&
            closeToMA10 &&
            approachingMA10 &&
            noBreak
        ) {

            return {

                detected: true,

                direction: "CALL",

                type:
                    "MA10_PRE_REJECTION",

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
                    "Retroceso bajista hacia MA10 sin romperla"
            };
        }
    }


    return {
        detected: false
    };
}


/*
============================================================
RECHAZO MA10 CONFIRMADO

ESTA FUNCIÓN SE MANTIENE.

Ahora tenemos DOS TIPOS:

MA10_PRE_REJECTION
    ↓
entrada anticipada

MA10_REJECTION
    ↓
entrada confirmada
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
        CONFIG.SLOW_MA + 3
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

    const ma50Current =
        smaAt(
            candles,
            i,
            CONFIG.SLOW_MA
        );


    if (
        ma10Current == null ||
        ma10Previous == null ||
        ma50Current == null
    ) {
        return {
            detected: false
        };
    }


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


    const currentOpen =
        number(current.open);

    const currentClose =
        number(current.close);

    const currentHigh =
        number(current.high);

    const currentLow =
        number(current.low);

    const previousClose =
        number(previous.close);

    const previous2Close =
        number(previous2.close);


    const strength =
        candleStrength(current);


    const distanceToMA10 =
        Math.abs(
            currentClose -
            ma10Current
        ) / avgRange;


    const previousDistance =
        Math.abs(
            previousClose -
            ma10Previous
        ) / avgRange;


    const movedTowardMA =
        previousDistance >
        distanceToMA10;


    /*
    ========================================================
    PUT
    ========================================================
    */

    if (direction === "PUT") {

        if (
            ma10Current >=
            ma50Current
        ) {
            return {
                detected: false
            };
        }


        const previousWasRecovering =
            previousClose >
            previous2Close;


        const rejectedBelowMA10 =
            currentClose <
            ma10Current;


        const touchedMA10 =
            currentHigh >=
            ma10Current -
            avgRange *
            CONFIG.MA10_TOUCH_TOLERANCE;


        const closeToMA10 =
            distanceToMA10 <=
            CONFIG.MA10_REJECTION_DISTANCE;


        const bearish =
            currentClose <
            currentOpen;


        const rejection =
            rejectedBelowMA10 &&
            touchedMA10 &&
            closeToMA10 &&
            bearish;


        const validPullback =
            previousWasRecovering &&
            movedTowardMA;


        if (
            rejection &&
            validPullback &&
            strength >=
            CONFIG.MA10_REJECTION_MIN_STRENGTH
        ) {

            return {

                detected: true,

                direction: "PUT",

                type:
                    "MA10_REJECTION",

                distanceToMA10:
                    round(
                        distanceToMA10,
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
                    "Retroceso + rechazo bajista confirmado"
            };
        }
    }


    /*
    ========================================================
    CALL
    ========================================================
    */

    if (direction === "CALL") {

        if (
            ma10Current <=
            ma50Current
        ) {
            return {
                detected: false
            };
        }


        const previousWasRecovering =
            previousClose <
            previous2Close;


        const rejectedAboveMA10 =
            currentClose >
            ma10Current;


        const touchedMA10 =
            currentLow <=
            ma10Current +
            avgRange *
            CONFIG.MA10_TOUCH_TOLERANCE;


        const closeToMA10 =
            distanceToMA10 <=
            CONFIG.MA10_REJECTION_DISTANCE;


        const bullish =
            currentClose >
            currentOpen;


        const rejection =
            rejectedAboveMA10 &&
            touchedMA10 &&
            closeToMA10 &&
            bullish;


        const validPullback =
            previousWasRecovering &&
            movedTowardMA;


        if (
            rejection &&
            validPullback &&
            strength >=
            CONFIG.MA10_REJECTION_MIN_STRENGTH
        ) {

            return {

                detected: true,

                direction: "CALL",

                type:
                    "MA10_REJECTION",

                distanceToMA10:
                    round(
                        distanceToMA10,
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
                    "Retroceso + rechazo alcista confirmado"
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

        if (
            ma10 <= ma50
        ) {
            return false;
        }

        const close =
            number(current.close);

        const previousClose =
            number(previous.close);

        const previous2Close =
            number(previous2.close);


        const aboveMA10 =
            close > ma10;

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

        if (
            ma10 >= ma50
        ) {
            return false;
        }

        const close =
            number(current.close);

        const previousClose =
            number(previous.close);

        const previous2Close =
            number(previous2.close);


        const belowMA10 =
            close < ma10;

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
    NUEVO CRUCE
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
                "📊 SMA V4 - NUEVO CRUCE:",
                {
                    direction: cross,
                    index
                }
            );
        }

        return cross;
    }


    /*
    ========================================================
    SI TODAVÍA NO TENEMOS TENDENCIA
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


    return strategyState.trendDirection;
}


/*
============================================================
PODEMOS ENTRAR
============================================================
*/

function canEnter(
    state,
    index
) {

    const strategyState =
        initializeState(state);


    const candlesSinceLastEntry =
        index -
        strategyState.lastEntryIndex;


    /*
    ========================================================
    SEPARACIÓN
    ========================================================
    */

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
SEÑAL NEUTRAL
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


    const distance =
        current.distance;


    /*
    ========================================================
    ========================================================
    NUEVO:

    MA10 PRE REJECTION

    ESTA SE EVALÚA PRIMERO.

    Así entramos ANTES de la confirmación.
    ========================================================
    ========================================================
    */

    const ma10PreRejection =
        detectMA10PreRejection(
            candles,
            direction
        );


    if (
        ma10PreRejection.detected &&
        canEnter(
            state,
            index
        )
    ) {

        registerEntry(
            state,
            index,
            "MA10_PRE_REJECTION"
        );


        if (CONFIG.DEBUG) {

            console.log(
                "⚡ SMA V4 - MA10 PRE REJECTION:",
                {

                    direction,

                    ...ma10PreRejection,

                    candleIndex:
                        index
                }
            );
        }


        const result =
            buildSignal({

                signal:
                    direction,

                score: 10,

                strategy: "sma",

                trend:
                    direction === "CALL"
                        ? "UP"
                        : "DOWN",

                entryType:
                    "MA10_PRE_REJECTION",

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
                    candleStrength(
                        candles[index]
                    )
            });


        return {

            ...result,

            signal:
                direction,

            entryType:
                "MA10_PRE_REJECTION",

            rejection:
                ma10PreRejection
        };
    }


    /*
    ========================================================
    RECHAZO MA10 CONFIRMADO
    ========================================================
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
                "🎯 SMA V4 - MA10 REJECTION:",
                {

                    direction,

                    ...ma10Rejection,

                    candleIndex:
                        index
                }
            );
        }


        const result =
            buildSignal({

                signal:
                    direction,

                score: 10,

                strategy: "sma",

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
                    ma10Rejection.strength
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
    EARLY TREND
    ========================================================
    */

    const strategyState =
        initializeState(state);


    const candlesFromCross =
        index -
        strategyState.lastCrossIndex;


    /*
    ========================================================
    Si no está confirmado y ya pasaron
    demasiadas velas desde el cruce,
    no hacemos EARLY.
    ========================================================
    */

    if (!confirmed) {

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
    CROSS
    ========================================================
    */

    const isCrossCandle =
        strategyState
            .lastCrossIndex ===
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

                strategy: "sma",

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
    EARLY TREND
    ========================================================
    */

    const earlyTrend =
        strategyState
            .lastCrossIndex >= 0 &&
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

                strategy: "sma",

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
    PULLBACK
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

                strategy: "sma",

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
    CONTINUATION
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

                strategy: "sma",

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
    SIN ENTRADA
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