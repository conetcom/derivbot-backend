class RiskManager {

 constructor(balance, params = {}) {

    this.balance = Number(balance) || 100;

    this.martingaleStep = 0;
    this.maxMartingale = Number(params.martingale ?? 0);

    this.baseStake = this.calculateBaseStake();
    this.currentStake = this.baseStake;
}
 // ===============================
  // 📊 CALCULAR STAKE BASE
  // ===============================
calculateBaseStake() {

    if (!this.balance || isNaN(this.balance)) {
        return 0.35;
    }

    const riskCapital = this.balance * 0.40;

    while (this.maxMartingale > 0) {

        const multiplier = Math.pow(2, this.maxMartingale + 1) - 1;

        const stake = riskCapital / multiplier;

        if (stake >= 0.35) {
            return Number(stake.toFixed(2));
        }

        console.log(
            `⚠️ Balance insuficiente para MG ${this.maxMartingale}, reduciendo...`
        );

        this.maxMartingale--;
    }
    

    return 0.35;
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

    if (this.martingaleStep < this.maxMartingale) {

        this.martingaleStep++;

        this.currentStake = Number(
            (this.currentStake * 2).toFixed(2)
        );

        console.log(
            `🔥 MARTINGALE ${this.martingaleStep}:`,
            this.currentStake
        );

    } else {

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

    if (!balance || isNaN(balance)) return;

    this.balance = Number(balance);

    this.baseStake = this.calculateBaseStake();

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