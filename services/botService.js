const WebSocket = require("ws");

const { RSI } = require("technicalindicators");

const tradesModel =
  require("../models/tradesModel");

class TradingBot {

  constructor(user, config = {}) {

    this.user = user;

    // =========================
    // CONFIG
    // =========================
    this.symbol =
      config.symbol || "R_75";

    this.strategy =
      config.strategy || "rsi";

    this.duration =
      config.duration || 1;

    this.duration_unit =
      config.duration_unit || "m";

    this.riskPerTrade =
      config.riskPerTrade || 0.02;

    // =========================
    // STATE
    // =========================
    this.prices = [];

    this.balance = 0;

    this.ws = null;

    this.connected = false;

    this.isTrading = false;

    this.activeContracts =
      new Set();

    this.lastTradeTime = 0;

    this.cooldown = 5000;

    this.reconnectAttempts = 0;

    this.maxReconnects = 5;
  }

  // ===================================
  // CONNECT
  // ===================================
  connect() {

    console.log(
      "🔌 Conectando a Deriv..."
    );

    this.ws =
      new WebSocket(
        "wss://ws.derivws.com/websockets/v3?app_id=1089"
      );

    this.ws.on(
      "open",
      () => {

        console.log(
          "✅ Deriv conectado"
        );

        this.connected = true;

        this.reconnectAttempts = 0;

        // AUTH
        this.send({
          authorize:
            this.user.deriv_token
        });

        // BALANCE
        this.send({
          balance: 1,
          subscribe: 1
        });

        // TICKS
        this.send({
          ticks: this.symbol,
          subscribe: 1
        });
      }
    );

    // ===================================
    // MESSAGE
    // ===================================
    this.ws.on(
      "message",
      async (data) => {

        try {

          const msg =
            JSON.parse(data);

          // ERROR
          if (msg.error) {

            console.log(
              "🔥 DERIV ERROR:",
              msg.error.message
            );

            return;
          }

          // AUTH
          if (msg.authorize) {

            console.log(
              "✅ AUTH OK"
            );
          }

          // BALANCE
          if (msg.balance) {

            this.handleBalance(
              msg.balance
            );
          }

          // TICK
          if (msg.tick) {

            this.handleTick(
              msg.tick.quote
            );
          }

          // BUY
          if (msg.buy) {

            this.handleBuy(
              msg.buy
            );
          }

          // CONTRACT UPDATE
          if (
            msg.proposal_open_contract
          ) {

            await this.handleResult(
              msg.proposal_open_contract
            );
          }

        } catch (err) {

          console.log(
            "🔥 MESSAGE ERROR:",
            err.message
          );
        }
      }
    );

    // ===================================
    // CLOSE
    // ===================================
    this.ws.on(
      "close",
      () => {

        console.log(
          "🔴 Deriv desconectado"
        );

        this.connected = false;

        this.reconnect();
      }
    );

    // ===================================
    // ERROR
    // ===================================
    this.ws.on(
      "error",
      (err) => {

        console.log(
          "🔥 WS ERROR:",
          err.message
        );
      }
    );
  }

  // ===================================
  // SEND SAFE
  // ===================================
  send(data) {

    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN
    ) {

      console.log(
        "⚠️ WS NO LISTO"
      );

      return;
    }

