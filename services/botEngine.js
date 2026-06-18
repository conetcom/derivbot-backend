// ===============================
// 🧠 BOT TRADING MODO PRO TOTAL
// ===============================

const { createTrade, closeTrade, updateTradeByContract } = require("../models/tradesModel");
const CandleBuilder = require("../bot/candleBuilder");
const {
  calculateSMA,
  smaStrategy,
  smartMoneyLiquidityStrategy,
  syntheticProStrategy
} = require("../bot/strategy");
const RiskManager = require("../bot/riskManager");
const { updateBotStatus} = require("../models/botsModel");
const activeBots = require("../services/activeBots");
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ===============================
// 🧾 LOGGER
// ===============================
const log = (type, msg, extra = {}) => {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    type,
    msg,
    ...extra
  }));
};
const {
  emitBotStarted,
  emitBotStopped,
  emitNewTrade,
  emitTradeUpdate,
  emitBalance,
  emitMetrics,
   emitPriceUpdate,
} = require("./socketEvents");
// ===============================
// 📊 DEBUG VISUAL
// ===============================
const debugVisual = (candles, signal, sma, liquidity, pro) => {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  console.log("\n==============================");
  console.log("📊 DEBUG VISUAL");

  console.log("🧠 PRO:", pro);
  console.log("🕯️ Última vela:", last);
  console.log("🕯️ Vela anterior:", prev);

  console.log("📊 Total velas:", candles.length);
  console.log("📈 SMA:", sma);
  console.log("💧 Liquidez:", liquidity);
  console.log("🎯 Señal:", signal || "NO TRADE");

  console.log("==============================\n");
};

