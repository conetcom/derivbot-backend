// ============================================================
// SIMPLE MA STRATEGY  -  MA10 / MA50
// ============================================================
//
// COMPRA (CALL) si TODO se cumple en la última vela cerrada:
//
//   1. la vela cerró al alza        (cierre > apertura)
//   2. el cierre está sobre la MA10
//   3. el cierre está sobre la MA50
//   4. la MA10 va en subida
//
// VENTA (PUT): exactamente lo contrario.
//
// Nada más. Sin filtros, sin estado, sin régimen.
//
// ============================================================

const CONFIG = {

    FAST_MA: 10,
    SLOW_MA: 50,

    // "MA10 va en subida": MA10 de ahora > MA10 de hace N velas.
    // 1 = muy sensible; 3 = un poco más estable.
    MA10_SLOPE_LOOKBACK: 2,

    // Velas mínimas entre una señal y la siguiente.
    // 1 = puede dar señal en cada vela mientras se cumplan las condiciones.
    MIN_CANDLES_BETWEEN_SIGNALS: 1
};

// Ajustes por entorno (SOLO para backtests):
//   SIMPLE_CONFIG_OVERRIDES='{"MA10_SLOPE_LOOKBACK":1}' node backtest.js ...
if (process.env.SIMPLE_CONFIG_OVERRIDES) {

    try {

        Object.assign(CONFIG, JSON.parse(process.env.SIMPLE_CONFIG_OVERRIDES));

    } catch (error) {

        console.error("SIMPLE_CONFIG_OVERRIDES inválido:", error.message);
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


// Estado de respaldo por si el bot no pasa `state`
const fallbackStates = new Map();

function resolveState(candles, state) {

    if (state && typeof state === "object") return state;

    const key = candles?.[candles.length - 1]?.symbol ?? "default";

    if (!fallbackStates.has(key)) fallbackStates.set(key, {});

    return fallbackStates.get(key);
}


function neutral(reason) {

    return {

        signal: null,
        score: 0,
        strategy: "simple_ma",
        entryType: null,
        counterTrend: false,
        analysis: { filter: reason }
    };
}


function simpleMAStrategy(candles, stateInput) {

    if (!Array.isArray(candles) || candles.length < CONFIG.SLOW_MA + CONFIG.MA10_SLOPE_LOOKBACK + 1) {

        return neutral("NOT_ENOUGH_DATA");
    }

    const state = resolveState(candles, stateInput);

    const index = candles.length - 1;
    const last = candles[index];

    const open = number(last.open);
    const close = number(last.close);

    const ma10 = smaAt(candles, index, CONFIG.FAST_MA);
    const ma50 = smaAt(candles, index, CONFIG.SLOW_MA);
    const ma10Before = smaAt(candles, index - CONFIG.MA10_SLOPE_LOOKBACK, CONFIG.FAST_MA);

    if (ma10 == null || ma50 == null || ma10Before == null) {

        return neutral("NO_MA_DATA");
    }

    const bullishCandle = close > open;
    const bearishCandle = close < open;

    const ma10Rising = ma10 > ma10Before;
    const ma10Falling = ma10 < ma10Before;

    let signal = null;

    if (bullishCandle && close > ma10 && close > ma50 && ma10Rising) {

        signal = "CALL";

    } else if (bearishCandle && close < ma10 && close < ma50 && ma10Falling) {

        signal = "PUT";
    }

    if (!signal) {

        return neutral("NO_SETUP");
    }

    // Espaciado entre señales (por número de vela, no por tamaño de ventana)
    const key = last.epoch ?? last.time ?? last.timestamp ?? null;

    if (!state.simpleMA) {

        state.simpleMA = { counter: -1, lastKey: null, lastSignalCounter: null };
    }

    const s = state.simpleMA;

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

    const ma10Distance = Math.abs(close - ma10);
    const ma50Distance = Math.abs(close - ma50);
    const maDistance = Math.abs(ma10 - ma50);

    return {

        signal,
        score: 7,
        strategy: "simple_ma",
        entryType: "SIMPLE_MA",
        trend: signal === "CALL" ? "UP" : "DOWN",
        counterTrend: false,

        ma10,
        ma50,
        distance: ma10Distance,
        strength: Math.abs(close - open),

        analysis: {

            ma10,
            ma50,
            ma10Distance,
            ma50Distance,
            maDistance,
            maDistanceRatio: maDistance > 0 ? ma50Distance / maDistance : 0,
            ma10Slope: ma10 - ma10Before
        }
    };
}


module.exports = simpleMAStrategy;
module.exports.simpleMAStrategy = simpleMAStrategy;
module.exports.CONFIG = CONFIG;