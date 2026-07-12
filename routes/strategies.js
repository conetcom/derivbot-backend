const express = require("express");
const router = express.Router();

const strategies = require("../bot/strategies");

router.get("/", (req, res) => {

    const list = Object.values(strategies).map(strategy => ({
        id: strategy.id,
        name: strategy.name
    }));

    res.json(list);

});

module.exports = router;