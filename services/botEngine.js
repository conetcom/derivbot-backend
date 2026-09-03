// ============================================================
// 🤖 BOT ENGINE - MODO PRO
// ============================================================

const {
  createTrade,
  closeTrade,
  updateTradeByContract
} = require("../models/tradesModel");

const CandleBuilder =
  require("../bot/candleBuilder");

const {
  getSignal
} = require("../bot/strategy");

const RiskManager =
  require("../bot/riskManager");

const {
  updateBotStatus,
  updateBalance
} = require("../models/botsModel");

const activeBots =
  require("../services/activeBots");

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
// ⚙️ CONFIGURACIÓN
// ============================================================

const ENGINE_CONFIG = {

  // Máximo de pérdidas consecutivas
  MAX_CONSECUTIVE_LOSSES: 3,

  // Tiempo de pausa después de 3 pérdidas
  LOSS_COOLDOWN_MS:
    5 * 60 * 1000,

  // Máximo martingale permitido
  MAX_MARTINGALE: 3,

  // Duración esperada del contrato
  CONTRACT_DURATION_MS:
    60 * 1000,

  // Timeout de seguridad
  CONTRACT_TIMEOUT_MS:
    75 * 1000,

  // Histórico mínimo global
  MIN_HISTORY_CANDLES: 30

};


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
// 🔓 LIBERAR ESTADO
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

  state.currentContractId = null;

  state.entrySaved = false;

  if (
    state.tradeTimeout
  ) {

    clearTimeout(
      state.tradeTimeout
    );

    state.tradeTimeout = null;

  }

  if (
    state.contractWatchdog
  ) {

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
        state.currentContractId,

      lossStreak:
        state.lossStreak,

      consecutiveLosses:
        state.consecutiveLosses,

      martingale:
        state.risk?.martingaleStep

    }
  );

};


// ============================================================
// ⏱️ PROGRAMAR SIGUIENTE OPERACIÓN
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


  // ==========================================================
  // LOSS
  // ==========================================================

  if (
    tradeResult === "loss"
  ) {

    state.nextTradeTime =
      now +
      msToNextMinute +
      (2 * 60000);

  }


  // ==========================================================
  // WIN
  // ==========================================================

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
// 🛑 ACTIVAR COOLDOWN
// ============================================================

const activateLossCooldown = (
  state,
  reason = "loss_streak"
) => {

  state.cooldown = true;

  state.cooldownUntil =
    Date.now() +
    ENGINE_CONFIG.LOSS_COOLDOWN_MS;

  console.log(
    "🛑 COOLDOWN ACTIVADO",
    {

      reason,

      lossStreak:
        state.lossStreak,

      consecutiveLosses:
        state.consecutiveLosses,

      until:
        new Date(
          state.cooldownUntil
        ).toLocaleTimeString()

    }
  );

};


// ============================================================
// ⏳ VERIFICAR COOLDOWN
// ============================================================

const isCooldownActive = (
  state
) => {

  if (
    !state.cooldown
  ) {

    return false;

  }


  const now =
    Date.now();


  if (
    state.cooldownUntil &&
    now >= state.cooldownUntil
  ) {

    state.cooldown =
      false;

    state.cooldownUntil =
      0;

    state.lossStreak =
      0;

    state.consecutiveLosses =
      0;

    console.log(
      "🔓 COOLDOWN FINALIZADO"
    );

    return false;

  }


  return true;

};


// ============================================================
// 🛡️ VERIFICAR MARTINGALE
// ============================================================

const isMartingaleBlocked = (
  state
) => {

  const martingale =
    Number(
      state.risk?.martingaleStep ?? 0
    );


  if (
    martingale >
    ENGINE_CONFIG.MAX_MARTINGALE
  ) {

    console.log(
      "🛑 MARTINGALE BLOQUEADO",
      {

        martingale,

        max:
          ENGINE_CONFIG.MAX_MARTINGALE

      }
    );

    return true;

  }


  return false;

};


// ============================================================
// 🚨 PROTECCIÓN DE RACHAS
// ============================================================

