function calculateStats(candles) {

  let GGG = 0;
  let GGR = 0;
  let RRR = 0;
  let RRG = 0;

  for (let i = 2; i < candles.length; i++) {

    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    const green1 = c1.close > c1.open;
    const green2 = c2.close > c2.open;
    const green3 = c3.close > c3.open;

    if (green1 && green2) {
      green3 ? GGG++ : GGR++;
    }

    if (!green1 && !green2) {
      green3 ? RRG++ : RRR++;
    }
  }

  return {
    GGG,
    GGR,
    RRR,
    RRG
  };
}