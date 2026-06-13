const pool = require("../config/db");
const { encrypt } = require("../utils/crypto");
const DerivAccountsService = require(
  "../services/DerivAccountsService"
);

const syncDerivAccounts = async (req, res) => {

  try {

    const {
      token,
      account_name
    } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "PAT requerido"
      });
    }

    // Obtener cuentas desde Deriv
    const accounts =
      await DerivAccountsService.getAccounts(token);

    if (!accounts.length) {
      return res.status(400).json({
        error: "No se encontraron cuentas"
      });
    }

    const encryptedToken =
      encrypt(token);

    for (const account of accounts) {

      // evitar duplicados
      const exists = await pool.query(
        `
        SELECT id
        FROM deriv_accounts
        WHERE user_id = $1
        AND account_id = $2
        `,
        [
          req.user.id,
          account.account_id
        ]
      );

      if (exists.rows.length > 0) {
        continue;
      }

      await pool.query(
        `
        INSERT INTO deriv_accounts
        (
          user_id,
          account_name,
          account_id,
          deriv_token,
          balance,
          currency,
          is_active
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,true
        )
        `,
        [
          req.user.id,
          account_name || "Cuenta Deriv",
          account.account_id,
          encryptedToken,
          account.balance,
          account.currency
        ]
      );
    }

    return res.json({
      success: true,
      accounts
    });

  } catch (err) {

    console.error(
      "SYNC DERIV ERROR:"
    );

    console.error(
      err.response?.data ||
      err.message
    );

    return res.status(500).json({
      error:
        err.response?.data?.message ||
        err.message
    });
  }
};

module.exports = {
  syncDerivAccounts
};