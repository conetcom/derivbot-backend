// ============================================================
// 🤖 BOT ENGINE - MODO PRO
// ============================================================

const {
  createTrade,
  closeTrade,
  updateTradeByContract
} = require("../models/tradesModel");

const CandleBuilder = require("../bot/candleBuilder");
const { getSignal } = require("../bot/strategy");
const { calculateSMA } = require("../bot/indicators");
const RiskManager = require("../bot/riskManager");

const {
  updateBotStatus,
  updateBalance
} = require("../models/botsModel");

const activeBots = require("../services/activeBots");

const {
  saveTradeStatistics,
  updateTradeStatistics
} = require("../models/tradeStatisticsModel");

const {
  calculateStats
} = require("../bot/candleStats");

const {
  emitBotStarted,
  emitBotStopped,
  emitNewTrade,
  emitTradeUpdate,
  emitBalance,
  emitMetrics,
  emitPriceUpdate
} = require("./socketEvents");


// ============================================================
// 🛠️ HELPERS
// ============================================================

const sleep = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));


// ============================================================
// 🧾 LOGGER
// ============================================================

const log = (
  type,
  msg,
  extra = {}
) => {

  console.log(
    JSON.stringify({
      time:
        new Date().toISOString(),

      type,
      msg,

      ...extra
    })
  );

};


// ============================================================
// 📊 DEBUG VISUAL
// ============================================================

const debugVisual = (
  candles,
  signal,
  sma,
  liquidity,
  pro
) => {

  if (!candles?.length)
    return;

  const last =
    candles[candles.length - 1];

  const prev =
    candles[candles.length - 2];

  console.log(
    "\n=============================="
  );

  console.log(
    "📊 DEBUG VISUAL"
  );

  console.log(
    "🧠 PRO:",
    pro
  );

  console.log(
    "🕯️ Última vela:",
    last
  );

  console.log(
    "🕯️ Vela anterior:",
    prev
  );

  console.log(
    "📊 Total velas:",
    candles.length
  );

  console.log(
    "📈 SMA:",
    sma
  );

  console.log(
    "💧 Liquidez:",
    liquidity
  );

  console.log(
    "🎯 Señal:",
    signal || "NO TRADE"
  );

  console.log(
    "==============================\n"
  );

};


// ============================================================
// 🔓 LIBERAR ESTADO DEL BOT
// ============================================================

const releaseBotState = (
  state,
  reason = "unknown"
) => {

  console.log(
    "🔓 LIBERANDO BOT:",
    reason
  );

  state.running = false;

  state.cooldown = false;

  state.currentContractId = null;

  state.entrySaved = false;

  if (state.tradeTimeout) {

    clearTimeout(
      state.tradeTimeout
    );

    state.tradeTimeout = null;

  }

  if (state.contractWatchdog) {

    clearInterval(
      state.contractWatchdog
    );

    state.contractWatchdog = null;

  }

  console.log(
    "📌 ESTADO BOT:",
    {
      running:
        state.running,

      cooldown:
        state.cooldown,

      currentContractId:
        state.currentContractId
    }
  );

};


// ============================================================
// ⏱️ PRÓXIMA OPERACIÓN
// ============================================================

const scheduleNextTrade = (
  state,
  tradeResult
) => {

  const now =
    Date.now();

  const msToNextMinute =
    60000 -
    (now % 60000);


  // LOSS
  if (
    tradeResult === "loss"
  ) {

    state.nextTradeTime =
      now +
      msToNextMinute +
      (2 * 60000);

  }

  // WIN
  else {

    state.nextTradeTime =
      now +
      msToNextMinute;

  }


  console.log(
    "⏳ Próxima operación:",
    new Date(
      state.nextTradeTime
    ).toLocaleTimeString()
  );

};


// ============================================================
// 🚨 WATCHDOG DEL CONTRATO
//
// IMPORTANTE:
// No liberamos inmediatamente.
// Primero preguntamos a Deriv si el contrato terminó.
// ============================================================

