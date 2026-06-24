const pool = require("../config/db");

const saveSettings = async (
  userId,
  settings
) => {
 console.log("SETTINGS:", settings);
  const result = await pool.query(
    `
    INSERT INTO bot_settings (
      user_id,
      symbol,
      strategy,
      stake,
      target_profit,
      stop_loss,
      max_drawdown,
      deriv_account
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      symbol = EXCLUDED.symbol,
      strategy = EXCLUDED.strategy,
      stake = EXCLUDED.stake,
      target_profit = EXCLUDED.target_profit,
      stop_loss = EXCLUDED.stop_loss,
      max_drawdown = EXCLUDED.max_drawdown, 
      deriv_account = EXCLUDED.deriv_account,     
      updated_at = NOW()

    RETURNING *
    `,
    [
      userId,
      settings.symbol,
      settings.strategy,
      settings.stake,
      settings.targetProfit,
      settings.stopLoss,
      settings.deriv_account,
      settings.maxDrawdown
    ]
  );

  return result.rows[0];
};

const getSettings = async (userId) => {

  const result = await pool.query(
    `
    SELECT *
    FROM bot_settings
    WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0];
};

module.exports = {
  saveSettings,
  getSettings
};