const checkLossProtection = (
  state
) => {

  const losses =
    Math.max(

      Number(
        state.lossStreak || 0
      ),

      Number(
        state.consecutiveLosses || 0
      )

    );


  if (
    losses >=
    ENGINE_CONFIG.MAX_CONSECUTIVE_LOSSES
  ) {

    if (
      !state.cooldown
    ) {

      activateLossCooldown(
        state,
        "3_consecutive_losses"
      );

    }

    return false;

  }


  return true;

};


// ============================================================
// 📊 CALCULAR VOLATILIDAD
// ============================================================

const calculateVolatility = (
  candles
) => {

  if (
    !candles ||
    candles.length < 5
  ) {

    return 0;

  }


  const recent =
    candles.slice(-5);


  const high =
    Math.max(
      ...recent.map(
        c => Number(c.high)
      )
    );


  const low =
    Math.min(
      ...recent.map(
        c => Number(c.low)
      )
    );


  return (
    high -
    low
  );

};


// ============================================================
// 📊 CALCULAR RANGO PROMEDIO
// ============================================================

const calculateAverageRange = (
  candles
) => {

  if (
    !candles ||
    candles.length === 0
  ) {

    return 0;

  }


  const recent =
    candles.slice(-10);


  const ranges =
    recent.map(
      c =>
        Number(c.high) -
        Number(c.low)
    );


  if (
    ranges.length === 0
  ) {

    return 0;

  }


  return (
    ranges.reduce(
      (a, b) => a + b,
      0
    ) /
    ranges.length
  );

};


// ============================================================
// 🚨 WATCHDOG DEL CONTRATO
// ============================================================

