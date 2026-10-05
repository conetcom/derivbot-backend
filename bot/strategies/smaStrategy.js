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

    MIN_CANDLES_BETWEEN_TRADES: 1,
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
    // FILTRO SEPARACIÓN MA10 / MA50  (NUEVO)
    // --------------------------------------------------------

    // true  => bloquea entradas si las medias están muy juntas
    MA_SEPARATION_FILTER_ENABLED: true,

    // Separación mínima |MA10-MA50| en unidades de avgRange.
    // Valor inicial, NO calibrado: ajústalo con tus datos.
    MIN_MA_SEPARATION: 0.20,

    // --------------------------------------------------------
    // MA50 BREAKOUT (NUEVO)
    // --------------------------------------------------------
    //
    // vela N      = vela que cruza la MA50 con fuerza
    // vela N+1    = primera vela después
    // vela N+2    = segunda vela después  <- aquí sale la señal
    //
    // (la operación se abre en la apertura de la vela N+3)
    //
    // --------------------------------------------------------

    MA50_BREAKOUT_ENABLED: true,

    // Velas después de la vela de cruce en que se emite la señal
    BREAKOUT_ENTRY_CANDLES_AFTER: 1,

    // Vela de cruce: cuerpo / rango mínimo
    BREAKOUT_MIN_STRENGTH: 0.50,

    // Vela de cruce: tamaño del cuerpo en rangos promedio
    // (rango medido ANTES de la vela de cruce)
    BREAKOUT_MIN_BODY_NORMALIZED: 1.00,

    // Vela de cruce: cierre al menos X rangos más allá de MA50
    BREAKOUT_MIN_CLOSE_BEYOND_MA50: 0.20,

    // true => exige que MA10 siga del lado contrario de MA50
    // (el cruce de medias todavía no ocurrió)
    BREAKOUT_REQUIRE_MA10_NOT_CROSSED: true,

    // MA10 debe apuntar en la dirección del breakout
    BREAKOUT_MIN_MA10_SLOPE: 0.05,

    // Máximo retroceso permitido (fracción del cuerpo de la
    // vela de cruce) en las velas posteriores
    BREAKOUT_MAX_RETRACE: 0.50,

    // La vela de entrada debe ir en la dirección del breakout
    BREAKOUT_REQUIRE_ENTRY_CANDLE_DIRECTION: true,
    BREAKOUT_MIN_ENTRY_STRENGTH: 0.20,

    // No entrar si el precio ya está muy lejos de la MA50
    // (en rangos promedio)
    BREAKOUT_MAX_EXTENSION_FROM_MA50: 4.00,

    // true => esta entrada ignora el filtro MIN_MA_SEPARATION
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

    // true  => la señal va CONTRA la tendencia (vuelta a MA10)
    // false => la señal sigue la tendencia
    MA10_MEAN_REVERSION_COUNTER_TREND: true,

    // --------------------------------------------------------
    // PRE REJECTION
    // --------------------------------------------------------

    MA10_PRE_REJECTION_ENABLED: true,
    MA10_PRE_REJECTION_MIN_RATIO: 1.25,
    MA10_PRE_REJECTION_MIN_STRENGTH: 0.20,
    MA10_PRE_REJECTION_COUNTER_TREND: true,

    DEBUG: false
};


// ============================================================
// UTILIDADES
// ============================================================

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
}


function round(value, decimals = 4) {

    const factor = Math.pow(10, decimals);

    return Math.round(number(value) * factor) / factor;
}


function oppositeDirection(direction) {

    if (direction === "CALL") return "PUT";
    if (direction === "PUT") return "CALL";

    return null;
}


// ============================================================
// SMA
// ============================================================

function smaAt(candles, index, period) {

    if (!Array.isArray(candles) || index < period - 1) {

        return null;
    }

    let sum = 0;

    for (let i = index - period + 1; i <= index; i++) {

        sum += number(candles[i]?.close);
    }

    return sum / period;
}


// ============================================================
// RANGO PROMEDIO
// ============================================================

function averageRangeAt(candles, index, period = 10) {

    if (!Array.isArray(candles) || index < 0) {

        return 0;
    }

    const start = Math.max(0, index - period + 1);

    let total = 0;
    let count = 0;

    for (let i = start; i <= index; i++) {

        const range =
            number(candles[i]?.high) -
            number(candles[i]?.low);

        if (range > 0) {

            total += range;
            count++;
        }
    }

    return count ? total / count : 0;
}


// ============================================================
// VELAS
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

    return Math.abs(close - open) / range;
}


function isBullish(candle) {

    return number(candle?.close) > number(candle?.open);
}


function isBearish(candle) {

    return number(candle?.close) < number(candle?.open);
}


// ============================================================
// CLASIFICAR SIMETRÍA
// ============================================================

function classifyMA50Symmetry(ratio) {

    if (ratio < 0.80) return "NORMAL";
    if (ratio < 1.00) return "NEAR_MA10";
    if (ratio < 1.25) return "EXTENSION_LOW";
    if (ratio < 1.50) return "EXTENSION_MEDIUM";
    if (ratio < 2.00) return "EXTENSION_HIGH";

    return "EXTENSION_EXTREME";
}


// ============================================================
// DATOS PRINCIPALES MA (CON CACHÉ POR LLAMADA)
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
// `distance`   = ma10DistanceNormalized
// `maSeparationNormalized` = maDistanceNormalized (para el filtro)
//
// ============================================================

let maCache = new Map();
let maCacheCandles = null;


function resetCache(candles) {

    maCache = new Map();
    maCacheCandles = candles;
}


