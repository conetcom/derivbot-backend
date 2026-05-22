class CandleBuilder {
  constructor() {
    this.candles = [];
    this.currentCandle = null;
    this.lastTime = null;
  }

  update(price, epoch) {
    // 🔥 usar tiempo real del mercado (NO Date.now)
    const currentMinute = Math.floor(epoch / 60);

    let isNewCandle = false;

    // 🟡 PRIMERA VELA
    if (!this.currentCandle) {
      this.currentCandle = this.createCandle(price, currentMinute);
      this.lastTime = currentMinute;
      return { candles: this.getAllCandles(), isNewCandle };
    }

    // 🟢 MISMA VELA (actualizar)
    if (currentMinute === this.lastTime) {
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;

      return { candles: this.getAllCandles(), isNewCandle };
    }

    // 🔥 NUEVA VELA (cambio de minuto real)
    this.candles.push(this.currentCandle);
    isNewCandle = true;

    this.currentCandle = this.createCandle(price, currentMinute);
    this.lastTime = currentMinute;

    console.log("🕯️ NUEVA VELA CREADA:", this.currentCandle);

    // 🧹 mantener máximo 100 velas
    if (this.candles.length > 100) {
      this.candles.shift();
    }

    return { candles: this.getAllCandles(), isNewCandle };
  }

  createCandle(price, time) {
    return {
      open: price,
      high: price,
      low: price,
      close: price,
      time
    };
  }

  getAllCandles() {
    return [...this.candles, this.currentCandle]; // 🔥 incluye vela actual
  }
}

module.exports = CandleBuilder;