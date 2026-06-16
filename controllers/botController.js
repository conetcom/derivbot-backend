const pool = require("../config/db");

const DerivService = require("../services/derivService");

const {
  startBot,
  stopBot
} = require("../services/botEngine");

const { decrypt } = require("../utils/crypto");

const {
  createTrade,
  closeTrade
} = require("../models/tradesModel");

// ======================================
// 🧠 MEMORIA BOTS ACTIVOS
// ======================================
const activeBots = new Map();

// ======================================
// 🔗 OBTENER CLIENTE DERIV
// ======================================
// ======================================
// 🔗 OBTENER CLIENTE DERIV
// ======================================
const getDerivClient = async (
  userId,
  accountId = null
) => {

  let query = `
    SELECT *
    FROM deriv_accounts
    WHERE user_id = $1
  `;

  let params = [userId];

  // cuenta específica
  if (accountId) {

    query += ` AND id = $2`;

    params.push(accountId);

  } else {

    query += `
      AND is_active = true
    `;
  }

  query += ` LIMIT 1`;

  const result = await pool.query(
    query,
    params
  );

  const account = result.rows[0];

  if (!account) {

    throw new Error(
      "No tienes cuenta Deriv configurada"
    );
  }

  // 🔥 TOKEN ENCRIPTADO
  const derivToken = decrypt(
    account.deriv_token
  );

  if (!derivToken) {

    throw new Error(
      "Token Deriv inválido"
    );
  }
  // 🔥 CREAR SERVICIO DERIV
 const deriv = new DerivService({
  token: derivToken,
  accountId: account.account_id
});

await deriv.connect();

return {
  deriv,
  account
};
};
// ======================================
// 🚀 START BOT
// ======================================
const start = async (req, res) => {

  console.log("🚀 BOT START REQUEST");

  try {

    const user = req.user;

    // ✅ accountId viene por params
    const { accountId } = req.params;

    // ✅ lo demás viene en body
    const {
      symbol,
      stake,
      strategy,
      targetProfit,
      stopLoss,
      maxDrawdown
    } = req.body;

    console.log("ACCOUNT ID:", accountId);
    console.log("BODY:", req.body);



    // ======================================
    // VALIDACIONES
    // ======================================
    if (!user?.id) {

      return res.status(401).json({
        error: "No autorizado"
      });
    }

    if (!symbol || !stake) {

      return res.status(400).json({
        error:
          "symbol y stake requeridos"
      });
    }

    if (
      isNaN(stake) ||
      Number(stake) <= 0
    ) {

      return res.status(400).json({
        error: "Stake inválido"
      });
    }

    // ======================================
    // EVITAR MULTI BOT
    // ======================================
    if (activeBots.has(user.id)) {

      return res.status(400).json({
        error:
          "Ya tienes un bot activo"
      });
    }

    // ======================================
    // EVITAR TRADE ABIERTO
    // ======================================
    const openTrade =
      await pool.query(
        `
        SELECT id
        FROM trades
        WHERE user_id = $1
        AND status = 'open'
        LIMIT 1
        `,
        [user.id]
      );

    if (openTrade.rows.length > 0) {

      return res.status(400).json({
        error:
          "Tienes un trade abierto"
      });
    }

    // ======================================
    // 🔗 CONECTAR DERIV
    // ======================================
    const {
      deriv,
      account
    } = await getDerivClient(
      user.id,
      accountId
    );

    console.log(
      "✅ DERIV CONNECTED:",
      account.account_name
    );

    // ======================================
    // 💰 BALANCE
    // ======================================
    const balance =
      await deriv.getBalance();

    console.log(
      "💰 BALANCE:",
      balance
    );

    // SOCKET BALANCE
    
    req.io
      .to(`user_${user.id}`)
      .emit("balance", {
        balance:
          balance.balance ||
          balance
      });

    // ======================================
    // 🤖 CREAR BOT DB
    // ======================================
    const botResult =
      await pool.query(
        `
        INSERT INTO bots (
          user_id,
          name,
          strategy,
          symbol,
          stake,
          status
        )
        VALUES (
          $1,$2,$3,$4,$5,$6
        )
        RETURNING *
        `,
        [
          user.id,
          "Bot automático",
          strategy || "sma",
          symbol,
          stake,
          "active"
        ]
      );

    const bot =
      botResult.rows[0];

    console.log(
      "🤖 BOT CREATED:",
      bot.id
    );

    // ======================================
    // 🚀 START ENGINE
    // ======================================
    const botInstance =
      await startBot(

        user,

        {
          id: bot.id,

          symbol,

          stake,

          strategy,

          targetProfit,

          stopLoss,

          maxDrawdown
        },

        deriv,

        req.io
      );

    // ======================================
    // 🧠 GUARDAR MEMORIA
    // ======================================
    activeBots.set(user.id, {

      botId: bot.id,

      bot: botInstance,

      deriv,

      accountId:
        account.id,

      startedAt:
        new Date()
    });
io.to(`user_${user.id}`).emit(
  "bot_started"
);

console.log(
  "📡 bot_started enviado a",
  `user_${user.id}`
);
    return res.json({

      success: true,

      message:
        "Bot iniciado",

      botId: bot.id,

      account:
        account.account_name
    });

  } catch (err) {

  console.log("🔥 FULL ERROR:");
  console.log(err);

  return res.status(500).json({
    error: err.message
  });
}
};