function getMAData(candles, index) {

    if (candles === maCacheCandles && maCache.has(index)) {

        return maCache.get(index);
    }

    const result = computeMAData(candles, index);

    if (candles === maCacheCandles) {

        maCache.set(index, result);
    }

    return result;
}


function computeMAData(candles, index) {

    const ma10 = smaAt(candles, index, CONFIG.FAST_MA);
    const ma50 = smaAt(candles, index, CONFIG.SLOW_MA);

    if (ma10 == null || ma50 == null) {

        return null;
    }

    const avgRange = averageRangeAt(
        candles,
        index,
        CONFIG.RANGE_PERIOD
    );

    if (!avgRange) {

        return null;
    }

    const close = number(candles[index]?.close);

    const ma10Distance = Math.abs(close - ma10);
    const ma50Distance = Math.abs(close - ma50);
    const maDistance = Math.abs(ma10 - ma50);

    const maDistanceRatio =
        maDistance > 0
            ? ma50Distance / maDistance
            : 0;

    const ma10DistanceNormalized = ma10Distance / avgRange;
    const ma50DistanceNormalized = ma50Distance / avgRange;
    const maDistanceNormalized = maDistance / avgRange;

    return {

        ma10,
        ma50,
        close,
        avgRange,

        ma10Distance: round(ma10Distance, 6),
        ma50Distance: round(ma50Distance, 6),
        maDistance: round(maDistance, 6),

        maDistanceRatio: round(maDistanceRatio, 4),

        symmetryClass: classifyMA50Symmetry(maDistanceRatio),

        ma10DistanceNormalized: round(ma10DistanceNormalized, 4),
        ma50DistanceNormalized: round(ma50DistanceNormalized, 4),
        maDistanceNormalized: round(maDistanceNormalized, 4),

        // Separación MA10-MA50 en rangos (usada por el filtro)
        maSeparationNormalized: round(maDistanceNormalized, 4),

        distance: round(ma10DistanceNormalized, 4),

        aboveMA10: close > ma10,
        belowMA10: close < ma10,
        aboveMA50: close > ma50,
        belowMA50: close < ma50
    };
}


// ============================================================
// FILTRO: SEPARACIÓN MA10 / MA50  (NUEVO)
// ============================================================

function checkMASeparation(candles, index) {

    if (!CONFIG.MA_SEPARATION_FILTER_ENABLED) {

        return {

            passed: true,
            enabled: false
        };
    }

    const data = getMAData(candles, index);

    if (!data) {

        return {

            passed: false,
            enabled: true,
            reason: "NO_MA_DATA"
        };
    }

    const separation = data.maSeparationNormalized;

    return {

        passed: separation >= CONFIG.MIN_MA_SEPARATION,
        enabled: true,
        separation,
        minRequired: CONFIG.MIN_MA_SEPARATION,
        reason:
            separation >= CONFIG.MIN_MA_SEPARATION
                ? null
                : "MA_TOO_CLOSE"
    };
}


// ============================================================
// MA50 BREAKOUT (NUEVO)
// ============================================================
//
// Busca una vela de cruce de MA50 exactamente N velas atrás
// (N = BREAKOUT_ENTRY_CANDLES_AFTER) y valida que:
//
//  - la vela de cruce sea fuerte y cierre más allá de MA50
//  - MA10 todavía NO haya cruzado MA50 (opcional)
//  - MA10 apunte en la dirección del breakout
//  - las velas siguientes sostengan el nuevo lado de MA50
//    y no retrocedan más de BREAKOUT_MAX_RETRACE
//  - la vela actual (de entrada) vaya en la dirección
//  - el precio no esté demasiado extendido
//
// Como solo se evalúa cuando index === crossIndex + N,
// cada breakout genera como máximo UNA señal.
//
// ============================================================

