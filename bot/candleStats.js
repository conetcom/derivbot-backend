function calculateStats(candles) {

  const patterns = {
    GGG: { G: 0, R: 0 },
    GGR: { G: 0, R: 0 },
    GRG: { G: 0, R: 0 },
    GRR: { G: 0, R: 0 },
    RGG: { G: 0, R: 0 },
    RGR: { G: 0, R: 0 },
    RRG: { G: 0, R: 0 },
    RRR: { G: 0, R: 0 }
  };

  // necesitamos 4 velas:
  // patrón = 3 velas
  // resultado = cuarta vela

  for (let i = 3; i < candles.length; i++) {

    const c1 = candles[i - 3];
    const c2 = candles[i - 2];
    const c3 = candles[i - 1];
    const c4 = candles[i];

    const pattern =
      (c1.close > c1.open ? "G" : "R") +
      (c2.close > c2.open ? "G" : "R") +
      (c3.close > c3.open ? "G" : "R");

    const next =
      c4.close > c4.open ? "G" : "R";

    patterns[pattern][next]++;

  }

  const stats = {};

  for (const p in patterns) {

    const total =
      patterns[p].G +
      patterns[p].R;

    stats[p] = {

      green: patterns[p].G,

      red: patterns[p].R,

      pctGreen:
        total
          ? Number(
              (
                patterns[p].G /
                total *
                100
              ).toFixed(2)
            )
          : 0,

      pctRed:
        total
          ? Number(
              (
                patterns[p].R /
                total *
                100
              ).toFixed(2)
            )
          : 0,

      total

    };

  }

  return stats;

}

module.exports = {
  calculateStats
};