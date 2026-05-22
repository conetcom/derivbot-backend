const WebSocket = require("ws");
const fs = require("fs");

// ===============================
// ⚙️ CONFIG
// ===============================
const APP_ID = 1089;
const SYMBOL = "R_100"; // puedes cambiar
const GRANULARITY = 60; // 1 minuto
const COUNT = 1000;

// ===============================
// 🚀 GET DATA
// ===============================
function getCandles() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    ws.on("open", () => {
      console.log("🟡 Conectando a Deriv...");

      ws.send(JSON.stringify({
        ticks_history: SYMBOL,
        adjust_start_time: 1,
         end: "latest", // 🔥 FIX
        count: COUNT,
        granularity: GRANULARITY,
        style: "candles"
      }));
    });

    ws.on("message", (msg) => {
      const data = JSON.parse(msg);

      if (data.error) {
        reject(data.error.message);
        ws.close();
        return;
      }

      if (data.msg_type === "candles") {
        const candles = data.candles.map(c => ({
          open: c.open,
          close: c.close,
          high: c.high,
          low: c.low
        }));

        resolve(candles);
        ws.close();
      }
    });

    ws.on("error", reject);
  });
}

// ===============================
// 💾 GUARDAR
// ===============================
(async () => {
  try {
    const candles = await getCandles();

    if (!fs.existsSync("./data")) {
      fs.mkdirSync("./data");
    }

    fs.writeFileSync(
      "./data/candles.json",
      JSON.stringify(candles, null, 2)
    );

    console.log("✅ Datos guardados:", candles.length);

  } catch (err) {
    console.error("❌ Error:", err);
  }
})();