function detectMA50Breakout(candles, index) {

    if (!CONFIG.MA50_BREAKOUT_ENABLED) {

        return { detected: false };
    }

    const after = CONFIG.BREAKOUT_ENTRY_CANDLES_AFTER;

    const crossIdx = index - after;

    if (crossIdx < CONFIG.SLOW_MA + 1) {

        return { detected: false, reason: "NOT_ENOUGH_DATA" };
    }

    const crossCandle = candles[crossIdx];
    const prevCandle = candles[crossIdx - 1];

    const crossMA = getMAData(candles, crossIdx);
    const prevMA = getMAData(candles, crossIdx - 1);
    const current = getMAData(candles, index);

    if (!crossMA || !prevMA || !current) {

        return { detected: false, reason: "NO_MA_DATA" };
    }

    const crossOpen = number(crossCandle.open);
    const crossClose = number(crossCandle.close);
    const prevClose = number(prevCandle.close);

    // --------------------------------------------------------
    // ¿LA VELA N CRUZÓ LA MA50?
    // --------------------------------------------------------

    let direction = null;

    if (
        prevClose <= prevMA.ma50 &&
        crossClose > crossMA.ma50
    ) {

        direction = "CALL";

    } else if (
        prevClose >= prevMA.ma50 &&
        crossClose < crossMA.ma50
    ) {

        direction = "PUT";
    }

    if (!direction) {

        return { detected: false, reason: "NO_CROSS_CANDLE" };
    }

    // --------------------------------------------------------
    // FUERZA DE LA VELA DE CRUCE
    // --------------------------------------------------------

    // Rango medido antes de la vela de cruce, para que la
    // propia vela no infle la referencia.
    const refRange = prevMA.avgRange;

    const body = Math.abs(crossClose - crossOpen);

    const crossStrength = candleStrength(crossCandle);

    const bodyNormalized = body / refRange;

    const crossDirectionOk =
        direction === "CALL"
            ? isBullish(crossCandle)
            : isBearish(crossCandle);

    const closeBeyondMA50 =
        (
            direction === "CALL"
                ? crossClose - crossMA.ma50
                : crossMA.ma50 - crossClose
        ) / refRange;

    const strongCross =
        crossDirectionOk &&
        crossStrength >= CONFIG.BREAKOUT_MIN_STRENGTH &&
        bodyNormalized >= CONFIG.BREAKOUT_MIN_BODY_NORMALIZED &&
        closeBeyondMA50 >= CONFIG.BREAKOUT_MIN_CLOSE_BEYOND_MA50;

    if (!strongCross) {

        return {
            detected: false,
            reason: "WEAK_CROSS_CANDLE",
            direction,
            crossStrength: round(crossStrength, 4),
            bodyNormalized: round(bodyNormalized, 4),
            closeBeyondMA50: round(closeBeyondMA50, 4)
        };
    }

    // --------------------------------------------------------
    // MA10 TODAVÍA NO CRUZÓ MA50
    // --------------------------------------------------------

    const ma10NotCrossed =
        direction === "CALL"
            ? current.ma10 < current.ma50
            : current.ma10 > current.ma50;

    if (
        CONFIG.BREAKOUT_REQUIRE_MA10_NOT_CROSSED &&
        !ma10NotCrossed
    ) {

        return {
            detected: false,
            reason: "MA10_ALREADY_CROSSED",
            direction
        };
    }

    // --------------------------------------------------------
    // PENDIENTE MA10 A FAVOR
    // --------------------------------------------------------

    const slope = detectMA10Slope(candles, index);

    const slopeOk =
        direction === "CALL"
            ? slope.slope >= CONFIG.BREAKOUT_MIN_MA10_SLOPE
            : slope.slope <= -CONFIG.BREAKOUT_MIN_MA10_SLOPE;

    if (!slopeOk) {

        return {
            detected: false,
            reason: "MA10_SLOPE_AGAINST",
            direction,
            slope
        };
    }

    // --------------------------------------------------------
    // VELAS POSTERIORES SOSTIENEN EL NUEVO LADO
    // --------------------------------------------------------

    const retraceLevel =
        direction === "CALL"
            ? crossClose - CONFIG.BREAKOUT_MAX_RETRACE * body
            : crossClose + CONFIG.BREAKOUT_MAX_RETRACE * body;

    for (let i = crossIdx + 1; i <= index; i++) {

        const ma = getMAData(candles, i);

        if (!ma) {

            return { detected: false, reason: "NO_MA_DATA" };
        }

        const close = number(candles[i].close);

        const heldMA50 =
            direction === "CALL"
                ? close > ma.ma50
                : close < ma.ma50;

        const heldRetrace =
            direction === "CALL"
                ? close >= retraceLevel
                : close <= retraceLevel;

        if (!heldMA50 || !heldRetrace) {

            return {
                detected: false,
                reason: !heldMA50
                    ? "LOST_MA50"
                    : "RETRACE_TOO_DEEP",
                direction,
                failedAt: i - crossIdx
            };
        }
    }

    // --------------------------------------------------------
    // VELA DE ENTRADA
    // --------------------------------------------------------

    const entryCandle = candles[index];

    const entryStrength = candleStrength(entryCandle);

    const entryDirectionOk =
        direction === "CALL"
            ? isBullish(entryCandle)
            : isBearish(entryCandle);

    if (
        CONFIG.BREAKOUT_REQUIRE_ENTRY_CANDLE_DIRECTION &&
        (
            !entryDirectionOk ||
            entryStrength < CONFIG.BREAKOUT_MIN_ENTRY_STRENGTH
        )
    ) {

        return {
            detected: false,
            reason: "ENTRY_CANDLE_INVALID",
            direction,
            entryStrength: round(entryStrength, 4)
        };
    }

    // --------------------------------------------------------
    // NO PERSEGUIR PRECIO EXTENDIDO
    // --------------------------------------------------------

    const extension =
        Math.abs(current.close - current.ma50) /
        current.avgRange;

    if (extension > CONFIG.BREAKOUT_MAX_EXTENSION_FROM_MA50) {

        return {
            detected: false,
            reason: "TOO_EXTENDED",
            direction,
            extension: round(extension, 4)
        };
    }

    return {

        detected: true,
        direction,
        type: "MA50_BREAKOUT",
        crossIndexOffset: after,
        crossStrength: round(crossStrength, 4),
        bodyNormalized: round(bodyNormalized, 4),
        closeBeyondMA50: round(closeBeyondMA50, 4),
        ma10NotCrossed,
        ma10Slope: slope.slope,
        entryStrength: round(entryStrength, 4),
        extension: round(extension, 4),
        maSeparationNormalized: current.maSeparationNormalized
    };
}


// ============================================================
// CROSS MA10 / MA50
// ============================================================

function detectCross(candles, index) {

    if (index < CONFIG.SLOW_MA) {

        return null;
    }

    const current = getMAData(candles, index);
    const previous = getMAData(candles, index - 1);

    if (!current || !previous) {

        return null;
    }

    if (
        previous.ma10 <= previous.ma50 &&
        current.ma10 > current.ma50
    ) {

        return "CALL";
    }

    if (
        previous.ma10 >= previous.ma50 &&
        current.ma10 < current.ma50
    ) {

        return "PUT";
    }

    return null;
}


// ============================================================
// TENDENCIA
// ============================================================

function getTrend(candles, index) {

    const data = getMAData(candles, index);

    if (!data) {

        return null;
    }

    if (data.ma10 > data.ma50) return "CALL";
    if (data.ma10 < data.ma50) return "PUT";

    return null;
}


