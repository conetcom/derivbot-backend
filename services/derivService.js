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

    // ==========================================
    // RESPUESTAS A REQUESTS (send)
    // ==========================================
    if (data.req_id) {

      const pending = this.pendingRequests.get(data.req_id);

      if (pending) {

        this.pendingRequests.delete(data.req_id);

        pending.resolve(data);
      }
    }

    // ==========================================
    // TICKS
    // ==========================================
    if (
      data.tick &&
      data.subscription?.id
    ) {

      const callback =
        this.subscriptions.get(
          data.subscription.id
        );

      if (callback) {
        callback(data.tick);
      }

      return;
    }

    // ==========================================
    // CONTRATOS ABIERTOS
    // ==========================================
   if (data.proposal_open_contract && data.subscription?.id) {

    const contractId =
        this.subscriptionMap.get(data.subscription.id);

    if (!contractId) return;

    const sub =
        this.contractSubscriptions.get(contractId);

    if (!sub) return;

    sub.callback(data.proposal_open_contract);
}

  } catch (err) {

    console.error(
      "❌ WS PARSE ERROR:",
      err.message
    );
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

this.subscriptionMap.set(subId, contractId);

this.contractSubscriptions.set(contractId,{
    callback,
    subId
});
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

    if (!this.isConnected) {
        throw new Error("WebSocket no conectado");
    }

    console.log(
        "👀 Watch:",
        contractId
    );

    this.contractSubscriptions = new Map();   // contractId -> datos
    this.subscriptionMap = new Map();         // subId -> contractId

    const res = await this.send({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
    });

    if (res.subscription?.id) {

        this.contractSubscriptions.get(contractId).subId =
            res.subscription.id;

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
 async getCandles(symbol, granularity = 60, count = 100) {
  const res = await this.send({
    ticks_history: symbol,
    style: "candles",
    granularity,
    count,
    end: "latest", // 🔥 ESTE ES EL FIX
    adjust_start_time: 1
  });

  if (!res.candles) return [];

  return res.candles.map(c => ({
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    time: c.epoch
  }));
}
}

module.exports = DerivService;