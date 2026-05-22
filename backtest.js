const fs = require("fs");
const { getProSignal } = require("./bot/strategy");
const RiskManager = require("./bot/riskManager");

// ===============================
// 📊 CONFIG
// ===============================
const INITIAL_BALANCE = 100;

// ===============================
// 📥 CARGAR DATA
// ===============================
function loadData(path) {
  const raw = fs.readFileSync(path);
  return JSON.parse(raw);
}

// ===============================
// 🧠 BACKTEST ENGINE
// ===============================
function runBacktest(candles) {
  let balance = INITIAL_BALANCE;
  let wins = 0;
  let losses = 0;
  let trades = 0;

  const risk = new RiskManager(balance);

  let equity = [];
  let maxBalance = balance;
  let stopTriggered = false;
  let maxDrawdown = 0;

  for (let i = 20; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i);

    const signal = getProSignal(slice);
    if (!signal) continue;

    const entry = candles[i].close;
    const next = candles[i + 1].close;

    // 🔥 stake dinámico correcto
    const stake = risk.getStake();
    console.log(stake);

    // protección anti-NaN
    if (!stake || isNaN(stake)) {
      console.log("⚠️ Stake inválido:", stake);
      continue;
    }

    let result = null;

    if (signal === "CALL") {
      result = next > entry ? "win" : "loss";
    }

    if (signal === "PUT") {
      result = next < entry ? "win" : "loss";
    }

    if (!result) continue;

    trades++;

    // ===============================
    // 💰 RESULTADO FINANCIERO
    // ===============================
    if (result === "win") {
      balance += stake * 0.9;
      wins++;
    } else {
      balance -= stake;
      losses++;
    }

    // 🔥 actualizar balance en risk manager
    risk.update(balance);

    // ===============================
    // 📉 DRAWDOWN
    // ===============================
    if (balance > maxBalance) {
      maxBalance = balance;
    }

    const drawdown = maxBalance - balance;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    equity.push(balance);
    // ===============================
// 🛑 PROTECCIÓN DE DRAWDOWN
// ===============================
if (balance < maxBalance * 0.8) {
  console.log("🛑 Drawdown alto, deteniendo backtest");
  stopTriggered = true;
  break;
}
  }

  const winrate = trades > 0 ? (wins / trades) * 100 : 0;

  return {
    trades,
    wins,
    losses,
    winrate: winrate.toFixed(2),
    balance: balance.toFixed(2),
    pnl: (balance - INITIAL_BALANCE).toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    stopped: stopTriggered
  };
  
}

// ===============================
// 🚀 RUN
// ===============================
const data = loadData("./data/candles.json");

const result = runBacktest(data);

console.log("📊 RESULTADOS BACKTEST:");
console.log(result);