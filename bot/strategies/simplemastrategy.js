// ============================================================
// LAST CANDLE STRATEGY  -  seguir la última vela, solo con MA10
// ============================================================
//
// REGLA:
//
//   1. La dirección la marca la ÚLTIMA VELA cerrada:
//        verde (cierre > apertura)  -> CALL
//        roja  (cierre < apertura)  -> PUT
//        doji  (cierre = apertura)  -> sin señal
//
//   2. FILTRO: la MA10 no puede estar horizontal.
//        Debe estar subiendo O bajando (cualquiera de las dos).
//
// Nada más: sin MA50, sin régimen, sin estado complicado.
//
// "Horizontal" se mide así:
//
//   pendiente = (MA10 ahora - MA10 hace N velas) / rango promedio de vela
//
//   |pendiente| < MIN_SLOPE  ->  horizontal  ->  NO se opera
//
// Se divide por el rango promedio para que el umbral valga igual
// para oro, índices o divisas, sin depender del precio.
//
// ============================================================

const CONFIG = {

    MA_PERIOD: 10,

    // Rango promedio usado para normalizar la pendiente
    RANGE_PERIOD: 5,

    // MA10 de ahora contra la de hace N velas
    SLOPE_LOOKBACK: 3,

    // Pendiente mínima (en rangos de vela). Por debajo = horizontal.
    //   0.08 = poco exigente   0.20 = exigente
    MIN_SLOPE: 0.1,

    // false => se sigue la vela AUNQUE vaya contra la MA10
    //          (lo que pediste: "sin importar si es roja o verde")
    // true  => solo se opera si la vela va en el mismo sentido que la MA10
    REQUIRE_SLOPE_MATCH: false,

    // Velas mínimas entre una señal y la siguiente (1 = sin límite)
    MIN_CANDLES_BETWEEN_SIGNALS: 1
};

// Ajustes por entorno (SOLO para backtests):
//   LASTCANDLE_CONFIG_OVERRIDES='{"MIN_SLOPE":0.15}' node backtest.js ...
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


function lastCandleStrategy(candles, stateInput) {

    const needed = CONFIG.MA_PERIOD + CONFIG.SLOPE_LOOKBACK + 1;

    if (!Array.isArray(candles) || candles.length < needed) {

        return neutral("NOT_ENOUGH_DATA");
    }

    const state = resolveState(candles, stateInput);

    const index = candles.length - 1;
    const last = candles[index];

    const open = number(last.open);
    const close = number(last.close);

    // ---- 1. dirección = color de la última vela ----

    let signal = null;

    if (close > open) signal = "PUT";
    else if (close < open) signal = "CALL";
/*
    if (!signal) {

        return neutral("DOJI");
    }*/

    // ---- 2. la MA10 no puede estar horizontal ----

    const ma10 = smaAt(candles, index, CONFIG.MA_PERIOD);
    const ma10Before = smaAt(candles, index - CONFIG.SLOPE_LOOKBACK, CONFIG.MA_PERIOD);
    const avgRange = averageRangeAt(candles, index, CONFIG.RANGE_PERIOD);

    if (ma10 == null || ma10Before == null || !avgRange) {

        return neutral("NO_MA_DATA");
    }

    const slope = (ma10 - ma10Before) / avgRange;

    if (Math.abs(slope) < CONFIG.MIN_SLOPE) {

        return neutral("MA10_FLAT", { ma10Slope: slope });
    }

    const ma10Direction = slope > 0 ? "CALL" : "PUT";

    if (CONFIG.REQUIRE_SLOPE_MATCH && ma10Direction !== signal) {

        return neutral("CANDLE_AGAINST_MA10", { ma10Slope: slope });
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

    // `counterTrend` aquí significa: la vela va contra la MA10
    const againstMA10 = ma10Direction !== signal;

    return {

        signal,
        score: 6,
        strategy: "last_candle",
        entryType: againstMA10 ? "LAST_CANDLE_AGAINST_MA10" : "LAST_CANDLE_WITH_MA10",
        trend: ma10Direction === "CALL" ? "UP" : "DOWN",
        counterTrend: againstMA10,

        ma10,
        distance: Math.abs(close - ma10),
        strength: Math.abs(close - open),

        analysis: {

            ma10,
            ma10Distance: Math.abs(close - ma10),
            ma10Slope: Number(slope.toFixed(4)),
            ma10SlopeDirection: ma10Direction,
            avgRange,
            candleColor: signal === "CALL" ? "GREEN" : "RED",
            againstMA10
        }
    };
}


module.exports = lastCandleStrategy;
module.exports.lastCandleStrategy = lastCandleStrategy;
module.exports.CONFIG = CONFIG;