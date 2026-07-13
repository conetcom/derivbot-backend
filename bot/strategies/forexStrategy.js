const calculateSMA = require('../indicators/sma');
const buildSignal = require("../helpers/buildSignal");
function forexStrategy(candles) {
  if (candles.length < 25) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // ⏰ HORARIO (UTC)
  const hour = new Date().getUTCHours();
  if (hour < 7 || hour > 17) return null;

  // 📊 VOLATILIDAD
  const last5 = candles.slice(-5);
  const volatility =
    Math.max(...last5.map(c => c.high)) -
    Math.min(...last5.map(c => c.low));

  if (volatility < 0.0005) return null;

  // 📈 TENDENCIA
  const sma = calculateSMA(candles, 20);
  if (!sma) return null;

  const trendUp = last.close > sma && prev.close > sma;
  const trendDown = last.close < sma && prev.close < sma;

  // ⚡ MOMENTUM
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;

  if (range === 0 || body / range < 0.5) return null;

  // 🔥 RSI
  const rsi = calculateRSI(candles, 14);
  if (!rsi) return null;

  // 🎯 ENTRADAS
  if (trendUp && rsi < 60 && last.close > prev.close) {
   return buildSignal({

    strategy:"synthetic_pro",

    signal:"CALL",

    score:8,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

    bos: bosUp || bosDown,

    pullback: pullbackUp || pullbackDown,

    momentum: momentumUp || momentumDown,

    strength: avgStrength,

    volatility,

    pattern,

    pctGreen: currentStats?.pctGreen,

    pctRed: currentStats?.pctRed,

    callScore,

    putScore,

    sma

});
  }

  if (trendDown && rsi > 40 && last.close < prev.close) {
   return buildSignal({

    strategy:"synthetic_pro",

    signal:"PUT",

    score:8,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

    bos: bosUp || bosDown,

    pullback: pullbackUp || pullbackDown,

    momentum: momentumUp || momentumDown,

    strength: avgStrength,

    volatility,

    pattern,

    pctGreen: currentStats?.pctGreen,

    pctRed: currentStats?.pctRed,

    callScore,

    putScore,

    sma

});
  }

  return buildSignal({

    strategy:"synthetic_pro",

    signal:null,

    score:0,

    trend: trendUp ? "UP" : trendDown ? "DOWN" : "SIDE",

    bos: bosUp || bosDown,

    pullback: pullbackUp || pullbackDown,

    momentum: momentumUp || momentumDown,

    strength: avgStrength,

    volatility,

    pattern,

    pctGreen: currentStats?.pctGreen,

    pctRed: currentStats?.pctRed,

    callScore,

    putScore,

    sma

});
}
module.exports = forexStrategy;