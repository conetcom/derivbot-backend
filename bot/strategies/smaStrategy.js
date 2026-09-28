// ============================================================
// SMA STRATEGY V5
// ============================================================
//
// MA10 / MA50
//
// ENTRADAS CONSERVADAS:
//
// 1. MA_REJECTION
// 2. PULLBACK
// 3. CONTINUATION
//
// NUEVOS DETECTORES:
//
// 4. MA10 SLOPE
// 5. MA50 LATERAL
// 6. DIRECTION CHANGE
// 7. CANDLE SEQUENCE
// 8. MA50 SYMMETRY
// 9. MA10 MEAN REVERSION
//
// NUEVAS MÉTRICAS:
//
// ma10Distance
// ma50Distance
// maDistance
// maDistanceRatio
// symmetryClass
//
// ============================================================


const buildSignal =
    require("../helpers/buildSignal");


// ============================================================
// CONFIG
// ============================================================

const CONFIG = {

    // --------------------------------------------------------
    // MOVING AVERAGES
    // --------------------------------------------------------

    FAST_MA: 10,

    SLOW_MA: 50,


    // --------------------------------------------------------
    // RANGO
    // --------------------------------------------------------

    RANGE_PERIOD: 10,


    // --------------------------------------------------------
    // DISTANCIA / PULLBACK
    // --------------------------------------------------------

    RETRACEMENT_MAX_DISTANCE: 1.50,

    MA10_ZONE_DISTANCE: 1.00,

    MA50_ZONE_DISTANCE: 0.75,


    // --------------------------------------------------------
    // CONFIRMACIÓN
    // --------------------------------------------------------

    MIN_CANDLE_STRENGTH: 0.25,


    // --------------------------------------------------------
    // SEPARACIÓN ENTRE OPERACIONES
    // --------------------------------------------------------

    MIN_CANDLES_BETWEEN_TRADES: 2,

    MAX_TRADES_PER_TREND: null,


    // --------------------------------------------------------
    // LOOKBACK
    // --------------------------------------------------------

    RETRACEMENT_LOOKBACK: 4,

    CONTINUATION_LOOKBACK: 3,


    // --------------------------------------------------------
    // MA REJECTION
    // --------------------------------------------------------

    MA_REJECTION_ENABLED: true,

    MA_REJECTION_MIN_STRENGTH: 0.20,

    MA_REJECTION_REQUIRE_TOUCH: false,


    // ========================================================
    // NUEVO V5
    // ========================================================


    // --------------------------------------------------------
    // MA10 SLOPE
    // --------------------------------------------------------

    MA10_SLOPE_LOOKBACK: 3,

    MA10_SLOPE_MIN: 0.08,

    MA10_STRONG_SLOPE: 0.20,


    // --------------------------------------------------------
    // MA50 LATERAL
    // --------------------------------------------------------

    MA50_SLOPE_LOOKBACK: 5,

    MA50_LATERAL_MAX: 0.18,


    // --------------------------------------------------------
    // CAMBIO DE DIRECCIÓN
    // --------------------------------------------------------

    DIRECTION_CHANGE_LOOKBACK: 3,

    DIRECTION_CHANGE_MIN_SLOPE: 0.08,


    // --------------------------------------------------------
    // SECUENCIA DE VELAS
    // --------------------------------------------------------

    MIN_SEQUENCE: 2,

    MAX_SEQUENCE: 5,

    MIN_SEQUENCE_STRENGTH: 0.30,


    // --------------------------------------------------------
    // REVERSIÓN / EXTENSIÓN
    // --------------------------------------------------------

    MA50_SYMMETRY_THRESHOLD: 1.10,

    MA50_SYMMETRY_STRONG: 1.50,

    MA50_SYMMETRY_EXTREME: 2.00,


    // --------------------------------------------------------
    // MEAN REVERSION
    // --------------------------------------------------------

    MA10_MEAN_REVERSION_ENABLED: true,

    MA10_MEAN_REVERSION_MIN_RATIO: 1.25,

    MA10_MEAN_REVERSION_MIN_STRENGTH: 0.20,


    // --------------------------------------------------------
    // PRE REJECTION
    // --------------------------------------------------------

    MA10_PRE_REJECTION_ENABLED: true,

    MA10_PRE_REJECTION_MIN_RATIO: 1.25,

    MA10_PRE_REJECTION_MIN_STRENGTH: 0.20,


    // --------------------------------------------------------
    // DEBUG
    // --------------------------------------------------------

    DEBUG: true
};


// ============================================================
// UTILIDADES
// ============================================================

