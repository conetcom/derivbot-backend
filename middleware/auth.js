const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {

      return res.status(401).json({
        error: "Token requerido"
      });
    }

    const token =
      authHeader.split(" ")[1];

    if (!token) {

      return res.status(401).json({
        error: "Token inválido"
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();

  } catch (err) {

    console.log(
      "🔥 AUTH ERROR:",
      err.message
    );

    return res.status(401).json({
      error: "No autorizado"
    });
  }
};