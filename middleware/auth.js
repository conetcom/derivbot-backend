const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log("🛡️ AUTH HEADER:", authHeader);

  if (!authHeader) {
    return res.status(401).json({ error: "No autorizado" });
  }

  // 🔥 AQUÍ ESTÁ EL FIX
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token mal formado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log("✅ DECODED:", decoded);

    req.user = decoded;

    next(); // 🔥 ESTO YA LO TENÍAS BIEN

  } catch (err) {
    console.error("❌ JWT ERROR:", err.message);

    return res.status(401).json({
      error: "Token inválido",
      message: err.message
    });
  }
};