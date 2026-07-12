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
    return{

signal:"CALL",

score:0

};;
  }

  if (trendDown && rsi > 40 && last.close < prev.close) {
    return{

signal:"PUT",

score:0

};
  }

  return null;
}
module.exports = forexStrategy;