// ============================================================
// PENDIENTE MA10
// ============================================================

const FLAT_SLOPE = {

    direction: "FLAT",
    slope: 0,
    previousSlope: 0,
    acceleration: 0,
    strong: false
};


function detectMA10Slope(candles, index) {

    const lookback = CONFIG.MA10_SLOPE_LOOKBACK;

    if (index < CONFIG.FAST_MA + lookback) {

        return { ...FLAT_SLOPE };
    }

    const currentMA = smaAt(candles, index, CONFIG.FAST_MA);
    const previousMA = smaAt(candles, index - lookback, CONFIG.FAST_MA);
    const previousCurrent = smaAt(candles, index - 1, CONFIG.FAST_MA);
    const previousPrevious = smaAt(candles, index - 1 - lookback, CONFIG.FAST_MA);

    if (
        currentMA == null ||
        previousMA == null ||
        previousCurrent == null ||
        previousPrevious == null
    ) {

        return { ...FLAT_SLOPE };
    }

    const avgRange = averageRangeAt(
        candles,
        index,
        CONFIG.RANGE_PERIOD
    );

    if (!avgRange) {

        return { ...FLAT_SLOPE };
    }

    const slope = (currentMA - previousMA) / avgRange;

    const previousSlope =
        (previousCurrent - previousPrevious) / avgRange;

    const acceleration = slope - previousSlope;

    let direction = "FLAT";

    if (slope >= CONFIG.MA10_SLOPE_MIN) {

        direction = "CALL";

    } else if (slope <= -CONFIG.MA10_SLOPE_MIN) {

        direction = "PUT";
    }

    return {

        direction,
        slope: round(slope, 4),
        previousSlope: round(previousSlope, 4),
        acceleration: round(acceleration, 4),
        strong: Math.abs(slope) >= CONFIG.MA10_STRONG_SLOPE
    };
}


// ============================================================
// LATERALIDAD MA50
// ============================================================

function detectMA50Lateral(candles, index) {

    const lookback = CONFIG.MA50_SLOPE_LOOKBACK;

    if (index < CONFIG.SLOW_MA + lookback) {

        return { lateral: false, slope: 0 };
    }

    const currentMA = smaAt(candles, index, CONFIG.SLOW_MA);
    const previousMA = smaAt(candles, index - lookback, CONFIG.SLOW_MA);

    if (currentMA == null || previousMA == null) {

        return { lateral: false, slope: 0 };
    }

    const avgRange = averageRangeAt(
        candles,
        index,
        CONFIG.RANGE_PERIOD
    );

    if (!avgRange) {

        return { lateral: false, slope: 0 };
    }

    const slope = (currentMA - previousMA) / avgRange;

    return {

        lateral: Math.abs(slope) <= CONFIG.MA50_LATERAL_MAX,
        slope: round(slope, 4),
        ma50: currentMA
    };
}


// ============================================================
// SECUENCIA DE VELAS
// ============================================================

function detectCandleSequence(candles, index) {

    if (index < 1) {

        return {

            direction: null,
            count: 0,
            averageStrength: 0,
            valid: false,
            sequence: []
        };
    }

    let direction = null;
    let count = 0;
    let totalStrength = 0;

    const sequence = [];

    for (
        let i = index;
        i >= 0 && count < CONFIG.MAX_SEQUENCE;
        i--
    ) {

        const candle = candles[i];

        let candleDirection = null;

        if (isBullish(candle)) {

            candleDirection = "CALL";

        } else if (isBearish(candle)) {

            candleDirection = "PUT";

        } else {

            break;
        }

        if (!direction) {

            direction = candleDirection;
        }

        if (candleDirection !== direction) {

            break;
        }

        totalStrength += candleStrength(candle);

        sequence.push(candleDirection);

        count++;
    }

    const averageStrength =
        count > 0 ? totalStrength / count : 0;

    return {

        direction,
        count,
        averageStrength: round(averageStrength, 4),

        valid:
            count >= CONFIG.MIN_SEQUENCE &&
            averageStrength >= CONFIG.MIN_SEQUENCE_STRENGTH,

        sequence
    };
}


// ============================================================
// CAMBIO DE DIRECCIÓN
// ============================================================

function detectDirectionChange(candles, index) {

    if (index < CONFIG.FAST_MA + 5) {

        return { detected: false, direction: null };
    }

    const current = detectMA10Slope(candles, index);
    const previous = detectMA10Slope(candles, index - 1);
    const previous2 = detectMA10Slope(candles, index - 2);

    const min = CONFIG.DIRECTION_CHANGE_MIN_SLOPE;

    const toPut =
        previous2.slope > min &&
        previous.slope >= -min &&
        current.slope <= -min;

    const toCall =
        previous2.slope < -min &&
        previous.slope <= min &&
        current.slope >= min;

    if (toPut || toCall) {

        return {

            detected: true,
            direction: toPut ? "PUT" : "CALL",
            previousSlope: previous2.slope,
            currentSlope: current.slope,
            acceleration: current.acceleration
        };
    }

    return {

        detected: false,
        direction: null,
        previousSlope: previous.slope,
        currentSlope: current.slope,
        acceleration: current.acceleration
    };
}


// ============================================================
// EXTENSIÓN / SIMETRÍA MA50
// ============================================================