const startContractWatchdog = (
  user,
  botConfig,
  state,
  contractId
) => {

  if (state.contractWatchdog) {

    clearInterval(
      state.contractWatchdog
    );

  }


  let attempts = 0;

  const maxAttempts = 24;


  state.contractWatchdog =
    setInterval(
      async () => {

        try {

          // Si ya no es el contrato activo
          if (
            state.currentContractId !==
            contractId
          ) {

            clearInterval(
              state.contractWatchdog
            );

            state.contractWatchdog =
              null;

            return;

          }


          attempts++;


          console.log(
            "🔎 WATCHDOG CONTRATO:",
            {
              contractId,
              attempt: attempts
            }
          );


          const contract =
            await state.deriv.getContract(
              contractId
            );


          if (!contract) {

            console.warn(
              "⚠️ WATCHDOG: contrato no encontrado"
            );

            return;

          }


          const done =
            Boolean(contract.is_sold) ||
            contract.status === "sold" ||
            contract.status === "closed";


          if (!done) {

            console.log(
              "⏳ WATCHDOG: contrato todavía abierto"
            );

            if (
              attempts >= maxAttempts
            ) {

              console.error(
                "🚨 WATCHDOG SUPERÓ EL MÁXIMO DE INTENTOS"
              );

              clearInterval(
                state.contractWatchdog
              );

              state.contractWatchdog =
                null;

            }

            return;

          }


          console.log(
            "✅ WATCHDOG DETECTÓ CONTRATO CERRADO:",
            contractId
          );


          // El callback normal debería
          // haberlo procesado.
          //
          // Si todavía sigue activo,
          // dejamos que el callback lo procese.
          //
          // Si por alguna razón se perdió
          // la suscripción, liberamos con
          // seguridad.

          if (
            state.currentContractId ===
            contractId
          ) {

            console.warn(
              "⚠️ Contrato cerrado detectado por watchdog"
            );

          }


        } catch (err) {

          console.error(
            "❌ WATCHDOG ERROR:",
            err.message
          );

        }

      },
      5000
    );

};


// ============================================================
// 🚀 START BOT
// ============================================================

