const WebSocket = require("ws");
const axios = require("axios");

class DerivService {
  constructor(config) {
    this.token = config.token;
    this.accountId = config.accountId;


    // Estado de conexión
    this.ws = null;
    this.isConnected = false;
    this.connecting = false;

    // Requests
    this.requestId = 1;
    this.pendingRequests = new Map();

    // Subscripciones
    this.subscriptions = new Map();
    this.contractSubscriptions = new Map();
    this.tickSubscriptions = new Map();

    // Reconexión
    this.reconnectAttempts = 0;
    this.maxReconnects = 10;
    this.reconnecting = false;

    // Ping
    this.pingInterval = null;
  }

async connect() {

  if (this.isConnected) return;
  if (this.connecting) return;

  this.connecting = true;
  
  try {
const cleanAccountId =
  String(this.accountId).trim();

    const response = await axios.post(
      `https://api.derivws.com/trading/v1/options/accounts/${cleanAccountId}/otp`,
      {},
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Deriv-App-ID": process.env.DERIV_APP_ID
        }
      }
    );

    const wsUrl =
  response.data?.data?.url;
  const WebSocket = require("ws");

this.ws = new WebSocket(wsUrl);

await new Promise((resolve, reject) => {

  this.ws.on("open", () => {
    console.log("✅ WebSocket conectado");

    this.isConnected = true;
    this.connecting = false;
    this.reconnectAttempts = 0;

    resolve();
  });

this.ws.on("message", (msg) => {
  try {
    const data = JSON.parse(msg);

    // =========================
    // RESPUESTAS req_id
    // =========================
    if (data.req_id) {
      const pending = this.pendingRequests.get(data.req_id);

      if (pending) {
        this.pendingRequests.delete(data.req_id);
        pending.resolve(data);
      }
    }

    // =========================
    // TICKS
    // =========================
    if (data.tick && data.subscription?.id) {

      const callback =
        this.subscriptions.get(
          data.subscription.id
        );

      if (callback) {
        callback(data);
      }
    }

    // =========================
    // CONTRATOS
    // =========================
    if (
      data.proposal_open_contract &&
      data.subscription?.id
    ) {

      for (const [contractId, sub] of this.contractSubscriptions.entries()) {

        if (sub.subId === data.subscription.id) {

          sub.callback(
            data.proposal_open_contract
          );

          break;
        }
      }
    }

  } catch (err) {
    console.error("WS PARSE ERROR:", err);
  }
});

  this.ws.on("error", (err) => {
    console.error("❌ WS ERROR", err);
    reject(err);
  });

 this.ws.on("close", (code, reason) => {
  console.log("========== WS CLOSE ==========");
  console.log("Code:", code);
  console.log("Reason:", reason?.toString());
  console.log("Connected:", this.isConnected);
  console.log("Time:", new Date().toISOString());
  console.log("==============================");

  this.isConnected = false;
});
});
  } catch (err) {
  console.error("STATUS:", err.response?.status);

  console.error(
    "DATA:",
    JSON.stringify(err.response?.data, null, 2)
  );

  console.error("MESSAGE:", err.message);

  throw err;
}
}

  send(data) {
    return new Promise((resolve, reject) => {
      // ✅ FIX 5
     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
  return reject(new Error("WebSocket no conectado"));
}

// 🔥 permitir authorize sin isConnected
if (!this.isConnected && !data.authorize) {
  return reject(new Error("No autorizado aún"));
}

      const req_id = this.requestId++;

      this.pendingRequests.set(req_id, { resolve, reject });

      try {
        this.ws.send(JSON.stringify({ ...data, req_id }));
      } catch (err) {
        this.pendingRequests.delete(req_id);
        reject(err);
      }
    });
  }

  async getBalance() {
    const res = await this.send({ balance: 1 });
    return res.balance;
  }
