const buildSignal = require("../helpers/buildSignal");

/*
============================================================
 SMA STRATEGY V2
============================================================

 OBJETIVO:

 Evitar entradas tardías después del cruce MA10 / MA50.

 ESTRUCTURA:

                  CRUCE
                    │
                    ▼
          ¿MA10/MA50 separándose?
               /          \
             SI            NO
             │              │
             ▼              ▼
      ¿distancia < 1.5?   ESPERAR
          /      \
        SI        NO
        │          │
        ▼          ▼
     ENTRAR    ¿PULLBACK?
                    │
                   SI
                    │
                    ▼
                 ENTRAR


 TIPOS DE ENTRADA:

 CROSS
 PULLBACK
 NONE


 MA10 = movimiento rápido
 MA50 = estructura principal

 La distancia entre las medias se normaliza
 utilizando el rango promedio de las últimas velas.

 Ejemplo:

 MA10 = 42300
 MA50 = 42100
 distancia = 200

 avgRange = 100

 normalizedDistance = 200 / 100 = 2.0

 Si > 1.5:
    NO entrar inmediatamente.
    Esperar pullback.

============================================================
*/


const CONFIG = {

    // --------------------------------------------------------
    // MEDIAS
    // --------------------------------------------------------

    FAST_MA: 10,

    SLOW_MA: 50,


    // --------------------------------------------------------
    // RANGO PROMEDIO
    // --------------------------------------------------------

    RANGE_PERIOD: 10,


    // --------------------------------------------------------
    // DISTANCIA MÁXIMA PARA ENTRADA TEMPRANA
    //
    // distancia MA10-MA50 / avgRange
    // --------------------------------------------------------

    MAX_EARLY_DISTANCE: 1.5,


    // --------------------------------------------------------
    // CUÁNTAS VELAS DESPUÉS DEL CRUCE TODAVÍA
    // CONSIDERAMOS QUE ESTAMOS EN LA FASE INICIAL
    // --------------------------------------------------------

    MAX_CROSS_AGE: 2,


    // --------------------------------------------------------
    // PULLBACK
    //
    // Qué tan cerca debe estar el precio de MA10.
    // --------------------------------------------------------

    PULLBACK_DISTANCE: 0.50,


    // --------------------------------------------------------
    // FUERZA MÍNIMA DE LA VELA
    // --------------------------------------------------------

    MIN_CANDLE_STRENGTH: 0.50,


    // --------------------------------------------------------
    // PENDIENTE MÍNIMA
    // --------------------------------------------------------

    MIN_SLOPE: 0,


    // --------------------------------------------------------
    // LOOKBACK PARA MEDIR EXPANSIÓN
    // --------------------------------------------------------

    DISTANCE_LOOKBACK: 2,


    // --------------------------------------------------------
    // DEBUG
    // --------------------------------------------------------

    DEBUG: true
};


// ============================================================
// NUMBER
// ============================================================

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


// ============================================================
// ROUND
// ============================================================

function round(value, decimals = 4) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return 0;
    }

    return Number(
        n.toFixed(decimals)
    );
}


// ============================================================
// SMA
// ============================================================

function calculateSMA(candles, period) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {
        return null;
    }

    let sum = 0;

    const start =
        candles.length - period;

    for (
        let i = start;
        i < candles.length;
        i++
    ) {

        const close =
            Number(candles[i]?.close);

        if (!Number.isFinite(close)) {
            return null;
        }

        sum += close;
    }

    return sum / period;
}


// ============================================================
// SMA EN UNA POSICIÓN ESPECÍFICA
//
// Necesario para detectar exactamente cuándo ocurrió
// el cruce.
// ============================================================

