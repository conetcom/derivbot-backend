const WebSocket = require("ws");
const axios = require("axios");

class DerivService {
 constructor(config) {

    this.token = config.token;
    this.accountId = config.accountId;

    this.ws = null;

    this.isConnected = false;
    this.connecting = false;

    this.requestId = 1;

    this.pendingRequests = new Map();

    // ticks
    this.subscriptions = new Map();

    // contratos
    this.contractSubscriptions = new Map();

    // subId -> contractId
    this.subscriptionMap = new Map();

    this.reconnectAttempts = 0;
    this.maxReconnects = 10;

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

    const wsUrl =  response.data?.data?.url;
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

    const { quote: price, epoch } = data.tick;

    callback({
        price,
        epoch
    });
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

   const c = data.proposal_open_contract;

sub.callback({

    contractId: c.contract_id,

    profit: Number(c.profit),

    status: c.status,

    isSold: Boolean(c.is_sold),

    entryPrice:
        c.entry_tick ??
        c.entry_spot ??
        c.buy_price,

    currentSpot: c.current_spot,

    exitSpot: c.exit_tick,

    dateStart: c.date_start,

    dateExpiry: c.date_expiry

});
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
for(const pending of this.pendingRequests.values()){

    pending.reject(
        new Error("WebSocket cerrado")
    );

}

this.pendingRequests.clear();
  this.isConnected = false;
  this.connecting = false;
});
});
  } catch (err) {
    this.connecting = false;
    this.isConnected = false;
  console.error("STATUS:", err.response?.status);

  console.error(
    "DATA:",
    JSON.stringify(err.response?.data, null, 2)
  );

  console.error("MESSAGE:", err.message);

  throw err;
}
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

    if (!this.isConnected) {
        throw new Error("WebSocket no conectado");
    }

    const res = await this.send({
        ticks: symbol,
        subscribe: 1
    });

    if (!res.subscription?.id) {
        throw new Error("No se recibió subscription.id");
    }

    const subId = res.subscription.id;

    this.subscriptions.set(subId, callback);

    return subId;
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

  console.log("🟢 BUY:", {
    contractId: res.buy?.contract_id,
    transactionId: res.buy?.transaction_id
});

  return res;
}
async watchContract(contractId, callback) {

    if (!this.isConnected) {
        throw new Error("WebSocket no conectado");
    }

    console.log("👀 Watch:", contractId);

    const res = await this.send({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1
    });

    if (!res.subscription?.id) {
        throw new Error("No se recibió subscription.id");
    }

    const subId = res.subscription.id;

    this.subscriptionMap.set(subId, contractId);

    this.contractSubscriptions.set(contractId, {
        callback,
        subId
    });

    console.log(
        "✅ Contrato suscrito:",
        contractId,
        "Sub:",
        subId
    );

    return subId;
}

async reSubscribeAll() {

    console.log("🔁 Re-suscribiendo contratos...");

    for (const [contractId, sub] of this.contractSubscriptions.entries()) {

        try {

            const res = await this.send({
                proposal_open_contract:1,
                contract_id:contractId,
                subscribe:1
            });

            if(res.subscription?.id){

                this.subscriptionMap.delete(sub.subId);

                sub.subId = res.subscription.id;

                this.subscriptionMap.set(
                    res.subscription.id,
                    contractId
                );
            }

        } catch(err){

            console.error(err.message);

        }

    }

}
send(data) {

    return new Promise((resolve, reject) => {

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return reject(new Error("WebSocket no conectado"));
        }

        const req_id = this.requestId++;

        const timeout = setTimeout(() => {

            this.pendingRequests.delete(req_id);

            reject(new Error("Request timeout"));

        }, 10000);

        this.pendingRequests.set(req_id, {

            resolve: (res) => {

                clearTimeout(timeout);

                resolve(res);

            },

            reject: (err) => {

                clearTimeout(timeout);

                reject(err);

            }

        });

       try {

    this.ws.send(JSON.stringify({
        ...data,
        req_id
    }));

} catch (err) {

    clearTimeout(timeout);

    this.pendingRequests.delete(req_id);

    reject(err);

}

    });

}
async forgetContract(contractId) {

    const sub =
        this.contractSubscriptions.get(contractId);

    if (!sub) return;

    try {

    await this.send({
        forget: sub.subId
    });

} catch (err) {

    console.warn(
        "⚠️ Error forget:",
        err.message
    );

}

     finally {

        this.subscriptionMap.delete(sub.subId);

        this.contractSubscriptions.delete(contractId);

        console.log(
            "🧹 Suscripción eliminada:",
            contractId
        );
    }
}
disconnect() {

    if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
    }

    if (this.ws) {
        try {
          this.ws.removeAllListeners();
            this.ws.close();
        } catch (err) {
            console.error(err);
        }

        this.ws = null;
    }

    this.isConnected = false;
    this.connecting = false;

    this.pendingRequests.clear();

    this.subscriptions.clear();
    this.contractSubscriptions.clear();
    this.subscriptionMap.clear();
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