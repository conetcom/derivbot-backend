require("dotenv").config();
const DerivService = require("./services/derivService");

(async () => {
  try {
    console.log("🟡 Iniciando prueba...");

    const deriv = new DerivService(process.env.DERIV_TOKEN);

    await deriv.connect();

    const balance = await deriv.getBalance();

    console.log("✅ Conectado correctamente");
    console.log("💰 Balance:", balance);

    process.exit(); // termina el proceso

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
})();