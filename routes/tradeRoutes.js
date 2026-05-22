const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const tradesModel = require("../models/tradesModel");

// 🔹 obtener trades
router.get("/", auth, async (req, res) => {
  try {
    const trades = await tradesModel.getTradesByUser(req.user.id);
    res.json(trades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 estadísticas
router.get("/stats", auth, async (req, res) => {
  try {
    const stats = await tradesModel.getStatsByUser(req.user.id);

    const winRate =
      stats.total_trades > 0
        ? (stats.wins / stats.total_trades) * 100
        : 0;

    res.json({
      ...stats,
      winRate: winRate.toFixed(2),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;