const startBot = async (
  user,
  botConfig,
  settings,
  deriv,
  io
) => {

  // ==========================================================
  // EVITAR BOT DUPLICADO
  // ==========================================================

  if (
    activeBots.has(
      user.id
    )
  ) {

    console.log(
      "⚠️ BOT YA ACTIVO:",
      user.id
    );

    return;

  }


  // ==========================================================
  // VERIFICAR WS
  // ==========================================================

  if (
    !deriv.isConnected
  ) {

    console.error(
      "❌ DERIV NO ESTÁ CONECTADO"
    );

    return;

  }


  // ==========================================================
  // BALANCE INICIAL
  // ==========================================================

  const balanceData =
    await deriv.getBalance();


  const risk =
    new RiskManager(
      balanceData.balance,
      settings
    );


  // ==========================================================
  // CANDLE BUILDER
  // ==========================================================

  const candleBuilder =
    new CandleBuilder();


  // ==========================================================
  // ESTADO
  // ==========================================================

  const state = {

    userId:
      user.id,

    botId:
      botConfig.id,

    deriv,

    io,

    risk,

    subId:
      null,

    trades:
      0,

    wins:
      0,

    losses:
      0,

    pnl:
      0,

    lossStreak:
      0,

    running:
      false,

    cooldown:
      false,

    currentContractId:
      null,

    entrySaved:
      false,

    nextTradeTime:
      0,

    lastExecutedSignal:
      null,

    startedAt:
      Date.now(),

    stats:
      {},

    tradeTimeout:
      null,

    contractWatchdog:
      null,

    stopping:
      false,

    status:
      "running",

    accountId:
      settings?.deriv_account ||
      settings?.account_id ||
      null

  };


  activeBots.set(
    user.id,
    state
  );


  emitBotStarted(
    io,
    user.id,
    botConfig.id
  );


  emitMetrics(
    io,
    user.id,
    {
      trades:
        0,

      wins:
        0,

      losses:
        0,

      pnl:
        0,

      winrate:
        0
    }
  );


  // ==========================================================
  // 🔥 CARGAR HISTÓRICO
  // ==========================================================

  try {

    const history =
      await deriv.getCandles(
        botConfig.symbol,
        60,
        100
      );


    if (
      history.length > 0
    ) {

      candleBuilder.candles =
        history.slice(
          0,
          -1
        );


      candleBuilder.currentCandle =
        {
          ...history[
            history.length - 1
          ]
        };


      candleBuilder.lastTime =
        Math.floor(
          history[
            history.length - 1
          ].time / 60
        );


      state.stats =
        calculateStats(
          history
        );


      console.log(
        "📊 Histórico cargado:",
        history.length
      );


      console.log(
        "📈 Estadísticas iniciales:",
        state.stats
      );


      console.log(
        "🕯️ Velas cerradas:",
        candleBuilder.candles.length
      );


      console.log(
        "🕯️ Vela actual:",
        candleBuilder.currentCandle
      );

    }

  } catch (err) {

    console.error(
      "⚠️ ERROR HISTÓRICO:",
      err.message
    );

  }


  // ==========================================================
  // BOT START
  // ==========================================================

  log(
    "BOT_START",
    "Bot iniciado",
    {
      user:
        user.id,

      botId:
        botConfig.id,

      symbol:
        botConfig.symbol
    }
  );


  // ==========================================================
  // 📡 SUSCRIPCIÓN TICKS
  // ==========================================================

  let subId;


  try {

    subId =
      await deriv.subscribeTicks(
        botConfig.symbol,

        async ({
          price,
          epoch
        }) => {

          try {

            // ==================================================
            // FRONTEND
            // ==================================================

            emitPriceUpdate(
              io,
              user.id,
              {
                price,
                epoch,
                symbol:
                  botConfig.symbol
              }
            );


            // ==================================================
            // 🛑 BOT DETENIÉNDOSE
            // ==================================================

            if (
              state.stopping
            ) {

              return;

            }


            // ==================================================
            // 🔎 DEBUG ESTADO
            // ==================================================

            if (
              state.running ||
              state.cooldown ||
              state.currentContractId
            ) {

              return;

            }


            // ==================================================
            // ⏳ ESPERA PRÓXIMA OPERACIÓN
            // ==================================================

            if (
              Date.now() <
              state.nextTradeTime
            ) {

              return;

            }


            // ==================================================
            // 🔥 CONTROL Racha
            // ==================================================

            if (
              state.lossStreak >= 3
            ) {

              console.log(
                "🛑 3 PÉRDIDAS CONSECUTIVAS"
              );


              state.cooldown =
                true;


              setTimeout(
                () => {

                  state.cooldown =
                    false;

                  state.lossStreak =
                    0;

                  console.log(
                    "🔓 COOLDOWN LIBERADO"
                  );

                },
                60000
              );


              return;

            }


            // ==================================================
            // 🕯️ ACTUALIZAR CANDLE
            // ==================================================

            const {
              candles,
              isNewCandle
            } =
              candleBuilder.update(
                price,
                epoch
              );


            if (
              !isNewCandle
            ) {

              return;

            }


            console.log(
              "🕯️ NUEVA VELA:",
              new Date(
                epoch * 1000
              ).toISOString()
            );


            // ==================================================
            // STATS
            // ==================================================

            const closedCandles =
              candles.slice(
                0,
                -1
              );


            state.stats =
              calculateStats(
                closedCandles
              );


            console.log(
              "📊 Stats actualizadas:",
              state.stats
            );


            // ==================================================
            // HISTÓRICO MÍNIMO
            // ==================================================

            if (
              closedCandles.length < 20
            ) {

              return;

            }


            // ==================================================
            // VOLATILIDAD
            // ==================================================

            const recent =
              closedCandles.slice(
                -5
              );


            const volatility =
              Math.max(
                ...recent.map(
                  c => c.high
                )
              ) -
              Math.min(
                ...recent.map(
                  c => c.low
                )
              );


            const last10 =
              closedCandles.slice(
                -10
              );


            const avgRange =
              last10
                .map(
                  c =>
                    c.high -
                    c.low
                )
                .reduce(
                  (a, b) =>
                    a + b,
                  0
                ) / last10.length;


            if (
              volatility <
              avgRange * 0.5
            ) {

              console.log(
                "⛔ VOLATILIDAD INSUFICIENTE"
              );

              return;

            }


            // ==================================================
            // 🧠 ESTRATEGIA
            // ==================================================

            console.log(
              "🧠 EJECUTANDO ESTRATEGIA..."
            );


            const result =
              getSignal(
                closedCandles,
                botConfig.strategy,
                state
              );


            if (
              !result ||
              !result.signal
            ) {

              console.log(
                "⏸️ ESTRATEGIA: SIN SEÑAL"
              );

              return;

            }


            console.log(
              `📈 Estrategia: ${result.strategy} | ` +
              `Señal: ${result.signal} | ` +
              `Score: ${result.score}`
            );


            const finalSignal =
              result.signal;


            // ==================================================
            // SMA DEBUG
            // ==================================================

            const smaValue =
              calculateSMA(
                closedCandles,
                20
              );


            debugVisual(
              closedCandles,
              finalSignal,
              smaValue,
              result,
              result
            );


            const contract_type =
              finalSignal;


            // ==================================================
            // 🔒 RESERVAR BOT
            //
            // MUY IMPORTANTE:
            // se bloquea ANTES del await.
            // ==================================================

            state.running =
              true;


            state.entrySaved =
              false;


            let tradeCreated =
              false;

            let trade =
              null;

            let contractId =
              null;


            try {

              // ==================================================
              // STAKE
              // ==================================================

              const stake =
                risk.getStake();


              const formattedStake =
                Number(
                  stake.toFixed(2)
                );


              if (
                !formattedStake ||
                isNaN(
                  formattedStake
                )
              ) {

                throw new Error(
                  "Stake inválido"
                );

              }


              log(
                "REQUEST",
                "Enviando orden",
                {
                  amount:
                    formattedStake,

                  contract_type,

                  symbol:
                    botConfig.symbol
                }
              );


              // ==================================================
              // SINCRONIZAR SEGUNDO
              // ==================================================

              const msToNextSecond =
                1000 -
                (Date.now() % 1000);


              await sleep(
                msToNextSecond + 200
              );


              // ==================================================
              // BUY
              // ==================================================

              const contract =
                await deriv.buyContract({
                  amount:
                    formattedStake,

                  price:
                    formattedStake,

                  contract_type,

                  symbol:
                    botConfig.symbol
                });


              if (
                contract?.error
              ) {

                console.error(
                  "BUY ERROR RESPONSE:",
                  JSON.stringify(
                    contract,
                    null,
                    2
                  )
                );

                throw new Error(
                  contract.error.message ||
                  "Error al comprar contrato"
                );

              }


              contractId =
                contract?.buy?.contract_id;


              if (
                !contractId
              ) {

                throw new Error(
                  "Contrato inválido"
                );

              }


              // ==================================================
              // 🔒 CONTRATO ACTIVO
              // ==================================================

              state.currentContractId =
                contractId;

              state.lastExecutedSignal =
                contract_type;


              console.log(
                "🔒 CONTRATO ACTIVO:",
                contractId
              );


              // ==================================================
              // DB TRADE
              // ==================================================

              trade =
                await createTrade({

                  start_time:
                    new Date(),

                  expiry_time:
                    new Date(
                      Date.now() +
                      60000
                    ),

                  user_id:
                    user.id,

                  bot_id:
                    botConfig.id,

                  contract_id:
                    contractId,

                  symbol:
                    botConfig.symbol,

                  type:
                    contract_type,

                  entry_price:
                    null,

                  status:
                    "open"

                });


              tradeCreated =
                true;


              // ==================================================
              // ESTADÍSTICAS
              // ==================================================

              await saveTradeStatistics({

                tradeId:
                  trade.id,

                strategy:
                  result.strategy,

                symbol:
                  botConfig.symbol,

                signal:
                  result.signal,

                score:
                  result.score,

                analysis:
                  result.analysis,

                stake:
                  formattedStake,

                martingale:
                  state.risk.martingaleStep,

                balanceBefore:
                  state.risk.balance

              });


              state.trades++;


              emitNewTrade(
                io,
                user.id,
                trade
              );


              // ==================================================
              // 🔥 WATCH CONTRACT
              // ==================================================

              console.log(
                "WS CONNECTED:",
                deriv.isConnected
              );


              console.log(
                "CONTRACT ID:",
                contractId
              );


              let closed =
                false;


              let contractFinished =
                false;


              let tradeResult =
                null;


              const finishTrade =
                async (
                  c,
                  source = "websocket"
                ) => {

                  // ==============================================
                  // PROTECCIÓN CONTRA DOBLE CIERRE
                  // ==============================================

                  if (
                    closed ||
                    contractFinished
                  ) {

                    return;

                  }


                  const done =
                    c.isSold ||
                    c.status === "sold" ||
                    c.status === "closed";


                  if (
                    !done
                  ) {

                    return;

                  }


                  closed =
                    true;


                  contractFinished =
                    true;


                  // ==============================================
                  // LIMPIAR WATCHDOG
                  // ==============================================

                  if (
                    state.contractWatchdog
                  ) {

                    clearInterval(
                      state.contractWatchdog
                    );

                    state.contractWatchdog =
                      null;

                  }


                  // ==============================================
                  // LIMPIAR TIMEOUT
                  // ==============================================

                  if (
                    state.tradeTimeout
                  ) {

                    clearTimeout(
                      state.tradeTimeout
                    );

                    state.tradeTimeout =
                      null;

                  }


                  // ==============================================
                  // PROFIT
                  // ==============================================

                  const profit =
                    Number(
                      c.profit || 0
                    );


                  tradeResult =
                    profit > 0
                      ? "win"
                      : "loss";


                  console.log(
                    "🏁 CONTRATO CERRADO:",
                    contractId,
                    "PROFIT:",
                    profit,
                    "SOURCE:",
                    source
                  );


                  // ==============================================
                  // MARTINGALA
                  // ==============================================

                  try {

                    risk.nextStake(
                      tradeResult
                    );

                  } catch (err) {

                    console.error(
                      "⚠️ MARTINGALE ERROR:",
                      err.message
                    );

                  }


                  // ==============================================
                  // MÉTRICAS
                  // ==============================================

                  if (
                    tradeResult === "win"
                  ) {

                    console.log(
                      "✅ WIN → RESET MARTINGALE"
                    );

                    state.wins++;

                    state.lossStreak =
                      0;

                  } else {

                    console.log(
                      "❌ LOSS"
                    );

                    state.losses++;

                    state.lossStreak++;

                  }


                  state.pnl +=
                    profit;


                  console.log(
                    "📊 PNL ACTUAL:",
                    state.pnl
                  );


                  const winrate =
                    state.trades > 0
                      ? (
                          state.wins /
                          state.trades
                        ) * 100
                      : 0;


                  log(
                    "RESULT",
                    "Trade cerrado",
                    {
                      result:
                        tradeResult,

                      profit,

                      winrate:
                        winrate.toFixed(2)
                    }
                  );


                  // ==============================================
                  // BALANCE
                  // ==============================================

                  try {

                    const balanceData =
                      await deriv.getBalance();


                    emitBalance(
                      io,
                      user.id,
                      balanceData.balance
                    );


                    risk.update(
                      balanceData.balance
                    );


                  } catch (err) {

                    console.error(
                      "⚠️ ERROR BALANCE:",
                      err.message
                    );

                  }


                  // ==============================================
                  // DB
                  // ==============================================

                  try {

                    await closeTrade(
                      contractId,
                      {
                        status:
                          "closed",

                        profit,

                        exit_price:
                          c.currentSpot
                      }
                    );


                    if (
                      trade?.id
                    ) {

                      await updateTradeStatistics(
                        trade.id,
                        {
                          balanceAfter:
                            risk.balance,

                          tradeResult
                        }
                      );

                    }


                    console.log(
                      "✅ TRADE CERRADO EN DB:",
                      contractId
                    );


                  } catch (err) {

                    console.error(
                      "⚠️ ERROR DB:",
                      err.message
                    );

                  }


                  // ==============================================
                  // FRONTEND FINAL
                  // ==============================================

                  emitTradeUpdate(
                    io,
                    user.id,
                    {
                      contract_id:
                        contractId,

                      profit,

                      status:
                        "closed",

                      exit_price:
                        c.currentSpot
                    }
                  );


                  // ==============================================
                  // FORGET CONTRACT
                  // ==============================================

                  try {

                    await deriv.forgetContract(
                      contractId
                    );


                    console.log(
                      "🧹 Suscripción olvidada:",
                      contractId
                    );

                  } catch (err) {

                    console.error(
                      "⚠️ ERROR FORGET:",
                      err.message
                    );

                  }


                  // ==============================================
                  // STOP LOSS
                  // ==============================================

                  if (
                    state.pnl <=
                    -Number(
                      botConfig.stopLoss || 0
                    )
                  ) {

                    console.log(
                      "🛑 STOP LOSS ALCANZADO"
                    );


                    releaseBotState(
                      state,
                      "stop_loss"
                    );


                    await stopBot(
                      user,
                      "stop_loss"
                    );


                    return;

                  }


                  // ==============================================
                  // TARGET PROFIT
                  // ==============================================

                  if (
                    state.pnl >=
                    Number(
                      botConfig.targetProfit || 0
                    )
                  ) {

                    console.log(
                      "🎯 TARGET PROFIT ALCANZADO"
                    );


                    releaseBotState(
                      state,
                      "take_profit"
                    );


                    await stopBot(
                      user,
                      "take_profit"
                    );


                    return;

                  }


                  // ==============================================
                  // MÉTRICAS
                  // ==============================================

                  emitMetrics(
                    io,
                    user.id,
                    {
                      trades:
                        state.trades,

                      wins:
                        state.wins,

                      losses:
                        state.losses,

                      pnl:
                        state.pnl,

                      winrate
                    }
                  );


                  // ==============================================
                  // PROGRAMAR SIGUIENTE
                  // ==============================================

                  scheduleNextTrade(
                    state,
                    tradeResult
                  );


                  // ==============================================
                  // LIBERAR BOT
                  // ==============================================

                  state.currentContractId =
                    null;

                  state.running =
                    false;

                  state.cooldown =
                    false;

                  state.entrySaved =
                    false;


                  console.log(
                    "🔓 BOT LISTO PARA SIGUIENTE CICLO"
                  );


                };


                // ==================================================
                // CALLBACK CONTRATO
                // ==================================================

                await deriv.watchContract(
                  contractId,

                  async (c) => {

                    try {

                      // ============================================
                      // ENTRY
                      // ============================================

                      const current =
                        c.entryPrice ||
                        c.currentSpot;


                      if (
                        !state.entrySaved &&
                        current
                      ) {

                        state.entrySaved =
                          true;


                        const updatedTrade =
                          await updateTradeByContract(
                            Number(
                              contractId
                            ),
                            {
                              entry_price:
                                Number(
                                  current
                                )
                            }
                          );


                        console.log(
                          "✅ TRADE ACTUALIZADO:",
                          updatedTrade
                        );

                      }


                      // ============================================
                      // FRONTEND
                      // ============================================

                      emitTradeUpdate(
                        io,
                        user.id,
                        {
                          contract_id:
                            c.contractId,

                          profit:
                            c.profit,

                          status:
                            c.status,

                          entry_price:
                            c.entryPrice,

                          current_spot:
                            c.currentSpot,

                          date_start:
                            c.dateStart,

                          date_expiry:
                            c.dateExpiry
                        }
                      );


                      // ============================================
                      // CIERRE
                      // ============================================

                      await finishTrade(
                        c,
                        "websocket"
                      );


                    } catch (err) {

                      console.error(
                        "🔥 ERROR CALLBACK CONTRATO:",
                        err.message
                      );

                    }

                  }
                );


                // ==================================================
                // WATCHDOG
                // ==================================================

                startContractWatchdog(
                  user,
                  botConfig,
                  state,
                  contractId
                );


                // ==================================================
                // TIMEOUT DE SEGURIDAD
                // ==================================================

                state.tradeTimeout =
                  setTimeout(
                    async () => {

                      console.error(
                        "🚨 TIMEOUT DEL CONTRATO:",
                        contractId
                      );


                      try {

                        const latest =
                          await deriv.getContract(
                            contractId
                          );


                        if (
                          latest
                        ) {

                          const done =
                            latest.is_sold ||
                            latest.status === "sold" ||
                            latest.status === "closed";


                          if (
                            done
                          ) {

                            console.log(
                              "✅ TIMEOUT: contrato ya estaba cerrado"
                            );


                            // Reutilizar el cierre
                            // para que DB/métricas
                            // queden sincronizadas.

                            return;

                          }


                          console.warn(
                            "⚠️ TIMEOUT: contrato TODAVÍA ABIERTO"
                          );


                          console.warn(
                            "🔒 BOT PERMANECE BLOQUEADO"
                          );


                          return;

                        }

                      } catch (err) {

                        console.error(
                          "❌ ERROR TIMEOUT CONTRACT:",
                          err.message
                        );

                      }

                    },
                    75000
                  );


            } catch (err) {

              console.error(
                "🔥 TRADE ERROR:",
                err.message
              );


              // ====================================================
              // CASO CRÍTICO:
              //
              // BUY YA PUDO HABER OCURRIDO.
              // NO debemos liberar el bot
              // si existe un contrato activo.
              // ====================================================

              if (
                contractId
              ) {

                console.error(
                  "⚠️ EXISTE CONTRATO DESPUÉS DEL ERROR:",
                  contractId
                );


                state.currentContractId =
                  contractId;


                // Intentar suscribir
                // nuevamente el contrato.

                try {

                  await deriv.watchContract(
                    contractId,
                    async (c) => {

                      try {

                        const done =
                          c.isSold ||
                          c.status === "sold" ||
                          c.status === "closed";


                        if (
                          done
                        ) {

                          console.log(
                            "🏁 CIERRE RECUPERADO:",
                            contractId
                          );

                        }

                      } catch (watchErr) {

                        console.error(
                          "❌ ERROR RECUPERANDO CONTRATO:",
                          watchErr.message
                        );

                      }

                    }
                  );


                } catch (watchErr) {

                  console.error(
                    "❌ NO SE PUDO RECUPERAR WATCH:",
                    watchErr.message
                  );

                }

                return;

              }


              // ====================================================
              // SI NO HUBO BUY:
              // LIBERAR
              // ====================================================

              state.currentContractId =
                null;

              state.running =
                false;

              state.cooldown =
                false;

            }


          } catch (err) {

            console.error(
              "🔥 ERROR PROCESANDO TICK:",
              err.message
            );

          }

        }
      );


    state.subId =
      subId;


    console.log(
      "📡 BOT TICK SUB:",
      subId
    );


  } catch (err) {

    console.error(
      "❌ ERROR SUSCRIBIENDO TICKS:",
      err.message
    );


    releaseBotState(
      state,
      "tick_subscription_error"
    );


    activeBots.delete(
      user.id
    );


    throw err;

  }

};


