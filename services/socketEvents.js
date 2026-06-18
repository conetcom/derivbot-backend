// ======================================
// SOCKET EVENTS CENTRALIZADOS
// ======================================

function emitToUser(
  io,
  userId,
  event,
  data = {}
) {

  const room =
    io.sockets.adapter.rooms.get(
      `user_${userId}`
    );

  console.log(
    `📡 ${event} -> user_${userId}`,
    `clients: ${room?.size || 0}`
  );

  io.to(
    `user_${userId}`
  ).emit(
    event,
    data
  );
}

// ======================================
// BOT EVENTS
// ======================================

function emitBotStarted(
  io,
  userId,
  botId
) {
  emitToUser(
    io,
    userId,
    "bot_started",
    {
      botId,
      status: "running"
    }
  );
}

function emitBotStopped(
  io,
  userId,
  botId,
  reason = "manual"
) {
  emitToUser(
    io,
    userId,
    "bot_stopped",
    {
      botId,
      reason,
      status: "stopped"
    }
  );
}
// ======================================
// TRADES
// ======================================

function emitNewTrade(
  io,
  userId,
  trade
) {
  emitToUser(
    io,
    userId,
    "new_trade",
    trade
  );
}

function emitTradeUpdate(
  io,
  userId,
  trade
) {
  emitToUser(
    io,
    userId,
    "trade_update",
    trade
  );
}

// ======================================
// BALANCE
// ======================================

function emitBalance(
  io,
  userId,
  balance
) {
  emitToUser(
    io,
    userId,
    "balance",
    {
      balance
    }
  );
}

// ======================================
// METRICS
// ======================================

function emitMetrics(
  io,
  userId,
  metrics
) {
  emitToUser(
    io,
    userId,
    "metrics",
    metrics
  );
}

// ======================================
// PRICE STREAM
// ======================================
function emitPriceUpdate(
  io,
  userId,
  payload
) {
  emitToUser(
    io,
    userId,
    "price_update",
    payload
  );
}

// ======================================
// GENERIC EVENT
// ======================================

function emitEvent(
  io,
  userId,
  event,
  payload
) {
  emitToUser(
    io,
    userId,
    event,
    payload
  );
}

// ======================================
// EXPORTS
// ======================================

module.exports = {
  emitToUser,

  emitBotStarted,
  emitBotStopped,

  emitNewTrade,
  emitTradeUpdate,

  emitBalance,
  emitMetrics,

  emitPriceUpdate,

  emitEvent
};