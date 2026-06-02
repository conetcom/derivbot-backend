const WebSocket = require("ws");

class DerivService {
  constructor(token) {
    this.token = token;
    this.ws = null;

    this.isConnected = false;
    this.connecting = false;

    this.requestId = 1;

    this.pendingRequests = new Map();
    this.subscriptions = new Map();
    this.contractSubscriptions = new Map();

    this.tickSubscriptions = new Map();

    // ✅ FIX 1
    this.reconnectAttempts = 0;
    this.maxReconnects = 10;
    this.reconnecting = false;
    this.pingInterval = null;
  }

  async connect() {
    if (this.isConnected) return;
    if (this.connecting) return;

    // ✅ FIX 2 (anti sockets duplicados)
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {}
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

      const timeout = setTimeout(() => {
        this.connecting = false;
        reject(new Error("Timeout conectando a Deriv"));
      }, 10000);

      this.ws.on("open", () => {
        console.log("🟡 Conectando a Deriv...");

        // ✅ FIX 3 (heartbeat)
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);

        this.send({ authorize: this.token }).catch(reject);
      });

      this.ws.on("message", (msg) => {
        let data;

        try {
          data = JSON.parse(msg);
        } catch (err) {
          console.error("❌ Error parseando mensaje:", err);
          return;
        }

        if (data.msg_type === "authorize") {
          clearTimeout(timeout);
          this.isConnected = true;
          this.connecting = false;

          console.log("✅ Autorizado en Deriv");
          resolve();
        }

        if (data.req_id && this.pendingRequests.has(data.req_id)) {
          const { resolve, reject } = this.pendingRequests.get(data.req_id);

          if (data.error) reject(new Error(data.error.message));
          else resolve(data);

          this.pendingRequests.delete(data.req_id);
        }

        if (data.msg_type === "tick" && data.subscription) {
          const subId = data.subscription.id;

          if (this.subscriptions.has(subId)) {
            this.subscriptions.get(subId)(data);
          }
        }

        if (data.msg_type === "proposal_open_contract" && data.proposal_open_contract) {
          const contract = data.proposal_open_contract;

          if (!contract.contract_id) {
            console.log("⚠️ contrato sin ID:", contract);
            return;
          }

          const contractId = contract.contract_id;
          const sub = this.contractSubscriptions.get(contractId);

          if (!sub) {
            console.log("⚠️ Contrato no encontrado:", contractId);
            return;
          }

          sub.received = true;

          if (data.subscription?.id && !sub.subId) {
            sub.subId = data.subscription.id;
          }

          sub.callback(contract);

          if (contract.is_sold) {
            console.log("🏁 CERRADO:", contractId, "Profit:", contract.profit);
          }
        }
      });

      // ✅ FIX 4 (reconexión pro)
      this.ws.on("close", (code, reason) => {
        console.log("🔴 WS CLOSED:", code, reason?.toString());

        this.isConnected = false;
        this.connecting = false;

        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        if (this.reconnecting) return;

        if (this.reconnectAttempts >= this.maxReconnects) {
          console.log("❌ Máximo de reconexiones alcanzado");
          return;
        }

        this.reconnecting = true;
        this.reconnectAttempts++;

        const delay = Math.min(3000 * this.reconnectAttempts, 15000);

        console.log(`🔄 Reintentando en ${delay}ms...`);

        setTimeout(async () => {
          try {
            await this.connect();

            console.log("✅ Reconectado");

            this.reSubscribeAll();

            this.reconnecting = false;
            this.reconnectAttempts = 0;

          } catch (err) {
            console.error("❌ Error reconectando:", err.message);
            this.reconnecting = false;
          }
        }, delay);
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        this.connecting = false;

        console.error("❌ WS ERROR:", err.message);
        reject(err);
      });
    });
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
    return await this.send({
      buy: 1,
      price: amount,
      parameters: {
        amount,
        basis: "stake",
        contract_type,
        currency: "USD",
        duration: 1,
        duration_unit: "m",
        symbol
        
      }
    });
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

        /*console.log(
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
    // ✅ FIX 8
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {}
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