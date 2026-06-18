const pool = require("../config/db");

const updateBotStatus = async (botId, status) => {
  const query = `
    UPDATE bots
    SET status = $1
    WHERE id = $2
    RETURNING *;
  `;

  const res = await pool.query(query, [
    status,
    botId
  ]);

  return res.rows[0];
};

module.exports = {
  updateBotStatus
};