const DerivService = require("../services/derivService");
const pool = require("../config/db");
const { encrypt } = require("../utils/crypto");

const connectDeriv = async (req, res) => {
  try {
    const { token } = req.body;
   
    if (!token) {
      return res.status(400).json({ error: "Token requerido" });
    }

    console.log("TOKEN RECIBIDO:", token);

    const encryptedToken = encrypt(token);

    const deriv = new DerivService(token);

    await deriv.connect();

    const balance = await deriv.getBalance();
    console.log(balance);

    await pool.query(
      "UPDATE users SET deriv_token = $1 WHERE id = $2",
      [encryptedToken, req.user.id]
    );

    res.json({
      success: true,
      balance
    });

  } catch (error) {
    console.error("🔥 ERROR CONNECT DERIV:", error);

    res.status(500).json({
      error: error.message || "Error conectando a Deriv"
    });
  }
};
module.exports = { connectDeriv };