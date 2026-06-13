const express = require("express");
const router = express.Router();const {
  syncDerivAccounts
} = require("../controllers/derivAccounts.js");

const auth = require("../middleware/auth");
const pool = require("../config/db");
const {
  connectDeriv
} = require("../controllers/derivController");

// ======================================
// 🔗 CONECTAR CUENTA DERIV
// ======================================
router.post(
  "/connect",
  auth,
  connectDeriv
);

router.post(
  "/sync-accounts",
  auth,
  syncDerivAccounts
);
// ======================================
// 📊 OBTENER CUENTAS DEL USUARIO
// ======================================
router.get(
  "/accounts",
  auth,
  async (req, res) => {

    try {

      console.log(
        "👤 USER:",
        req.user
      );

      const result = await pool.query(
        `
        SELECT
          id,
          account_name,
          balance,
          currency,
          is_active,
          created_at
        FROM deriv_accounts
        WHERE user_id = $1
        ORDER BY id DESC
        `,
        [req.user.id]
      );

      res.json(result.rows);

    } catch (error) {

      console.error(
        "🔥 ERROR /accounts:",
        error
      );

      res.status(500).json({
        error: error.message
      });
    }
  }
);

module.exports = router;