    this.ws.send(
      JSON.stringify(data)
    );
  }

  // ===================================
  // BALANCE
  // ===================================
  handleBalance(balanceData) {

    this.balance =
      Number(balanceData.balance);

    console.log(
      "💰 Balance:",
      this.balance
    );

    if (global.io) {

      global.io
        .to(`user_${this.user.id}`)
        .emit("balance", {

          balance:
            this.balance,

          currency:
            balanceData.currency
        });
    }
  }

  // ===================================
  // TICKS
  // ===================================
  handleTick(price) {

    this.prices.push(price);

    if (
      this.prices.length > 100
    ) {

      this.prices.shift();
    }

    // FRONT
    if (global.io) {

      global.io
        .to(`user_${this.user.id}`)
        .emit(
          "price_update",
          price
        );
    }

    // STRATEGY
    if (
      this.prices.length >= 14
    ) {

      this.evaluateStrategy();
    }
  }

  // ===================================
  // STRATEGY
  // ===================================
  evaluateStrategy() {

    if (this.isTrading) return;

    const now = Date.now();

    // COOLDOWN
    if (
      now - this.lastTradeTime <
      this.cooldown
    ) {

      return;
    }

    const rsi =
      RSI.calculate({

        values:
          this.prices,

        period: 14
      });

    const lastRSI =
      rsi[rsi.length - 1];

    if (!lastRSI) return;

    console.log(
      "📊 RSI:",
      lastRSI
    );

    if (lastRSI < 30) {

      this.buy("CALL");
    }

    else if (
      lastRSI > 70
    ) {

      this.buy("PUT");
    }
  }

  // ===================================
  // BUY
  // ===================================
  buy(type) {

    // BLOQUEAR
    if (
      this.activeContracts.size > 0
    ) {

      console.log(
        "⛔ Trade activo"
      );

      return;
    }

    if (!this.balance) {

      console.log(
        "⚠️ Balance vacío"
      );

      return;
    }

    this.isTrading = true;

    this.lastTradeTime =
      Date.now();

    // STAKE
    let stake =
      this.balance *
      this.riskPerTrade;

    if (
      stake < 0.35
    ) {

      stake = 0.35;
    }

    stake =
      Number(stake.toFixed(2));

    console.log(
      "🟢 BUY:",
      type,
      stake
    );

    this.send({

      buy: 1,

      price: stake,

      parameters: {

        amount: stake,

        basis: "stake",

        contract_type: type,

        currency: "USD",

        duration:
          this.duration,

        duration_unit:
          this.duration_unit,

        symbol:
          this.symbol
      }
    });
  }

  // ===================================
  // BUY RESPONSE
  // ===================================
  handleBuy(buyData) {

    const contractId =
      buyData.contract_id;

    console.log(
      "🆔 CONTRACT:",
      contractId
    );

    this.activeContracts.add(
      contractId
    );

    this.send({

      proposal_open_contract: 1,

      contract_id:
        contractId,

      subscribe: 1
    });
  }

  // ===================================
  // RESULT
  // ===================================
  async handleResult(contract) {

    if (!contract.is_sold)
      return;

    const profit =
      Number(
        contract.profit || 0
      );

    const contractId =
      contract.contract_id;

    console.log(
      "📈 RESULT:",
      profit
    );

    // FREE
    this.activeContracts.delete(
      contractId
    );

    this.isTrading = false;

    // SAVE DB
    const savedTrade =
      await tradesModel.saveTrade({

        user_id:
          this.user.id,

        symbol:
          contract.underlying,

        contract_type:
          contract.contract_type,

        profit
      });

    // FRONT
    if (global.io) {

      global.io
        .to(`user_${this.user.id}`)
        .emit(
          "trade_closed",
          savedTrade
        );
    }

    // UPDATE BALANCE
    this.balance += profit;

    // UNSUBSCRIBE
    this.send({
      forget:
        contract.contract_id
    });
  }

  // ===================================
  // RECONNECT
  // ===================================
  reconnect() {

    if (
      this.reconnectAttempts >=
      this.maxReconnects
    ) {

      console.log(
        "❌ MAX RECONNECTS"
      );

      return;
    }

    this.reconnectAttempts++;

    console.log(
      `🔄 Reconnect ${this.reconnectAttempts}`
    );

    setTimeout(() => {

      this.connect();

    }, 3000);
  }

  // ===================================
  // STOP
  // ===================================
  stop() {

    console.log(
      "🛑 STOP BOT"
    );

    this.connected = false;

    this.isTrading = false;

    this.activeContracts.clear();

    if (this.ws) {

      this.ws.close();
    }
  }
}

module.exports = TradingBot;