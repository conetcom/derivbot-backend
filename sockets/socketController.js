module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado");

    socket.on("join", (userId) => {
      socket.join(userId);
    });

    socket.on("disconnect", () => {
      console.log("🔴 Cliente desconectado");
    });
  });
};