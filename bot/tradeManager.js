class TradeManager {
  constructor(deriv) {
    this.deriv = deriv;
    this.active = false;
  }

  async execute(symbol, contract_type, amount) {
    if (this.active) {
      console.log("⛔ Trade en progreso, ignorando señal...");
      return;
    }

    this.active = true;

    try {
      // ===============================
      // 🔥 VALIDACIÓN Y FORMATEO
      // ===============================
      if (!amount || isNaN(amount)) {
        console.log("❌ Amount inválido:", amount);
        return;
      }

      const formattedAmount = Number(amount.toFixed(2));

      if (!formattedAmount || isNaN(formattedAmount)) {
        console.log("❌ Amount formateado inválido:", formattedAmount);
        return;
      }

      // ===============================
      // 📦 DEBUG (CLAVE)
      // ===============================
      console.log("📦 REQUEST:", {
        amount: formattedAmount,
        price: formattedAmount,
        contract_type,
        symbol
      });

      // ===============================
      // 🚀 EJECUCIÓN DEL TRADE
      // ===============================
      const res = await this.deriv.buyContract({
        amount: formattedAmount,
        price: formattedAmount, // 🔥 FIX CLAVE
        contract_type,
        symbol
      });

      if (res && res.buy) {
        console.log("🟢 BUY OK:", res.buy.contract_id);
        return res.buy.contract_id;
      } else {
        console.log("⚠️ Respuesta inesperada:", res);
      }

    } catch (err) {
      console.error("❌ ERROR TRADE:", err.message);
    } finally {
      this.active = false;
    }
  }
}

module.exports = TradeManager;