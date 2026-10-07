// ============================================================
// SMA STRATEGY V5 (CORREGIDA + FILTRO DE SEPARACIÓN MA)
// ============================================================
//
// CAMBIOS:
//
// 1. FIX: getMAData devuelve `distance` (CLOSE->MA10 normalizada).
// 2. FIX: MEAN_REVERSION y PRE_REJECTION pueden ir CONTRA la
//    tendencia (flags en CONFIG).
// 3. FIX: "extended" exige también distancia a MA10 en rangos.
// 4. FIX: índices absolutos (ventana deslizante).
// 5. LIMPIEZA: caché de getMAData, DEBUG apagado.
//
// 6. NUEVO: FILTRO DE SEPARACIÓN MA10/MA50
//
//    separación normalizada = |MA10 - MA50| / avgRange
//
//    Si es menor que MIN_MA_SEPARATION, las medias están
//    "pegadas" (mercado lateral / cruces falsos) y NO se
//    permite ninguna entrada. La tendencia sigue
//    actualizándose para no perder los cruces.
//
// 7. NUEVO: ENTRADA MA50_BREAKOUT
//
//    Una vela fuerte cruza la MA50 mientras la MA10 TODAVÍA
//    está del lado contrario (el cruce de medias aún no
//    ocurrió). Se entra N velas después (por defecto 2) si
//    el precio sostiene el lado nuevo de la MA50.
//    Es independiente de la tendencia MA10/MA50 y, por
//    defecto, ignora el filtro de separación (las medias
//    están cerca justamente en este patrón).
//
// ============================================================


// ============================================================
// CONFIG
// ============================================================

const CONFIG = {

    FAST_MA: 10,
    SLOW_MA: 50,

    RANGE_PERIOD: 10,

    RETRACEMENT_MAX_DISTANCE: 1.50,
    MA10_ZONE_DISTANCE: 1.00,
    MA50_ZONE_DISTANCE: 0.75,

    MIN_CANDLE_STRENGTH: 0.25,

    MIN_CANDLES_BETWEEN_TRADES: 2,
    MAX_TRADES_PER_TREND: null,

    RETRACEMENT_LOOKBACK: 4,
    CONTINUATION_LOOKBACK: 3,


    MA_REJECTION_ENABLED: true,
    MA_REJECTION_MIN_STRENGTH: 0.60,
    MA_REJECTION_REQUIRE_TOUCH: false,

    MA10_SLOPE_LOOKBACK: 3,
    MA10_SLOPE_MIN: 0.08,
    MA10_STRONG_SLOPE: 0.20,

    MA50_SLOPE_LOOKBACK: 5,
    MA50_LATERAL_MAX: 0.18,

    DIRECTION_CHANGE_LOOKBACK: 3,
    DIRECTION_CHANGE_MIN_SLOPE: 0.08,

    MIN_SEQUENCE: 2,
    MAX_SEQUENCE: 5,
    MIN_SEQUENCE_STRENGTH: 0.30,

    // --------------------------------------------------------
    // FILTRO SEPARACIÓN MA10 / MA50
    // --------------------------------------------------------

    MA_SEPARATION_FILTER_ENABLED: true,

    MIN_MA_SEPARATION: 0.20,

    // --------------------------------------------------------
    // MA50 BREAKOUT
    // --------------------------------------------------------

    MA50_BREAKOUT_ENABLED: true,

    BREAKOUT_ENTRY_CANDLES_AFTER: 2,

    BREAKOUT_MIN_STRENGTH: 0.50,

    BREAKOUT_MIN_BODY_NORMALIZED: 1.00,

    BREAKOUT_MIN_CLOSE_BEYOND_MA50: 0.20,

    BREAKOUT_REQUIRE_MA10_NOT_CROSSED: true,

    BREAKOUT_MIN_MA10_SLOPE: 0.05,

    BREAKOUT_MAX_RETRACE: 0.50,

    BREAKOUT_REQUIRE_ENTRY_CANDLE_DIRECTION: true,

    BREAKOUT_MIN_ENTRY_STRENGTH: 0.20,

    BREAKOUT_MAX_EXTENSION_FROM_MA50: 4.00,

    BREAKOUT_BYPASS_SEPARATION_FILTER: true,

    // --------------------------------------------------------
    // EXTENSIÓN
    // --------------------------------------------------------

    MA50_SYMMETRY_THRESHOLD: 1.10,
    MA50_SYMMETRY_STRONG: 1.50,
    MA50_SYMMETRY_EXTREME: 2.00,

    MA10_EXTENSION_MIN_NORMALIZED: 1.00,

    // --------------------------------------------------------
    // MEAN REVERSION
    // --------------------------------------------------------

    MA10_MEAN_REVERSION_ENABLED: true,
    MA10_MEAN_REVERSION_MIN_RATIO: 1.25,
    MA10_MEAN_REVERSION_MIN_STRENGTH: 0.20,

    MA10_MEAN_REVERSION_COUNTER_TREND: true,

    // --------------------------------------------------------
    // PRE REJECTION
    // --------------------------------------------------------

    MA10_PRE_REJECTION_ENABLED: true,
    MA10_PRE_REJECTION_MIN_RATIO: 1.25,
    MA10_PRE_REJECTION_MIN_STRENGTH: 0.20,
    MA10_PRE_REJECTION_COUNTER_TREND: true,

    // --------------------------------------------------------
    // RÉGIMEN DE MERCADO / SALIDA DE LATERALIDAD
    // --------------------------------------------------------

    MA50_SLOPE_LOOKBACK: 5,
    MA50_LATERAL_MAX: 0.18,

    // Umbral más estricto para bloquear lateralidad real
    MA50_LATERAL_BLOCK: 0.12,

    // Número de velas laterales consecutivas requeridas
    MA50_LATERAL_CONFIRM_CANDLES: 2,

    // Separación mínima para considerar tendencia real
    MIN_TREND_SEPARATION: 0.35,

    // Ventana para detectar lateralidad inmediatamente anterior
    // a una nueva tendencia.
    LATERAL_LOOKBACK: 6,

    // Pendiente MA50 mínima para considerar que está saliendo
    // de una lateralidad.
    MA50_EMERGING_SLOPE: 0.12,

    // Separación mínima para validar salida de lateralidad
    EMERGING_MIN_SEPARATION: 0.15,

    // MA10 debe acompañar la nueva dirección
    EMERGING_MIN_MA10_SLOPE: 0.05,

    // Durante transición no se permiten entradas normales
    BLOCK_TRANSITION_ENTRIES: true,

    DEBUG: false
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

    return Math.round(
        number(value) * factor
    ) / factor;
}


