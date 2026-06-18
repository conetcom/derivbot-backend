let lastEmit = 0;

const startMarketStream = (deriv, io, userId, symbol = "R_75") => {
  deriv.subscribeTicks(symbol, (data) => {
    const price = data.tick.quote;
    const epoch = data.tick.epoch;

    // 🧠 throttle global (IMPORTANTE)
    const now = Date.now();
    if (now - lastEmit < 200) return;
    lastEmit = now;

    // 📡 SOLO STREAM — NUNCA lógica de trading
tickSubscription.on("tick", ({
  price,
  epoch,
  symbol
}) => {

  // 📡 SOLO STREAM — NUNCA lógica de trading
  emitPriceUpdate(
    io,
    userId,
    {
      price,
      epoch,
      symbol
    }
  );

});


module.exports = startMarketStream;