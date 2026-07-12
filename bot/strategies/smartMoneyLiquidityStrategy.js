function smartMoneyLiquidityStrategy(candles) {
  if (candles.length < 8) return null;

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const highs = candles.slice(-10).map(c => c.high);
  const lows = candles.slice(-10).map(c => c.low);

  const liquidityHigh = Math.max(...highs.slice(0, -2));
  const liquidityLow = Math.min(...lows.slice(0, -2));

  const sweepHigh =
    last.high > liquidityHigh && last.close < liquidityHigh;

  const sweepLow =
    last.low < liquidityLow && last.close > liquidityLow;

  const upperWick =
    last.high - Math.max(last.open, last.close);

  const lowerWick =
    Math.min(last.open, last.close) - last.low;

  const body = Math.abs(last.close - last.open);

  const rejectionSell = upperWick > body * 1.5;
  const rejectionBuy = lowerWick > body * 1.5;

  const bearishConfirm =
    last.close < last.open &&
    prev.close < prev.open;

  const bullishConfirm =
    last.close > last.open &&
    prev.close > prev.open;

  if (sweepHigh && rejectionSell && bearishConfirm) {
    return{

signal:"CALL",
score:6,
strategy: "liquidity"

};
  }

  if (sweepLow && rejectionBuy && bullishConfirm) {
    return{
      signal:"PUT",
      score:6,
      strategy: "liquidity"
    };
  }

  return {
      signal:"null",
      score:0,
      strategy: "liquidity"
    };
}
module.exports = smartMoneyLiquidityStrategy;