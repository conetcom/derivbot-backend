const WebSocket = require("ws");
const { RSI } = require("technicalindicators");
const tradesModel = require("../models/tradesModel");

class TradingBot {
  constructor(user) {
    this.user = user;
    this.prices = [];
    this.balance = 100;
    this.riskPerTrade = 0.02;

    this.activeContracts = new Set(); // 🔥 FIX correcto
  }

  connect() {
    this.ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

    this.ws.on("open", () => {
      console.log("✅ Conectado a Deriv");

      this.ws.send(JSON.stringify({
        authorize: this.user.deriv_token
      }));

      this.ws.send(JSON.stringify({
        ticks: "R_100"
      }));
    });

    this.ws.on("message", async (data) => {
      const msg = JSON.parse(data);
      console.log("📩 RAW:", msg);

      // 📊 TICKS
      if (msg.tick) {
        this.handleTick(msg.tick.quote);
      }

      // 🆔 CUANDO COMPRA
      if (msg.buy) {
        const contractId = msg.buy.contract_id;

        console.log("🆔 Contract ID:", contractId);

        this.activeContracts.add(contractId);

        // 🔥 SUSCRIPCIÓN AL CONTRATO
        this.ws.send(JSON.stringify({
          proposal_open_contract: 1,
          contract_id: contractId,
          subscribe: 1
        }));
      }

      // 📉 RESULTADO
      if (msg.proposal_open_contract) {
        await this.handleResult(msg.proposal_open_contract);
      }
    });
  }

  handleTick(price) {
    this.prices.push(price);

    if (this.prices.length > 100) {
      this.prices.shift();
    }

    if (this.prices.length >= 14) {
      this.evaluateStrategy();
    }
  }

  evaluateStrategy() {
    const rsi = RSI.calculate({
      values: this.prices,
      period: 14 // 🔥 más estable
    });

    const lastRSI = rsi[rsi.length - 1];

    console.log("📊 RSI:", lastRSI);

    // 🔥 ESTRATEGIA REAL (no ruido)
    if (lastRSI < 30) {
      this.buy("CALL");
    } else if (lastRSI > 70) {
      this.buy("PUT");
    }
  }

buy(type) {
  // 🔒 evitar múltiples trades simultáneos
  if (this.activeContracts.size > 0) {
    console.log("⛔ Trade activo, esperando cierre...");
    return;
  }

  // 🔍 DEBUG
  console.log("📊 balance:", this.balance, "risk:", this.riskPerTrade);

  // 🔥 VALIDACIÓN FUERTE
  if (!this.balance || isNaN(this.balance)) {
    console.log("❌ balance inválido:", this.balance);
    return;
  }

  let stake = this.balance * this.riskPerTrade;

  if (!stake || isNaN(stake)) {
    console.log("⚠️ stake inválido, usando fallback");
    stake = 1;
  }

  const formattedStake = Number(stake.toFixed(2));

  if (!formattedStake || isNaN(formattedStake)) {
    console.log("❌ stake final inválido:", formattedStake);
    return;
  }

  // 🔥 DERIV FIX CLAVE
  const price = formattedStake;
  const amount = formattedStake;

  console.log("🟢 Comprando:", type, "Monto:", formattedStake);
console.log("📦 REQUEST:", {
  price,
  amount,
  type
});
  this.ws.send(JSON.stringify({
    buy: 1,
    price: price,
    parameters: {
      amount: amount,
      basis: "stake",
      contract_type: type,
      currency: "USD",
      duration: 1,
      duration_unit: "m",
      symbol: "R_100"
    }
  }));
}

  async handleResult(contract) {
    if (!contract.is_sold) return;

    const profit = contract.profit;
    const contractId = contract.contract_id;

    console.log("📈 Resultado:", profit);

    // 🔓 liberar contrato
    this.activeContracts.delete(contractId);

    // 💾 guardar trade
    const savedTrade = await tradesModel.saveTrade({
      user_id: this.user.id,
      symbol: contract.underlying,
      contract_type: contract.contract_type,
      profit: profit
    });

    // 📡 emitir al frontend (CONSISTENTE)
    if (global.io) {
      global.io
        .to(`user_${this.user.id}`)
        .emit("trade_closed", savedTrade);
    }

    // 💰 actualizar balance
    this.balance += profit;
  }
}

module.exports = TradingBot;