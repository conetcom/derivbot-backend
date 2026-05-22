const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 🧑 Registro
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1,$2,$3)
       RETURNING id, email`,
      [name, email, hashedPassword]
    );

    res.json({ message: "Usuario registrado", user: result.rows[0] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🔐 Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const userRes = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = userRes.rows[0];
    if (!user) return res.status(400).json({ error: "Usuario no existe" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Password incorrecto" });

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { register, login };