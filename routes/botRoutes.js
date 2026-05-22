const express = require("express");
const router = express.Router();
const botController = require("../controllers/botController");
const authMiddleware = require("../middleware/auth") ;

router.post("/start", authMiddleware, botController.start);
router.post("/stop", authMiddleware, botController.stop);

router.post(
  "/manual-trade",
  authMiddleware,
  botController.manualTrade
);

module.exports = router;