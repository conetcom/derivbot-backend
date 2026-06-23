const db = require("../config/db");

// ✅ CREAR TRADE
const createTrade = async (trade) => {
  

  const contractId = String(trade.contract_id); // 🔥 NORMALIZAR

  const query = `
    INSERT INTO trades 
    (user_id, bot_id, contract_id, symbol, type, entry_price, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *;
  `;

  const values = [
    trade.user_id,
    trade.bot_id,
    contractId, // 🔥 FIX
    trade.symbol,
    trade.type,
    trade.entry_price,
    trade.status || "open"
  ];
  // 💰 🔥 ACTUALIZAR BALANCE
  // =========================


  const res = await db.query(query, values);

  console.log("✅ TRADE GUARDADO:", contractId);

  return res.rows[0];
};

// ✅ CERRAR TRADE
const closeTrade = async (contract_id, data) => {

  const contractId = String(contract_id); // 🔥 FIX CRÍTICO
console.log("🔥 CERRAR TRADE:", contractId, data);
  const query = `
    UPDATE trades
    SET 
      exit_price = $1,
      profit = $2,
      status = $3
      
    WHERE contract_id = $4
    RETURNING *;
  `;

  const values = [
    data.exit_price ||data.current_spot,
    data.profit,
    data.status || "closed",
    contractId
  ];
//console.log('contrato', query);
  const res = await db.query(query, values);

  // 🔥 DEBUG PRO (CLAVE)
  if (res.rows.length === 0) {
    console.log("❌ NO SE ENCONTRÓ TRADE PARA CERRAR:", contractId);

    const debug = await db.query(
      "SELECT contract_id, status FROM trades WHERE status = 'open'"
    );

    console.log("📊 TRADES ABIERTOS EN DB:", debug.rows);
  } else {
    console.log("✅ TRADE CERRADO EN DB:", contractId);
  }

  return res.rows[0];
};

// ✅ ACTUALIZAR POR ID
const updateTradeById = async (id, data) => {
  const query = `
    UPDATE trades
    SET 
      exit_price = $1,
      profit = $2,
      status = $3,
      updated_at = NOW()
    WHERE id = $4
    RETURNING *;
  `;

  const values = [
    data.exit_price,
    data.profit,
    data.status,
    id
  ];

  const res = await db.query(query, values);
  return res.rows[0];
};

// ✅ OBTENER TRADE ABIERTO
const getOpenTradeByUser = async (user_id) => {
  const query = `
    SELECT * 
    FROM trades
    WHERE user_id = $1 AND status = 'open'
    LIMIT 1;
  `;

  const res = await db.query(query, [user_id]);
  return res.rows[0];
};

// ✅ HISTORIAL
const getTradesByUser = async (user_id) => {
  const query = `
    SELECT *
    FROM trades
    WHERE user_id = $1
    ORDER BY created_at DESC;
  `;

  const res = await db.query(query, [user_id]);
  return res.rows;
};

// ✅ STATS
const getStatsByUser = async (user_id) => {
  const query = `
    SELECT 
      COUNT(*) FILTER (WHERE status = 'closed') as total_trades,
      COUNT(*) FILTER (WHERE profit > 0) as wins,
      COUNT(*) FILTER (WHERE profit <= 0) as losses,
      COALESCE(SUM(profit),0) as total_profit
    FROM trades
    WHERE user_id = $1;
  `;

  const res = await db.query(query, [user_id]);
  return res.rows[0];
};
const updateTradeByContract = async (contractId, data) => {
  console.log("🔥 UPDATE DATA:", data);
console.log("🔥 CONTRACT:", contractId);
  const query = `
    UPDATE trades
    SET 
      entry_price = COALESCE($1, entry_price),
      exit_price = COALESCE($2, exit_price),
      profit = COALESCE($3, profit),
      status = COALESCE($4, status)
      WHERE contract_id = $5
    RETURNING *;
  `;

  const values = [
    data.entry_price || null,
    data.exit_price || null,
    data.profit || null,
    data.status || null,
    contractId
  ];

  const res = await db.query(query, values);
  return res.rows[0];
};

module.exports = {
  createTrade,
  closeTrade,
  updateTradeById,
  getOpenTradeByUser,
  getTradesByUser,
  getStatsByUser,
  updateTradeByContract
};