// ===============================
// 🚀 START BOT
// ===============================
const startBot = async (user, botConfig, deriv, io) => {

 if (activeBots.has(user.id)) {
  return;
}

if (!deriv.isConnected) return;

const balanceData =
  await deriv.getBalance();

const risk =
  new RiskManager(
    balanceData.balance
  );

const candleBuilder =
  new CandleBuilder();

const state = {
  userId: user.id,

  botId: botConfig.id,

  deriv,
  io,

  risk,

  subId: null,

  trades: 0,
  wins: 0,
  losses: 0,
  pnl: 0,

  lossStreak: 0,

  running: false,
  cooldown: false,

  currentContractId: null,

  entrySaved: false,

  lastTradeTime: null,
   tradeTimeout: null,

  startedAt: Date.now()
};

activeBots.set(
  user.id,
  state
);


emitBotStarted(
  io,
  user.id,
  botConfig.id
);
emitMetrics(
  io,
  user.id,
  {
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    winrate: 0
  }
);
  // ===============================
  // 🔥 HISTÓRICO
  // ===============================
  try {
    const history = await deriv.getCandles(botConfig.symbol, 60, 100);

    if (history.length > 0) {
      candleBuilder.candles = history;
      console.log("📊 Histórico cargado:", history.length);
    }
  } catch (err) {
    console.log("⚠️ Error histórico:", err.message);
  }

  log("BOT_START", "Bot iniciado", { user: user.id });

  const subId = await deriv.subscribeTicks(botConfig.symbol, async (data) => {
  const currentState =
      activeBots.get(user.id);

    if (!currentState) {
      return;
    }
    if (!deriv.isConnected) return;
 
    const price = data.tick.quote;
    const epoch = data.tick.epoch;

emitPriceUpdate(
  io,
  user.id,
  {
    price,
    epoch,
    symbol: botConfig.symbol
  }
);
   // console.log("📡 Tick recibido:", price);

    // 🛑 bloqueos
    if (state.running || state.cooldown || state.currentContractId) return;

    // 🛑 evitar overtrading
    if (state.lastTradeTime && Date.now() - state.lastTradeTime < 10000) return;

    // 🛑 control global




    // 🛑 control racha
    if (state.lossStreak >= 3) {
      state.cooldown = true;

      setTimeout(() => {
        state.cooldown = false;
        state.lossStreak = 0;
      }, 60000);

      return;
    }

    const { candles, isNewCandle } = candleBuilder.update(price, epoch);

    if (!isNewCandle) return;

    const closedCandles = candles.slice(0, -1);

    if (closedCandles.length < 20) return;

    // ===============================
    // 📊 VOLATILIDAD DINÁMICA
    // ===============================
    const recent = closedCandles.slice(-5);

    const volatility =
      Math.max(...recent.map(c => c.high)) -
      Math.min(...recent.map(c => c.low));

    const avgRange = closedCandles
      .slice(-10)
      .map(c => c.high - c.low)
      .reduce((a, b) => a + b, 0) / 10;

    if (volatility < avgRange * 0.5) return;

    // ===============================
    // 🚀 ESTRATEGIAS
    // ===============================
    const pro = syntheticProStrategy(closedCandles, state);

    const smaSignal = smaStrategy(closedCandles);
    const liquiditySignal = smartMoneyLiquidityStrategy(closedCandles);

    let finalSignal = null;

    // 🔥 PRIORIDAD PRO
    if (pro && pro.signal && pro.score >= 5) {
      finalSignal = pro.signal;
      console.log("🚀 PRO SIGNAL:", pro);
    }
    // ⚡ fallback liquidez
    else if (liquiditySignal) {
      finalSignal = liquiditySignal;
      console.log("💧 LIQUIDITY FALLBACK");
    }
    // ⚡ fallback SMA
    else if (smaSignal) {
      finalSignal = smaSignal;
      console.log("⚡ SMA FALLBACK");
    }

    const smaValue = calculateSMA(closedCandles, 20);

    // 📊 DEBUG
    debugVisual(closedCandles, finalSignal, smaValue, liquiditySignal, pro);

    if (!finalSignal) return;

    // ===============================
    // 🔥 FILTRO DE TENDENCIA
    // ===============================
    const lastCandle = closedCandles.at(-1);

    const trendUp = lastCandle.close > smaValue;
    const trendDown = lastCandle.close < smaValue;

    if (finalSignal === "CALL" && !trendUp) return;
    if (finalSignal === "PUT" && !trendDown) return;

    const contract_type = finalSignal;

    state.running = true;
    state.lastTradeTime = Date.now();

    log("SIGNAL", "Trade detectado", { contract_type });

    const msToNextSecond = 1000 - (Date.now() % 1000);
    await sleep(msToNextSecond + 200);

  state.tradeTimeout = setTimeout(() => {

  console.log(
    "⏰ TIMEOUT LIBERANDO BOT"
  );

  state.running = false;
  state.cooldown = false;

  state.tradeTimeout = null;

}, 70000);

    try {

     let stake = risk.getStake();
      const formattedStake = Number(stake.toFixed(2));

      if (!formattedStake || isNaN(formattedStake)) {
        state.running = false;
        return;
      }

      log("REQUEST", "Enviando orden", {
        amount: formattedStake,
        contract_type
      });

      const contract = await deriv.buyContract({
        amount: formattedStake,
        price: formattedStake,
        contract_type,
        symbol: botConfig.symbol
      });

      const contractId = contract?.buy?.contract_id;
      if (contract?.error) {
  console.error(
    "BUY ERROR RESPONSE:",
    JSON.stringify(contract, null, 2)
  );
}
    if (!contractId) throw new Error("Contrato inválido");

      state.currentContractId = contractId;
      state.entrySaved = false;

      const trade = await createTrade({
        start_time: new Date(),
expiry_time: new Date(Date.now() + 60000),
  user_id: user.id,
  bot_id: botConfig.id,
  contract_id: contractId,
  symbol: botConfig.symbol,
  type: contract_type,
  entry_price: null,
  status: "open"
  
});

      state.trades++;
     emitNewTrade(
  io,
  user.id,
  trade
);

      let closed = false;
      let contractFinished = false;
console.log(
  "WS CONNECTED:",
  deriv.isConnected
);

console.log(
  "CONTRACT ID:",
  contractId
);
     deriv.watchContract(contractId, async (c) => {

  try {

    // ===============================
    // 💾 GUARDAR ENTRY
    // ===============================
   const current=
  c.entry_tick ||
  c.entry_spot ||
  c.buy_price ||
  c.current_spot;
  const entryPrice = current;

if (!state.entrySaved && current) {

  state.entrySaved = true;

  const updatedTrade =    await updateTradeByContract(
      Number(contractId),
      {
        entry_price: Number(entryPrice)
      }
    );

  console.log(
    "✅ TRADE ACTUALIZADO:",
    updatedTrade
  );
}

    // ===============================
    // 📡 UPDATE FRONTEND
    // ===============================
 const tradeUpdate = {
  contract_id: c.contract_id,

  profit: c.profit,

  status: c.status,

  entry_price:
    c.entry_tick ||
    c.entry_spot ||
    c.buy_price,

  current_spot: c.current_spot,

  date_start: c.date_start,

  date_expiry: c.date_expiry
};

emitTradeUpdate(
  io,
  user.id,
  tradeUpdate
);

    // ===============================
    // 🏁 VALIDAR CIERRE
    // ===============================
    const done =
      c.is_sold ||
      c.status === "sold";

  if (!done || closed || contractFinished) {
  return;
}

closed = true;
contractFinished = true;
if (state.tradeTimeout) {

  clearTimeout(
    state.tradeTimeout
  );

  state.tradeTimeout = null;

  console.log(
    "🧹 TRADE TIMEOUT LIMPIADO"
  );
}

 // ===============================
    // 💾 CERRAR TRADE DB
    // ===============================
    try {

      await closeTrade(contractId, {
        status: "closed",
        profit,
        exit_price: c.exit_tick
      });

      console.log(
        "✅ TRADE CERRADO EN DB:",
        contractId
      );

    } catch (err) {

      console.log(
        "⚠️ ERROR DB:",
        err.message
      );
    }

    // ===============================
    // 💰 RESULTADO
    // ===============================
    const profit = Number(c.profit || 0);

    const result =
      profit > 0
        ? "win"
        : "loss";

    console.log(
      "🏁 CONTRATO CERRADO:",
      contractId,
      "PROFIT:",
      profit
    );

    // ===============================
    // 🔥 MARTINGALE
    // ===============================
    risk.nextStake(result);

    // ===============================
    // 📊 MÉTRICAS
    // ===============================
    if (result === "win") {

      state.wins++;
      state.lossStreak = 0;

    } else {

      state.losses++;
      state.lossStreak++;
    }

    state.pnl += profit;
    console.log(
  "📊 PNL ACTUAL:",
  state.pnl
);

       if (state.pnl <= -botConfig.stopLoss) {
  await stopBot(
    user,
    "stop_loss"
  );

  return;
}
if (state.pnl >=botConfig.targetProfit) {

  await stopBot(
    user,
    "take_profit"
  );

  return;
}

    const winrate = (
      (state.wins / state.trades) * 100
    ).toFixed(2);

    log("RESULT", "Trade cerrado", {
      result,
      profit,
      winrate
    });

    // ===============================
    // 💰 BALANCE
    // ===============================
    try {

    const balanceData =
  await deriv.getBalance();

emitBalance(
  io,
  user.id,
  balanceData.balance
);

      risk.update(balanceData.balance);

    } catch (err) {

      console.log(
        "⚠️ ERROR BALANCE:",
        err.message
      );
    }

   
    // ===============================
    // 🧹 OLVIDAR CONTRATO
    // ===============================
    try {
    state.currentContractId = null;
      await deriv.forgetContract(contractId);

      console.log(
        "🧹 Suscripción olvidada:",
        contractId
      );

    } catch (err) {

      console.log(
        "⚠️ Error olvidando contrato:",
        err.message
      );
    }

    // ===============================
    // 📡 MÉTRICAS FRONTEND
    // ===============================
emitMetrics(
  io,
  user.id,
  {
    trades: state.trades,
    wins: state.wins,
    losses: state.losses,
    pnl: state.pnl,
    winrate
  }
);

  } catch (err) {

    console.log(
      "🔥 ERROR WATCH CONTRACT:",
      err.message
    );

  } 
  finally {

  // 🔥 liberar SOLO si contrato terminó
  if (contractFinished) {

  state.currentContractId = null;

  state.running = false;

  state.cooldown = false;

  console.log("✅ BOT LIBERADO");
}

}
});

    } 
    catch(err) {

  if (state.tradeTimeout) {

    clearTimeout(
      state.tradeTimeout
    );

    state.tradeTimeout = null;

  }

  state.running = false;
  state.cooldown = false;

  console.log(
    "🔥 TRADE ERROR:",
    err.message
  );
}

  });

  state.subId = subId;
};

// ===============================
// 🛑 STOP BOT
// ===============================
const stopBot = async (
  user,
  reason = "manual"
) => {

  const state = activeBots.get(user.id);

  if (!state) return;

  try {

    if (state.subId) {
      await state.deriv.unsubscribe(state.subId);

      console.log("🧹 TICKS CANCELADOS");
    }

   state.running = false;
state.cooldown = true;
state.stopping = true;

    if (state.deriv) {
  state.deriv.disconnect();
  console.log("🔌 DERIV DESCONECTADO");
}

    // actualizar BD
    await updateBotStatus(
  state.botId,
  "stopped"
);

state.status = "stopped";
  console.log(
    "✅ BOT STATUS STOPPED:",
    state.botId
  );
    state.running = false;
    state.cooldown = false;
    state.currentContractId = null;

   emitBotStopped(
  state.io,
  user.id,
  state.botId,
  reason
);


    activeBots.delete(user.id);

    console.log("🛑 BOT ELIMINADO");

  } catch (err) {

    console.log(
      "STOP ERROR:",
      err.message
    );
  }
};
module.exports = { startBot, stopBot };