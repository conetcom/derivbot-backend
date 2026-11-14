// ============================================================
// LAST CANDLE STRATEGY v2  -  seguir la última vela, cuerpos parecidos
// ============================================================
//
// REGLA:
//
//   1. La dirección la marca la ÚLTIMA VELA cerrada:
//        verde -> CALL        roja -> PUT
//        doji  -> NO se opera
//
//   2. Se comparan los CUERPOS de las últimas N velas
//      (cuerpo = |cierre - apertura|, N = BODY_LOOKBACK):
//
//        - cuerpos PARECIDOS                        -> se opera
//        - una vela MUCHO más grande que las demás  -> NO se opera
//
//      "Mucho más grande" = su cuerpo es más de BIG_FACTOR veces
//      el cuerpo promedio de las OTRAS velas de la ventana.
//      Cuenta cualquier vela de la ventana, también la última.
//
// Sin MA50, sin régimen. El filtro de MA10 horizontal de la
// versión anterior queda APAGADO (MA10_FILTER_ENABLED: false);
// se puede volver a encender.
//
// ============================================================

const CONFIG = {

    // Cuántas velas se comparan (incluye la última)
    BODY_LOOKBACK: 5,

    // "Mucho más grande": cuerpo > BIG_FACTOR x promedio de las otras
    //   1.5 = estricto (descarta casi todo lo irregular)
    //   2.0 = intermedio
    //   3.0 = permisivo (solo descarta velas enormes)
    BIG_FACTOR: 3.0,

    // Doji: cuerpo menor a este % del rango de la vela (high - low).
    //   0.10 = el cuerpo es menos del 10% de la vela
    //   0    = solo cierre EXACTAMENTE igual a la apertura
    DOJI_BODY_RATIO: 0.10,

    // Velas mínimas entre una señal y la siguiente (1 = sin límite)
    MIN_CANDLES_BETWEEN_SIGNALS: 1,

    // ---------------- filtro opcional de MA10 ----------------
    // true => además exige que la MA10 no esté horizontal
    MA10_FILTER_ENABLED: false,
    MA_PERIOD: 10,
    RANGE_PERIOD: 5,
    SLOPE_LOOKBACK: 3,
    MIN_SLOPE: 0.1,

    // true => solo opera si la vela va en el mismo sentido que la MA10
    REQUIRE_SLOPE_MATCH: false
};

// Ajustes por entorno (SOLO para backtests):
//   LASTCANDLE_CONFIG_OVERRIDES='{"BIG_FACTOR":3}' node backtest.js ...
if (process.env.LASTCANDLE_CONFIG_OVERRIDES) {

    try {

        Object.assign(CONFIG, JSON.parse(process.env.LASTCANDLE_CONFIG_OVERRIDES));

    } catch (error) {

        console.error("LASTCANDLE_CONFIG_OVERRIDES inválido:", error.message);
    }
}


function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
}


function bodyOf(candle) {

    return Math.abs(number(candle?.close) - number(candle?.open));
}


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


function averageRangeAt(candles, index, period) {

    const start = Math.max(0, index - period + 1);

    let total = 0;
    let count = 0;

    for (let i = start; i <= index; i++) {

        const range = number(candles[i]?.high) - number(candles[i]?.low);

        if (range > 0) {

            total += range;
            count++;
        }
    }

    return count ? total / count : 0;
}


// Estado de respaldo por si el bot no pasa `state`
const fallbackStates = new Map();

function resolveState(candles, state) {

    if (state && typeof state === "object") return state;

    const key = candles?.[candles.length - 1]?.symbol ?? "default";

    if (!fallbackStates.has(key)) fallbackStates.set(key, {});

    return fallbackStates.get(key);
}


function neutral(reason, extra = {}) {

    return {

        signal: null,
        score: 0,
        strategy: "last_candle",
        entryType: null,
        counterTrend: false,
        analysis: { filter: reason, ...extra }
    };
}


// ============================================================
// Comparación de cuerpos
// ============================================================
//
// Devuelve la vela de cuerpo más grande de la ventana y cuántas
// veces supera al cuerpo promedio de las demás.
//
//   offset 0 = la última vela, 1 = la anterior, ...
//
// ============================================================

function compareBodies(candles, index, lookback) {

    const bodies = [];

    for (let k = 0; k < lookback; k++) {

        bodies.push(bodyOf(candles[index - k]));
    }

    let maxBody = -1;
    let maxOffset = 0;

    bodies.forEach((b, k) => {

        if (b > maxBody) {

            maxBody = b;
            maxOffset = k;
        }
    });

    const others = bodies.filter((_, k) => k !== maxOffset);

    const meanOthers = others.reduce((a, b) => a + b, 0) / others.length;

    // Si las demás no tienen cuerpo, cualquier vela con cuerpo es "enorme".
    const ratio =
        meanOthers > 0
            ? maxBody / meanOthers
            : (maxBody > 0 ? Infinity : 1);

    return { maxBody, maxOffset, meanOthers, ratio, bodies };
}


