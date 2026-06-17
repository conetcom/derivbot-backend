const pool = require("../config/db");
const DerivService = require("./derivService.js");
const decrypt =  require("../utils/decrypt");

async function recoverOpenTrades() {

  const openTrades = await pool.query(`
    SELECT
    t.contract_id,
    t.user_id,
    d.deriv_token as api_token,
    d.account_id
  FROM trades t
  JOIN deriv_accounts d
    ON d.user_id = t.user_id
  WHERE t.status = 'open'
  `);


for (const trade of openTrades.rows) {

  const token = decrypt(
    trade.api_token
  );

  console.log(
    "🔓 TOKEN DESENCRIPTADO:",
    token?.substring(0, 10) + "..."
  );

  const deriv = new DerivService({
    token,
    accountId: trade.account_id
  });

  try {

    await deriv.connect();

    const contract =
      await deriv.getContract(
        trade.contract_id
      );

    console.log(
      "📄 CONTRACT:",
      trade.contract_id,
      contract.status
    );

    const finished =
      contract.is_sold ||
      contract.status === "sold";

    if (finished) {

      await pool.query(`
        UPDATE trades
        SET
          status='closed',
          profit=$1,
          exit_price=$2
        WHERE contract_id=$3
      `, [
        contract.profit,
        contract.exit_tick,
        trade.contract_id
      ]);

      console.log(
        "✅ Trade recuperado:",
        trade.contract_id
      );
    }

  } catch (err) {

    console.log(
      "🔥 ERROR RECOVER:",
      trade.contract_id,
      err.message
    );

  } finally {

    deriv.disconnect();

  }
}
}

module.exports = recoverOpenTrades;