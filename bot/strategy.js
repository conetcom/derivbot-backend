// ===============================
// 📊 INDICADORES
// ===============================
function calculateSMA(candles, period = 8) {
  
  if (!candles || candles.length < period) return null;

  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  const sma = sum / period;

  // =============================
  // 🔥 ESTRATEGIA INSTITUCIONAL (INTEGRADA)
  // =============================
  if (candles.length >= period + 2) {
    const last = candles[candles.length - 2];
    const prev = candles[candles.length - 3];
    const prev2 = candles[candles.length -4 ];

    // 🟢 / 🔴 dirección velas
    const bullish =
      last.close > last.open &&
      prev.close > prev.open;

    const bearish =
      last.close < last.open &&
      prev.close < prev.open;

    // 📊 tendencia
    const trendUp =
      last.close > sma &&
      prev.close > sma;

    const trendDown =
      last.close < sma &&
      prev.close < sma;

    // 💪 fuerza
    const bodyLast = Math.abs(last.close - last.open);
    const bodyPrev = Math.abs(prev.close - prev.open);

    const strongMove =
      bodyLast > 0.1 &&
      bodyPrev > 0.1;

    // 🚫 ruido
    const indecision =
      bodyLast < 0.05 &&
      bodyPrev < 0.05;

    // ⚡ momentum
    const momentumUp =
      last.close > prev.close &&
      prev.close > prev2.close;

    const momentumDown =
      last.close < prev.close &&
      prev.close < prev2.close;

    // 🔥 DEBUG opcional
    // console.log({ bullish, trendUp, strongMove, momentumUp });

    // 🎯 señal institucional (NO rompe nada)
    if (bullish && trendUp )//&& strongMove && momentumUp) 
    {
      // puedes usar esto si quieres debug
       console.log("📈 INSTITUTIONAL CALL");
    }

    if (bearish && trendDown && strongMove && momentumDown) {
      // console.log("📉 INSTITUTIONAL PUT");
    }
  }

  return sma;
}

function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;

    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ===============================
// 🔵 ESTRATEGIA SMA
// ===============================
function smaStrategy(candles) {
  if (candles.length < 30) return null;

  const sma = calculateSMA(candles, 8);
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
  // 💪 FUERZA DE VELA
  // =========================
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;

  const strongCandle =
    range > 0 && (body / range) > 0.6;

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

  if (volatility < 0.1) return null;

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
    return "CALL";
  }

  if (
    trendDown &&
    bosDown &&
    pullbackDown &&
    strongCandle &&
    momentumDown
  ) {
    return "PUT";
  }

  return null;
}

// ===============================
// 🟣 ESTRATEGIA RSI
// ===============================
function rsiStrategy(candles) {
  const rsi = calculateRSI(candles, 14);
  if (!rsi) return null;

  if (rsi < 30) return "CALL";
  if (rsi > 70) return "PUT";

  return null;
}

