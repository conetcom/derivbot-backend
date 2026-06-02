const pool = require("../config/db");
const DerivService = require("../services/DerivService");
const { encrypt } = require("../utils/crypto");

const connectDeriv = async (req, res) => {

  try {

    const { token, account_name } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "Token requerido"
      });
    }

    // conectar deriv
    const deriv = new DerivService(token);

    await deriv.connect();

    const balance = await deriv.getBalance();

    // encriptar token
    const encryptedToken = encrypt(token);

    // guardar nueva cuenta
    await pool.query(
      `
      INSERT INTO deriv_accounts
      (user_id, account_name, deriv_token, balance)
      VALUES ($1, $2, $3, $4)
      `,
      [
        req.user.id,
        account_name || "Cuenta Deriv",
        encryptedToken,
        balance.balance
      ]
    );

    res.json({
      success: true,
      balance
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
};

module.exports = {
  connectDeriv
};