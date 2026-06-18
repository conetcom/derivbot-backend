const pool = require("../config/db");
const DerivService = require("../services/derivService.js");
const { encrypt } = require("../utils/crypto");

const connectDeriv = async (req, res) => {

  try {

    const { token, account_name, account_id} = req.body;

      if (!token) {
      return res.status(400).json({
        error: "Token requerido"
      });
    }
console.log(
  "TOKEN RECIBIDO:",
  token, account_id, account_name
);
    // conectar deriv
    const deriv = new DerivService({token, account_id});

   const balance = await deriv.getBalance();

    // encriptar token
    const encryptedToken = encrypt(token);

    // guardar nueva cuenta
    await pool.query(
      `
      INSERT INTO deriv_accounts
(
 user_id,
 account_name,
 account_id,
 deriv_token,
 balance
)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
 req.user.id,
 account_name || "Cuenta Deriv",
 account_id,
 encryptedToken,
 balance.balance
]
    );

    res.json({
      success: true,
      balance
    });

  } catch (error) {

  console.error(
    "🔥 CONNECT DERIV ERROR:"
  );

  console.error(error);

  res.status(500).json({
    error: error.message,
    stack: error.stack
  });
}
};

module.exports = {
  connectDeriv
};