// ===============================
// 🔥 FOREX PRO STRATEGY
// ===============================
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
    return "CALL";
  }

  if (trendDown && rsi > 40 && last.close < prev.close) {
    return "PUT";
  }

  return null;
}

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
    return "PUT";
  }

  if (sweepLow && rejectionBuy && bullishConfirm) {
    return "CALL";
  }

  return null;
}
// ===============================
// 🎯 SELECTOR DE ESTRATEGIA
// ===============================
function getSignal(candles, strategy = "sma", state = {}) {
  switch (strategy) {
    case "forex":
      return forexStrategy(candles);

    case "rsi":
      return rsiStrategy(candles);

    case "synthetic_pro": {
      const { signal, score } = syntheticProStrategy(candles, state);

      if (signal) {
        console.log(`🚀 PRO SIGNAL: ${signal} | score=${score}`);
        return signal;
      }

      return null;
    }

    case "sma":
    default: {
      const sma = smaStrategy(candles);
      const liquidity = smartMoneyLiquidityStrategy(candles);

      if (sma && liquidity && sma === liquidity) return sma;
      if (sma) return sma;
      if (liquidity) return liquidity;

      return null;
    }
  }
}
// ===============================
// 🚀 ESTRATEGIA PRO SINTÉTICOS
// ===============================
function syntheticProStrategy(candles, state = {}) {

  const stats = state.stats || {};

  if (!candles || candles.length < 30) {
    return { signal: null, score: 0 };
  }

  // ===============================
  // 📊 SMA
  // ===============================
  const sma = calculateSMA(candles, 12);

  if (!sma) {
    return { signal: null, score: 0 };
  }

  // ===============================
  // 🕯️ VELAS
  // ===============================
  const last = candles[candles.length - 2];
  const prev = candles[candles.length - 3];
  const prev2 = candles[candles.length - 4];

  const green1 = prev.close > prev.open;
  const green2 = last.close > last.open;

  // ===============================
  // 📊 VOLATILIDAD
  // ===============================
  const last5 = candles.slice(-5);

  const volatility =
    Math.max(...last5.map(c => c.high)) -
    Math.min(...last5.map(c => c.low));

  if (volatility < 0.2) {
    return { signal: null, score: 0 };
  }

  // ===============================
  // 📈 TENDENCIA
  // ===============================
  const trendUp =
    last.close > sma &&
    prev.close > sma;

  const trendDown =
    last.close < sma &&
    prev.close < sma;

  // ===============================
  // 🧲 PULLBACK
  // ===============================
  const pullbackUp =
    prev.low <= sma &&
    last.close > sma;

  const pullbackDown =
    prev.high >= sma &&
    last.close < sma;

  // ===============================
  // 💥 BOS
  // ===============================
  const highs =
    candles.slice(-8).map(c => c.high);

  const lows =
    candles.slice(-8).map(c => c.low);

  const prevHigh =
    Math.max(...highs.slice(0, -2));

  const prevLow =
    Math.min(...lows.slice(0, -2));

  const bosUp =
    last.close > prevHigh;

  const bosDown =
    last.close < prevLow;

  // ===============================
  // 💪 FUERZA
  // ===============================
  const body =
    Math.abs(last.close - last.open);

  const range =
    last.high - last.low;

  if (range === 0) {
    return { signal: null, score: 0 };
  }

  const strong =
    body / range > 0.6;

  // ===============================
  // ⚡ MOMENTUM
  // ===============================
  const momentumUp =
    last.close > prev.close &&
    prev.close > prev2.close;

  const momentumDown =
    last.close < prev.close &&
    prev.close < prev2.close;

  // ===============================
  // ⛔ COOLDOWN
  // ===============================
  const now = Date.now();

  const cooldown = 60000;

  if (
    state.lastTradeTime &&
    now - state.lastTradeTime < cooldown
  ) {
    return { signal: null, score: 0 };
  }

  // ===============================
  // 🎯 SCORE BASE
  // ===============================
  let callScore = 0;
  let putScore = 0;

  if (trendUp) callScore += 2;
  if (trendDown) putScore += 2;

  if (pullbackUp) callScore += 2;
  if (pullbackDown) putScore += 2;

  if (bosUp) callScore += 2;
  if (bosDown) putScore += 2;

  if (strong) {
    callScore += 1;
    putScore += 1;
  }

  if (momentumUp) callScore += 2;
  if (momentumDown) putScore += 2;

  // ===============================
  // 📊 ESTADÍSTICAS HISTÓRICAS
  // ===============================

  const pctGGG =
    Number(stats.pctGGG || 0);

  const pctGGR =
    Number(stats.pctGGR || 0);

  const pctRRR =
    Number(stats.pctRRR || 0);

  const pctRRG =
    Number(stats.pctRRG || 0);

  // --------------------------------
  // DOS VERDES
  // --------------------------------
  if (green1 && green2) {

    console.log(
      "📊 GG ->",
      "GGG:", pctGGG,
      "GGR:", pctGGR
    );

    // continuidad alcista
    if (pctGGG > pctGGR) {

      callScore += 2;

      if (pctGGG >= 65) {
        callScore += 1;
      }

    }
    // reversión bajista
    else {

      putScore += 2;

      if (pctGGR >= 65) {
        putScore += 1;
      }

    }
  }

  // --------------------------------
  // DOS ROJAS
  // --------------------------------
  if (!green1 && !green2) {

    console.log(
      "📊 RR ->",
      "RRR:", pctRRR,
      "RRG:", pctRRG
    );

    // continuidad bajista
    if (pctRRR > pctRRG) {

      putScore += 2;

      if (pctRRR >= 65) {
        putScore += 1;
      }

    }
    // reversión alcista
    else {

      callScore += 2;

      if (pctRRG >= 65) {
        callScore += 1;
      }

    }
  }

  // ===============================
  // DEBUG
  // ===============================
  console.log(
    "🎯 SCORES",
    {
      callScore,
      putScore
    }
  );

  // ===============================
  // DECISIÓN FINAL
  // ===============================
  if (
    callScore >= 5 &&
    callScore > putScore
  ) {

    console.log(
      "🟢 CALL",
      callScore
    );

    return {
      signal: "CALL",
      score: callScore
    };
  }

  if (
    putScore >= 5 &&
    putScore > callScore
  ) {

    console.log(
      "🔴 PUT",
      putScore
    );

    return {
      signal: "PUT",
      score: putScore
    };
  }

  return {
    signal: null,
    score: 0
  };
}


// ===============================
// 📦 EXPORTS
// ===============================
module.exports = {
  getSignal,
  calculateSMA,
  calculateRSI,
  smaStrategy,
  smartMoneyLiquidityStrategy,
  syntheticProStrategy
};