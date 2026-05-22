const fs = require("fs");
const CandleBuilder = require("./bot/candleBuilder");

// simula precios (o usa tu deriv real)
const candleBuilder = new CandleBuilder();

let candles = [];

// simula datos (puedes conectar tu deriv aquí)
function simulatePrices() {
  let price = 100;

  setInterval(() => {
    price += (Math.random() - 0.5) * 0.5;

    const built = candleBuilder.update(price);

    if (built.length > candles.length) {
      candles = built;

      fs.writeFileSync(
        "./data/candles.json",
        JSON.stringify(candles, null, 2)
      );

      console.log("💾 Velas guardadas:", candles.length);
    }
  }, 1000);
}

simulatePrices();