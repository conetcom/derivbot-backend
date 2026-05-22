const pool = require("../config/db");
const DerivService = require("../services/derivService");
const { startBot, stopBot } = require("../services/botEngine");
const { decrypt } = require("../utils/crypto");

// 🧠 memoria de bots activos
const activeBots = new Map();

/**
 * 🔗 Obtener cliente Deriv
 */
const getDerivClient = async (userId) => {
  const result = await pool.query(
    "SELECT deriv_token FROM users WHERE id = $1",
    [userId]
  );

  const encryptedToken = result.rows[0]?.deriv_token;

  if (!encryptedToken) {
    throw new Error("No tienes token de Deriv configurado");
  }

  const derivToken = decrypt(encryptedToken);

  if (!derivToken) {
    throw new Error("Token inválido");
  }

  const deriv = new DerivService(derivToken);
  await deriv.connect();

  return deriv;
};
/**
 * 🚀 START BOT
 */
const start = async (req, res) => {
  console.log("🚀 LLEGÓ AL BOT CONTROLLER");

  try {
    const user = req.user; // 🔥 PRO: viene de JWT
   const { symbol, stake, strategy } = req.body;
    console.log("📥 BODY:", req.body);
    console.log("👤 USER:", user);

    // 🔒 VALIDACIONES PRO
    if (!user?.id) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    if (!symbol || !stake) {
      return res.status(400).json({
        error: "symbol y stake son requeridos"
      });
    }

    if (isNaN(stake) || Number(stake) <= 0) {
      return res.status(400).json({
        error: "stake debe ser un número válido"
      });
    }

    // 🔥 EVITAR MULTI BOT
    if (activeBots.has(user.id)) {
      return res.status(400).json({
        error: "Ya tienes un bot activo"
      });
    }

    // 🔥 EVITAR TRADE ABIERTO EN DB (PRO REAL)
    const openTrade = await pool.query(
      "SELECT id FROM trades WHERE user_id = $1 AND status = 'open' LIMIT 1",
      [user.id]
    );

    if (openTrade.rows.length > 0) {
      return res.status(400).json({
        error: "Tienes un trade abierto, espera a que cierre"
      });
    }

    // 🔗 conectar deriv
    const deriv = await getDerivClient(user.id);

    // 🧠 crear bot en DB
    const result = await pool.query(
      `INSERT INTO bots (user_id, name, strategy, symbol, stake, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        user.id,
        "Bot automático",
        "simple",
        symbol,
        stake,
        "active"
      ]
    );

    const botId = result.rows[0].id;

    console.log("🤖 BOT ID:", botId);

    // 🚀 iniciar bot
    const botInstance = await startBot(
      user,
      { id: botId, symbol, stake, strategy },
      deriv,
      req.io
    );

    // 💾 guardar en memoria (MEJORADO)
    activeBots.set(user.id, {
      bot: botInstance,
      deriv,
      botId,
      startedAt: new Date()
    });

    res.json({
      success: true,
      botId
    });

  } catch (err) {
    console.error("🔥 ERROR START:", err);

    res.status(500).json({
      error: err.message
    });
  }
};

/**
 * 🛑 STOP BOT
 */
const stop = async (req, res) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({
        error: "Usuario no autenticado"
      });
    }

    if (!activeBots.has(user.id)) {
      return res.status(400).json({
        error: "No hay bot activo"
      });
    }

    const { deriv, botId } = activeBots.get(user.id);
    // 🔥 cerrar trades abiertos al detener
await pool.query(
  `
  UPDATE trades
  SET status = 'closed',
      profit = 0
        WHERE user_id = $1 AND status = 'open'
  `,
  [user.id]
);

console.log("🧹 Trades abiertos cerrados automáticamente");

    console.log("🛑 Deteniendo bot:", botId);

    // detener lógica
    await stopBot(user);

    // 🔄 actualizar DB
    await pool.query(
      "UPDATE bots SET status = 'stopped' WHERE id = $1",
      [botId]
    );

    // 🔌 cerrar conexión deriv
    if (deriv?.ws) {
      deriv.ws.close();
    }

    activeBots.delete(user.id);

    res.json({
      success: true
    });

  } catch (err) {
    console.error("🔥 ERROR STOP:", err);

    res.status(500).json({
      error: err.message
    });
  }
};

/**
 * 📊 STATUS
 */
const status = (req, res) => {
  const user = req.user;

  if (!user?.id) {
    return res.status(401).json({
      error: "Usuario no autenticado"
    });
  }

  const botData = activeBots.get(user.id);

  res.json({
    active: activeBots.has(user.id),
    bot: botData
      ? {
          botId: botData.botId,
          startedAt: botData.startedAt
        }
      : null
  });
};

const {
  createTrade,
  closeTrade,
  updateTradeByContract
} = require("../models/tradesModel");

const manualTrade = async (req, res) => {

  try {

    const user = req.user;

    const {
      symbol,
      contract_type,
      amount
    } = req.body;

    const deriv =
      await getDerivClient(user.id);

    await deriv.connect();

    console.log(
      "🚀 MANUAL TRADE REQUEST",
      {
        symbol,
        contract_type,
        amount
      }
    );

    // ===============================
    // 🛒 BUY CONTRACT
    // ===============================
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
      "✅ MANUAL TRADE RESPONSE",
      contract
    );

    const contractId =
      contract.buy.contract_id;

    // ===============================
    // 💾 CREATE TRADE DB
    // ===============================
    const trade =
      await createTrade({

        user_id: user.id,

        contract_id: Number(contractId),

        symbol,

        type: contract_type,

        entry_price:
          contract.buy.buy_price,

        status: "open",

        start_time:
          new Date(
            contract.buy.start_time * 1000
          ),

        expiry_time:
          new Date(
            (contract.buy.start_time + 60) * 1000
          )
      });

    // ===============================
    // 📡 NEW TRADE FRONTEND
    // ===============================
    req.io
      .to(`user_${user.id}`)
      .emit("new_trade", trade);

    // ===============================
    // 👀 WATCH CONTRACT
    // ===============================
    deriv.watchContract(
      contractId,
      async (c) => {

        try {

          // ===============================
          // 📡 LIVE UPDATE
          // ===============================
          req.io
            .to(`user_${user.id}`)
            .emit("trade_update", {

              contract_id:
                c.contract_id,

              entry_price:
                c.entry_tick ||
                c.buy_price,

              current_spot:
                c.current_spot,

              profit:
                c.profit,

              status:
                c.status,

              date_start:
                c.date_start,

              date_expiry:
                c.date_expiry
            });

          // ===============================
          // 🏁 CLOSE
          // ===============================
          const done =
            c.is_sold ||
            c.status === "sold";

          if (!done) return;

          const profit =
            Number(c.profit || 0);

          // ===============================
          // 💾 CLOSE DB
          // ===============================
          await closeTrade(
            Number(contractId),
            {
              status: "closed",
              profit,
              exit_price:
                c.exit_tick
            }
          );

          // ===============================
          // 📡 CLOSED FRONTEND
          // ===============================
          req.io
            .to(`user_${user.id}`)
            .emit("trade_closed", {

              id: trade.id,

              contract_id,

              profit,

              status:
                profit > 0
                  ? "won"
                  : "lost"
            });

          // ===============================
          // 🧹 FORGET
          // ===============================
          await deriv.forgetContract(
            contractId
          );

          console.log(
            "🧹 MANUAL CONTRACT CLOSED:",
            contractId
          );

        } catch (err) {

          console.log(
            "🔥 WATCH MANUAL ERROR:",
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

module.exports = {
  start,
  stop,
  status, 
  manualTrade
};