function number(
    value,
    fallback = 0
) {

    const n =
        Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function round(
    value,
    decimals = 4
) {

    const factor =
        Math.pow(
            10,
            decimals
        );

    return Math.round(
        number(value) *
        factor
    ) / factor;
}


// ============================================================
// SMA
// ============================================================

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


    let sum = 0;


    for (
        let i = index - period + 1;
        i <= index;
        i++
    ) {

        sum +=
            number(
                candles[i]?.close
            );
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


    const start =
        Math.max(
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

        const high =
            number(
                candles[i]?.high
            );

        const low =
            number(
                candles[i]?.low
            );


        const range =
            high - low;


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

function candleStrength(
    candle
) {

    const open =
        number(
            candle?.open
        );

    const close =
        number(
            candle?.close
        );

    const high =
        number(
            candle?.high
        );

    const low =
        number(
            candle?.low
        );


    const range =
        high - low;


    if (
        range <= 0
    ) {

        return 0;
    }


    const body =
        Math.abs(
            close - open
        );


    return body / range;
}


// ============================================================
// DIRECCIÓN VELA
// ============================================================

function isBullish(
    candle
) {

    return (
        number(candle?.close) >
        number(candle?.open)
    );
}


function isBearish(
    candle
) {

    return (
        number(candle?.close) <
        number(candle?.open)
    );
}


// ============================================================
// CLASIFICAR SIMETRÍA
// ============================================================

function classifyMA50Symmetry(
    ratio
) {

    if (
        ratio < 0.80
    ) {

        return "NORMAL";
    }


    if (
        ratio < 1.00
    ) {

        return "NEAR_MA10";
    }


    if (
        ratio < 1.25
    ) {

        return "EXTENSION_LOW";
    }


    if (
        ratio < 1.50
    ) {

        return "EXTENSION_MEDIUM";
    }


    if (
        ratio < 2.00
    ) {

        return "EXTENSION_HIGH";
    }


    return "EXTENSION_EXTREME";
}


// ============================================================
// DATOS PRINCIPALES MA
// ============================================================
//
// IMPORTANTE:
//
// Aquí calculamos las tres distancias.
//
// CLOSE
//   │
//   │ ma10Distance
//   │
// MA10
//   │
//   │ maDistance
//   │
// MA50
//
// ma50Distance = CLOSE -> MA50
//
// ratio = ma50Distance / maDistance
//
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


    if (
        !avgRange
    ) {

        return null;
    }


    const close =
        number(
            candles[index]?.close
        );


    // --------------------------------------------------------
    // DISTANCIA CLOSE -> MA10
    // --------------------------------------------------------

    const ma10Distance =
        Math.abs(
            close - ma10
        );


    // --------------------------------------------------------
    // DISTANCIA CLOSE -> MA50
    // --------------------------------------------------------

    const ma50Distance =
        Math.abs(
            close - ma50
        );


    // --------------------------------------------------------
    // DISTANCIA MA10 -> MA50
    // --------------------------------------------------------

    const maDistance =
        Math.abs(
            ma10 - ma50
        );


    // --------------------------------------------------------
    // RATIO
    // --------------------------------------------------------

    let maDistanceRatio = 0;


    if (
        maDistance > 0
    ) {

        maDistanceRatio =
            ma50Distance /
            maDistance;
    }


    const symmetryClass =
        classifyMA50Symmetry(
            maDistanceRatio
        );


    // --------------------------------------------------------
    // DISTANCIAS NORMALIZADAS
    // --------------------------------------------------------

    const ma10DistanceNormalized =
        ma10Distance /
        avgRange;


    const ma50DistanceNormalized =
        ma50Distance /
        avgRange;


    const maDistanceNormalized =
        maDistance /
        avgRange;


    return {

        ma10,

        ma50,

        close,

        avgRange,


        // --------------------------------------------
        // DISTANCIAS ABSOLUTAS
        // --------------------------------------------

        ma10Distance:
            round(
                ma10Distance,
                6
            ),

        ma50Distance:
            round(
                ma50Distance,
                6
            ),

        maDistance:
            round(
                maDistance,
                6
            ),


        // --------------------------------------------
        // RATIO
        // --------------------------------------------

        maDistanceRatio:
            round(
                maDistanceRatio,
                4
            ),


        symmetryClass,


        // --------------------------------------------
        // DISTANCIAS NORMALIZADAS
        // --------------------------------------------

        ma10DistanceNormalized:
            round(
                ma10DistanceNormalized,
                4
            ),

        ma50DistanceNormalized:
            round(
                ma50DistanceNormalized,
                4
            ),

        maDistanceNormalized:
            round(
                maDistanceNormalized,
                4
            ),


        // --------------------------------------------
        // POSICIÓN
        // --------------------------------------------

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
// CROSS MA10 / MA50
// ============================================================

function detectCross(
    candles,
    index
) {

    if (
        index <
        CONFIG.SLOW_MA
    ) {

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


    // CALL

    if (
        previous.ma10 <=
            previous.ma50 &&
        current.ma10 >
            current.ma50
    ) {

        return "CALL";
    }


    // PUT

    if (
        previous.ma10 >=
            previous.ma50 &&
        current.ma10 <
            current.ma50
    ) {

        return "PUT";
    }


    return null;
}


// ============================================================
// TENDENCIA
// ============================================================

function getTrend(
    candles,
    index
) {

    const data =
        getMAData(
            candles,
            index
        );


    if (!data) {

        return null;
    }


    if (
        data.ma10 >
        data.ma50
    ) {

        return "CALL";
    }


    if (
        data.ma10 <
        data.ma50
    ) {

        return "PUT";
    }


    return null;
}


// ============================================================
// DISTANCIA MA10
// ============================================================

function getDistance(
    candles,
    index
) {

    const data =
        getMAData(
            candles,
            index
        );


    return data
        ? data.distance
        : null;
}


// ============================================================
// DISTANCIA EXPANDIÉNDOSE
// ============================================================

function isDistanceExpanding(
    candles,
    index
) {

    if (
        index < 2
    ) {

        return false;
    }


    const d0 =
        getDistance(
            candles,
            index
        );

    const d1 =
        getDistance(
            candles,
            index - 1
        );


    if (
        d0 == null ||
        d1 == null
    ) {

        return false;
    }


    return d0 > d1;
}


// ============================================================
// DISTANCIA CONTRAYÉNDOSE
// ============================================================

function isDistanceContracting(
    candles,
    index
) {

    if (
        index < 1
    ) {

        return false;
    }


    const d0 =
        getDistance(
            candles,
            index
        );

    const d1 =
        getDistance(
            candles,
            index - 1
        );


    if (
        d0 == null ||
        d1 == null
    ) {

        return false;
    }


    return d0 < d1;
}


// ============================================================
// NUEVO V5
// PENDIENTE MA10
// ============================================================

function detectMA10Slope(
    candles,
    index
) {

    const lookback =
        CONFIG.MA10_SLOPE_LOOKBACK;


    if (
        index <
        CONFIG.FAST_MA +
        lookback
    ) {

        return {

            direction: "FLAT",

            slope: 0,

            previousSlope: 0,

            acceleration: 0,

            strong: false
        };
    }


    const currentMA =
        smaAt(
            candles,
            index,
            CONFIG.FAST_MA
        );


    const previousMA =
        smaAt(
            candles,
            index - lookback,
            CONFIG.FAST_MA
        );


    const previousCurrent =
        smaAt(
            candles,
            index - 1,
            CONFIG.FAST_MA
        );


    const previousPrevious =
        smaAt(
            candles,
            index - 1 - lookback,
            CONFIG.FAST_MA
        );


    if (
        currentMA == null ||
        previousMA == null ||
        previousCurrent == null ||
        previousPrevious == null
    ) {

        return {

            direction: "FLAT",

            slope: 0,

            previousSlope: 0,

            acceleration: 0,

            strong: false
        };
    }


    const avgRange =
        averageRangeAt(
            candles,
            index,
            CONFIG.RANGE_PERIOD
        );


    if (!avgRange) {

        return {

            direction: "FLAT",

            slope: 0,

            previousSlope: 0,

            acceleration: 0,

            strong: false
        };
    }


    const slope =
        (
            currentMA -
            previousMA
        ) /
        avgRange;


    const previousSlope =
        (
            previousCurrent -
            previousPrevious
        ) /
        avgRange;


    const acceleration =
        slope -
        previousSlope;


    let direction =
        "FLAT";


    if (
        slope >=
        CONFIG.MA10_SLOPE_MIN
    ) {

        direction =
            "CALL";

    } else if (
        slope <=
        -CONFIG.MA10_SLOPE_MIN
    ) {

        direction =
            "PUT";
    }


    return {

        direction,

        slope:
            round(
                slope,
                4
            ),

        previousSlope:
            round(
                previousSlope,
                4
            ),

        acceleration:
            round(
                acceleration,
                4
            ),

        strong:
            Math.abs(slope) >=
            CONFIG.MA10_STRONG_SLOPE
    };
}


// ============================================================
// NUEVO V5
// LATERALIDAD MA50
// ============================================================

function detectMA50Lateral(
    candles,
    index
) {

    const lookback =
        CONFIG.MA50_SLOPE_LOOKBACK;


    if (
        index <
        CONFIG.SLOW_MA +
        lookback
    ) {

        return {

            lateral: false,

            slope: 0
        };
    }


    const currentMA =
        smaAt(
            candles,
            index,
            CONFIG.SLOW_MA
        );


    const previousMA =
        smaAt(
            candles,
            index - lookback,
            CONFIG.SLOW_MA
        );


    if (
        currentMA == null ||
        previousMA == null
    ) {

        return {

            lateral: false,

            slope: 0
        };
    }


    const avgRange =
        averageRangeAt(
            candles,
            index,
            CONFIG.RANGE_PERIOD
        );


    if (!avgRange) {

        return {

            lateral: false,

            slope: 0
        };
    }


    const slope =
        (
            currentMA -
            previousMA
        ) /
        avgRange;


    return {

        lateral:
            Math.abs(slope) <=
            CONFIG.MA50_LATERAL_MAX,

        slope:
            round(
                slope,
                4
            ),

        ma50:
            currentMA
    };
}


// ============================================================
// NUEVO V5
// SECUENCIA DE VELAS
// ============================================================

function detectCandleSequence(
    candles,
    index
) {

    if (
        index < 1
    ) {

        return {

            direction: null,

            count: 0,

            averageStrength: 0,

            valid: false
        };
    }


    let direction =
        null;

    let count =
        0;

    let totalStrength =
        0;


    const sequence =
        [];


    for (
        let i = index;

        i >= 0 &&
        count <
        CONFIG.MAX_SEQUENCE;

        i--
    ) {

        const candle =
            candles[i];


        let candleDirection =
            null;


        if (
            isBullish(candle)
        ) {

            candleDirection =
                "CALL";

        } else if (
            isBearish(candle)
        ) {

            candleDirection =
                "PUT";

        } else {

            break;
        }


        if (!direction) {

            direction =
                candleDirection;
        }


        if (
            candleDirection !==
            direction
        ) {

            break;
        }


        const strength =
            candleStrength(
                candle
            );


        totalStrength +=
            strength;


        sequence.push(
            candleDirection
        );


        count++;
    }


    const averageStrength =
        count > 0
            ? totalStrength / count
            : 0;


    return {

        direction,

        count,

        averageStrength:
            round(
                averageStrength,
                4
            ),

        valid:
            count >=
            CONFIG.MIN_SEQUENCE &&
            averageStrength >=
            CONFIG.MIN_SEQUENCE_STRENGTH,

        sequence
    };
}


// ============================================================
// NUEVO V5
// CAMBIO DE DIRECCIÓN
// ============================================================

function detectDirectionChange(
    candles,
    index
) {

    if (
        index <
        CONFIG.FAST_MA + 5
    ) {

        return {

            detected: false,

            direction: null
        };
    }


    const current =
        detectMA10Slope(
            candles,
            index
        );


    const previous =
        detectMA10Slope(
            candles,
            index - 1
        );


    const previous2 =
        detectMA10Slope(
            candles,
            index - 2
        );


    if (
        !current ||
        !previous ||
        !previous2
    ) {

        return {

            detected: false,

            direction: null
        };
    }


    // --------------------------------------------------------
    // CAMBIO HACIA PUT
    // --------------------------------------------------------

    const toPut =
        previous2.slope >
            CONFIG.DIRECTION_CHANGE_MIN_SLOPE &&

        previous.slope >=
            -CONFIG.DIRECTION_CHANGE_MIN_SLOPE &&

        current.slope <=
            -CONFIG.DIRECTION_CHANGE_MIN_SLOPE;


    // --------------------------------------------------------
    // CAMBIO HACIA CALL
    // --------------------------------------------------------

    const toCall =
        previous2.slope <
            -CONFIG.DIRECTION_CHANGE_MIN_SLOPE &&

        previous.slope <=
            CONFIG.DIRECTION_CHANGE_MIN_SLOPE &&

        current.slope >=
            CONFIG.DIRECTION_CHANGE_MIN_SLOPE;


    if (toPut) {

        return {

            detected: true,

            direction: "PUT",

            previousSlope:
                previous2.slope,

            currentSlope:
                current.slope,

            acceleration:
                current.acceleration
        };
    }


    if (toCall) {

        return {

            detected: true,

            direction: "CALL",

            previousSlope:
                previous2.slope,

            currentSlope:
                current.slope,

            acceleration:
                current.acceleration
        };
    }


    return {

        detected: false,

        direction: null,

        previousSlope:
            previous.slope,

        currentSlope:
            current.slope,

        acceleration:
            current.acceleration
    };
}


// ============================================================
// NUEVO V5
// SIMETRÍA MA50
// ============================================================
//
// close
//   │
//   │ ma10Distance
//   │
// MA10
//   │
//   │ maDistance
//   │
// MA50
//
// ratio:
//
// ma50Distance / maDistance
//
// ============================================================

function detectMA50Symmetry(
    candles,
    index
) {

    const current =
        getMAData(
            candles,
            index
        );


    if (!current) {

        return {

            valid: false,

            extended: false,

            direction: null
        };
    }


    const {
        close,
        ma10,
        ma50,
        ma10Distance,
        ma50Distance,
        maDistance,
        maDistanceRatio,
        symmetryClass
    } = current;


    if (
        maDistance <= 0
    ) {

        return {

            valid: false,

            extended: false,

            direction: null
        };
    }


    let direction =
        null;


    // --------------------------------------------------------
    // CALL
    // --------------------------------------------------------

    if (
        ma10 > ma50 &&
        close > ma50
    ) {

        direction =
            "CALL";
    }


    // --------------------------------------------------------
    // PUT
    // --------------------------------------------------------

    else if (
        ma10 < ma50 &&
        close < ma50
    ) {

        direction =
            "PUT";
    }


    const beyondMA10 =
        (
            direction === "CALL" &&
            close > ma10
        ) ||
        (
            direction === "PUT" &&
            close < ma10
        );


    const extended =
        direction !== null &&
        beyondMA10 &&
        maDistanceRatio >=
        CONFIG.MA50_SYMMETRY_THRESHOLD;


    return {

        valid: true,

        extended,

        direction,

        close,

        ma10,

        ma50,

        ma10Distance,

        ma50Distance,

        maDistance,

        maDistanceRatio,

        symmetryClass,

        beyondMA10
    };
}


// ============================================================
// NUEVO V5
// MEAN REVERSION HACIA MA10
// ============================================================

function detectMA10MeanReversion(
    candles,
    index,
    direction
) {

    if (
        !CONFIG.MA10_MEAN_REVERSION_ENABLED
    ) {

        return {

            detected: false
        };
    }


    if (
        index < 1
    ) {

        return {

            detected: false
        };
    }


    const symmetry =
        detectMA50Symmetry(
            candles,
            index
        );


    if (
        !symmetry.valid ||
        !symmetry.extended
    ) {

        return {

            detected: false,

            symmetry
        };
    }


    if (
        symmetry.direction !==
        direction
    ) {

        return {

            detected: false,

            reason:
                "DIRECTION_MISMATCH",

            symmetry
        };
    }


    const current =
        candles[index];


    const previous =
        candles[index - 1];


    const currentStrength =
        candleStrength(
            current
        );


    const previousStrength =
        candleStrength(
            previous
        );


    // --------------------------------------------------------
    // PÉRDIDA DE FUERZA
    // --------------------------------------------------------

    const losingStrength =
        currentStrength <
        previousStrength;


    // --------------------------------------------------------
    // CAMBIO DE COLOR
    // --------------------------------------------------------

    const colorChange =
        direction === "PUT"
            ? (
                isBearish(previous) &&
                isBullish(current)
            )
            : (
                isBullish(previous) &&
                isBearish(current)
            );


    // --------------------------------------------------------
    // DISTANCIA ACTUAL A MA10
    // --------------------------------------------------------

    const currentMA10Distance =
        Math.abs(
            number(
                current.close
            ) -
            symmetry.ma10
        );


    const previousMA =
        getMAData(
            candles,
            index - 1
        );


    if (!previousMA) {

        return {

            detected: false,

            symmetry
        };
    }


    const previousMA10Distance =
        Math.abs(
            number(
                previous.close
            ) -
            previousMA.ma10
        );


    const approachingMA10 =
        currentMA10Distance <
        previousMA10Distance;


    // --------------------------------------------------------
    // PENDIENTE
    // --------------------------------------------------------

    const slope =
        detectMA10Slope(
            candles,
            index
        );


    // --------------------------------------------------------
    // DETECTADO
    // --------------------------------------------------------

    const detected =
        symmetry.maDistanceRatio >=
        CONFIG.MA10_MEAN_REVERSION_MIN_RATIO &&

        (
            losingStrength ||
            colorChange ||
            approachingMA10
        );


    return {

        detected,

        direction,

        symmetry,

        currentStrength,

        previousStrength,

        losingStrength,

        colorChange,

        approachingMA10,

        currentMA10Distance,

        previousMA10Distance,

        slope
    };
}


// ============================================================
// NUEVO V5
// PRE REJECTION MA10
// ============================================================
//
// Esta función busca entrar UNA VELA ANTES
// del rechazo tradicional.
//
// Ejemplo:
//
// 🔴
// 🔴
// 🔴
// 🟢   <- todavía no confirmó completamente
//
// Si:
//
// ratio alto
// +
// MA10 extendida
// +
// secuencia fuerte
// +
// pendiente comienza a perder fuerza
//
// podemos anticipar el movimiento.
//
// ============================================================

function detectMA10PreRejection(
    candles,
    index,
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
        index < 3
    ) {

        return {

            detected: false
        };
    }


    const symmetry =
        detectMA50Symmetry(
            candles,
            index
        );


    if (
        !symmetry.valid
    ) {

        return {

            detected: false,

            symmetry
        };
    }


    if (
        symmetry.direction !==
        direction
    ) {

        return {

            detected: false,

            reason:
                "DIRECTION_MISMATCH",

            symmetry
        };
    }


    if (
        symmetry.maDistanceRatio <
        CONFIG.MA10_PRE_REJECTION_MIN_RATIO
    ) {

        return {

            detected: false,

            reason:
                "RATIO_TOO_LOW",

            symmetry
        };
    }


    const current =
        candles[index];


    const previous =
        candles[index - 1];


    const sequence =
        detectCandleSequence(
            candles,
            index
        );


    const slope =
        detectMA10Slope(
            candles,
            index
        );


    const ma50 =
        detectMA50Lateral(
            candles,
            index
        );


    // --------------------------------------------------------
    // FUERZA
    // --------------------------------------------------------

    const strength =
        candleStrength(
            current
        );


    if (
        strength <
        CONFIG.MA10_PRE_REJECTION_MIN_STRENGTH
    ) {

        return {

            detected: false,

            reason:
                "WEAK_CANDLE",

            symmetry,

            sequence,

            slope,

            ma50
        };
    }


    // --------------------------------------------------------
    // SECUENCIA
    // --------------------------------------------------------

    if (
        sequence.count <
        CONFIG.MIN_SEQUENCE
    ) {

        return {

            detected: false,

            reason:
                "SHORT_SEQUENCE",

            symmetry,

            sequence,

            slope,

            ma50
        };
    }


    if (
        sequence.direction !==
        direction
    ) {

        return {

            detected: false,

            reason:
                "SEQUENCE_MISMATCH",

            symmetry,

            sequence,

            slope,

            ma50
        };
    }


    // --------------------------------------------------------
    // PÉRDIDA DE ACELERACIÓN
    // --------------------------------------------------------

    const losingAcceleration =
        direction === "PUT"
            ? slope.acceleration > 0
            : slope.acceleration < 0;


    // --------------------------------------------------------
    // DISTANCIA A MA10
    // --------------------------------------------------------

    const currentMA10Distance =
        symmetry.ma10Distance;


    const previousMA =
        getMAData(
            candles,
            index - 1
        );


    const previousMA10Distance =
        previousMA
            ? Math.abs(
                number(
                    previous.close
                ) -
                previousMA.ma10
            )
            : currentMA10Distance;


    // --------------------------------------------------------
    // EMPIEZA A ACERCARSE A MA10
    // --------------------------------------------------------

    const approachingMA10 =
        currentMA10Distance <
        previousMA10Distance;


    // --------------------------------------------------------
    // PRE-REJECTION
    // --------------------------------------------------------

    const detected =
        symmetry.extended &&

        sequence.valid &&

        (
            losingAcceleration ||
            approachingMA10 ||
            ma50.lateral
        );


    return {

        detected,

        direction,

        type:
            "MA10_PRE_REJECTION",

        symmetry,

        sequence,

        slope,

        ma50,

        strength,

        losingAcceleration,

        approachingMA10,

        currentMA10Distance,

        previousMA10Distance
    };
}


// ============================================================
// RETRACEMENT
// ============================================================

function detectRetracement(
    candles,
    index,
    direction
) {

    if (
        index < 3
    ) {

        return {
            detected: false
        };
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

    const previous2 =
        getMAData(
            candles,
            index - 2
        );

    const previous3 =
        getMAData(
            candles,
            index - 3
        );


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


    const trend =
        direction === "CALL"
            ? current.ma10 >
              current.ma50
            : current.ma10 <
              current.ma50;


    if (!trend) {

        return {

            detected: false,

            reason:
                "NO_TREND"
        };
    }


    const d0 =
        current.distance;

    const d1 =
        previous.distance;

    const d2 =
        previous2.distance;

    const d3 =
        previous3.distance;


    const approaching =
        d1 < d2 ||
        d2 < d3;


    const nearMA10 =
        Math.min(
            d0,
            d1,
            d2
        ) <=
        CONFIG.MA10_ZONE_DISTANCE;


    const nearMA50 =
        Math.abs(
            current.close -
            current.ma50
        ) /
        current.avgRange
        <=
        CONFIG.MA50_ZONE_DISTANCE;


    return {

        detected:
            approaching &&
            (
                nearMA10 ||
                nearMA50
            ),

        trend,

        approaching,

        nearMA10,

        nearMA50,

        distance:
            round(
                d0,
                3
            ),

        previousDistance:
            round(
                d1,
                3
            ),

        ma10:
            current.ma10,

        ma50:
            current.ma50
    };
}


// ============================================================
// REJECTION MA10
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
        getMAData(
            candles,
            index
        );

    const previous =
        getMAData(
            candles,
            index - 1
        );

    const previous2 =
        getMAData(
            candles,
            index - 2
        );

    const previous3 =
        getMAData(
            candles,
            index - 3
        );

    const previous4 =
        getMAData(
            candles,
            index - 4
        );


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


    const d0 =
        current.distance;

    const d1 =
        previous.distance;

    const d2 =
        previous2.distance;

    const d3 =
        previous3.distance;

    const d4 =
        previous4.distance;


    const trend =
        direction === "CALL"
            ? current.ma10 >
              current.ma50
            : current.ma10 <
              current.ma50;


    if (!trend) {

        return {

            detected: false,

            reason:
                "TREND_INVALID"
        };
    }


    const minDistance =
        Math.min(
            d1,
            d2,
            d3
        );


    const nearMA =
        minDistance <=
        CONFIG.RETRACEMENT_MAX_DISTANCE;


    const approaching =
        d2 < d3 ||
        d3 < d4;


    const recovering =
        d0 > d1;


    const recoveryFromMinimum =
        d1 <= d2 ||
        d1 <= d3;


    const currentCandle =
        candles[index];


    const directionCandle =
        direction === "CALL"
            ? isBullish(currentCandle)
            : isBearish(currentCandle);


    const strength =
        candleStrength(
            currentCandle
        );


    const strengthValid =
        strength >=
        CONFIG.MA_REJECTION_MIN_STRENGTH;


    const priceDistanceToMA50 =
        Math.abs(
            current.close -
            current.ma50
        ) /
        current.avgRange;


    const nearMA50 =
        priceDistanceToMA50 <=
        CONFIG.MA50_ZONE_DISTANCE;


    let touchedMA = false;


    if (
        direction === "CALL"
    ) {

        touchedMA =
            currentCandle.low <=
            current.ma10;

    } else {

        touchedMA =
            currentCandle.high >=
            current.ma10;
    }


    if (
        CONFIG.MA_REJECTION_REQUIRE_TOUCH &&
        !touchedMA
    ) {

        return {

            detected: false,

            reason:
                "NO_TOUCH"
        };
    }


    const detected =
        approaching &&
        nearMA &&
        recovering &&
        recoveryFromMinimum &&
        directionCandle &&
        strengthValid;


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
            round(
                d0,
                3
            ),

        previousDistance:
            round(
                d1,
                3
            ),

        minDistance:
            round(
                minDistance,
                3
            ),

        priceDistanceToMA50:
            round(
                priceDistanceToMA50,
                3
            )
    };
}


// ============================================================
// CONTINUATION
// ============================================================

function detectContinuation(
    candles,
    index,
    direction
) {

    if (
        index < 3
    ) {

        return false;
    }


    const current =
        candles[index];

    const previous =
        candles[index - 1];


    const ma =
        getMAData(
            candles,
            index
        );


    if (!ma) {

        return false;
    }


    if (
        direction === "CALL"
    ) {

        return (
            ma.ma10 >
            ma.ma50 &&

            ma.close >
            ma.ma10 &&

            (
                isBullish(current) ||
                isBullish(previous)
            )
        );
    }


    if (
        direction === "PUT"
    ) {

        return (
            ma.ma10 <
            ma.ma50 &&

            ma.close <
            ma.ma10 &&

            (
                isBearish(current) ||
                isBearish(previous)
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
        candleStrength(
            current
        );


    if (
        strength <
        CONFIG.MIN_CANDLE_STRENGTH
    ) {

        return false;
    }


    if (
        direction === "CALL"
    ) {

        return (
            ma.ma10 >
            ma.ma50 &&
            isBullish(current)
        );
    }


    if (
        direction === "PUT"
    ) {

        return (
            ma.ma10 <
            ma.ma50 &&
            isBearish(current)
        );
    }


    return false;
}


// ============================================================
// STATE
// ============================================================

function initializeState(
    state
) {

    if (
        !state.smaStrategy
    ) {

        state.smaStrategy = {

            trendDirection:
                null,

            trendStartIndex:
                null,

            lastCrossIndex:
                null,

            lastEntryIndex:
                null,

            lastEntryType:
                null,

            tradesInTrend:
                0,

            lastSignalIndex:
                null,

            // --------------------------------------------
            // NUEVO
            // --------------------------------------------

            lastSymmetryClass:
                null,

            lastMA10Distance:
                null,

            lastMA50Distance:
                null,

            lastMADistance:
                null,

            lastMADistanceRatio:
                null,

            lastAnalysis:
                null
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
        initializeState(
            state
        );


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


        if (CONFIG.DEBUG) {

            console.log(
                "🔄 SMA CROSS:",
                {
                    index,

                    direction:
                        cross
                }
            );
        }
    }


    // --------------------------------------------------------
    // INICIALIZAR TENDENCIA
    // --------------------------------------------------------

    if (
        !strategyState.trendDirection
    ) {

        strategyState.trendDirection =
            trend;

        if (trend) {

            strategyState.trendStartIndex =
                index;
        }
    }


    // --------------------------------------------------------
    // CAMBIO MA10 / MA50
    // --------------------------------------------------------

    if (
        trend &&
        strategyState.trendDirection &&
        trend !==
        strategyState.trendDirection
    ) {

        strategyState.trendDirection =
            trend;

        strategyState.trendStartIndex =
            index;

        strategyState.tradesInTrend =
            0;

        strategyState.lastEntryIndex =
            null;

        strategyState.lastEntryType =
            null;


        if (CONFIG.DEBUG) {

            console.log(
                "🔄 SMA TREND CAMBIÓ:",
                {
                    index,

                    direction:
                        trend
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
        initializeState(
            state
        );


    if (
        strategyState.lastEntryIndex != null
    ) {

        const candlesSince =
            index -
            strategyState.lastEntryIndex;


        if (
            candlesSince <
            CONFIG.MIN_CANDLES_BETWEEN_TRADES
        ) {

            return false;
        }
    }


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
        initializeState(
            state
        );


    strategyState.lastEntryIndex =
        index;

    strategyState.lastEntryType =
        entryType;

    strategyState.tradesInTrend++;

    strategyState.lastSignalIndex =
        index;


    if (CONFIG.DEBUG) {

        console.log(
            "📈 SMA V5 ENTRY:",
            {

                index,

                direction,

                entryType,

                tradesInTrend:
                    strategyState
                        .tradesInTrend
            }
        );
    }
}


// ============================================================
// CREAR ANALYSIS COMÚN
// ============================================================
//
// TODOS LOS TIPOS DE ENTRADA
// tendrán estas métricas.
//
// ============================================================

function buildAnalysis(
    candles,
    index,
    direction
) {

    const ma =
        getMAData(
            candles,
            index
        );


    if (!ma) {

        return {};
    }


    const slope =
        detectMA10Slope(
            candles,
            index
        );


    const ma50Lateral =
        detectMA50Lateral(
            candles,
            index
        );


    const sequence =
        detectCandleSequence(
            candles,
            index
        );


    const directionChange =
        detectDirectionChange(
            candles,
            index
        );


    const symmetry =
        detectMA50Symmetry(
            candles,
            index
        );


    return {

        // --------------------------------------------
        // DIRECCIÓN
        // --------------------------------------------

        direction,


        // --------------------------------------------
        // MA
        // --------------------------------------------

        ma10:
            ma.ma10,

        ma50:
            ma.ma50,


        // --------------------------------------------
        // DISTANCIAS
        // --------------------------------------------

        ma10Distance:
            ma.ma10Distance,

        ma50Distance:
            ma.ma50Distance,

        maDistance:
            ma.maDistance,

        maDistanceRatio:
            ma.maDistanceRatio,

        symmetryClass:
            ma.symmetryClass,


        // --------------------------------------------
        // NORMALIZADAS
        // --------------------------------------------

        ma10DistanceNormalized:
            ma.ma10DistanceNormalized,

        ma50DistanceNormalized:
            ma.ma50DistanceNormalized,

        maDistanceNormalized:
            ma.maDistanceNormalized,


        // --------------------------------------------
        // SLOPE
        // --------------------------------------------

        ma10Slope:
            slope.slope,

        ma10SlopeDirection:
            slope.direction,

        ma10SlopeAcceleration:
            slope.acceleration,

        ma10SlopeStrong:
            slope.strong,


        // --------------------------------------------
        // MA50 LATERAL
        // --------------------------------------------

        ma50Lateral:
            ma50Lateral.lateral,

        ma50Slope:
            ma50Lateral.slope,


        // --------------------------------------------
        // SECUENCIA
        // --------------------------------------------

        candleSequenceDirection:
            sequence.direction,

        candleSequenceCount:
            sequence.count,

        candleSequenceStrength:
            sequence.averageStrength,


        // --------------------------------------------
        // CAMBIO DIRECCIÓN
        // --------------------------------------------

        directionChangeDetected:
            directionChange.detected,

        directionChangeDirection:
            directionChange.direction,


        // --------------------------------------------
        // POSICIÓN
        // --------------------------------------------

        close:
            ma.close,

        avgRange:
            ma.avgRange
    };
}


// ============================================================
// NEUTRAL
// ============================================================

function neutral() {

    return {

        signal: null,

        score: 0,

        strategy: "sma",

        entryType: null,

        analysis: {}
    };
}


// ============================================================
// SMA STRATEGY V5
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
    // ANÁLISIS COMPLETO
    // ========================================================

    const commonAnalysis =
        buildAnalysis(
            candles,
            index,
            direction
        );


    // ========================================================
    // ACTUALIZAR STATE ANALYSIS
    // ========================================================

    strategyState.lastMA10Distance =
        current.ma10Distance;

    strategyState.lastMA50Distance =
        current.ma50Distance;

    strategyState.lastMADistance =
        current.maDistance;

    strategyState.lastMADistanceRatio =
        current.maDistanceRatio;

    strategyState.lastSymmetryClass =
        current.symmetryClass;

    strategyState.lastAnalysis =
        commonAnalysis;


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
    // 1. MA10 PRE-REJECTION
    // ========================================================
    //
    // ESTA ES LA NUEVA ENTRADA ANTICIPADA.
    //
    // Busca capturar el movimiento antes de esperar
    // todo el rechazo tradicional.
    //
    // ========================================================

    if (
        CONFIG.MA10_PRE_REJECTION_ENABLED
    ) {

        const preRejection =
            detectMA10PreRejection(
                candles,
                index,
                direction
            );


        if (CONFIG.DEBUG) {

            console.log(
                `🔬 MA10 PRE-REJECTION ${direction}:`,
                preRejection
            );
        }


        if (
            preRejection.detected
        ) {

            registerEntry(
                index,
                "MA10_PRE_REJECTION",
                direction,
                state
            );


            return {

                signal:
                    direction,

                score: 9,

                strategy: "sma",

                entryType:
                    "MA10_PRE_REJECTION",

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

                strength,

                analysis: {

                    ...commonAnalysis,

                    preRejection:
                        preRejection
                }
            };
        }
    }


    // ========================================================
    // 2. MEAN REVERSION
    // ========================================================
    //
    // Detecta:
    //
    // CLOSE muy alejado de MA50
    // +
    // MA10 relativamente cerca de MA50
    //
    // y comienza a aparecer evidencia de regreso.
    //
    // ========================================================

    if (
        CONFIG.MA10_MEAN_REVERSION_ENABLED
    ) {

        const meanReversion =
            detectMA10MeanReversion(
                candles,
                index,
                direction
            );


        if (CONFIG.DEBUG) {

            console.log(
                `↩️ MA10 MEAN REVERSION ${direction}:`,
                meanReversion
            );
        }


        if (
            meanReversion.detected
        ) {

            registerEntry(
                index,
                "MA10_MEAN_REVERSION",
                direction,
                state
            );


            return {

                signal:
                    direction,

                score: 8,

                strategy: "sma",

                entryType:
                    "MA10_MEAN_REVERSION",

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

                strength,

                analysis: {

                    ...commonAnalysis,

                    meanReversion:
                        meanReversion
                }
            };
        }
    }


    // ========================================================
    // 3. MA REJECTION
    // ========================================================
    //
    // ESTA ENTRADA YA EXISTÍA.
    //
    // SE CONSERVA.
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

                analysis: {

                    ...commonAnalysis,

                    rejection:
                        rejection
                }
            };
        }
    }


    // ========================================================
    // 4. PULLBACK
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


        if (
            confirmed
        ) {

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

                strength,

                analysis: {

                    ...commonAnalysis,

                    retracement:
                        retracement
                }
            };
        }
    }


    // ========================================================
    // 5. CONTINUATION
    // ========================================================

    const continuation =
        detectContinuation(
            candles,
            index,
            direction
        );


    if (
        continuation
    ) {

        const confirmed =
            directionConfirmed(
                candles,
                index,
                direction
            );


        if (
            confirmed
        ) {

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

                strength,

                analysis: {

                    ...commonAnalysis,

                    continuation: true
                }
            };
        }
    }


    // ========================================================
    // SIN SEÑAL
    // ========================================================

    return neutral();
}


// ============================================================
// EXPORT
// ============================================================

module.exports =
    smaStrategy;