async getContract(contractId) {

  const res = await this.send({
    proposal_open_contract: 1,
    contract_id: contractId
  });

  return res.proposal_open_contract;
}
  async subscribeTicks(symbol, callback) {
    const res = await this.send({
      ticks: symbol,
      subscribe: 1
    });

    const subId = res.subscription.id;

    this.subscriptions.set(subId, callback);
    this.tickSubscriptions.set(symbol, callback);

    return subId;
  }

  async unsubscribe(subId) {
    try {
      await this.send({ forget: subId });
    } catch (err) {
      console.warn("⚠️ Error al desuscribir:", err.message);
    }

    this.subscriptions.delete(subId);
  }

 async buyContract({ amount, contract_type, symbol }) {

  const res = await this.send({
    buy: 1,
    price: amount,
    parameters: {
      amount,
      basis: "stake",
      contract_type,
      currency: "USD",
      duration: 1,
      duration_unit: "m",
      underlying_symbol: symbol
    }
  });

  console.log(
    "BUY RESPONSE:",
    JSON.stringify(res, null, 2)
  );

  return res;
}

  async watchContract(contractId, callback) {

  console.log("👀 Iniciando seguimiento contrato:", contractId);

  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    console.log("❌ WS no conectado");
    return;
  }

  this.contractSubscriptions.set(contractId, {
    callback,
    subId: null,
    received: false,
    closed: false
  });

  try {

    // ✅ SUSCRIPCIÓN REALTIME
    const res = await this.send({
      proposal_open_contract: 1,
      contract_id: contractId,
      subscribe: 1
    });

    console.log("✅ Suscripción contrato OK:", contractId);

    const sub = this.contractSubscriptions.get(contractId);

    if (res.subscription?.id && sub) {
      sub.subId = res.subscription.id;
    }

    // ✅ FALLBACK POLLING
    const interval = setInterval(async () => {

      const current = this.contractSubscriptions.get(contractId);

      if (!current || current.closed) {
        clearInterval(interval);
        return;
      }

      try {

        const poll = await this.send({
          proposal_open_contract: 1,
          contract_id: contractId
        });

        if (!poll.proposal_open_contract) return;

        const contract = poll.proposal_open_contract;

       /* console.log(
          "📡 POLL:",
          contract.contract_id,
          contract.status,
          contract.profit
        );*/
        

        callback(contract);

        // ✅ CERRADO
        if (
          contract.is_sold === 1 ||
          contract.status === "sold"
        ) {

          console.log(
            "🏁 CONTRATO CERRADO:",
            contract.contract_id,
            "PROFIT:",
            contract.profit
          );

          current.closed = true;

          clearInterval(interval);

          await this.forgetContract(contractId);
        }

      } catch (err) {

        console.error(
          "❌ Error polling contrato:",
          err.message
        );
      }

    }, 2000);

  } catch (err) {

    console.error(
      "❌ Error watchContract:",
      err.message
    );
  }
}

  reSubscribeAll() {
    console.log("🔁 Re-suscribiendo TODO...");

    for (const [contractId] of this.contractSubscriptions.entries()) {
      // ✅ FIX 7
      if (!this.isConnected) break;

      console.log("📉 Re-subscribiendo contrato:", contractId);

      this.send({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
      }).catch(err =>
        console.error("❌ Error re-subscribiendo contrato:", err.message)
      );
    }
  }

  async forgetContract(contractId) {
    const sub = this.contractSubscriptions.get(contractId);

    if (sub?.subId) {
      try {
        await this.send({
          forget: sub.subId
        });

        console.log("🧹 Cancelada suscripción:", contractId);

      } catch (err) {
        console.warn("⚠️ Error olvidando contrato:", err.message);
      }
    }

    this.contractSubscriptions.delete(contractId);
  }

  disconnect() {

  if (this.pingInterval) {
    clearInterval(this.pingInterval);
    this.pingInterval = null;
  }

  if (this.ws) {

    try {
      this.ws.close();
    } catch (err) {
      console.log(err.message);
    }

    this.ws = null;
  }

  this.isConnected = false;
  this.connecting = false;

  this.pendingRequests.clear();
  this.subscriptions.clear();
  this.contractSubscriptions.clear();
  this.tickSubscriptions.clear();
}
async getCandles(symbol, granularity = 60, count = 500) {

  const res = await this.send({
    ticks_history: symbol,
    style: "candles",
    granularity,
    count,
    end: "latest",
    adjust_start_time: 1
  });

  if (!res.candles) return [];

  const candles = res.candles.map(c => ({
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    time: c.epoch
  }));

  // ==========================
  // ESTADÍSTICAS
  // ==========================

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

    // VERDE → VERDE
    if (green1 && green2) {

      if (green3) {
        GGG++;
      } else {
        GGR++;
      }

    }

    // ROJA → ROJA
    if (!green1 && !green2) {

      if (!green3) {
        RRR++;
      } else {
        RRG++;
      }

    }
  }

  // ==========================
  // PORCENTAJES
  // ==========================

  const totalGG = GGG + GGR;
  const totalRR = RRR + RRG;

  const pctGGG =
    totalGG > 0
      ? ((GGG / totalGG) * 100).toFixed(2)
      : 0;

  const pctGGR =
    totalGG > 0
      ? ((GGR / totalGG) * 100).toFixed(2)
      : 0;

  const pctRRR =
    totalRR > 0
      ? ((RRR / totalRR) * 100).toFixed(2)
      : 0;

  const pctRRG =
    totalRR > 0
      ? ((RRG / totalRR) * 100).toFixed(2)
      : 0;

  console.log("========== ESTADÍSTICAS ==========");

  console.log(`GGG: ${GGG} (${pctGGG}%)`);
  console.log(`GGR: ${GGR} (${pctGGR}%)`);

  console.log(`RRR: ${RRR} (${pctRRR}%)`);
  console.log(`RRG: ${RRG} (${pctRRG}%)`);

  return candles;
  stats: {
      greenGreenGreen,
      greenGreenRed,
      redRedRed,
      redRedGreen
    }
}
}

module.exports = DerivService;