function smaAt(
    candles,
    index,
    period
) {

    if (
        !Array.isArray(candles)
    ) {
        return null;
    }

    if (
        index < period - 1
    ) {
        return null;
    }

    let sum = 0;

    const start =
        index - period + 1;

    for (
        let i = start;
        i <= index;
        i++
    ) {

        const close =
            Number(candles[i]?.close);

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

function averageRange(
    candles,
    period
) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {
        return null;
    }

    const start =
        candles.length - period;

    let total = 0;

    let count = 0;

    for (
        let i = start;
        i < candles.length;
        i++
    ) {

        const high =
            Number(candles[i]?.high);

        const low =
            Number(candles[i]?.low);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {
            continue;
        }

        const range =
            high - low;

        if (range <= 0) {
            continue;
        }

        total += range;

        count++;
    }

    if (!count) {
        return null;
    }

    return total / count;
}


// ============================================================
// RANGO PROMEDIO EN UNA POSICIÓN
//
// Para calcular distancia histórica correctamente.
// ============================================================

function averageRangeAt(
    candles,
    index,
    period
) {

    if (
        index < period - 1
    ) {
        return null;
    }

    let total = 0;

    let count = 0;

    const start =
        index - period + 1;

    for (
        let i = start;
        i <= index;
        i++
    ) {

        const high =
            Number(candles[i]?.high);

        const low =
            Number(candles[i]?.low);

        if (
            !Number.isFinite(high) ||
            !Number.isFinite(low)
        ) {
            continue;
        }

        const range =
            high - low;

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
// CANDLE STRENGTH
// ============================================================

function candleStrength(candle) {

    if (!candle) {
        return 0;
    }

    const open =
        Number(candle.open);

    const close =
        Number(candle.close);

    const high =
        Number(candle.high);

    const low =
        Number(candle.low);

    if (
        !Number.isFinite(open) ||
        !Number.isFinite(close) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low)
    ) {
        return 0;
    }

    const range =
        high - low;

    if (range <= 0) {
        return 0;
    }

    return Math.min(
        1,
        Math.abs(close - open) / range
    );
}


// ============================================================
// BULLISH / BEARISH
// ============================================================

function isBullish(candle) {

    return (
        Number(candle?.close) >
        Number(candle?.open)
    );
}


function isBearish(candle) {

    return (
        Number(candle?.close) <
        Number(candle?.open)
    );
}


// ============================================================
// DISTANCIA MA10 / MA50
// ============================================================

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
        ma10 === null ||
        ma50 === null
    ) {
        return null;
    }

    const avgRange =
        averageRangeAt(
            candles,
            index,
            CONFIG.RANGE_PERIOD
        );

    if (
        !avgRange ||
        avgRange <= 0
    ) {
        return null;
    }

    const distance =
        Math.abs(
            ma10 - ma50
        );

    const normalizedDistance =
        distance / avgRange;

    return {

        ma10,

        ma50,

        avgRange,

        distance,

        normalizedDistance
    };
}


// ============================================================
// DETECTAR CRUCE
//
// Devuelve:
// CALL = cruce alcista
// PUT  = cruce bajista
// null = no hay cruce
// ============================================================

function detectCross(
    candles,
    index
) {

    if (index <= 0) {
        return null;
    }

    const current =
        getMAData(
            candles,
            index
        );

    const previous =
        getMAData(
            candles,
            index - 1
        );

    if (
        !current ||
        !previous
    ) {
        return null;
    }


    // --------------------------------------------------------
    // CROSS ALCISTA
    // --------------------------------------------------------

    const bullishCross =
        previous.ma10 <=
        previous.ma50 &&

        current.ma10 >
        current.ma50;


    if (bullishCross) {
        return "CALL";
    }


    // --------------------------------------------------------
    // CROSS BAJISTA
    // --------------------------------------------------------

    const bearishCross =
        previous.ma10 >=
        previous.ma50 &&

        current.ma10 <
        current.ma50;


    if (bearishCross) {
        return "PUT";
    }


    return null;
}


// ============================================================
// ENCONTRAR ÚLTIMO CRUCE
// ============================================================

function findLatestCross(
    candles
) {

    const lastIndex =
        candles.length - 1;

    const start =
        Math.max(
            CONFIG.SLOW_MA,
            lastIndex -
            CONFIG.MAX_CROSS_AGE -
            2
        );


    for (
        let i = lastIndex;
        i >= start;
        i--
    ) {

        const cross =
            detectCross(
                candles,
                i
            );

        if (cross) {

            return {

                direction:
                    cross,

                index:
                    i,

                candlesSinceCross:
                    lastIndex - i
            };
        }
    }

    return null;
}


// ============================================================
// ¿DISTANCIA SE ESTÁ EXPANDIENDO?
//
// Comparamos distancia actual contra distancia de hace
// DISTANCE_LOOKBACK velas.
// ============================================================