const startContractWatchdog = (
  user,
  botConfig,
  state,
  contractId,
  finishTrade
) => {

  if (
    state.contractWatchdog
  ) {

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

          // ====================================================
          // CONTRATO YA NO ES EL ACTUAL
          // ====================================================

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

              attempt:
                attempts

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

            if (
              attempts >= maxAttempts
            ) {

              console.error(
                "🚨 WATCHDOG: máximo de intentos"
              );

              clearInterval(
                state.contractWatchdog
              );

              state.contractWatchdog =
                null;

            }

            return;

          }


          const done =
            Boolean(
              contract.is_sold
            ) ||

            Boolean(
              contract.isSold
            ) ||

            contract.status === "sold" ||

            contract.status === "closed";


          if (!done) {

            console.log(
              "⏳ WATCHDOG: contrato todavía abierto"
            );

            return;

          }


          console.log(
            "✅ WATCHDOG DETECTÓ CONTRATO CERRADO:",
            contractId
          );


          if (
            typeof finishTrade ===
            "function"
          ) {

            await finishTrade(
              contract,
              "watchdog"
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
  // VERIFICAR DERIV
  // ==========================================================

  if (
    !deriv ||
    !deriv.isConnected
  ) {

    console.error(
      "❌ DERIV NO ESTÁ CONECTADO"
    );

    return;

  }


  console.log(
    "🟢 DERIV CONECTADO:",
    deriv.isConnected
  );


  // ==========================================================
  // BALANCE INICIAL
  // ==========================================================

  const balanceData =
    await deriv.getBalance();


  const initialBalance =
    Number(
      balanceData?.balance || 0
    );


  if (
    !initialBalance ||
    initialBalance <= 0
  ) {

    throw new Error(
      "Balance inicial inválido"
    );

  }


  console.log(
    "💰 BALANCE INICIAL:",
    initialBalance
  );


  // ==========================================================
  // RISK MANAGER
  // ==========================================================

  const risk =
    new RiskManager(
      initialBalance,
      settings || {}
    );


  console.log(
    "🛡️ RISK MANAGER:",
    {

      balance:
        risk.balance,

      martingale:
        risk.martingaleStep

    }
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

    // ------------------------------------------
    // RACHAS
    // ------------------------------------------

    lossStreak:
      0,

    consecutiveLosses:
      0,

    // ------------------------------------------
    // COOLDOWN
    // ------------------------------------------

    cooldown:
      false,

    cooldownUntil:
      0,

    // ------------------------------------------
    // TRADING
    // ------------------------------------------

    running:
      false,

    currentContractId:
      null,

    entrySaved:
      false,

    nextTradeTime:
      0,

    lastExecutedSignal:
      null,

    // ------------------------------------------
    // HISTÓRICO
    // ------------------------------------------

    stats:
      {},

    // ------------------------------------------
    // TIMERS
    // ------------------------------------------

    tradeTimeout:
      null,

    contractWatchdog:
      null,

    // ------------------------------------------
    // ESTADO
    // ------------------------------------------

    stopping:
      false,

    status:
      "running",

    startedAt:
      Date.now(),

    accountId:
      settings?.deriv_account ||
      settings?.account_id ||
      null

  };


  // ==========================================================
  // REGISTRAR BOT
  // ==========================================================

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
        300
      );


    if (
      history &&
      history.length > 0
    ) {

      // ----------------------------------------------
      // Todas menos la vela actual
      // ----------------------------------------------

      candleBuilder.candles =
        history.slice(
          0,
          -1
        );


      // ----------------------------------------------
      // Vela actual
      // ----------------------------------------------

      candleBuilder.currentCandle =
        {
          ...history[
            history.length - 1
          ]
        };


      // ----------------------------------------------
      // Tiempo
      // ----------------------------------------------

      candleBuilder.lastTime =
        Math.floor(
          history[
            history.length - 1
          ].time / 60
        );


      // ----------------------------------------------
      // ESTADÍSTICAS
      // ----------------------------------------------

      state.stats =
        calculateStats(
          history
        );


      console.log(
        "📊 HISTÓRICO CARGADO:",
        history.length
      );


      console.log(
        "📈 ESTADÍSTICAS INICIALES:",
        state.stats
      );


      console.log(
        "🕯️ VELAS CERRADAS:",
        candleBuilder.candles.length
      );


      console.log(
        "🕯️ VELA ACTUAL:",
        candleBuilder.currentCandle
      );

    } else {

      console.warn(
        "⚠️ DERIV NO DEVOLVIÓ HISTÓRICO"
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
        botConfig.symbol,

      strategy:
        botConfig.strategy

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
            // FRONTEND PRECIO
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
            // BOT DETENIÉNDOSE
            // ==================================================

            if (
              state.stopping
            ) {

              return;

            }


            // ==================================================
            // COOLDOWN
            // ==================================================

            if (
              isCooldownActive(
                state
              )
            ) {

              return;

            }


            // ==================================================
            // EVITAR OPERACIONES DUPLICADAS
            // ==================================================

            if (

              state.running ||

              state.currentContractId

            ) {

              return;

            }


            // ==================================================
            // PRÓXIMA OPERACIÓN
            // ==================================================

            if (
              Date.now() <
              state.nextTradeTime
            ) {

              return;

            }


            // ==================================================
            // RACHAS
            // ==================================================

            if (
              !checkLossProtection(
                state
              )
            ) {

              return;

            }


            // ==================================================
            // MARTINGALE
            // ==================================================

            if (
              isMartingaleBlocked(
                state
              )
            ) {

              activateLossCooldown(
                state,
                "max_martingale"
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
              "\n=========================================="
            );

            console.log(
              "🕯️ NUEVA VELA:"
            );

            console.log(
              new Date(
                epoch * 1000
              ).toISOString()
            );

            console.log(
              "=========================================="
            );


            // ==================================================
            // VELAS CERRADAS
            // ==================================================

            const closedCandles =
              candles.slice(
                0,
                -1
              );


            console.log(
              "📊 VELAS CERRADAS:",
              closedCandles.length
            );


            if (
              closedCandles.length <
              ENGINE_CONFIG.MIN_HISTORY_CANDLES
            ) {

              console.log(
                "⏳ HISTÓRICO INSUFICIENTE:",
                {

                  actual:
                    closedCandles.length,

                  minimo:
                    ENGINE_CONFIG.MIN_HISTORY_CANDLES

                }
              );

              return;

            }


            // ==================================================
            // STATS
            // ==================================================

            state.stats =
              calculateStats(
                closedCandles
              );


            console.log(
              "📊 STATS ACTUALIZADAS:"
            );

            console.dir(
              state.stats,
              {
                depth: null
              }
            );


            // ==================================================
            // VOLATILIDAD
            // ==================================================

            const volatility =
              calculateVolatility(
                closedCandles
              );


            const avgRange =
              calculateAverageRange(
                closedCandles
              );


            console.log(
              "📊 VOLATILIDAD:",
              {

                volatility,

                avgRange

              }
            );


            // ==================================================
            // FILTRO DE VOLATILIDAD
            // ==================================================

            if (

              avgRange > 0 &&

              volatility <
              avgRange * 0.5

            ) {

              console.log(
                "⛔ VOLATILIDAD INSUFICIENTE:",
                {

                  volatility,

                  avgRange,

                  required:
                    avgRange * 0.5

                }
              );

              return;

            }


            // ==================================================
            // 🧠 ESTRATEGIA
            // ==================================================

            console.log(
              "\n🧠 EJECUTANDO ESTRATEGIA..."
            );


            console.log(
              "🧠 STRATEGY:",
              botConfig.strategy
            );


            console.log(
              "🧠 CANDLES:",
              closedCandles.length
            );


            console.log(
              "🧠 STATS DISPONIBLES:",
              Object.keys(
                state.stats || {}
              )
            );


            // ==================================================
            // IMPORTANTE:
            //
            // Se pasa TODO state.
            //
            // syntheticProStrategy espera:
            //
            // state.stats
            // ==================================================

            const result =
              getSignal(

                closedCandles,

                botConfig.strategy,

                state

              );


            // ==================================================
            // 🔥 DEBUG COMPLETO
            // ==================================================

            console.log(
              "\n🚨 RESULTADO COMPLETO DE GETSIGNAL:"
            );

            console.dir(
              result,
              {
                depth: null
              }
            );


            // ==================================================
            // SIN SEÑAL
            // ==================================================

            if (

              !result ||

              !result.signal

            ) {

              console.log(
                "⏸️ ESTRATEGIA: SIN SEÑAL"
              );

              return;

            }


            // ==================================================
            // RESULTADO ESTRATEGIA
            // ==================================================

            console.log(
              "📈 RESULTADO ESTRATEGIA:",
              {

                strategy:
                  result.strategy,

                signal:
                  result.signal,

                score:
                  result.score,

                callScore:
                  result.callScore,

                putScore:
                  result.putScore,

                pattern:
                  result.pattern,

                pctGreen:
                  result.pctGreen,

                pctRed:
                  result.pctRed,

                total:
                  result.total,

                historyEdge:
                  result.historyEdge

              }
            );


            // ==================================================
            // SEGURIDAD EXTRA
            // ==================================================

            const finalSignal =
              result.signal;


            if (

              finalSignal !== "CALL" &&

              finalSignal !== "PUT"

            ) {

              console.log(
                "⛔ SEÑAL INVÁLIDA:",
                finalSignal
              );

              return;

            }


            // ==================================================
            // 📊 INFORMACIÓN HISTÓRICA
            //
            // IMPORTANTE:
            //
            // YA NO BLOQUEAMOS EL TRADE AQUÍ.
            //
            // La estrategia es responsable de utilizar
            // el histórico para decidir CALL / PUT.
            // ==================================================

            let patternStats =
              null;


            if (
              result.pattern &&
              state.stats
            ) {

              patternStats =
                state.stats[
                  result.pattern
                ];

            }


            let pctGreen =
              Number(
                result.pctGreen
              );


            let pctRed =
              Number(
                result.pctRed
              );


            if (
              !Number.isFinite(
                pctGreen
              )
            ) {

              pctGreen =
                Number(
                  patternStats?.pctGreen
                );

            }


            if (
              !Number.isFinite(
                pctRed
              )
            ) {

              pctRed =
                Number(
                  patternStats?.pctRed
                );

            }


            if (
              !Number.isFinite(
                pctGreen
              )
            ) {

              pctGreen =
                0;

            }


            if (
              !Number.isFinite(
                pctRed
              )
            ) {

              pctRed =
                0;

            }


            const statsTotal =
              Number(
                result.total ??
                patternStats?.total ??
                0
              );


            const historyEdge =
              Math.abs(
                pctGreen -
                pctRed
              );


            console.log(
              "📊 INFORMACIÓN HISTÓRICA:",
              {

                pattern:
                  result.pattern,

                total:
                  statsTotal,

                pctGreen,

                pctRed,

                edge:
                  historyEdge,

                strategySignal:
                  finalSignal

              }
            );


            // ==================================================
            // 🚨 NO HAY BLOQUEO HISTÓRICO
            // ==================================================
            //
            // ANTES:
            //
            // if(historyDirection !== finalSignal)
            //     return;
            //
            // ESO SE ELIMINA.
            //
            // La estrategia ya tomó la decisión.
            //
            // ==================================================


            console.log(
              "✅ SEÑAL APROBADA POR LA ESTRATEGIA:",
              {

                signal:
                  finalSignal,

                score:
                  result.score,

                pattern:
                  result.pattern

              }
            );


            // ==================================================
            // 🔒 RESERVAR BOT
            //
            // MUY IMPORTANTE:
            // antes de cualquier await.
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

              // =================================================
              // STAKE
              // =================================================

              const stake =
                risk.getStake();


              const formattedStake =
                Number(
                  Number(stake).toFixed(2)
                );


              if (

                !formattedStake ||

                isNaN(
                  formattedStake
                ) ||

                formattedStake <= 0

              ) {

                throw new Error(
                  "Stake inválido"
                );

              }


              // =================================================
              // MARTINGALE ACTUAL
              // =================================================

              const currentMartingale =
                Number(
                  risk.martingaleStep ?? 0
                );


              if (
                currentMartingale >
                ENGINE_CONFIG.MAX_MARTINGALE
              ) {

                console.log(
                  "🛑 MARTINGALE BLOQUEADO ANTES DEL BUY",
                  {

                    currentMartingale,

                    max:
                      ENGINE_CONFIG.MAX_MARTINGALE

                  }
                );


                activateLossCooldown(
                  state,
                  "max_martingale_before_buy"
                );


                state.running =
                  false;


                return;

              }


              // =================================================
              // 🔥 PREPARANDO BUY
              // =================================================

              console.log(
                "\n🚀 PREPARANDO BUY"
              );


              console.log(
                "=========================================="
              );


              console.log(
                "📌 SYMBOL:",
                botConfig.symbol
              );


              console.log(
                "📌 SIGNAL:",
                finalSignal
              );


              console.log(
                "📌 STAKE:",
                formattedStake
              );


              console.log(
                "📌 SCORE:",
                result.score
              );


              console.log(
                "📌 CALL SCORE:",
                result.callScore
              );


              console.log(
                "📌 PUT SCORE:",
                result.putScore
              );


              console.log(
                "📌 PATTERN:",
                result.pattern
              );


              console.log(
                "📌 MARTINGALE:",
                currentMartingale
              );


              console.log(
                "📌 DERIV CONNECTED:",
                deriv.isConnected
              );


              console.log(
                "=========================================="
              );


              // =================================================
              // LOG REQUEST
              // =================================================

              log(
                "REQUEST",
                "Enviando orden",
                {

                  amount:
                    formattedStake,

                  contract_type:
                    finalSignal,

                  symbol:
                    botConfig.symbol,

                  score:
                    result.score,

                  callScore:
                    result.callScore,

                  putScore:
                    result.putScore,

                  pattern:
                    result.pattern,

                  pctGreen,

                  pctRed,

                  historyEdge,

                  martingale:
                    currentMartingale

                }
              );


              // =================================================
              // VERIFICAR DERIV
              // =================================================

              if (
                !deriv ||
                !deriv.isConnected
              ) {

                throw new Error(
                  "Deriv no está conectado antes del BUY"
                );

              }


              // =================================================
              // SINCRONIZAR SEGUNDO
              // =================================================

              const msToNextSecond =
                1000 -
                (
                  Date.now() %
                  1000
                );


              console.log(
                "⏱️ ESPERANDO PARA BUY:",
                msToNextSecond + 200,
                "ms"
              );


              await sleep(
                msToNextSecond + 200
              );


              // =================================================
              // VERIFICAR ESTADO NUEVAMENTE
              // =================================================

              if (
                state.stopping
              ) {

                throw new Error(
                  "Bot detenido antes del BUY"
                );

              }


              if (
                !deriv.isConnected
              ) {

                throw new Error(
                  "Deriv se desconectó antes del BUY"
                );

              }


              // =================================================
              // 🔥 BUY
              // =================================================

              console.log(
                "\n💥 EJECUTANDO BUY CONTRACT..."
              );


              console.log(
                {

                  amount:
                    formattedStake,

                  price:
                    formattedStake,

                  contract_type:
                    finalSignal,

                  symbol:
                    botConfig.symbol

                }
              );


              const contract =
                await deriv.buyContract({

                  amount:
                    formattedStake,

                  price:
                    formattedStake,

                  contract_type:
                    finalSignal,

                  symbol:
                    botConfig.symbol

                });


              // =================================================
              // RESPUESTA BUY
              // =================================================

              console.log(
                "\n📥 RESPUESTA BUY:"
              );


              console.dir(
                contract,
                {
                  depth: null
                }
              );


              // =================================================
              // BUY ERROR
              // =================================================

              if (
                contract?.error
              ) {

                console.error(
                  "❌ BUY ERROR RESPONSE:",
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


              // =================================================
              // CONTRACT ID
              // =================================================

              contractId =
                contract?.buy?.contract_id;


              if (
                !contractId
              ) {

                console.error(
                  "❌ RESPUESTA BUY SIN CONTRACT ID:",
                  contract
                );

                throw new Error(
                  "Contrato inválido: no se recibió contract_id"
                );

              }


              // =================================================
              // CONTRATO ACTIVO
              // =================================================

              state.currentContractId =
                contractId;


              state.lastExecutedSignal =
                finalSignal;


              console.log(
                "🔒 CONTRATO ACTIVO:",
                contractId
              );


              // =================================================
              // DB TRADE
              // =================================================

              try {

                trade =
                  await createTrade({

                    start_time:
                      new Date(),

                    expiry_time:
                      new Date(
                        Date.now() +
                        ENGINE_CONFIG.CONTRACT_DURATION_MS
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
                      finalSignal,

                    entry_price:
                      null,

                    status:
                      "open"

                  });


                tradeCreated =
                  true;


                console.log(
                  "✅ TRADE CREADO EN DB:",
                  trade?.id
                );


              } catch (dbErr) {

                console.error(
                  "❌ ERROR CREANDO TRADE EN DB:",
                  dbErr.message
                );

                // IMPORTANTE:
                // El contrato ya existe.
                // NO cancelamos el control del contrato.

              }


              // =================================================
              // ESTADÍSTICAS
              // =================================================

              if (
                trade?.id
              ) {

                try {

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
                      currentMartingale,

                    balanceBefore:
                      risk.balance,

                    callScore:
                      result.callScore,

                    putScore:
                      result.putScore,

                    pattern:
                      result.pattern,

                    pctGreen,

                    pctRed,

                    historyEdge,

                    volatility

                  });

                } catch (statsErr) {

                  console.error(
                    "⚠️ ERROR GUARDANDO ESTADÍSTICAS:",
                    statsErr.message
                  );

                }

              }


              state.trades++;


              emitNewTrade(
                io,
                user.id,
                trade
              );


              // =================================================
              // WS
              // =================================================

              console.log(
                "WS CONNECTED:",
                deriv.isConnected
              );


              console.log(
                "CONTRACT ID:",
                contractId
              );


              // =================================================
              // CONTROL CIERRE
              // =================================================

              let closed =
                false;


              let contractFinished =
                false;


              let tradeResult =
                null;


              // =================================================
              // FINISH TRADE
              // =================================================

              const finishTrade =
                async (
                  c,
                  source = "websocket"
                ) => {

                  // =============================================
                  // DOBLE CIERRE
                  // =============================================

                  if (

                    closed ||

                    contractFinished

                  ) {

                    return;

                  }


                  // =============================================
                  // ESTADO CONTRATO
                  // =============================================

                  const done =

                    Boolean(
                      c?.isSold
                    ) ||

                    Boolean(
                      c?.is_sold
                    ) ||

                    c?.status === "sold" ||

                    c?.status === "closed";


                  if (
                    !done
                  ) {

                    return;

                  }


                  closed =
                    true;


                  contractFinished =
                    true;


                  // =============================================
                  // LIMPIAR WATCHDOG
                  // =============================================

                  if (
                    state.contractWatchdog
                  ) {

                    clearInterval(
                      state.contractWatchdog
                    );

                    state.contractWatchdog =
                      null;

                  }


                  // =============================================
                  // LIMPIAR TIMEOUT
                  // =============================================

                  if (
                    state.tradeTimeout
                  ) {

                    clearTimeout(
                      state.tradeTimeout
                    );

                    state.tradeTimeout =
                      null;

                  }


                  // =============================================
                  // PROFIT
                  // =============================================

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
                    {

                      contractId,

                      profit,

                      result:
                        tradeResult,

                      source

                    }
                  );


                  // =============================================
                  // MARTINGALE
                  // =============================================

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


                  // =============================================
                  // MÉTRICAS
                  // =============================================

                  if (
                    tradeResult === "win"
                  ) {

                    state.wins++;

                    state.lossStreak =
                      0;

                    state.consecutiveLosses =
                      0;


                    console.log(
                      "✅ WIN → RESET MARTINGALE / RACHA"
                    );

                  } else {

                    state.losses++;

                    state.lossStreak =
                      Number(
                        state.lossStreak || 0
                      ) + 1;

                    state.consecutiveLosses =
                      Number(
                        state.consecutiveLosses || 0
                      ) + 1;


                    console.log(
                      "❌ LOSS",
                      {

                        lossStreak:
                          state.lossStreak,

                        consecutiveLosses:
                          state.consecutiveLosses,

                        martingale:
                          risk.martingaleStep

                      }
                    );

                  }


                  // =============================================
                  // PNL
                  // =============================================

                  state.pnl +=
                    profit;


                  console.log(
                    "📊 PNL ACTUAL:",
                    state.pnl
                  );


                  // =============================================
                  // WINRATE
                  // =============================================

                  const winrate =
                    state.trades > 0

                      ? (

                          state.wins /
                          state.trades

                        ) * 100

                      : 0;


                  // =============================================
                  // RESULT LOG
                  // =============================================

                  log(
                    "RESULT",
                    "Trade cerrado",
                    {

                      result:
                        tradeResult,

                      profit,

                      winrate:
                        winrate.toFixed(2),

                      lossStreak:
                        state.lossStreak,

                      consecutiveLosses:
                        state.consecutiveLosses,

                      martingale:
                        risk.martingaleStep

                    }
                  );


                  // =============================================
                  // BALANCE
                  // =============================================

                  let balanceAfter =
                    risk.balance;


                  try {

                    const balanceData =
                      await deriv.getBalance();


                    balanceAfter =
                      Number(
                        balanceData.balance
                      );


                    emitBalance(
                      io,
                      user.id,
                      balanceAfter
                    );


                    risk.update(
                      balanceAfter
                    );


                    console.log(
                      "💰 BALANCE ACTUALIZADO:",
                      balanceAfter
                    );


                  } catch (err) {

                    console.error(
                      "⚠️ ERROR BALANCE:",
                      err.message
                    );

                  }


                  // =============================================
                  // DB TRADE
                  // =============================================

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
                            balanceAfter,

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


                  // =============================================
                  // FRONTEND FINAL
                  // =============================================

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


                  // =============================================
                  // FORGET
                  // =============================================

                  try {

                    await deriv.forgetContract(
                      contractId
                    );


                    console.log(
                      "🧹 Suscripción olvidada:",
                      contractId
                    );

                  } catch (err) {

                    console.warn(
                      "⚠️ ERROR FORGET:",
                      err.message
                    );

                  }


                  // =============================================
                  // STOP LOSS
                  // =============================================

                  const stopLoss =
                    Number(
                      botConfig.stopLoss || 0
                    );


                  if (

                    stopLoss > 0 &&

                    state.pnl <=
                    -stopLoss

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


                  // =============================================
                  // TARGET PROFIT
                  // =============================================

                  const targetProfit =
                    Number(
                      botConfig.targetProfit || 0
                    );


                  if (

                    targetProfit > 0 &&

                    state.pnl >=
                    targetProfit

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


                  // =============================================
                  // 3 PÉRDIDAS
                  // =============================================

                  if (

                    state.consecutiveLosses >=
                    ENGINE_CONFIG.MAX_CONSECUTIVE_LOSSES

                  ) {

                    activateLossCooldown(
                      state,
                      "3_consecutive_losses"
                    );

                  }


                  // =============================================
                  // MARTINGALE MÁXIMO
                  // =============================================

                  if (

                    Number(
                      risk.martingaleStep ?? 0
                    ) >
                    ENGINE_CONFIG.MAX_MARTINGALE

                  ) {

                    activateLossCooldown(
                      state,
                      "max_martingale"
                    );

                  }


                  // =============================================
                  // MÉTRICAS
                  // =============================================

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

                      winrate:

                        Number(
                          winrate.toFixed(2)
                        ),

                      lossStreak:
                        state.lossStreak,

                      consecutiveLosses:
                        state.consecutiveLosses,

                      martingale:
                        Number(
                          risk.martingaleStep ?? 0
                        ),

                      cooldown:
                        state.cooldown

                    }

                  );


                  // =============================================
                  // PRÓXIMA OPERACIÓN
                  // =============================================

                  scheduleNextTrade(
                    state,
                    tradeResult
                  );


                  // =============================================
                  // LIBERAR CONTRATO
                  // =============================================

                  state.currentContractId =
                    null;

                  state.running =
                    false;

                  state.entrySaved =
                    false;


                  console.log(
                    "🔓 BOT LISTO PARA SIGUIENTE CICLO",
                    {

                      nextTrade:
                        new Date(
                          state.nextTradeTime
                        ).toLocaleTimeString(),

                      lossStreak:
                        state.lossStreak,

                      consecutiveLosses:
                        state.consecutiveLosses,

                      martingale:
                        risk.martingaleStep,

                      cooldown:
                        state.cooldown

                    }
                  );

                };


                // =================================================
                // WATCH CONTRACT
                // =================================================

                await deriv.watchContract(

                  contractId,

                  async (c) => {

                    try {

                      // ==========================================
                      // ENTRY
                      // ==========================================

                      const current =
                        c.entryPrice ||
                        c.currentSpot;


                      if (

                        !state.entrySaved &&

                        current

                      ) {

                        state.entrySaved =
                          true;


                        if (
                          trade?.id
                        ) {

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

                      }


                      // ==========================================
                      // FRONTEND
                      // ==========================================

                      emitTradeUpdate(

                        io,

                        user.id,

                        {

                          contract_id:
                            c.contractId ||
                            contractId,

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


                      // ==========================================
                      // CIERRE
                      // ==========================================

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


                // =================================================
                // WATCHDOG
                // =================================================

                startContractWatchdog(

                  user,

                  botConfig,

                  state,

                  contractId,

                  finishTrade

                );


                // =================================================
                // TIMEOUT
                // =================================================

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

                            Boolean(
                              latest.is_sold
                            ) ||

                            Boolean(
                              latest.isSold
                            ) ||

                            latest.status === "sold" ||

                            latest.status === "closed";


                          if (
                            done
                          ) {

                            console.log(
                              "✅ TIMEOUT: CONTRATO YA CERRADO"
                            );


                            await finishTrade(
                              latest,
                              "timeout"
                            );


                            return;

                          }


                          console.warn(
                            "⚠️ TIMEOUT: CONTRATO TODAVÍA ABIERTO"
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

                    ENGINE_CONFIG.CONTRACT_TIMEOUT_MS

                  );


              // =================================================
              // BUY COMPLETADO
              // =================================================

              console.log(
                "\n✅ BUY COMPLETADO CORRECTAMENTE"
              );

              console.log(
                "🔒 CONTRACT ID:",
                contractId
              );

              console.log(
                "🎯 SIGNAL:",
                finalSignal
              );

              console.log(
                "💰 STAKE:",
                formattedStake
              );


            } catch (err) {

              console.error(
                "\n🔥 TRADE ERROR:",
                err.message
              );


              console.error(
                "🔥 TRADE ERROR STACK:",
                err.stack
              );


              // =================================================
              // BUY PUDO HABER OCURRIDO
              // =================================================

              if (
                contractId
              ) {

                console.error(
                  "⚠️ EXISTE CONTRATO DESPUÉS DEL ERROR:",
                  contractId
                );


                state.currentContractId =
                  contractId;


                try {

                  await deriv.watchContract(

                    contractId,

                    async (c) => {

                      try {

                        const done =

                          Boolean(
                            c.isSold
                          ) ||

                          Boolean(
                            c.is_sold
                          ) ||

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


                // No liberar el bot si existe contrato
                return;

              }


              // =================================================
              // SI NO HUBO BUY
              // =================================================

              console.log(
                "🔓 NO HUBO CONTRATO → LIBERANDO BOT"
              );


              state.currentContractId =
                null;

              state.running =
                false;

              state.cooldown =
                false;

              state.entrySaved =
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
    // TIMEOUT
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
    // WATCHDOG
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