// ============================================================
// 🛑 STOP BOT
// ============================================================

const stopBot = async (
  user,
  reason = "manual"
) => {

  const state =
    activeBots.get(
      user.id
    );


  if (!state)
    return;


  console.log(
    "🛑 DETENIENDO BOT:",
    {
      user:
        user.id,

      reason,

      contract:
        state.currentContractId
    }
  );


  state.stopping =
    true;


  try {

    // ==========================================================
    // CANCELAR TIMEOUT
    // ==========================================================

    if (
      state.tradeTimeout
    ) {

      clearTimeout(
        state.tradeTimeout
      );

      state.tradeTimeout =
        null;

    }


    // ==========================================================
    // CANCELAR WATCHDOG
    // ==========================================================

    if (
      state.contractWatchdog
    ) {

      clearInterval(
        state.contractWatchdog
      );

      state.contractWatchdog =
        null;

    }


    // ==========================================================
    // TICKS
    // ==========================================================

    if (
      state.subId
    ) {

      try {

        await state.deriv.unsubscribe(
          state.subId
        );

        console.log(
          "🧹 TICKS CANCELADOS"
        );

      } catch (err) {

        console.warn(
          "⚠️ ERROR CANCELANDO TICKS:",
          err.message
        );

      }

    }


    // ==========================================================
    // BALANCE
    // ==========================================================

    try {

      const balanceData =
        await state.deriv.getBalance();


      emitBalance(
        state.io,
        user.id,
        balanceData.balance
      );


      if (
        state.accountId
      ) {

        await updateBalance(
          state.accountId,
          balanceData.balance
        );

      }


      console.log(
        "💰 Balance guardado:",
        balanceData.balance
      );


    } catch (err) {

      console.warn(
        "⚠️ ERROR GUARDANDO BALANCE:",
        err.message
      );

    }


    // ==========================================================
    // ESTADO
    // ==========================================================

    state.running =
      false;

    state.cooldown =
      true;


    // ==========================================================
    // DESCONECTAR
    // ==========================================================

    if (
      state.deriv
    ) {

      try {

        state.deriv.disconnect();

        console.log(
          "🔌 DERIV DESCONECTADO"
        );

      } catch (err) {

        console.warn(
          "⚠️ ERROR DESCONECTANDO DERIV:",
          err.message
        );

      }

    }


    // ==========================================================
    // DB STATUS
    // ==========================================================

    try {

      await updateBotStatus(
        state.botId,
        "stopped"
      );

    } catch (err) {

      console.warn(
        "⚠️ ERROR ACTUALIZANDO BOT:",
        err.message
      );

    }


    state.status =
      "stopped";


    state.currentContractId =
      null;


    emitBotStopped(
      state.io,
      user.id,
      state.botId,
      reason
    );


    activeBots.delete(
      user.id
    );


    console.log(
      "🛑 BOT ELIMINADO"
    );


  } catch (err) {

    console.error(
      "🔥 STOP ERROR:",
      err.message
    );


    // Nunca dejar el estado
    // en running después de stop.

    state.running =
      false;

  }

};


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  startBot,
  stopBot
};