const smaStrategy = require("./smaStrategy");
const rsiStrategy = require("./rsiStrategy");
const forexStrategy = require("./forexStrategy");
const smartMoneyLiquidityStrategy = require("./smartMoneyLiquidityStrategy");
const syntheticProStrategy = require("./syntheticProStrategy");

const strategies = {

    sma: {
        id: "sma",
        name: "SMA + Smart Money",
        handler: smaStrategy
    },

    liquidity: {
        id: "liquidity",
        name: "Liquidity Sweep",
        handler: smartMoneyLiquidityStrategy
    },

    forex: {
        id: "forex",
        name: "Forex Pro",
        handler: forexStrategy
    },

    rsi: {
        id: "rsi",
        name: "RSI",
        handler: rsiStrategy
    },

    synthetic_pro: {
        id: "synthetic_pro",
        name: "Synthetic Pro",
        handler: syntheticProStrategy
    }

};

module.exports = strategies;