function lastCandleStrategy(candles, stateInput) {

    const needed = Math.max(
        CONFIG.BODY_LOOKBACK,
        CONFIG.MA10_FILTER_ENABLED
            ? CONFIG.MA_PERIOD + CONFIG.SLOPE_LOOKBACK + 1
            : 0
    );

    if (!Array.isArray(candles) || candles.length < needed) {

        return neutral("NOT_ENOUGH_DATA");
    }

    const state = resolveState(candles, stateInput);

    const index = candles.length - 1;
    const last = candles[index];

    const open = number(last.open);
    const close = number(last.close);
    const range = number(last.high) - number(last.low);
    const body = Math.abs(close - open);

    // ---- 1. doji: no se opera ----

    const isDoji =
        body === 0 ||
        range <= 0 ||
        body / range < CONFIG.DOJI_BODY_RATIO;

    if (isDoji) {

        return neutral("DOJI", {
            bodyOfRange: range > 0 ? Number((body / range).toFixed(4)) : 0
        });
    }

    // ---- 2. dirección = color de la última vela ----

    const signal = close > open ? "CALL" : "PUT";

    // ---- 3. ¿hay una vela mucho más grande? ----

    const cmp = compareBodies(candles, index, CONFIG.BODY_LOOKBACK);

    if (cmp.ratio > CONFIG.BIG_FACTOR) {

        return neutral("BIG_CANDLE", {
            bodyRatioMax: Number.isFinite(cmp.ratio) ? Number(cmp.ratio.toFixed(3)) : null,
            bigCandleOffset: cmp.maxOffset
        });
    }

    // ---- 4. (opcional) la MA10 no puede estar horizontal ----

    let ma10 = null;
    let slope = null;
    let ma10Direction = null;

    if (CONFIG.MA10_FILTER_ENABLED) {

        ma10 = smaAt(candles, index, CONFIG.MA_PERIOD);

        const ma10Before = smaAt(candles, index - CONFIG.SLOPE_LOOKBACK, CONFIG.MA_PERIOD);
        const avgRange = averageRangeAt(candles, index, CONFIG.RANGE_PERIOD);

        if (ma10 == null || ma10Before == null || !avgRange) {

            return neutral("NO_MA_DATA");
        }

        slope = (ma10 - ma10Before) / avgRange;

        if (Math.abs(slope) < CONFIG.MIN_SLOPE) {

            return neutral("MA10_FLAT", { ma10Slope: slope });
        }

        ma10Direction = slope > 0 ? "CALL" : "PUT";

        if (CONFIG.REQUIRE_SLOPE_MATCH && ma10Direction !== signal) {

            return neutral("CANDLE_AGAINST_MA10", { ma10Slope: slope });
        }
    }

    // ---- espaciado entre señales ----

    const key = last.epoch ?? last.time ?? last.timestamp ?? null;

    if (!state.lastCandle) {

        state.lastCandle = { counter: -1, lastKey: null, lastSignalCounter: null };
    }

    const s = state.lastCandle;

    if (key == null || key !== s.lastKey) {

        s.counter++;
        s.lastKey = key;
    }

    if (
        s.lastSignalCounter != null &&
        s.counter - s.lastSignalCounter < CONFIG.MIN_CANDLES_BETWEEN_SIGNALS
    ) {

        return neutral("MIN_CANDLES_BETWEEN_SIGNALS");
    }

    s.lastSignalCounter = s.counter;

    return {

        signal,
        score: 6,
        strategy: "last_candle",
        entryType: "LAST_CANDLE_SIMILAR_BODIES",
        trend: signal === "CALL" ? "UP" : "DOWN",
        counterTrend: false,

        ma10,
        distance: ma10 != null ? Math.abs(close - ma10) : 0,
        strength: body,

        analysis: {

            candleColor: signal === "CALL" ? "GREEN" : "RED",
            lastBody: body,
            bodyOfRange: Number((body / range).toFixed(4)),
            bodyRatioMax: Number(cmp.ratio.toFixed(3)),
            meanBodyOthers: Number(cmp.meanOthers.toFixed(6)),
            bodyLookback: CONFIG.BODY_LOOKBACK,
            ma10,
            ma10Slope: slope != null ? Number(slope.toFixed(4)) : null,
            ma10SlopeDirection: ma10Direction
        }
    };
}


module.exports = lastCandleStrategy;
module.exports.lastCandleStrategy = lastCandleStrategy;
module.exports.compareBodies = compareBodies;
module.exports.CONFIG = CONFIG;