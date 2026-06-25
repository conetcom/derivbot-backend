class RiskManager {

    constructor(balance, params = {}) {

    this.balance = Number(balance) || 100;

    this.riskPerTrade =
      this.balance > 120
        ? 0.015
        : 0.01;

    this.martingaleStep = 0;
    this.maxMartingale = Number(params.martingale ?? 0);

    this.baseStake = this.calculateBaseStake();
    this.currentStake = this.baseStake;
  }

}

  // ===============================
  // 📊 CALCULAR STAKE BASE
  // ===============================
  calculateBaseStake() {

    if (!this.balance || isNaN(this.balance)) {
      return 1;
    }

    const stake = this.balance * this.riskPerTrade;

    // 🔥 máximo 5% balance
   const finalStake = Math.min(
  stake,
  this.balance * 0.03
);

// 🔥 mínimo permitido Deriv
return Number(
  Math.max(finalStake, 0.35).toFixed(2)
);
  }

  // ===============================
  // 💰 OBTENER STAKE
  // ===============================
  getStake() {
    return this.currentStake;
  }

  // ===============================
  // 🔥 MARTINGALE
  // ===============================
  nextStake(result) {

    // ✅ WIN → RESET
    if (result === "win") {

      console.log("✅ WIN → RESET MARTINGALE");

      this.martingaleStep = 0;

      this.baseStake = this.calculateBaseStake();

      this.currentStake = this.baseStake;

      return this.currentStake;
    }

    // ❌ LOSS
    if (result === "loss") {

      // 🔥 todavía puede hacer MG
      if (this.martingaleStep < this.maxMartingale) {

        this.martingaleStep++;

        // 🔥 multiplicador
        this.currentStake = Number(
          (this.currentStake * 2).toFixed(2)
        );

        // 🛑 nunca más del 10% balance
        const maxStake = this.balance * 0.10;

        if (this.currentStake > maxStake) {
          this.currentStake = Number(maxStake.toFixed(2));
        }

        console.log(
          `🔥 MARTINGALE ${this.martingaleStep}:`,
          this.currentStake
        );

      } else {

        // 🛑 límite alcanzado
        console.log("🛑 MAX MARTINGALE → RESET");

        this.martingaleStep = 0;

        this.baseStake = this.calculateBaseStake();

        this.currentStake = this.baseStake;
      }
    }

    return this.currentStake;
  }

  // ===============================
  // 🔄 ACTUALIZAR BALANCE
  // ===============================
 update(balance) {

  if (!balance || isNaN(balance)) {
    return;
  }

  this.balance = Number(balance);

  this.riskPerTrade =
    this.balance > 120
      ? 0.015
      : 0.01;

  // 🔥 recalcular SOLO base
  this.baseStake = this.calculateBaseStake();

  // 🔥 IMPORTANTE:
  // NO tocar currentStake
  // mientras exista martingale activo

  if (this.martingaleStep === 0) {

    this.currentStake = this.baseStake;

  } else {

    console.log(
      "🔥 MG ACTIVO - manteniendo stake:",
      this.currentStake
    );
  }
}
}

module.exports = RiskManager;