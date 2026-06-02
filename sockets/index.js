const socketIO = require("socket.io");

module.exports = (server) => {
  const io = socketIO(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    console.log("Cliente conectado");

    socket.on("join", (userId) => {

  console.log("JOIN:", userId);

  socket.join(`user_${userId}`);

});
  });

  return io;
};