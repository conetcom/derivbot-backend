const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const derivRoutes = require("./routes/derivRoutes");
const botRoutes = require("./routes/botRoutes");
const tradeRoutes = require("./routes/tradeRoutes");

const pool = require("./config/db");

const app = express();
const server = http.createServer(app);

// 🔥 SOCKET.IO CONFIG
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ✅ MIDDLEWARES BASE
app.use(cors());
app.use(express.json());

// 🔥 INYECTAR IO (⚠️ DEBE IR ANTES DE LAS RUTAS)
app.use((req, res, next) => {
  req.io = io;
  next();
});


global.io = io;
// ==========================
// 🔌 SOCKET CONNECTION (UNA SOLA VEZ)
// ==========================
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("join", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 Usuario ${userId} unido a su sala`);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});

// ==========================
// 🚀 ROUTES
// ==========================
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/deriv", derivRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/trades", tradeRoutes);

// ==========================
// 🧪 TEST DB
// ==========================
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "Conexión exitosa",
      time: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error conectando a la DB" });
  }
});

// ==========================
// 🚀 SERVER
// ==========================
const PORT = 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});