// ======================================
// 🛑 STOP BOT
// ======================================
const stop = async (req, res) => {

  try {

    const user = req.user;

    if (!user?.id) {

      return res.status(401).json({
        error: "No autorizado"
      });
    }

    const botData =
      activeBots.get(user.id);

    if (!botData) {

      return res.status(400).json({
        error:
          "No tienes bot activo"
      });
    }

    const {
      deriv,
      botId
    } = botData;

    console.log(
      "🛑 STOP BOT:",
      botId
    );

    // ======================================
    // STOP ENGINE
    // ======================================
    await stopBot(user);

    // ======================================
    // CERRAR TRADES OPEN
    // ======================================
    await pool.query(
      `
      UPDATE trades
      SET status = 'closed',
          profit = 0
      WHERE user_id = $1
      AND status = 'open'
      `,
      [user.id]
    );

    console.log(
      "🧹 OPEN TRADES CLOSED"
    );

    // ======================================
    // UPDATE BOT DB
    // ======================================
    await pool.query(
      `
      UPDATE bots
      SET status = 'stopped'
      WHERE id = $1
      `,
      [botId]
    );

    // ======================================
    // CLOSE SOCKET
    // ======================================
    if (deriv?.ws) {

      deriv.ws.close();

      console.log(
        "🔌 DERIV SOCKET CLOSED"
      );
    }

    // ======================================
    // REMOVE MEMORY
    // ======================================
    activeBots.delete(user.id);

    return res.json({

      success: true,

      message:
        "Bot detenido"
    });

  } catch (err) {

    console.log(
      "🔥 STOP ERROR:",
      err.message
    );

    return res.status(500).json({
      error: err.message
    });
  }
};

// ======================================
// 📊 STATUS
// ======================================
const status = async (req, res) => {

  try {

    const user = req.user;

    if (!user?.id) {

      return res.status(401).json({
        error: "No autorizado"
      });
    }

    const botData =
      activeBots.get(user.id);

    return res.json({

      active:
        activeBots.has(user.id),

      bot: botData
        ? {
            botId:
              botData.botId,

            accountId:
              botData.accountId,

            startedAt:
              botData.startedAt
          }
        : null
    });

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });
  }
};

// ======================================
// 🎯 MANUAL TRADE
// ======================================
const manualTrade = async (
  req,
  res
) => {

  try {

    const user = req.user;

    const {
      symbol,
      contract_type,
      amount,
      accountId
    } = req.body;

    // ======================================
    // DERIV
    // ======================================
    const {
      deriv
    } = await getDerivClient(
      user.id,
      accountId
    );

    console.log(
      "🎯 MANUAL TRADE",
      {
        symbol,
        contract_type,
        amount
      }
    );

    // ======================================
    // BUY CONTRACT
    // ======================================
    const contract =
      await deriv.buyContract({

        amount,

        price: amount,

        basis: "stake",

        contract_type,

        currency: "USD",

        duration: 1,

        duration_unit: "m",

        symbol
      });

    console.log(
      "✅ CONTRACT:",
      contract
    );

    const contractId =
      contract.buy.contract_id;

    // ======================================
    // CREATE TRADE DB
    // ======================================
    const trade =
      await createTrade({

        user_id: user.id,

        contract_id:
          Number(contractId),

        symbol,

        type:
          contract_type,

        entry_price:
          contract.buy.buy_price,

        status: "open",

        start_time:
          new Date(),

        expiry_time:
          new Date(
            Date.now() + 60000
          )
      });

    // ======================================
    // FRONT NEW TRADE
    // ======================================
    req.io
      .to(`user_${user.id}`)
      .emit("new_trade", trade);

    // ======================================
    // WATCH CONTRACT
    // ======================================
    deriv.watchContract(

      contractId,

      async (c) => {

        try {

          // LIVE UPDATE
          req.io
            .to(`user_${user.id}`)
            .emit("trade_update", {

              contract_id:
                c.contract_id,

              current_spot:
                c.current_spot,

              entry_price:
                c.entry_tick,

              profit:
                c.profit,

              status:
                c.status,

              date_start:
                c.date_start,

              date_expiry:
                c.date_expiry
            });

          // CLOSE?
          const closed =
            c.is_sold ||
            c.status === "sold";

          if (!closed) return;

          const profit =
            Number(c.profit || 0);

          // DB CLOSE
          await closeTrade(
            Number(contractId),
            {
              status: "closed",
              profit,
              exit_price:
                c.exit_tick
            }
          );

          // FRONT CLOSE
          req.io
            .to(`user_${user.id}`)
            .emit("trade_closed", {

              id: trade.id,

              contract_id,

              profit,

              status:
                profit >= 0
                  ? "won"
                  : "lost"
            });

          // FORGET
          await deriv.forgetContract(
            contractId
          );

          console.log(
            "🧹 CONTRACT CLOSED:",
            contractId
          );

        } catch (err) {

          console.log(
            "🔥 WATCH ERROR:",
            err.message
          );
        }
      }
    );

    return res.json({

      success: true,

      trade
    });

  } catch (err) {

    console.log(
      "🔥 MANUAL TRADE ERROR:",
      err.message
    );

    return res.status(500).json({
      error: err.message
    });
  }
};

// ======================================
// EXPORTS
// ======================================
module.exports = {
  start,
  stop,
  status,
  manualTrade
};