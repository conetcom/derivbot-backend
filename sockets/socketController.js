module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado");

    socket.on("join", (userId) => {
      socket.join(userId);
       console.log(
    "🟢 USER JOIN:",
    userId,
    socket.id
  );
    });

    socket.on("disconnect", () => {
    console.log(
    "🔴 USER DISCONNECT:",
    socket.id
  );

    });
  });
};