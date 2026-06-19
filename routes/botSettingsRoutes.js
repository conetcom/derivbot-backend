const express =
  require("express");

const router =
  express.Router();

const auth =
  require("../middleware/auth");

const {
  saveSettings,
  getSettings
} = require(
  "../controllers/botSettingsController"
);

router.post(
  "/",
  auth,
  saveSettings
);

router.get(
  "/",
  auth,
  getSettings
);

module.exports = router;