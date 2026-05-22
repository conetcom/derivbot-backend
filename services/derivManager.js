const DerivService = require("./derivService");

const clients = new Map();

const getClient = async (user) => {
  if (clients.has(user.id)) return clients.get(user.id);

  const deriv = new DerivService(user.deriv_token);
  await deriv.connect();

  clients.set(user.id, deriv);

  return deriv;
};

module.exports = { getClient };