const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 🧑 Registro

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Verificar si el correo ya existe
    const existingUser = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: "El correo electrónico ya está registrado."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hashedPassword]
    );

    res.status(201).json({
      message: "Usuario registrado correctamente.",
      user: result.rows[0]
    });

  } catch (err) {

    // En caso de que dos peticiones lleguen al mismo tiempo
    if (err.code === "23505") {
      return res.status(409).json({
        error: "El correo electrónico ya está registrado."
      });
    }

    console.error(err);

    res.status(500).json({
      error: "Error interno del servidor."
    });
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

   res.json({
  token,
  user: {
    id: user.id,
    email: user.email,
    deriv_accounts: user.deriv_accounts,
    hasDerivAccount: true
  }
});

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { register, login };