function isDistanceExpanding(
    candles
) {

    const currentIndex =
        candles.length - 1;

    const previousIndex =
        currentIndex -
        CONFIG.DISTANCE_LOOKBACK;

    if (
        previousIndex < CONFIG.SLOW_MA
    ) {
        return false;
    }

    const current =
        getMAData(
            candles,
            currentIndex
        );

    const previous =
        getMAData(
            candles,
            previousIndex
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


// ============================================================
// CAMBIO DE DISTANCIA
// ============================================================

function distanceChange(
    candles
) {

    const currentIndex =
        candles.length - 1;

    const previousIndex =
        currentIndex -
        CONFIG.DISTANCE_LOOKBACK;

    if (
        previousIndex < CONFIG.SLOW_MA
    ) {
        return 0;
    }

    const current =
        getMAData(
            candles,
            currentIndex
        );

    const previous =
        getMAData(
            candles,
            previousIndex
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


// ============================================================
// PULLBACK
//
// Después del cruce y cuando la distancia ya es grande:
//
// PUT:
// precio vuelve hacia MA10 desde abajo
// y la última vela vuelve a rechazar hacia abajo.
//
// CALL:
// precio vuelve hacia MA10 desde arriba
// y la última vela vuelve a rechazar hacia arriba.
// ============================================================

function detectPullback(
    candles,
    direction,
    maData
) {

    const last =
        candles.at(-1);

    const previous =
        candles.at(-2);

    if (
        !last ||
        !previous ||
        !maData
    ) {
        return false;
    }

    const ma10 =
        maData.ma10;

    const avgRange =
        maData.avgRange;

    const price =
        Number(last.close);

    const previousClose =
        Number(previous.close);

    const distanceToMA10 =
        Math.abs(
            price - ma10
        );

    const normalizedToMA10 =
        distanceToMA10 /
        avgRange;


    // ========================================================
    // PULLBACK PUT
    // ========================================================

    if (
        direction === "PUT"
    ) {

        /*
        Precio estaba debajo de MA10,
        se acerca a MA10,
        pero la última vela rechaza hacia abajo.
        */

        const previousBelowMA10 =
            previousClose <
            ma10;

        const priceBelowMA10 =
            price <
            ma10;

        const nearMA10 =
            normalizedToMA10 <=
            CONFIG.PULLBACK_DISTANCE;

        const bearishRejection =
            isBearish(last);

        return (
            previousBelowMA10 &&
            priceBelowMA10 &&
            nearMA10 &&
            bearishRejection
        );
    }


    // ========================================================
    // PULLBACK CALL
    // ========================================================

    if (
        direction === "CALL"
    ) {

        const previousAboveMA10 =
            previousClose >
            ma10;

        const priceAboveMA10 =
            price >
            ma10;

        const nearMA10 =
            normalizedToMA10 <=
            CONFIG.PULLBACK_DISTANCE;

        const bullishRejection =
            isBullish(last);

        return (
            previousAboveMA10 &&
            priceAboveMA10 &&
            nearMA10 &&
            bullishRejection
        );
    }


    return false;
}


// ============================================================
// CONFIRMACIÓN DE DIRECCIÓN
// ============================================================

function directionConfirmed(
    candles,
    direction,
    maData
) {

    const last =
        candles.at(-1);

    if (
        !last ||
        !maData
    ) {
        return false;
    }

    const strength =
        candleStrength(last);


    if (
        strength <
        CONFIG.MIN_CANDLE_STRENGTH
    ) {
        return false;
    }


    // --------------------------------------------------------
    // CALL
    // --------------------------------------------------------

    if (
        direction === "CALL"
    ) {

        return (
            maData.ma10 >
            maData.ma50 &&

            isBullish(last)
        );
    }


    // --------------------------------------------------------
    // PUT
    // --------------------------------------------------------

    if (
        direction === "PUT"
    ) {

        return (
            maData.ma10 <
            maData.ma50 &&

            isBearish(last)
        );
    }


    return false;
}


// ============================================================
// NEUTRAL
// ============================================================

function neutral(
    data = {}
) {

    return buildSignal({

        strategy:
            "smaStrategy",

        signal:
            null,

        score:
            0,

        trend:
            false,

        bos:
            false,

        pullback:
            false,

        momentum:
            false,

        strength:
            data.strength ?? 0,

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

        callScore:
            0,

        putScore:
            0,

        sma:
            data.ma10 ?? null,

        ...data
    });
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
        !Array.isArray(candles)
    ) {

        return neutral();
    }


    if (
        candles.length <
        CONFIG.SLOW_MA + 3
    ) {

        console.log(
            "⏳ SMA V2 - ESPERANDO HISTORIAL",
            {
                actual:
                    candles.length,

                necesario:
                    CONFIG.SLOW_MA + 3
            }
        );

        return neutral();
    }


    const lastIndex =
        candles.length - 1;


    const last =
        candles.at(-1);

    const previous =
        candles.at(-2);


    // ========================================================
    // DATOS ACTUALES
    // ========================================================

    const maData =
        getMAData(
            candles,
            lastIndex
        );


    if (!maData) {

        return neutral();
    }


    const {

        ma10,

        ma50,

        avgRange,

        distance,

        normalizedDistance

    } = maData;


    // ========================================================
    // PENDIENTE MA10
    // ========================================================

    const previousMA =
        getMAData(
            candles,
            lastIndex - 1
        );


    if (!previousMA) {

        return neutral();
    }


    const ma10Slope =
        ma10 -
        previousMA.ma10;


    const ma50Slope =
        ma50 -
        previousMA.ma50;


    // ========================================================
    // EXPANSIÓN
    // ========================================================

    const distanceExpanding =
        isDistanceExpanding(
            candles
        );


    const distChange =
        distanceChange(
            candles
        );


    // ========================================================
    // ÚLTIMO CRUCE
    // ========================================================

    const latestCross =
        findLatestCross(
            candles
        );


    // ========================================================
    // ESTADO DEL MERCADO
    // ========================================================

    let marketState =
        "WAIT";


    if (
        ma10 >
        ma50
    ) {

        marketState =
            "BULLISH";

    } else if (
        ma10 <
        ma50
    ) {

        marketState =
            "BEARISH";
    }


    // ========================================================
    // DIRECCIÓN DEL CRUCE
    // ========================================================

    let crossDirection =
        latestCross?.direction ??
        null;


    let candlesSinceCross =
        latestCross?.candlesSinceCross ??
        null;


    // ========================================================
    // CROSS ACTUAL
    // ========================================================

    const currentCross =
        detectCross(
            candles,
            lastIndex
        );


    // ========================================================
    // ENTRADA CROSS
    //
    // SOLAMENTE SI:
    //
    // 1. El cruce acaba de ocurrir
    // 2. MA10/MA50 se están separando
    // 3. distancia < 1.5
    // 4. vela confirma dirección
    // ========================================================

    let crossEntry =
        false;


    if (
        currentCross
    ) {

        const currentDirection =
            currentCross;


        const directionOk =
            directionConfirmed(
                candles,
                currentDirection,
                maData
            );


        if (
            directionOk &&
            distanceExpanding &&
            normalizedDistance <
            CONFIG.MAX_EARLY_DISTANCE
        ) {

            crossEntry =
                true;

            crossDirection =
                currentDirection;

            candlesSinceCross =
                0;
        }
    }


    // ========================================================
    // CROSS RECIENTE
    //
    // Permite una confirmación en la siguiente vela.
    // ========================================================

    if (
        !crossEntry &&
        latestCross &&
        candlesSinceCross <=
        CONFIG.MAX_CROSS_AGE
    ) {

        const direction =
            latestCross.direction;


        const directionOk =
            directionConfirmed(
                candles,
                direction,
                maData
            );


        if (
            directionOk &&
            distanceExpanding &&
            normalizedDistance <
            CONFIG.MAX_EARLY_DISTANCE
        ) {

            crossEntry =
                true;
        }
    }


    // ========================================================
    // PULLBACK
    //
    // Si la distancia ya es > 1.5:
    //
    // NO perseguimos el precio.
    //
    // Esperamos que vuelva hacia MA10.
    // ========================================================

    let pullbackEntry =
        false;


    if (
        !crossEntry &&
        latestCross &&
        latestCross.candlesSinceCross <= 10 &&
        normalizedDistance >=
        CONFIG.MAX_EARLY_DISTANCE
    ) {

        const direction =
            latestCross.direction;


        const pullback =
            detectPullback(
                candles,
                direction,
                maData
            );


        if (
            pullback
        ) {

            pullbackEntry =
                true;

            crossDirection =
                direction;
        }
    }


    // ========================================================
    // RESULTADO
    // ========================================================

    let signal =
        null;


    let entryType =
        "NONE";


    // ========================================================
    // CROSS
    // ========================================================

    if (
        crossEntry
    ) {

        signal =
            crossDirection;

        entryType =
            "CROSS";
    }


    // ========================================================
    // PULLBACK
    // ========================================================

    else if (
        pullbackEntry
    ) {

        signal =
            crossDirection;

        entryType =
            "PULLBACK";
    }


    // ========================================================
    // SCORE INFORMATIVO
    //
    // NO DECIDE LA ENTRADA.
    // ========================================================

    let callScore =
        0;

    let putScore =
        0;


    if (
        ma10 >
        ma50
    ) {

        callScore += 3;
    }


    if (
        ma10 <
        ma50
    ) {

        putScore += 3;
    }


    if (
        ma10Slope >
        CONFIG.MIN_SLOPE
    ) {

        callScore += 2;
    }


    if (
        ma10Slope <
        -CONFIG.MIN_SLOPE
    ) {

        putScore += 2;
    }


    if (
        distanceExpanding
    ) {

        if (
            ma10 >
            ma50
        ) {

            callScore += 2;

        } else if (
            ma10 <
            ma50
        ) {

            putScore += 2;
        }
    }


    if (
        crossEntry
    ) {

        if (
            signal === "CALL"
        ) {

            callScore += 3;

        } else if (
            signal === "PUT"
        ) {

            putScore += 3;
        }
    }


    if (
        pullbackEntry
    ) {

        if (
            signal === "CALL"
        ) {

            callScore += 3;

        } else if (
            signal === "PUT"
        ) {

            putScore += 3;
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
            "📊 SMA STRATEGY V2"
        );

        console.log(
            "================================================"
        );

        console.log({

            signal,

            entryType,

            marketState,

            crossDirection,

            currentCross,

            candlesSinceCross,

            price:
                round(
                    Number(last.close)
                ),

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

            maDistance:
                round(distance),

            normalizedDistance:
                round(
                    normalizedDistance
                ),

            distanceChange:
                round(distChange),

            distanceExpanding,

            crossEntry,

            pullbackEntry,

            candleStrength:
                round(
                    candleStrength(last)
                ),

            callScore,

            putScore,

            score
        });

        console.log(
            "================================================"
        );
    }


    // ========================================================
    // NO TRADE
    // ========================================================

    if (
        !signal
    ) {

        console.log(
            "⚪ SMA V2 → NO TRADE",
            {
                marketState,
                normalizedDistance:
                    round(
                        normalizedDistance
                    ),
                distanceExpanding,
                latestCross:
                    latestCross
                        ? {
                            direction:
                                latestCross.direction,

                            candlesSinceCross:
                                latestCross.candlesSinceCross
                        }
                        : null
            }
        );
    }


    // ========================================================
    // TRADE
    // ========================================================

    if (
        signal
    ) {

        console.log(
            signal === "CALL"
                ? "🟢 SMA V2 → CALL"
                : "🔴 SMA V2 → PUT"
        );

        console.log(
            "🎯 ENTRY TYPE:",
            entryType
        );

        console.log(
            "📏 MA DISTANCE:",
            round(
                normalizedDistance
            )
        );

        console.log(
            "⏱️ CANDLES SINCE CROSS:",
            candlesSinceCross
        );
    }


    // ========================================================
    // BUILD SIGNAL
    // ========================================================

    const result =
        buildSignal({

            strategy:
                "smaStrategy",

            signal,

            score,

            trend:
                signal === "CALL"
                    ? ma10 > ma50
                    : signal === "PUT"
                        ? ma10 < ma50
                        : false,

            bos:
                false,

            pullback:
                pullbackEntry,

            momentum:
                distanceExpanding,

            strength:
                candleStrength(last),

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

            callScore,

            putScore,

            sma:
                ma10
        });


    // ========================================================
    // METADATA
    //
    // Estos campos nos servirán para analizar posteriormente
    // exactamente por qué entró el bot.
    // ========================================================

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

        maDistance:
            round(distance),

        normalizedDistance:
            round(
                normalizedDistance
            ),

        distanceChange:
            round(distChange),

        distanceExpanding,

        marketState,

        crossDirection,

        currentCross,

        candlesSinceCross,

        entryType,

        crossEntry,

        pullbackEntry,

        candleStrength:
            round(
                candleStrength(last)
            )
    };
}


// ============================================================
// EXPORT
// ============================================================

module.exports = smaStrategy;