function detectMA50Symmetry(candles, index) {

    const current = getMAData(candles, index);

    if (!current) {

        return { valid: false, extended: false, direction: null };
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

    if (maDistance <= 0) {

        return { valid: false, extended: false, direction: null };
    }

    let direction = null;

    if (ma10 > ma50 && close > ma50) {

        direction = "CALL";

    } else if (ma10 < ma50 && close < ma50) {

        direction = "PUT";
    }

    const beyondMA10 =
        (direction === "CALL" && close > ma10) ||
        (direction === "PUT" && close < ma10);

    const extended =
        direction !== null &&
        beyondMA10 &&
        maDistanceRatio >= CONFIG.MA50_SYMMETRY_THRESHOLD &&
        ma10DistanceNormalized >= CONFIG.MA10_EXTENSION_MIN_NORMALIZED;

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

function detectMA10MeanReversion(candles, index, direction) {

    if (!CONFIG.MA10_MEAN_REVERSION_ENABLED || index < 1) {

        return { detected: false };
    }

    const symmetry = detectMA50Symmetry(candles, index);

    if (!symmetry.valid || !symmetry.extended) {

        return { detected: false, symmetry };
    }

    if (symmetry.direction !== direction) {

        return {
            detected: false,
            reason: "DIRECTION_MISMATCH",
            symmetry
        };
    }

    const current = candles[index];
    const previous = candles[index - 1];

    const currentStrength = candleStrength(current);
    const previousStrength = candleStrength(previous);

    if (currentStrength < CONFIG.MA10_MEAN_REVERSION_MIN_STRENGTH) {

        return {
            detected: false,
            reason: "WEAK_CANDLE",
            symmetry
        };
    }

    const losingStrength = currentStrength < previousStrength;

    const colorChange =
        direction === "PUT"
            ? (isBearish(previous) && isBullish(current))
            : (isBullish(previous) && isBearish(current));

    const previousMA = getMAData(candles, index - 1);

    if (!previousMA) {

        return { detected: false, symmetry };
    }

    const currentMA10Distance =
        Math.abs(number(current.close) - symmetry.ma10);

    const previousMA10Distance =
        Math.abs(number(previous.close) - previousMA.ma10);

    const approachingMA10 =
        currentMA10Distance < previousMA10Distance;

    const slope = detectMA10Slope(candles, index);

    const detected =
        symmetry.maDistanceRatio >=
            CONFIG.MA10_MEAN_REVERSION_MIN_RATIO &&
        (losingStrength || colorChange || approachingMA10);

    const signal =
        CONFIG.MA10_MEAN_REVERSION_COUNTER_TREND
            ? oppositeDirection(direction)
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
// PRE REJECTION MA10
// ============================================================

function detectMA10PreRejection(candles, index, direction) {

    if (!CONFIG.MA10_PRE_REJECTION_ENABLED || index < 3) {

        return { detected: false };
    }

    const symmetry = detectMA50Symmetry(candles, index);

    if (!symmetry.valid) {

        return { detected: false, symmetry };
    }

    if (symmetry.direction !== direction) {

        return {
            detected: false,
            reason: "DIRECTION_MISMATCH",
            symmetry
        };
    }

    if (
        symmetry.maDistanceRatio <
        CONFIG.MA10_PRE_REJECTION_MIN_RATIO
    ) {

        return {
            detected: false,
            reason: "RATIO_TOO_LOW",
            symmetry
        };
    }

    const current = candles[index];
    const previous = candles[index - 1];

    const sequence = detectCandleSequence(candles, index);
    const slope = detectMA10Slope(candles, index);
    const ma50 = detectMA50Lateral(candles, index);

    const strength = candleStrength(current);

    if (strength < CONFIG.MA10_PRE_REJECTION_MIN_STRENGTH) {

        return {
            detected: false,
            reason: "WEAK_CANDLE",
            symmetry,
            sequence,
            slope,
            ma50
        };
    }

    if (sequence.count < CONFIG.MIN_SEQUENCE) {

        return {
            detected: false,
            reason: "SHORT_SEQUENCE",
            symmetry,
            sequence,
            slope,
            ma50
        };
    }

    if (sequence.direction !== direction) {

        return {
            detected: false,
            reason: "SEQUENCE_MISMATCH",
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

    const currentMA10Distance = symmetry.ma10Distance;

    const previousMA = getMAData(candles, index - 1);

    const previousMA10Distance =
        previousMA
            ? Math.abs(number(previous.close) - previousMA.ma10)
            : currentMA10Distance;

    const approachingMA10 =
        currentMA10Distance < previousMA10Distance;

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
            ? oppositeDirection(direction)
            : direction;

    return {

        detected,
        direction,
        signal,
        type: "MA10_PRE_REJECTION",
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

function detectRetracement(candles, index, direction) {

    if (index < 3) {

        return { detected: false };
    }

    const current = getMAData(candles, index);
    const previous = getMAData(candles, index - 1);
    const previous2 = getMAData(candles, index - 2);
    const previous3 = getMAData(candles, index - 3);

    if (!current || !previous || !previous2 || !previous3) {

        return { detected: false };
    }

    const trend =
        direction === "CALL"
            ? current.ma10 > current.ma50
            : current.ma10 < current.ma50;

    if (!trend) {

        return { detected: false, reason: "NO_TREND" };
    }

    const d0 = current.distance;
    const d1 = previous.distance;
    const d2 = previous2.distance;
    const d3 = previous3.distance;

    const approaching = d1 < d2 || d2 < d3;

    const nearMA10 =
        Math.min(d0, d1, d2) <= CONFIG.MA10_ZONE_DISTANCE;

    const nearMA50 =
        Math.abs(current.close - current.ma50) /
        current.avgRange <=
        CONFIG.MA50_ZONE_DISTANCE;

    return {

        detected: approaching && (nearMA10 || nearMA50),
        trend,
        approaching,
        nearMA10,
        nearMA50,
        distance: round(d0, 3),
        previousDistance: round(d1, 3),
        ma10: current.ma10,
        ma50: current.ma50
    };
}


// ============================================================
// REJECTION MA10
// ============================================================

function detectRejection(candles, index, direction) {

    if (!CONFIG.MA_REJECTION_ENABLED || index < 4) {

        return { detected: false };
    }

    const current = getMAData(candles, index);
    const previous = getMAData(candles, index - 1);
    const previous2 = getMAData(candles, index - 2);
    const previous3 = getMAData(candles, index - 3);
    const previous4 = getMAData(candles, index - 4);

    if (
        !current ||
        !previous ||
        !previous2 ||
        !previous3 ||
        !previous4
    ) {

        return { detected: false };
    }

    const d0 = current.distance;
    const d1 = previous.distance;
    const d2 = previous2.distance;
    const d3 = previous3.distance;
    const d4 = previous4.distance;

    const trend =
        direction === "CALL"
            ? current.ma10 > current.ma50
            : current.ma10 < current.ma50;

    if (!trend) {

        return { detected: false, reason: "TREND_INVALID" };
    }

    const minDistance = Math.min(d1, d2, d3);

    const nearMA =
        minDistance <= CONFIG.RETRACEMENT_MAX_DISTANCE;

    const approaching = d2 < d3 || d3 < d4;

    const recovering = d0 > d1;

    const recoveryFromMinimum = d1 <= d2 || d1 <= d3;

    const currentCandle = candles[index];

    const directionCandle =
        direction === "CALL"
            ? isBullish(currentCandle)
            : isBearish(currentCandle);

    const strength = candleStrength(currentCandle);

    const strengthValid =
        strength >= CONFIG.MA_REJECTION_MIN_STRENGTH;

    const priceDistanceToMA50 =
        Math.abs(current.close - current.ma50) /
        current.avgRange;

    const nearMA50 =
        priceDistanceToMA50 <= CONFIG.MA50_ZONE_DISTANCE;

    const touchedMA =
        direction === "CALL"
            ? currentCandle.low <= current.ma10
            : currentCandle.high >= current.ma10;

    if (CONFIG.MA_REJECTION_REQUIRE_TOUCH && !touchedMA) {

        return { detected: false, reason: "NO_TOUCH" };
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
        ma10: current.ma10,
        ma50: current.ma50,
        close: current.close,
        distance: round(d0, 3),
        previousDistance: round(d1, 3),
        minDistance: round(minDistance, 3),
        priceDistanceToMA50: round(priceDistanceToMA50, 3)
    };
}


// ============================================================
// CONTINUATION
// ============================================================

function detectContinuation(candles, index, direction) {

    if (index < 3) {

        return false;
    }

    const current = candles[index];
    const previous = candles[index - 1];

    const ma = getMAData(candles, index);

    if (!ma) {

        return false;
    }

    if (direction === "CALL") {

        return (
            ma.ma10 > ma.ma50 &&
            ma.close > ma.ma10 &&
            (isBullish(current) || isBullish(previous))
        );
    }

    if (direction === "PUT") {

        return (
            ma.ma10 < ma.ma50 &&
            ma.close < ma.ma10 &&
            (isBearish(current) || isBearish(previous))
        );
    }

    return false;
}


// ============================================================
// CONFIRMAR DIRECCIÓN
// ============================================================

function directionConfirmed(candles, index, direction) {

    const current = candles[index];

    const ma = getMAData(candles, index);

    if (!ma) {

        return false;
    }

    if (candleStrength(current) < CONFIG.MIN_CANDLE_STRENGTH) {

        return false;
    }

    if (direction === "CALL") {

        return ma.ma10 > ma.ma50 && isBullish(current);
    }

    if (direction === "PUT") {

        return ma.ma10 < ma.ma50 && isBearish(current);
    }

    return false;
}


// ============================================================
// STATE
// ============================================================

function initializeState(state) {

    if (!state.smaStrategy) {

        state.smaStrategy = {

            absoluteIndex: -1,
            lastCandleKey: null,

            trendDirection: null,
            trendStartIndex: null,
            lastCrossIndex: null,
            lastEntryIndex: null,
            lastEntryType: null,
            tradesInTrend: 0,
            lastSignalIndex: null,

            lastSymmetryClass: null,
            lastMA10Distance: null,
            lastMA50Distance: null,
            lastMADistance: null,
            lastMADistanceRatio: null,
            lastAnalysis: null,

            // NUEVO: estadística del filtro
            lastSeparationCheck: null,
            blockedBySeparation: 0
        };
    }

    return state.smaStrategy;
}


// ============================================================
// ÍNDICE ABSOLUTO
// ============================================================

function advanceAbsoluteIndex(state, candle) {

    const s = initializeState(state);

    const key =
        candle?.epoch ??
        candle?.time ??
        candle?.timestamp ??
        null;

    if (key == null || key !== s.lastCandleKey) {

        s.absoluteIndex++;
        s.lastCandleKey = key;
    }

    return s.absoluteIndex;
}


// ============================================================
// ACTUALIZAR TENDENCIA
// ============================================================

function updateTrendState(candles, index, absIndex, state) {

    const s = initializeState(state);

    const cross = detectCross(candles, index);
    const trend = getTrend(candles, index);

    if (cross) {

        s.trendDirection = cross;
        s.trendStartIndex = absIndex;
        s.lastCrossIndex = absIndex;
        s.tradesInTrend = 0;
        s.lastEntryIndex = null;
        s.lastEntryType = null;

        if (CONFIG.DEBUG) {

            console.log("🔄 SMA CROSS:", { absIndex, direction: cross });
        }
    }

    if (!s.trendDirection) {

        s.trendDirection = trend;

        if (trend) {

            s.trendStartIndex = absIndex;
        }
    }

    if (
        trend &&
        s.trendDirection &&
        trend !== s.trendDirection
    ) {

        s.trendDirection = trend;
        s.trendStartIndex = absIndex;
        s.tradesInTrend = 0;
        s.lastEntryIndex = null;
        s.lastEntryType = null;

        if (CONFIG.DEBUG) {

            console.log("🔄 SMA TREND CAMBIÓ:", { absIndex, direction: trend });
        }
    }

    return s;
}


// ============================================================
// CAN ENTER (usa índice ABSOLUTO)
// ============================================================

function canEnter(absIndex, state) {

    const s = initializeState(state);

    if (s.lastEntryIndex != null) {

        if (
            absIndex - s.lastEntryIndex <
            CONFIG.MIN_CANDLES_BETWEEN_TRADES
        ) {

            return false;
        }
    }

    if (
        CONFIG.MAX_TRADES_PER_TREND != null &&
        s.tradesInTrend >= CONFIG.MAX_TRADES_PER_TREND
    ) {

        return false;
    }

    return true;
}


// ============================================================
// REGISTER ENTRY
// ============================================================

function registerEntry(absIndex, entryType, signal, state) {

    const s = initializeState(state);

    s.lastEntryIndex = absIndex;
    s.lastEntryType = entryType;
    s.tradesInTrend++;
    s.lastSignalIndex = absIndex;

    if (CONFIG.DEBUG) {

        console.log("📈 SMA V5 ENTRY:", {
            absIndex,
            signal,
            entryType,
            tradesInTrend: s.tradesInTrend
        });
    }
}


// ============================================================
// ANALYSIS COMÚN
// ============================================================

function buildAnalysis(candles, index, direction) {

    const ma = getMAData(candles, index);

    if (!ma) {

        return {};
    }

    const slope = detectMA10Slope(candles, index);
    const ma50Lateral = detectMA50Lateral(candles, index);
    const sequence = detectCandleSequence(candles, index);
    const directionChange = detectDirectionChange(candles, index);

    return {

        direction,

        ma10: ma.ma10,
        ma50: ma.ma50,

        ma10Distance: ma.ma10Distance,
        ma50Distance: ma.ma50Distance,
        maDistance: ma.maDistance,
        maDistanceRatio: ma.maDistanceRatio,
        symmetryClass: ma.symmetryClass,

        ma10DistanceNormalized: ma.ma10DistanceNormalized,
        ma50DistanceNormalized: ma.ma50DistanceNormalized,
        maDistanceNormalized: ma.maDistanceNormalized,
        maSeparationNormalized: ma.maSeparationNormalized,

        ma10Slope: slope.slope,
        ma10SlopeDirection: slope.direction,
        ma10SlopeAcceleration: slope.acceleration,
        ma10SlopeStrong: slope.strong,

        ma50Lateral: ma50Lateral.lateral,
        ma50Slope: ma50Lateral.slope,

        candleSequenceDirection: sequence.direction,
        candleSequenceCount: sequence.count,
        candleSequenceStrength: sequence.averageStrength,

        directionChangeDetected: directionChange.detected,
        directionChangeDirection: directionChange.direction,

        close: ma.close,
        avgRange: ma.avgRange
    };
}


// ============================================================
// NEUTRAL
// ============================================================

function neutral(analysis = {}) {

    return {

        signal: null,
        score: 0,
        strategy: "sma",
        entryType: null,
        analysis
    };
}


// ============================================================
// CONSTRUIR RESPUESTA
// ============================================================

function buildResult({
    signal,
    trendDirection,
    score,
    entryType,
    ma10,
    ma50,
    distance,
    strength,
    analysis
}) {

    return {

        signal,
        score,
        strategy: "sma",
        entryType,

        trend: trendDirection === "CALL" ? "UP" : "DOWN",
        counterTrend: signal !== trendDirection,

        ma10,
        ma50,
        distance,
        strength,
        analysis
    };
}


// ============================================================
// SMA STRATEGY V5
// ============================================================

function smaStrategy(candles, state = {}) {

    if (
        !Array.isArray(candles) ||
        candles.length < CONFIG.SLOW_MA + 5
    ) {

        return neutral();
    }

    resetCache(candles);

    const index = candles.length - 1;

    const absIndex = advanceAbsoluteIndex(state, candles[index]);

    // La tendencia SIEMPRE se actualiza (aunque el filtro bloquee),
    // para no perder cruces ni reiniciar contadores tarde.
    const s = updateTrendState(candles, index, absIndex, state);

    const direction = s.trendDirection;

    if (!direction) {

        return neutral();
    }

    const current = getMAData(candles, index);

    if (!current) {

        return neutral();
    }

    const strength = candleStrength(candles[index]);

    const commonAnalysis = buildAnalysis(candles, index, direction);

    s.lastMA10Distance = current.ma10Distance;
    s.lastMA50Distance = current.ma50Distance;
    s.lastMADistance = current.maDistance;
    s.lastMADistanceRatio = current.maDistanceRatio;
    s.lastSymmetryClass = current.symmetryClass;
    s.lastAnalysis = commonAnalysis;

    // ========================================================
    // 0. MA50 BREAKOUT (NUEVO)
    // ========================================================
    //
    // Se evalúa ANTES del filtro de separación: este patrón
    // ocurre justo cuando MA10 y MA50 están cerca.
    // No depende de la tendencia MA10/MA50 (que aún es la
    // contraria), por eso la señal puede salir marcada como
    // counterTrend respecto a la tendencia de medias.
    //
    // ========================================================

    if (CONFIG.MA50_BREAKOUT_ENABLED) {

        const breakout = detectMA50Breakout(candles, index);

        if (CONFIG.DEBUG) {

            console.log("💥 MA50 BREAKOUT:", breakout);
        }

        const separationOk =
            CONFIG.BREAKOUT_BYPASS_SEPARATION_FILTER ||
            checkMASeparation(candles, index).passed;

        if (
            breakout.detected &&
            separationOk &&
            canEnter(absIndex, state)
        ) {

            registerEntry(
                absIndex,
                "MA50_BREAKOUT",
                breakout.direction,
                state
            );

            return buildResult({
                signal: breakout.direction,
                trendDirection: direction,
                score: 9,
                entryType: "MA50_BREAKOUT",
                ma10: current.ma10,
                ma50: current.ma50,
                distance: current.distance,
                strength,
                analysis: { ...commonAnalysis, breakout }
            });
        }
    }

    // ========================================================
    // FILTRO: MA10 MUY CERCA DE MA50  (NUEVO)
    // ========================================================
    //
    // Se evalúa ANTES de cualquier detector de entrada.
    // Si las medias están pegadas, no se opera.
    //
    // ========================================================

    const separationCheck = checkMASeparation(candles, index);

    s.lastSeparationCheck = separationCheck;

    if (!separationCheck.passed) {

        s.blockedBySeparation++;

        if (CONFIG.DEBUG) {

            console.log("⛔ FILTRO MA SEPARATION:", {
                absIndex,
                ...separationCheck
            });
        }

        return neutral({

            ...commonAnalysis,

            filter: "MA_SEPARATION",
            filterBlocked: true,
            separationCheck
        });
    }

    if (!canEnter(absIndex, state)) {

        return neutral();
    }

    // --------------------------------------------------------
    // 1. MA10 PRE-REJECTION
    // --------------------------------------------------------

    if (CONFIG.MA10_PRE_REJECTION_ENABLED) {

        const preRejection =
            detectMA10PreRejection(candles, index, direction);

        if (CONFIG.DEBUG) {

            console.log(`🔬 PRE-REJECTION ${direction}:`, preRejection);
        }

        if (preRejection.detected) {

            registerEntry(
                absIndex,
                "MA10_PRE_REJECTION",
                preRejection.signal,
                state
            );

            return buildResult({
                signal: preRejection.signal,
                trendDirection: direction,
                score: 9,
                entryType: "MA10_PRE_REJECTION",
                ma10: current.ma10,
                ma50: current.ma50,
                distance: current.distance,
                strength,
                analysis: { ...commonAnalysis, preRejection, separationCheck }
            });
        }
    }

    // --------------------------------------------------------
    // 2. MEAN REVERSION
    // --------------------------------------------------------

    if (CONFIG.MA10_MEAN_REVERSION_ENABLED) {

        const meanReversion =
            detectMA10MeanReversion(candles, index, direction);

        if (CONFIG.DEBUG) {

            console.log(`↩️ MEAN REVERSION ${direction}:`, meanReversion);
        }

        if (meanReversion.detected) {

            registerEntry(
                absIndex,
                "MA10_MEAN_REVERSION",
                meanReversion.signal,
                state
            );

            return buildResult({
                signal: meanReversion.signal,
                trendDirection: direction,
                score: 8,
                entryType: "MA10_MEAN_REVERSION",
                ma10: current.ma10,
                ma50: current.ma50,
                distance: current.distance,
                strength,
                analysis: { ...commonAnalysis, meanReversion, separationCheck }
            });
        }
    }

    // --------------------------------------------------------
    // 3. MA REJECTION
    // --------------------------------------------------------

    if (CONFIG.MA_REJECTION_ENABLED) {

        const rejection = detectRejection(candles, index, direction);

        if (CONFIG.DEBUG) {

            console.log(`🔎 MA REJECTION ${direction}:`, rejection);
        }

        if (rejection.detected) {

            registerEntry(absIndex, "MA_REJECTION", direction, state);

            return buildResult({
                signal: direction,
                trendDirection: direction,
                score: 10,
                entryType: "MA_REJECTION",
                ma10: rejection.ma10,
                ma50: rejection.ma50,
                distance: rejection.distance,
                strength: rejection.strength,
                analysis: { ...commonAnalysis, rejection, separationCheck }
            });
        }
    }

    // --------------------------------------------------------
    // 4. PULLBACK
    // --------------------------------------------------------

    const retracement = detectRetracement(candles, index, direction);

    if (
        retracement.detected &&
        directionConfirmed(candles, index, direction)
    ) {

        registerEntry(absIndex, "PULLBACK", direction, state);

        return buildResult({
            signal: direction,
            trendDirection: direction,
            score: 8,
            entryType: "PULLBACK",
            ma10: current.ma10,
            ma50: current.ma50,
            distance: current.distance,
            strength,
            analysis: { ...commonAnalysis, retracement, separationCheck }
        });
    }

    // --------------------------------------------------------
    // 5. CONTINUATION
    // --------------------------------------------------------

    if (
        detectContinuation(candles, index, direction) &&
        directionConfirmed(candles, index, direction)
    ) {

        registerEntry(absIndex, "CONTINUATION", direction, state);

        return buildResult({
            signal: direction,
            trendDirection: direction,
            score: 7,
            entryType: "CONTINUATION",
            ma10: current.ma10,
            ma50: current.ma50,
            distance: current.distance,
            strength,
            analysis: { ...commonAnalysis, continuation: true, separationCheck }
        });
    }

    return neutral();
}


module.exports = smaStrategy;