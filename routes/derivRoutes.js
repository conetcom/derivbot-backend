const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { connectDeriv } = require("../controllers/derivController");

router.post("/connect", auth, connectDeriv);

module.exports = router;