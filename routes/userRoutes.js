const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const pool = require("../config/db");

// Obtener usuario autenticado
router.get("/me", auth, async (req, res) => {

  try {

    // 👤 USER
    const userResult = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    // 🔗 CUENTAS DERIV
    const accountsResult = await pool.query(
      `
      SELECT
        id,
        account_name,
        balance,
        currency,
        is_active
      FROM deriv_accounts
      WHERE user_id = $1
      `,
      [req.user.id]
    );

    const user = userResult.rows[0];

    user.deriv_accounts =
      accountsResult.rows;

    // 🔥 tiene cuenta activa?
    user.hasDerivAccount =
      accountsResult.rows.length > 0;
console.log("user:", user);
    res.json(user);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Error obteniendo usuario"
    });
  }
});

module.exports = router;