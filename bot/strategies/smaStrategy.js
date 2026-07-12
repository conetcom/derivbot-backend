const { calculateSMA } = require("../indicators");

const CONFIG = {
    SMA_PERIOD: 8,
    MIN_CANDLES: 30,
    STRONG_CANDLE: 0.65,
    MIN_VOLATILITY: 0.1,
    SCORE: 6
};
function buildSignal(signal) {
    return {
        signal,
        score: CONFIG.SCORE,
        strategy: "sma"
    };
}
function smaStrategy(candles) {
  if (candles.length < CONFIG.MIN_CANDLES)
return null;
  const sma = calculateSMA(candles, CONFIG.SMA_PERIOD);
 // console.log("SMA:", sma);
  if (!sma) return null;

  const last = candles[candles.length - 2];
  const prev = candles[candles.length - 3];
  const prev2 = candles[candles.length - 4];

  // =========================
  // 📈 ESTRUCTURA (TREND)
  // =========================
  const trendUp =
    last.close > sma &&
    prev.close > sma;

  const trendDown =
    last.close < sma &&
    prev.close < sma;

  // =========================
  // 💥 BREAK OF STRUCTURE (BOS)
  // =========================
  const highs = candles.slice(-10).map(c => c.high);
  const lows = candles.slice(-10).map(c => c.low);

  const prevHigh = Math.max(...highs.slice(0, -2));
  const prevLow = Math.min(...lows.slice(0, -2));

  const bosUp = last.close > prevHigh;
  const bosDown = last.close < prevLow;

  // =========================
  // 🧲 PULLBACK (RETEST)
  // =========================
  const pullbackUp =
    prev.low <= sma &&
    last.close > sma;

  const pullbackDown =
    prev.high >= sma &&
    last.close < sma;

// =========================
// 💪 FUERZA DE LA VELA
// =========================
const body = Math.abs(last.close - last.open);
const range = last.high - last.low;

if (range === 0) return null;

const strongCandle = body / range >= CONFIG.STRONG_CANDLE;
  // =========================
  // ⚡ MOMENTUM
  // =========================
  const momentumUp =
    last.close > prev.close &&
    prev.close > prev2.close;

  const momentumDown =
    last.close < prev.close &&
    prev.close < prev2.close;

  // =========================
  // 🚫 FILTRO DE RUIDO
  // =========================
  const last5 = candles.slice(-5);
  const volatility =
    Math.max(...last5.map(c => c.high)) -
    Math.min(...last5.map(c => c.low));

  if (volatility < CONFIG.MIN_VOLATILITY) return null;

  // =========================
  // 🎯 ENTRADAS SMART MONEY
  // =========================
  if (
    trendUp &&
    bosUp &&
    pullbackUp &&
    strongCandle &&
    momentumUp
  ) {
    return  

    buildSignal("CALL");


  }

  if (
    trendDown &&
    bosDown &&
    pullbackDown &&
    strongCandle &&
    momentumDown
  ) {
    return  buildSignal("PUT");
  }

  return {
    signal: null,
    score: 0,
    strategy: "sma"
};

module.exports = smaStrategy;