function oppositeDirection(direction) {

    if (direction === "CALL") {

        return "PUT";
    }

    if (direction === "PUT") {

        return "CALL";
    }

    return null;
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

        sum += number(
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

        const range =
            number(candles[i]?.high) -
            number(candles[i]?.low);

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
// VELAS
// ============================================================

function candleStrength(candle) {

    const open =
        number(candle?.open);

    const close =
        number(candle?.close);

    const high =
        number(candle?.high);

    const low =
        number(candle?.low);

    const range =
        high - low;

    if (range <= 0) {

        return 0;
    }

    return Math.abs(
        close - open
    ) / range;
}


function isBullish(candle) {

    return (
        number(candle?.close) >
        number(candle?.open)
    );
}


function isBearish(candle) {

    return (
        number(candle?.close) <
        number(candle?.open)
    );
}


// ============================================================
// CLASIFICAR SIMETRÍA
// ============================================================

function classifyMA50Symmetry(ratio) {

    if (ratio < 0.80) {

        return "NORMAL";
    }

    if (ratio < 1.00) {

        return "NEAR_MA10";
    }

    if (ratio < 1.25) {

        return "EXTENSION_LOW";
    }

    if (ratio < 1.50) {

        return "EXTENSION_MEDIUM";
    }

    if (ratio < 2.00) {

        return "EXTENSION_HIGH";
    }

    return "EXTENSION_EXTREME";
}


// ============================================================
// DATOS PRINCIPALES MA
// ============================================================
//
// CLOSE
//   │ ma10Distance
// MA10
//   │ maDistance
// MA50
//
// ma50Distance = CLOSE -> MA50
// ratio        = ma50Distance / maDistance
//
// distance = ma10DistanceNormalized
// maSeparationNormalized = separación MA10-MA50 normalizada
//
// ============================================================

let maCache =
    new Map();

let maCacheCandles =
    null;


function resetCache(candles) {

    maCache =
        new Map();

    maCacheCandles =
        candles;
}


function getMAData(
    candles,
    index
) {

    if (
        candles === maCacheCandles &&
        maCache.has(index)
    ) {

        return maCache.get(index);
    }

    const result =
        computeMAData(
            candles,
            index
        );

    if (
        candles === maCacheCandles
    ) {

        maCache.set(
            index,
            result
        );
    }

    return result;
}


function computeMAData(
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

    if (!avgRange) {

        return null;
    }

    const close =
        number(
            candles[index]?.close
        );

    const ma10Distance =
        Math.abs(
            close - ma10
        );

    const ma50Distance =
        Math.abs(
            close - ma50
        );

    const maDistance =
        Math.abs(
            ma10 - ma50
        );

    const maDistanceRatio =
        maDistance > 0
            ? ma50Distance / maDistance
            : 0;

    const ma10DistanceNormalized =
        ma10Distance / avgRange;

    const ma50DistanceNormalized =
        ma50Distance / avgRange;

    const maDistanceNormalized =
        maDistance / avgRange;

    return {

        ma10,

        ma50,

        close,

        avgRange,

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

        maDistanceRatio:
            round(
                maDistanceRatio,
                4
            ),

        symmetryClass:
            classifyMA50Symmetry(
                maDistanceRatio
            ),

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

        maSeparationNormalized:
            round(
                maDistanceNormalized,
                4
            ),

        // Alias utilizado por la lógica V5
        distance:
            round(
                ma10DistanceNormalized,
                4
            ),

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
// FILTRO SEPARACIÓN MA10 / MA50
// ============================================================

function checkMASeparation(
    candles,
    index
) {

    if (
        !CONFIG.MA_SEPARATION_FILTER_ENABLED
    ) {

        return {

            passed: true,

            enabled: false
        };
    }

    const data =
        getMAData(
            candles,
            index
        );

    if (!data) {

        return {

            passed: false,

            enabled: true,

            reason:
                "NO_MA_DATA"
        };
    }

    const separation =
        data.maSeparationNormalized;

    return {

        passed:
            separation >=
            CONFIG.MIN_MA_SEPARATION,

        enabled: true,

        separation,

        minRequired:
            CONFIG.MIN_MA_SEPARATION,

        reason:
            separation >=
            CONFIG.MIN_MA_SEPARATION

                ? null

                : "MA_TOO_CLOSE"
    };
}


// ============================================================
// MA50 BREAKOUT
// ============================================================
//
// Busca una vela de cruce de MA50 exactamente N velas atrás.
//
// N = BREAKOUT_ENTRY_CANDLES_AFTER
//
// Valida:
//
// 1. Vela de cruce fuerte.
// 2. Cierre más allá de MA50.
// 3. MA10 todavía del lado contrario.
// 4. MA10 acompañando el movimiento.
// 5. Retroceso posterior limitado.
// 6. Vela actual confirma dirección.
//
// ============================================================

function detectMA50Breakout(candles, index) {

    if (
        !Array.isArray(candles) ||
        index < 1
    ) {
        return {
            detected: false,
            direction: null,
            crossed: false
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

    if (!current || !previous) {

        return {
            detected: false,
            direction: null,
            crossed: false
        };
    }

    const currentClose =
        Number(
            candles[index]?.close
        );

    const previousClose =
        Number(
            candles[index - 1]?.close
        );

    const currentMA50 =
        Number(
            current.ma50
        );

    const previousMA50 =
        Number(
            previous.ma50
        );

    if (
        !Number.isFinite(currentClose) ||
        !Number.isFinite(previousClose) ||
        !Number.isFinite(currentMA50) ||
        !Number.isFinite(previousMA50)
    ) {

        return {
            detected: false,
            direction: null,
            crossed: false
        };
    }

    const crossedUp =
        previousClose <= previousMA50 &&
        currentClose > currentMA50;

    const crossedDown =
        previousClose >= previousMA50 &&
        currentClose < currentMA50;

    if (crossedUp) {

        return {
            detected: true,
            direction: "CALL",
            crossed: true,

            price:
                currentClose,

            ma50:
                currentMA50
        };
    }

    if (crossedDown) {

        return {
            detected: true,
            direction: "PUT",
            crossed: true,

            price:
                currentClose,

            ma50:
                currentMA50
        };
    }

    return {
        detected: false,
        direction: null,
        crossed: false,

        price:
            currentClose,

        ma50:
            currentMA50
    };
}


// ============================================================
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

            direction: null,

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

    const previous2MA =
        smaAt(
            candles,
            index - lookback - 1,
            CONFIG.FAST_MA
        );

    const avgRange =
        averageRangeAt(
            candles,
            index,
            CONFIG.RANGE_PERIOD
        );

    if (
        currentMA == null ||
        previousMA == null ||
        !avgRange
    ) {

        return {

            direction: null,

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

    let previousSlope = 0;

    if (
        previous2MA != null
    ) {

        previousSlope =
            (
                previousMA -
                previous2MA
            ) /
            avgRange;
    }

    const acceleration =
        slope -
        previousSlope;

    let direction =
        null;

    if (
        slope >=
        CONFIG.MA10_SLOPE_MIN
    ) {

        direction =
            "CALL";

    }

    else if (
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
// SECUENCIA DE VELAS
// ============================================================

function detectCandleSequence(
    candles,
    index
) {

    if (index < 1) {

        return {

            direction: null,

            count: 0,

            averageStrength: 0,

            valid: false,

            sequence: []
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

        }

        else if (
            isBearish(candle)
        ) {

            candleDirection =
                "PUT";

        }

        else {

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

        totalStrength +=
            candleStrength(
                candle
            );

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
// CAMBIO DE DIRECCIÓN
// ============================================================

function detectDirectionChange(
    candles,
    index
) {

    if (
        index <
        CONFIG.FAST_MA +
        5
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

    if (
        !current ||
        !previous
    ) {

        return {

            detected: false,

            direction: null
        };
    }

    const currentDirection =
        current.direction;

    const previousDirection =
        previous.direction;

    if (
        !currentDirection ||
        !previousDirection
    ) {

        return {

            detected: false,

            direction: null
        };
    }

    if (
        currentDirection ===
        previousDirection
    ) {

        return {

            detected: false,

            direction:
                currentDirection
        };
    }

    if (
        Math.abs(
            current.slope
        ) <
        CONFIG.DIRECTION_CHANGE_MIN_SLOPE
    ) {

        return {

            detected: false,

            direction:
                currentDirection
        };
    }

    return {

        detected: true,

        direction:
            currentDirection,

        previousDirection,

        currentSlope:
            current.slope,

        previousSlope:
            previous.slope
    };
}
// ============================================================
// EXTENSIÓN / SIMETRÍA MA50
// ============================================================
//
// El ratio por sí solo no determina extensión.
//
// Cuando el precio está más allá de MA10:
//
//     ratio = ma50Distance / maDistance
//
// Por eso además exigimos una distancia mínima normalizada
// respecto a MA10.
//
// ============================================================

function detectMA50Symmetry(candles, index) {

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
        ma10DistanceNormalized,
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

    let direction = null;

    if (
        ma10 > ma50 &&
        close > ma50
    ) {

        direction = "CALL";

    } else if (
        ma10 < ma50 &&
        close < ma50
    ) {

        direction = "PUT";
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
            CONFIG.MA50_SYMMETRY_THRESHOLD &&
        ma10DistanceNormalized >=
            CONFIG.MA10_EXTENSION_MIN_NORMALIZED;

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

        ma10DistanceNormalized,

        symmetryClass,

        beyondMA10
    };
}


// ============================================================
// MEAN REVERSION HACIA MA10
// ============================================================
//
// direction = tendencia actual
// signal    = dirección de la operación
//
// Puede operar contra tendencia cuando:
//
// MA10_MEAN_REVERSION_COUNTER_TREND = true
//
// ============================================================

function detectMA10MeanReversion(
    candles,
    index,
    direction
) {

    if (
        !CONFIG.MA10_MEAN_REVERSION_ENABLED ||
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

    if (
        currentStrength <
        CONFIG.MA10_MEAN_REVERSION_MIN_STRENGTH
    ) {

        return {

            detected: false,

            reason:
                "WEAK_CANDLE",

            symmetry
        };
    }

    const losingStrength =
        currentStrength <
        previousStrength;

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

    const currentMA10Distance =
        Math.abs(
            number(current.close) -
            symmetry.ma10
        );

    const previousMA10Distance =
        Math.abs(
            number(previous.close) -
            previousMA.ma10
        );

    const approachingMA10 =
        currentMA10Distance <
        previousMA10Distance;

    const slope =
        detectMA10Slope(
            candles,
            index
        );

    const detected =
        symmetry.maDistanceRatio >=
            CONFIG.MA10_MEAN_REVERSION_MIN_RATIO &&

        (
            losingStrength ||
            colorChange ||
            approachingMA10
        );

    const signal =
        CONFIG.MA10_MEAN_REVERSION_COUNTER_TREND

            ? oppositeDirection(
                direction
            )

            : direction;

    return {

        detected,

        direction,

        signal,

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
// PRE-REJECTION MA10
// ============================================================
//
// Detecta agotamiento antes de una posible reacción sobre MA10.
//
// IMPORTANTE:
// Esta detección NO debe convertirse en un bloqueo global.
// El filtro global de lateralidad se ejecutará posteriormente
// en smaStrategy().
//
// ============================================================

function detectMA10PreRejection(
    candles,
    index,
    direction
) {

    if (
        !CONFIG.MA10_PRE_REJECTION_ENABLED ||
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

    if (!symmetry.valid) {

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

    const losingAcceleration =
        direction === "PUT"

            ? slope.acceleration > 0

            : slope.acceleration < 0;

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
                number(previous.close) -
                previousMA.ma10
            )

            : currentMA10Distance;

    const approachingMA10 =
        currentMA10Distance <
        previousMA10Distance;

    const detected =
        symmetry.extended &&

        sequence.valid &&

        (
            losingAcceleration ||
            approachingMA10 ||
            ma50.lateral
        );

    const signal =
        CONFIG.MA10_PRE_REJECTION_COUNTER_TREND

            ? oppositeDirection(
                direction
            )

            : direction;

    return {

        detected,

        direction,

        signal,

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
        current.avgRange <=
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

            ? isBullish(
                currentCandle
            )

            : isBearish(
                currentCandle
            );

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

    const touchedMA =
        direction === "CALL"

            ? currentCandle.low <=
              current.ma10

            : currentCandle.high >=
              current.ma10;

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

    if (
        candleStrength(
            current
        ) <
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

            isBullish(
                current
            )
        );
    }

    if (
        direction === "PUT"
    ) {

        return (

            ma.ma10 <
            ma.ma50 &&

            isBearish(
                current
            )
        );
    }

    return false;
}


// ============================================================
// DETECTAR CRUCE MA10 / MA50
// ============================================================

function detectCross(
    candles,
    index
) {

    if (
        index < 1
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

    const bullishCross =
        previous.ma10 <=
        previous.ma50 &&

        current.ma10 >
        current.ma50;

    if (
        bullishCross
    ) {

        return "CALL";
    }

    const bearishCross =
        previous.ma10 >=
        previous.ma50 &&

        current.ma10 <
        current.ma50;

    if (
        bearishCross
    ) {

        return "PUT";
    }

    return null;
}


// ============================================================
// OBTENER TENDENCIA
// ============================================================

function getTrend(
    candles,
    index
) {

    const ma =
        getMAData(
            candles,
            index
        );

    if (!ma) {

        return null;
    }

    if (
        ma.ma10 >
        ma.ma50
    ) {

        return "CALL";
    }

    if (
        ma.ma10 <
        ma.ma50
    ) {

        return "PUT";
    }

    return null;
}


// ============================================================
// STATE
// ============================================================

function initializeState(state) {

    if (
        !state.smaStrategy
    ) {

        state.smaStrategy = {

            absoluteIndex:
                -1,

            lastCandleKey:
                null,

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
                null,

            lastSeparationCheck:
                null,

            blockedBySeparation:
                0,

            // =================================================
            // NUEVO ESTADO DE RÉGIMEN
            // =================================================

            lastMarketRegime:
                null,

            marketRegime:
                "UNKNOWN",

            blockedByLateral:
                0,

            blockedByTransition:
                0,

            lastReversalIndex:
                null
        };
    }

    return state.smaStrategy;
}


// ============================================================
// ÍNDICE ABSOLUTO
// ============================================================
//
// IMPORTANTE:
//
// candles normalmente llegan como ventana deslizante.
// Por eso NO debemos utilizar candles.length como índice
// histórico de operaciones.
//
// ============================================================

function advanceAbsoluteIndex(
    state,
    candle
) {

    const s =
        initializeState(
            state
        );

    const key =
        candle?.epoch ??
        candle?.time ??
        candle?.timestamp ??
        null;

    if (
        key == null ||
        key !==
        s.lastCandleKey
    ) {

        s.absoluteIndex++;

        s.lastCandleKey =
            key;
    }

    return s.absoluteIndex;
}


// ============================================================
// ACTUALIZAR TENDENCIA
// ============================================================

function updateTrendState(
    candles,
    index,
    absIndex,
    state
) {

    const s =
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

    if (cross) {

        s.trendDirection =
            cross;

        s.trendStartIndex =
            absIndex;

        s.lastCrossIndex =
            absIndex;

        s.tradesInTrend =
            0;

        s.lastEntryIndex =
            null;

        s.lastEntryType =
            null;

        if (
            CONFIG.DEBUG
        ) {

            console.log(
                "🔄 SMA CROSS:",
                {
                    absIndex,
                    direction:
                        cross
                }
            );
        }
    }

    if (
        !s.trendDirection
    ) {

        s.trendDirection =
            trend;

        if (
            trend
        ) {

            s.trendStartIndex =
                absIndex;
        }
    }

    if (
        trend &&
        s.trendDirection &&
        trend !==
        s.trendDirection
    ) {

        s.trendDirection =
            trend;

        s.trendStartIndex =
            absIndex;

        s.tradesInTrend =
            0;

        s.lastEntryIndex =
            null;

        s.lastEntryType =
            null;

        if (
            CONFIG.DEBUG
        ) {

            console.log(
                "🔄 SMA TREND CAMBIÓ:",
                {
                    absIndex,
                    direction:
                        trend
                }
            );
        }
    }

    return s;
}


// ============================================================
// CAN ENTER
// ============================================================

function canEnter(
    absIndex,
    state
) {

    const s =
        initializeState(
            state
        );

    if (
        s.lastEntryIndex != null
    ) {

        if (
            absIndex -
            s.lastEntryIndex <
            CONFIG.MIN_CANDLES_BETWEEN_TRADES
        ) {

            return false;
        }
    }

    if (
        CONFIG.MAX_TRADES_PER_TREND != null &&

        s.tradesInTrend >=
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
    absIndex,
    entryType,
    signal,
    state
) {

    const s =
        initializeState(
            state
        );

    s.lastEntryIndex =
        absIndex;

    s.lastEntryType =
        entryType;

    s.tradesInTrend++;

    s.lastSignalIndex =
        absIndex;

    if (
        CONFIG.DEBUG
    ) {

        console.log(
            "📈 SMA V5 ENTRY:",
            {
                absIndex,
                signal,
                entryType,
                tradesInTrend:
                    s.tradesInTrend
            }
        );
    }
}
// ============================================================
// DETECCIÓN DE RÉGIMEN DE MERCADO
// ============================================================
// Objetivo:
//
// LATERAL
//   → MA50 prácticamente plana.
//   → NO operar.
//
// TRANSITION
//   → El mercado está saliendo/entrando de lateralidad,
//     pero todavía no existe suficiente estructura.
//   → NO operar normalmente.
//
// EMERGING_TREND
//   → El mercado acaba de salir de lateralidad.
//   → Existe pendiente suficiente de MA50.
//   → Existe separación entre MA10/MA50.
//   → MA10 y precio empiezan a alinearse.
//   → NO hacer continuación todavía.
//   → SÍ permitir detector de REVERSAL/BREAKOUT.
//
// TREND
//   → Tendencia suficientemente confirmada.
//   → Se permiten las entradas normales.
//
// UNKNOWN
//   → No hay suficiente información.
// ============================================================

function detectMarketRegime(candles, index) {

    const neutralResult = {
        regime: "UNKNOWN",
        reason: "INSUFFICIENT_DATA",
        direction: null,
        tradable: false,
        allowReversal: false,

        ma50Slope: 0,
        ma10Slope: 0,
        separation: 0,

        lateralCount: 0,
        previousLateralCount: 0,

        recentlyLateral: false
    };

    if (!Array.isArray(candles)) {
        return neutralResult;
    }

    if (index < 0 || index >= candles.length) {
        return neutralResult;
    }

    /*
     * Necesitamos suficiente historial para:
     *
     * MA50
     * + slope MA50
     * + slope MA10
     * + lookback de lateralidad
     */
    const minimumRequired =
        CONFIG.SLOW_MA +
        Math.max(
            CONFIG.MA50_SLOPE_LOOKBACK || 5,
            CONFIG.MA10_SLOPE_LOOKBACK || 3,
            CONFIG.LATERAL_LOOKBACK || 6
        ) +
        3;

    if (index < minimumRequired) {
        return neutralResult;
    }

    // --------------------------------------------------------
    // DATOS MA ACTUALES
    // --------------------------------------------------------

    const current = getMAData(candles, index);

    if (!current) {
        return neutralResult;
    }

    const ma50Detection = detectMA50Lateral(candles, index);

    const ma10Detection = detectMA10Slope(candles, index);

    if (!ma50Detection || !ma10Detection) {
        return neutralResult;
    }

    const ma50Slope = Number(ma50Detection.slope) || 0;
    const ma10Slope = Number(ma10Detection.slope) || 0;

    const separation =
        Number(current.maSeparationNormalized) || 0;

    // --------------------------------------------------------
    // DIRECCIÓN PRINCIPAL DE MA50
    // --------------------------------------------------------

    let direction = null;

    if (ma50Slope > 0) {
        direction = "CALL";
    } else if (ma50Slope < 0) {
        direction = "PUT";
    }

    // --------------------------------------------------------
    // CONTAR LATERALIDAD ACTUAL
    // --------------------------------------------------------
    //
    // No queremos solamente saber si la MA50 actual es lateral.
    //
    // Queremos saber cuántas velas consecutivas llevan
    // mostrando una MA50 prácticamente plana.
    //
    // Esto evita considerar una sola vela plana como un
    // verdadero régimen lateral.
    // --------------------------------------------------------

    const lateralLimit =
        Number(CONFIG.MA50_LATERAL_BLOCK);

    const confirmationCandles =
        Math.max(
            1,
            Number(CONFIG.MA50_LATERAL_CONFIRM_CANDLES) || 2
        );

    let lateralCount = 0;

    for (
        let i = index;
        i >= 0;
        i--
    ) {

        const lateralData =
            detectMA50Lateral(candles, i);

        if (!lateralData) {
            break;
        }

        const slope =
            Math.abs(Number(lateralData.slope) || 0);

        if (slope <= lateralLimit) {
            lateralCount++;
        } else {
            break;
        }

        /*
         * No necesitamos recorrer todo el histórico.
         * Para confirmar lateralidad solamente necesitamos
         * superar el número mínimo de velas requerido.
         */
        if (
            lateralCount >=
            confirmationCandles
        ) {
            break;
        }
    }

    // --------------------------------------------------------
    // CONTAR LATERALIDAD PREVIA
    // --------------------------------------------------------
    //
    // Esto es importante para detectar:
    //
    // LATERAL
    //    ↓
    // salida del lateral
    //    ↓
    // EMERGING_TREND
    //
    // No debemos utilizar solamente el estado actual.
    // --------------------------------------------------------

    let previousLateralCount = 0;

    const lateralLookback =
        Math.max(
            confirmationCandles,
            Number(CONFIG.LATERAL_LOOKBACK) || 6
        );

    /*
     * Empezamos una vela atrás.
     *
     * Si la vela actual ya dejó de ser lateral pero las
     * anteriores sí lo fueron, podremos identificar la
     * transición.
     */

    for (
        let offset = 1;
        offset <= lateralLookback;
        offset++
    ) {

        const i = index - offset;

        if (i < CONFIG.SLOW_MA) {
            break;
        }

        const lateralData =
            detectMA50Lateral(candles, i);

        if (!lateralData) {
            break;
        }

        const slope =
            Math.abs(Number(lateralData.slope) || 0);

        if (slope <= lateralLimit) {
            previousLateralCount++;
        } else {
            break;
        }
    }

    const recentlyLateral =
        previousLateralCount >=
        confirmationCandles;

    // --------------------------------------------------------
    // ALINEACIÓN MA10
    // --------------------------------------------------------

    let ma10Aligned = false;

    if (direction === "CALL") {

        ma10Aligned =
            ma10Slope >=
            Number(CONFIG.EMERGING_MIN_MA10_SLOPE);

    } else if (direction === "PUT") {

        ma10Aligned =
            ma10Slope <=
            -Number(CONFIG.EMERGING_MIN_MA10_SLOPE);
    }

    // --------------------------------------------------------
    // ALINEACIÓN DEL PRECIO CON MA50
    // --------------------------------------------------------

    const close =
        Number(candles[index]?.close);

    const ma50 =
        Number(current.ma50);

    let priceAligned = false;

    if (
        Number.isFinite(close) &&
        Number.isFinite(ma50)
    ) {

        if (direction === "CALL") {
            priceAligned = close > ma50;
        }

        if (direction === "PUT") {
            priceAligned = close < ma50;
        }
    }

    // --------------------------------------------------------
    // LATERALIDAD ACTUAL FUERTE
    // --------------------------------------------------------

    if (
        lateralCount >=
        confirmationCandles
    ) {

        return {
            regime: "LATERAL",
            reason: "MA50_LATERAL",
            direction: null,

            tradable: false,
            allowReversal: false,

            ma50Slope: round(ma50Slope, 4),
            ma10Slope: round(ma10Slope, 4),

            separation: round(separation, 4),

            lateralCount,
            previousLateralCount,

            recentlyLateral
        };
    }

    // --------------------------------------------------------
    // SALIDA DE LATERALIDAD
    // --------------------------------------------------------
    //
    // Para considerar que realmente está apareciendo una
    // tendencia necesitamos varias confirmaciones.
    //
    // 1. Veníamos de lateral.
    // 2. MA50 empezó a inclinarse.
    // 3. Existe separación MA10/MA50.
    // 4. MA10 acompaña la dirección.
    // 5. Precio está del lado correcto de MA50.
    // --------------------------------------------------------

    const emergingSlope =
        Math.abs(ma50Slope) >=
        Number(CONFIG.MA50_EMERGING_SLOPE);

    const emergingSeparation =
        separation >=
        Number(CONFIG.EMERGING_MIN_SEPARATION);

    const emergingTrend =
        recentlyLateral &&
        emergingSlope &&
        emergingSeparation &&
        ma10Aligned &&
        priceAligned;

    if (emergingTrend) {

        return {
            regime: "EMERGING_TREND",
            reason: "EXITING_LATERAL_WITH_ALIGNMENT",
            direction,

            /*
             * IMPORTANTE:
             *
             * Todavía NO permitimos las entradas normales.
             * Este estado está reservado para detectar una
             * posible reversión/breakout.
             */
            tradable: false,
            allowReversal: true,

            ma50Slope: round(ma50Slope, 4),
            ma10Slope: round(ma10Slope, 4),

            separation: round(separation, 4),

            lateralCount,
            previousLateralCount,

            recentlyLateral: true
        };
    }

    // --------------------------------------------------------
    // TRANSICIÓN
    // --------------------------------------------------------
    //
    // Aquí tenemos un mercado que ya no es claramente lateral,
    // pero tampoco posee suficiente estructura para considerarlo
    // una tendencia confirmada.
    //
    // Es precisamente una zona peligrosa para una estrategia
    // de continuación.
    // --------------------------------------------------------

    const weakMA50 =
        Math.abs(ma50Slope) <=
        Number(CONFIG.MA50_LATERAL_MAX);

    const weakSeparation =
        separation <
        Number(CONFIG.MIN_TREND_SEPARATION);

    if (
        weakMA50 ||
        weakSeparation
    ) {

        return {
            regime: "TRANSITION",
            reason:
                weakMA50
                    ? "MA50_TRANSITION"
                    : "INSUFFICIENT_TREND_SEPARATION",

            direction,

            tradable:
                CONFIG.BLOCK_TRANSITION_ENTRIES
                    ? false
                    : true,

            allowReversal:
                recentlyLateral &&
                emergingSlope,

            ma50Slope: round(ma50Slope, 4),
            ma10Slope: round(ma10Slope, 4),

            separation: round(separation, 4),

            lateralCount,
            previousLateralCount,

            recentlyLateral
        };
    }

    // --------------------------------------------------------
    // TENDENCIA CONFIRMADA
    // --------------------------------------------------------
    //
    // Para llegar aquí:
    //
    // - no estamos en lateral fuerte
    // - no estamos en transición
    // - existe separación suficiente
    // - existe una dirección clara
    // --------------------------------------------------------

    if (
        direction &&
        separation >=
        Number(CONFIG.MIN_TREND_SEPARATION)
    ) {

        return {
            regime: "TREND",
            reason: "TREND_CONFIRMED",
            direction,

            tradable: true,

            /*
             * En una tendencia ya confirmada no necesitamos
             * tratarla como breakout de reversión.
             */
            allowReversal: false,

            ma50Slope: round(ma50Slope, 4),
            ma10Slope: round(ma10Slope, 4),

            separation: round(separation, 4),

            lateralCount,
            previousLateralCount,

            recentlyLateral
        };
    }

    // --------------------------------------------------------
    // UNKNOWN / FALLBACK
    // --------------------------------------------------------

    return {
        regime: "UNKNOWN",
        reason: "NO_VALID_MARKET_STRUCTURE",
        direction,

        tradable: false,
        allowReversal: false,

        ma50Slope: round(ma50Slope, 4),
        ma10Slope: round(ma10Slope, 4),

        separation: round(separation, 4),

        lateralCount,
        previousLateralCount,

        recentlyLateral
    };
}


// ============================================================
// DETECTOR DE DEBILITAMIENTO DE TENDENCIA
// ============================================================
//
// Este detector NO genera una entrada.
//
// Su función es identificar:
//
// TENDENCIA FUERTE
//       ↓
// TENDENCIA PERDIENDO FUERZA
//       ↓
// TRANSICIÓN
//       ↓
// POSIBLE REVERSIÓN
//
// Esto es especialmente importante para evitar seguir entrando
// CALL/CALL/CALL cuando la tendencia ya está agotándose.
// ============================================================

function detectTrendWeakening(candles, index, state = {}) {

    const result = {
        weakening: false,
        direction: null,

        currentStrength: 0,
        previousStrength: 0,
        strengthDelta: 0,

        nearZero: false,
        signChanged: false,

        reason: "NO_DATA"
    };

    if (
        !Array.isArray(candles) ||
        index < 2
    ) {
        return result;
    }

    const current =
        detectCandleSequence(
            candles,
            index
        );

    const previous =
        detectCandleSequence(
            candles,
            index - 1
        );

    if (!current || !previous) {
        return result;
    }

    const currentStrength =
        Number(current.strength) || 0;

    const previousStrength =
        Number(previous.strength) || 0;

    const strengthDelta =
        currentStrength -
        previousStrength;

    let direction = null;

    if (previousStrength > 0) {
        direction = "CALL";
    } else if (previousStrength < 0) {
        direction = "PUT";
    }

    /*
     * La tendencia está perdiendo fuerza cuando:
     *
     * CALL:
     *   strength positiva
     *   pero disminuye
     *
     * PUT:
     *   strength negativa
     *   pero aumenta hacia cero
     */

    let weakening = false;

    if (
        previousStrength > 0 &&
        strengthDelta < 0
    ) {
        weakening = true;
    }

    if (
        previousStrength < 0 &&
        strengthDelta > 0
    ) {
        weakening = true;
    }

    /*
     * Zona cercana a cero.
     *
     * No utilizamos solamente "strength < 0" para declarar
     * reversión.
     *
     * Primero necesitamos observar pérdida de fuerza.
     */

    const nearZero =
        Math.abs(currentStrength) <=
        0.20;

    /*
     * Cambio de signo:
     *
     * CALL → PUT
     * PUT  → CALL
     */

    const signChanged =
        (
            previousStrength > 0 &&
            currentStrength < 0
        ) ||
        (
            previousStrength < 0 &&
            currentStrength > 0
        );

    let reason = "STABLE";

    if (signChanged) {
        reason = "STRENGTH_SIGN_CHANGE";
    } else if (nearZero && weakening) {
        reason = "STRENGTH_NEAR_ZERO";
    } else if (weakening) {
        reason = "STRENGTH_WEAKENING";
    }

    return {
        weakening,
        direction,

        currentStrength:
            round(currentStrength, 4),

        previousStrength:
            round(previousStrength, 4),

        strengthDelta:
            round(strengthDelta, 4),

        nearZero,
        signChanged,

        reason
    };
}


// ============================================================
// CONFIRMACIÓN DE REVERSIÓN
// ============================================================
//
// La reversión no debe dispararse solamente porque:
//     close > MA50
// o:
//     close < MA50
//
// Buscamos una secuencia:
//
// 1. Tendencia previa.
// 2. Pérdida de fuerza.
// 3. Precio cruza MA50.
// 4. Precio mantiene el lado nuevo.
// 5. MA50 comienza a inclinarse.
// 6. MA10 empieza a acompañar.
//
// Este detector prepara la información para que
// detectMA50Breakout() pueda utilizarla.
// ============================================================

function detectReversalContext(candles, index, state = {}) {

    const result = {
        detected: false,

        previousDirection: null,
        reversalDirection: null,

        strengthWeakening: false,
        strengthNearZero: false,
        strengthSignChanged: false,

        priceCrossedMA50: false,
        priceHoldingMA50: false,

        ma10Aligned: false,
        ma50Emerging: false,

        confirmationCandles: 0,

        reason: "NO_REVERSAL"
    };

    if (
        !Array.isArray(candles) ||
        index < CONFIG.SLOW_MA + 5
    ) {
        return result;
    }

    const current =
        getMAData(candles, index);

    const previous =
        getMAData(candles, index - 1);

    if (!current || !previous) {
        return result;
    }

    // --------------------------------------------------------
    // CONTEXTO DE FUERZA
    // --------------------------------------------------------

    const weakening =
        detectTrendWeakening(
            candles,
            index,
            state
        );

    result.previousDirection =
        weakening.direction || null;

    result.strengthWeakening =
        Boolean(weakening.weakening);

    result.strengthNearZero =
        Boolean(weakening.nearZero);

    result.strengthSignChanged =
        Boolean(weakening.signChanged);

    // --------------------------------------------------------
    // CROSS MA50
    // --------------------------------------------------------

    const currentClose =
        Number(candles[index]?.close);

    const previousClose =
        Number(candles[index - 1]?.close);

    const currentMA50 =
        Number(current.ma50);

    const previousMA50 =
        Number(previous.ma50);

    if (
        Number.isFinite(currentClose) &&
        Number.isFinite(previousClose) &&
        Number.isFinite(currentMA50) &&
        Number.isFinite(previousMA50)
    ) {

        const crossedUp =
            previousClose <= previousMA50 &&
            currentClose > currentMA50;

        const crossedDown =
            previousClose >= previousMA50 &&
            currentClose < currentMA50;

        if (crossedUp) {
            result.priceCrossedMA50 = true;
            result.reversalDirection = "CALL";
        }

        if (crossedDown) {
            result.priceCrossedMA50 = true;
            result.reversalDirection = "PUT";
        }
    }

    // --------------------------------------------------------
    // SI YA CRUZÓ MA50, COMPROBAR SI MANTIENE EL LADO NUEVO
    // --------------------------------------------------------

    if (
        result.reversalDirection === "CALL"
    ) {

        result.priceHoldingMA50 =
            currentClose > currentMA50;

    } else if (
        result.reversalDirection === "PUT"
    ) {

        result.priceHoldingMA50 =
            currentClose < currentMA50;
    }

    // --------------------------------------------------------
    // PENDIENTE MA50
    // --------------------------------------------------------

    const ma50Detection =
        detectMA50Lateral(
            candles,
            index
        );

    const ma10Detection =
        detectMA10Slope(
            candles,
            index
        );

    const ma50Slope =
        Number(ma50Detection?.slope) || 0;

    const ma10Slope =
        Number(ma10Detection?.slope) || 0;

    result.ma50Emerging =
        Math.abs(ma50Slope) >=
        Number(CONFIG.MA50_EMERGING_SLOPE);

    // --------------------------------------------------------
    // ALINEACIÓN MA10
    // --------------------------------------------------------

    if (
        result.reversalDirection === "CALL"
    ) {

        result.ma10Aligned =
            ma10Slope >=
            Number(CONFIG.EMERGING_MIN_MA10_SLOPE);

    } else if (
        result.reversalDirection === "PUT"
    ) {

        result.ma10Aligned =
            ma10Slope <=
            -Number(CONFIG.EMERGING_MIN_MA10_SLOPE);
    }

    // --------------------------------------------------------
    // CONFIRMACIÓN DE VELAS
    // --------------------------------------------------------
    //
    // Después de cruzar MA50 queremos saber cuántas velas
    // consecutivas permanecen en el nuevo lado.
    // --------------------------------------------------------

    if (
        result.reversalDirection
    ) {

        let confirmation = 0;

        for (
            let i = index;
            i >= 0 && confirmation < 3;
            i--
        ) {

            const candle =
                candles[i];

            const close =
                Number(candle?.close);

            const ma =
                Number(
                    getMAData(
                        candles,
                        i
                    )?.ma50
                );

            if (
                !Number.isFinite(close) ||
                !Number.isFinite(ma)
            ) {
                break;
            }

            if (
                result.reversalDirection === "CALL" &&
                close > ma
            ) {
                confirmation++;
                continue;
            }

            if (
                result.reversalDirection === "PUT" &&
                close < ma
            ) {
                confirmation++;
                continue;
            }

            break;
        }

        result.confirmationCandles =
            confirmation;
    }

    // --------------------------------------------------------
    // RESULTADO FINAL
    // --------------------------------------------------------

    /*
     * El contexto de reversión solamente se considera válido
     * cuando tenemos:
     *
     * - debilitamiento de la tendencia
     * - cruce MA50
     * - precio manteniéndose del nuevo lado
     */

    result.detected =
        (
            result.strengthWeakening ||
            result.strengthNearZero ||
            result.strengthSignChanged
        ) &&
        result.priceCrossedMA50 &&
        result.priceHoldingMA50;

    if (result.detected) {

        result.reason =
            result.strengthSignChanged
                ? "STRENGTH_CHANGE_MA50_CROSS"
                : "WEAKENING_MA50_CROSS";

    } else if (
        result.priceCrossedMA50
    ) {

        result.reason =
            "MA50_CROSS_WITHOUT_CONFIRMATION";
    }

    return result;
}


// ============================================================
// ANÁLISIS COMÚN
// ============================================================

function buildAnalysis({
    candles,
    index,
    current,
    trend,
    sequence,
    slope,
    ma50,
    ma50Symmetry,
    marketRegime,
    reversalContext,
    filter = null
}) {

    const market =
        marketRegime || {
            regime: "UNKNOWN",
            reason: "NO_MARKET_REGIME",
            direction: null,
            tradable: false,
            allowReversal: false,
            ma50Slope: 0,
            ma10Slope: 0,
            separation: 0,
            lateralCount: 0,
            previousLateralCount: 0,
            recentlyLateral: false
        };

    return {

        // ----------------------------------------------------
        // TENDENCIA
        // ----------------------------------------------------

        trend:
            trend || null,

        // ----------------------------------------------------
        // MA
        // ----------------------------------------------------

        ma10:
            current?.ma10 ?? null,

        ma50:
            current?.ma50 ?? null,

        maDifference:
            current?.maDifference ?? null,

        maSeparation:
            current?.maSeparation ?? null,

        maSeparationNormalized:
            current?.maSeparationNormalized ?? null,

        maDistanceRatio:
            current?.maDistanceRatio ?? null,

        ma10Distance:
            current?.ma10Distance ?? null,

        ma50Distance:
            current?.ma50Distance ?? null,

        ma10AboveMA50:
            current?.ma10AboveMA50 ?? null,

        ma10BelowMA50:
            current?.ma10BelowMA50 ?? null,

        // ----------------------------------------------------
        // SLOPES
        // ----------------------------------------------------

        ma10Slope:
            slope?.slope ?? null,

        ma10SlopeDirection:
            slope?.direction ?? null,

        ma50Slope:
            market.ma50Slope,

        // ----------------------------------------------------
        // SECUENCIA
        // ----------------------------------------------------

        sequence:
            sequence || null,

        sequenceStrength:
            sequence?.strength ?? null,

        sequenceDirection:
            sequence?.direction ?? null,

        // ----------------------------------------------------
        // SIMETRÍA
        // ----------------------------------------------------

        ma50Symmetry:
            ma50Symmetry || null,

        // ----------------------------------------------------
        // RÉGIMEN DEL MERCADO
        // ----------------------------------------------------

        marketRegime:
            market.regime,

        marketReason:
            market.reason,

        marketDirection:
            market.direction,

        marketTradable:
            market.tradable,

        marketAllowReversal:
            market.allowReversal,

        marketMA50Slope:
            market.ma50Slope,

        marketMA10Slope:
            market.ma10Slope,

        marketLateralCount:
            market.lateralCount,

        marketPreviousLateralCount:
            market.previousLateralCount,

        marketRecentlyLateral:
            market.recentlyLateral,

        marketSeparation:
            market.separation,

        // ----------------------------------------------------
        // REVERSIÓN
        // ----------------------------------------------------

        reversalContext:
            reversalContext || null,

        // ----------------------------------------------------
        // FILTRO
        // ----------------------------------------------------

        filter:
            filter || null,

        filterBlocked:
            Boolean(filter)
    };
}


// ============================================================
// RESULTADO NEUTRAL
// ============================================================

function neutral(analysis = {}) {

    return {
        signal: null,
        score: 0,

        strategy: "sma_v5",

        entryType: null,

        reason:
            analysis.filter ||
            analysis.marketReason ||
            "NO_SIGNAL",

        counterTrend: false,

        analysis
    };
}


// ============================================================
// CONSTRUCCIÓN DEL RESULTADO
// ============================================================

function buildResult({
    signal,
    score = 0,
    entryType = null,
    reason = null,
    trendDirection = null,
    analysis = {}
}) {

    const normalizedSignal =
        signal === "CALL" ||
        signal === "PUT"
            ? signal
            : null;

    const counterTrend =
        Boolean(
            normalizedSignal &&
            trendDirection &&
            normalizedSignal !== trendDirection
        );

    return {

        signal:
            normalizedSignal,

        score:
            Number(score) || 0,

        strategy:
            "sma_v5",

        entryType,

        reason,

        counterTrend,

        analysis
    };
}
// ============================================================
// SMA STRATEGY V5 - MOTOR PRINCIPAL
// ============================================================
//
// FLUJO:
//
// 1. Validar candles
// 2. Calcular MA10 / MA50
// 3. Detectar régimen de mercado
// 4. Detectar debilitamiento / reversión
// 5. Detectar breakout MA50 si corresponde
// 6. BLOQUEAR LATERAL
// 7. BLOQUEAR TRANSICIÓN
// 8. Validar separación MA10/MA50
// 9. Buscar MEAN REVERSION
// 10. Buscar MA REJECTION
// 11. Buscar PULLBACK
// 12. Buscar CONTINUATION
// 13. Registrar entrada
//
// IMPORTANTE:
//
// La estrategia NO convierte cualquier cruce de MA50 en una
// operación de reversión.
//
// La reversión solamente se permite cuando el mercado viene
// de una zona lateral/transición y existe estructura suficiente.
// ============================================================

function smaStrategy(candles, state = {}) {

    // ========================================================
    // VALIDACIÓN BÁSICA
    // ========================================================

    if (!Array.isArray(candles)) {

        return neutral({
            filter: "INVALID_CANDLES"
        });
    }

    const requiredCandles =
        Math.max(
            CONFIG.SLOW_MA + 5,
            CONFIG.MIN_CANDLES || 0
        );

    if (candles.length < requiredCandles) {

        return neutral({
            filter: "INSUFFICIENT_CANDLES",
            candles: candles.length,
            required: requiredCandles
        });
    }

    // ========================================================
    // ÍNDICE ABSOLUTO
    // ========================================================
    //
    // El candleBuilder puede trabajar con una ventana deslizante.
    //
    // Por eso NO debemos utilizar simplemente "index" para
    // registrar operaciones en state.
    //
    // advanceAbsoluteIndex() mantiene el contador correcto.
    // ========================================================

    const index =
        candles.length - 1;

    const absIndex =
        advanceAbsoluteIndex(
            state,
            candles,
            index
        );

    // ========================================================
    // ACTUALIZAR ESTADO DE TENDENCIA
    // ========================================================

    updateTrendState(
        state,
        candles,
        index
    );

    // ========================================================
    // DATOS MA
    // ========================================================

    const current =
        getMAData(
            candles,
            index
        );

    if (!current) {

        return neutral({
            filter: "MA_DATA_UNAVAILABLE"
        });
    }

    // ========================================================
    // TENDENCIA
    // ========================================================

    const trend =
        getTrend(
            candles,
            index
        );

    // ========================================================
    // PENDIENTE MA10
    // ========================================================

    const slope =
        detectMA10Slope(
            candles,
            index
        );

    // ========================================================
    // SECUENCIA DE VELAS
    // ========================================================

    const sequence =
        detectCandleSequence(
            candles,
            index
        );

    // ========================================================
    // SIMETRÍA MA50
    // ========================================================

    const ma50Symmetry =
        detectMA50Symmetry(
            candles,
            index
        );

    // ========================================================
    // RÉGIMEN DEL MERCADO
    // ========================================================

    const marketRegime =
        detectMarketRegime(
            candles,
            index
        );

    // Guardar siempre el régimen actual.
    state.lastMarketRegime =
        marketRegime;

    state.marketRegime =
        marketRegime.regime;

    // ========================================================
    // CONTEXTO DE REVERSIÓN
    // ========================================================

    const reversalContext =
        detectReversalContext(
            candles,
            index,
            state
        );

    // ========================================================
    // ANÁLISIS COMÚN
    // ========================================================

    const commonAnalysis =
        buildAnalysis({
            candles,
            index,
            current,
            trend,
            sequence,
            slope,
            ma50Symmetry,
            marketRegime,
            reversalContext
        });

    // ========================================================
    // 1. BREAKOUT / REVERSIÓN MA50
    // ========================================================
    //
    // ESTE BLOQUE DEBE IR ANTES DEL BLOQUEO LATERAL.
    //
    // ¿Por qué?
    //
    // Porque una reversión válida precisamente puede aparecer
    // cuando el mercado está saliendo de una lateralidad.
    //
    // Ejemplo:
    //
    // MA50 plana
    //      ↓
    // precio rompe MA50
    //      ↓
    // MA50 comienza a inclinarse
    //      ↓
    // MA10 empieza a acompañar
    //      ↓
    // REVERSAL
    //
    // En cambio, si simplemente estamos en lateralidad,
    // allowReversal será false.
    // ========================================================

    if (
        CONFIG.MA50_BREAKOUT_ENABLED &&
        marketRegime.allowReversal
    ) {

        const breakout =
            detectMA50Breakout(
                candles,
                index
            );

        if (breakout) {

            const breakoutDirection =
                breakout.direction;

            // ------------------------------------------------
            // Dirección del régimen
            // ------------------------------------------------

            const regimeDirection =
                marketRegime.direction;

            let reversalDirectionOk = true;

            if (
                regimeDirection &&
                breakoutDirection
            ) {

                reversalDirectionOk =
                    regimeDirection ===
                    breakoutDirection;
            }

            // ------------------------------------------------
            // Separación mínima
            // ------------------------------------------------

            const separation =
                Number(
                    current.maSeparationNormalized
                ) || 0;

            const separationOk =
                separation >=
                Number(
                    CONFIG.EMERGING_MIN_SEPARATION
                );

            // ------------------------------------------------
            // Contexto de debilitamiento
            // ------------------------------------------------

            const weakeningOk =
                reversalContext.strengthWeakening ||
                reversalContext.strengthNearZero ||
                reversalContext.strengthSignChanged;

            // ------------------------------------------------
            // Confirmación de precio
            // ------------------------------------------------

            const priceConfirmation =
                reversalContext.priceHoldingMA50;

            // ------------------------------------------------
            // MA50 emergente
            // ------------------------------------------------

            const ma50Emerging =
                Math.abs(
                    Number(
                        marketRegime.ma50Slope
                    ) || 0
                ) >=
                Number(
                    CONFIG.MA50_EMERGING_SLOPE
                );

            // ------------------------------------------------
            // Validación final
            // ------------------------------------------------

            if (
                separationOk &&
                reversalDirectionOk &&
                weakeningOk &&
                priceConfirmation &&
                ma50Emerging
            ) {

                const canEnterReversal =
                    canEnter(
                        state,
                        absIndex,
                        breakoutDirection
                    );

                if (canEnterReversal) {

                    registerEntry(
                        absIndex,
                        "MA50_BREAKOUT_REVERSAL",
                        breakoutDirection,
                        state
                    );

                    state.lastReversalIndex =
                        absIndex;

                    const reversalScore =
                        8 +
                        (
                            reversalContext.strengthSignChanged
                                ? 2
                                : 0
                        ) +
                        (
                            reversalContext.confirmationCandles >= 2
                                ? 1
                                : 0
                        );

                    return buildResult({
                        signal:
                            breakoutDirection,

                        score:
                            reversalScore,

                        entryType:
                            "MA50_BREAKOUT_REVERSAL",

                        reason:
                            "MA50_BREAKOUT_REVERSAL_CONFIRMED",

                        trendDirection:
                            trend,

                        analysis: {
                            ...commonAnalysis,

                            breakout,

                            reversalContext,

                            marketRegime,

                            reversal:
                                true,

                            reversalScore
                        }
                    });
                }
            }
        }
    }

    // ========================================================
    // 2. BLOQUEO DE LATERALIDAD
    // ========================================================
    //
    // Aquí está el cambio fundamental.
    //
    // Antes:
    //
    // ma50.lateral
    //      ↓
    // solamente afectaba algunos detectores.
    //
    // Ahora:
    //
    // MARKET REGIME = LATERAL
    //      ↓
    // BLOQUEO GLOBAL
    //
    // Esto evita que PULLBACK / CONTINUATION / REJECTION
    // sigan entrando dentro de una MA50 plana.
    // ========================================================

    if (
        marketRegime.regime ===
        "LATERAL"
    ) {

        state.blockedByLateral =
            Number(
                state.blockedByLateral
            ) + 1;

        return neutral({
            ...commonAnalysis,

            marketRegime,

            filter:
                "MA50_LATERAL",

            filterBlocked:
                true
        });
    }

    // ========================================================
    // 3. BLOQUEO DE TRANSICIÓN
    // ========================================================

    if (
        marketRegime.regime ===
            "TRANSITION" &&
        CONFIG.BLOCK_TRANSITION_ENTRIES
    ) {

        state.blockedByTransition =
            Number(
                state.blockedByTransition
            ) + 1;

        return neutral({
            ...commonAnalysis,

            marketRegime,

            filter:
                "MARKET_TRANSITION",

            filterBlocked:
                true
        });
    }

    // ========================================================
    // 4. UNKNOWN
    // ========================================================

    if (
        marketRegime.regime ===
        "UNKNOWN"
    ) {

        return neutral({
            ...commonAnalysis,

            marketRegime,

            filter:
                "UNKNOWN_MARKET_REGIME",

            filterBlocked:
                true
        });
    }

    // ========================================================
    // 5. FILTRO DE SEPARACIÓN MA10 / MA50
    // ========================================================
    //
    // Evita operar cuando las medias están demasiado juntas.
    //
    // Esto es especialmente importante después de salir de
    // lateralidad.
    // ========================================================

    const separationCheck =
        checkMASeparation(
            current,
            trend
        );

    if (
        separationCheck &&
        separationCheck.blocked
    ) {

        return neutral({
            ...commonAnalysis,

            marketRegime,

            filter:
                "MA_SEPARATION",

            filterBlocked:
                true,

            separation:
                separationCheck
        });
    }

    // ========================================================
    // 6. VALIDAR DIRECCIÓN
    // ========================================================

    const confirmedDirection =
        directionConfirmed(
            candles,
            index,
            trend
        );

    // ========================================================
    // 7. MEAN REVERSION MA10
    // ========================================================
    //
    // Este detector busca situaciones donde el precio se ha
    // extendido demasiado de MA10 y empieza a regresar.
    //
    // No debe ejecutarse contra una estructura completamente
    // lateral porque el régimen ya fue filtrado arriba.
    // ========================================================

    if (
        CONFIG.MA10_MEAN_REVERSION_ENABLED
    ) {

        const meanReversion =
            detectMA10MeanReversion(
                candles,
                index,
                trend,
                slope
            );

        if (
            meanReversion &&
            meanReversion.signal
        ) {

            const signal =
                meanReversion.signal;

            // ----------------------------------------------
            // Validar entrada
            // ----------------------------------------------

            if (
                canEnter(
                    state,
                    absIndex,
                    signal
                )
            ) {

                registerEntry(
                    absIndex,
                    "MA10_MEAN_REVERSION",
                    signal,
                    state
                );

                return buildResult({

                    signal,

                    score:
                        Number(
                            meanReversion.score
                        ) || 0,

                    entryType:
                        "MA10_MEAN_REVERSION",

                    reason:
                        "MA10_MEAN_REVERSION_CONFIRMED",

                    trendDirection:
                        trend,

                    analysis: {

                        ...commonAnalysis,

                        marketRegime,

                        meanReversion
                    }
                });
            }
        }
    }

    // ========================================================
    // 8. MA10 PRE-REJECTION
    // ========================================================
    //
    // Detecta rejeição antecipada de MA10.
    //
    // É importante que continue existindo porque pode detectar
    // entradas antes de uma confirmação completa.
    // ========================================================

    if (
        CONFIG.MA10_PRE_REJECTION_ENABLED
    ) {

        const preRejection =
            detectMA10PreRejection(
                candles,
                index,
                trend,
                slope,
                ma50Symmetry
            );

        if (
            preRejection &&
            preRejection.signal
        ) {

            const signal =
                preRejection.signal;

            if (
                canEnter(
                    state,
                    absIndex,
                    signal
                )
            ) {

                registerEntry(
                    absIndex,
                    "MA10_PRE_REJECTION",
                    signal,
                    state
                );

                return buildResult({

                    signal,

                    score:
                        Number(
                            preRejection.score
                        ) || 0,

                    entryType:
                        "MA10_PRE_REJECTION",

                    reason:
                        "MA10_PRE_REJECTION_CONFIRMED",

                    trendDirection:
                        trend,

                    analysis: {

                        ...commonAnalysis,

                        marketRegime,

                        preRejection
                    }
                });
            }
        }
    }

    // ========================================================
    // 9. MA REJECTION
    // ========================================================

    if (
        CONFIG.MA_REJECTION_ENABLED
    ) {

        const rejection =
            detectRejection(
                candles,
                index,
                trend
            );

        if (
            rejection &&
            rejection.signal
        ) {

            const signal =
                rejection.signal;

            // ----------------------------------------------
            // Confirmar dirección
            // ----------------------------------------------

            const directionOk =
                !confirmedDirection ||
                confirmedDirection === signal;

            if (
                directionOk &&
                canEnter(
                    state,
                    absIndex,
                    signal
                )
            ) {

                registerEntry(
                    absIndex,
                    "MA_REJECTION",
                    signal,
                    state
                );

                return buildResult({

                    signal,

                    score:
                        Number(
                            rejection.score
                        ) || 0,

                    entryType:
                        "MA_REJECTION",

                    reason:
                        "MA_REJECTION_CONFIRMED",

                    trendDirection:
                        trend,

                    analysis: {

                        ...commonAnalysis,

                        marketRegime,

                        rejection
                    }
                });
            }
        }
    }

    // ========================================================
    // 10. PULLBACK
    // ========================================================

    const retracement =
        detectRetracement(
            candles,
            index,
            trend
        );

    if (
        retracement &&
        retracement.signal
    ) {

        const signal =
            retracement.signal;

        const directionOk =
            !confirmedDirection ||
            confirmedDirection === signal;

        if (
            directionOk &&
            canEnter(
                state,
                absIndex,
                signal
            )
        ) {

            registerEntry(
                absIndex,
                "PULLBACK",
                signal,
                state
            );

            return buildResult({

                signal,

                score:
                    Number(
                        retracement.score
                    ) || 0,

                entryType:
                    "PULLBACK",

                reason:
                    "PULLBACK_CONFIRMED",

                trendDirection:
                    trend,

                analysis: {

                    ...commonAnalysis,

                    marketRegime,

                    retracement
                }
            });
        }
    }

    // ========================================================
    // 11. CONTINUATION
    // ========================================================
    //
    // Este es el último detector.
    //
    // Solamente se llega aquí si:
    //
    // - NO estamos en lateral
    // - NO estamos en transición
    // - NO hubo reversión
    // - NO hubo mean reversion
    // - NO hubo rejection
    // - NO hubo pullback
    //
    // Por tanto CONTINUATION representa una entrada de tendencia
    // relativamente limpia.
    // ========================================================

    const continuation =
        detectContinuation(
            candles,
            index,
            trend
        );

    if (
        continuation &&
        continuation.signal
    ) {

        const signal =
            continuation.signal;

        const directionOk =
            !confirmedDirection ||
            confirmedDirection === signal;

        if (
            directionOk &&
            canEnter(
                state,
                absIndex,
                signal
            )
        ) {

            registerEntry(
                absIndex,
                "CONTINUATION",
                signal,
                state
            );

            return buildResult({

                signal,

                score:
                    Number(
                        continuation.score
                    ) || 0,

                entryType:
                    "CONTINUATION",

                reason:
                    "TREND_CONTINUATION_CONFIRMED",

                trendDirection:
                    trend,

                analysis: {

                    ...commonAnalysis,

                    marketRegime,

                    continuation
                }
            });
        }
    }

    // ========================================================
    // 12. SIN SEÑAL
    // ========================================================

    return neutral({

        ...commonAnalysis,

        marketRegime,

        filter:
            "NO_VALID_ENTRY",

        filterBlocked:
            false
    });
}


// ============================================================
// EXPORTS
// ============================================================
//
// IMPORTANTE:
//
// Mantener aquí los exports que ya utiliza botEngine.
//
// Si tu archivo original exporta más funciones, se conservan
// también en la PARTE 5.
// ============================================================

module.exports = {
    smaStrategy,

    detectMarketRegime,
    detectTrendWeakening,
    detectReversalContext,

    detectMA50Breakout,
    detectMA50Lateral,
    detectMA50Symmetry,

    detectMA10Slope,
    detectMA10MeanReversion,
    detectMA10PreRejection,

    detectRetracement,
    detectRejection,
    detectContinuation,

    detectCandleSequence,
    detectDirectionChange,

    checkMASeparation,

    calculateSMA: smaAt
};
// ============================================================
// EXPORT FINAL - COMPATIBLE CON BOTENGINE
// ============================================================
//
// Compatible con:
//
// const getSignal = require("../bot/smaStrategy");
//
// y también permite:
//
// const {
//     smaStrategy,
//     detectMarketRegime,
//     detectMA50Breakout
// } = require("../bot/smaStrategy");
//
// ============================================================

module.exports = smaStrategy;


// ============================================================
// FUNCIONES AUXILIARES DISPONIBLES
// ============================================================

module.exports.smaStrategy =
    smaStrategy;

module.exports.detectMarketRegime =
    detectMarketRegime;

module.exports.detectTrendWeakening =
    detectTrendWeakening;

module.exports.detectReversalContext =
    detectReversalContext;

module.exports.detectMA50Breakout =
    detectMA50Breakout;

module.exports.detectMA50Lateral =
    detectMA50Lateral;

module.exports.detectMA50Symmetry =
    detectMA50Symmetry;

module.exports.detectMA10Slope =
    detectMA10Slope;

module.exports.detectMA10MeanReversion =
    detectMA10MeanReversion;

module.exports.detectMA10PreRejection =
    detectMA10PreRejection;

module.exports.detectRetracement =
    detectRetracement;

module.exports.detectRejection =
    detectRejection;

module.exports.detectContinuation =
    detectContinuation;

module.exports.detectCandleSequence =
    detectCandleSequence;

module.exports.detectDirectionChange =
    detectDirectionChange;

module.exports.checkMASeparation =
    checkMASeparation;

module.exports.calculateSMA =
    smaAt;