// ============================================================
// 🧠 INTELLIGENCE ENGINE
// ============================================================
// Motor de inteligencia adaptativa para SYNTHETIC PRO
//
// NO ejecuta operaciones.
// NO llama a Deriv.
// NO modifica RiskManager.
//
// Su trabajo:
//
// 1. Detectar régimen del mercado
// 2. Analizar contexto actual
// 3. Calcular confianza CALL / PUT
// 4. Ajustar el score de Synthetic Pro
// 5. Aprender de los trades cerrados
// ============================================================


class IntelligenceEngine {

    constructor(config = {}) {

        this.config = {

            MIN_CANDLES: 30,

            RECENT_TRADES: 20,

            RECENT_CANDLES: 20,

            MIN_CONFIDENCE: 60,

            STRONG_CONFIDENCE: 75,

            MAX_LEARNING_MEMORY: 200,

            ...config

        };


        // ====================================================
        // MEMORIA DE TRADES
        // ====================================================

        this.tradeHistory = [];


        // ====================================================
        // ESTADÍSTICAS
        // ====================================================

        this.stats = {

            totalTrades: 0,

            wins: 0,

            losses: 0,

            callTrades: 0,

            callWins: 0,

            putTrades: 0,

            putWins: 0

        };


        // ====================================================
        // ÚLTIMO ANÁLISIS
        // ====================================================

        this.lastAnalysis = null;

    }


    // ========================================================
    // UTILIDADES
    // ========================================================

    number(value, fallback = 0) {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;

    }


    clamp(value, min, max) {

        return Math.max(
            min,
            Math.min(max, value)
        );

    }


    // ========================================================
    // 📊 DETECTAR RÉGIMEN DEL MERCADO
    // ========================================================

    detectMarketRegime(candles) {

        if (
            !candles ||
            candles.length < 10
        ) {

            return {
                regime: "UNKNOWN",
                strength: 0
            };

        }


        const recent =
            candles.slice(
                -this.config.RECENT_CANDLES
            );


        let green = 0;
        let red = 0;

        let bullishBody = 0;
        let bearishBody = 0;


        for (const candle of recent) {

            const open =
                this.number(candle.open);

            const close =
                this.number(candle.close);

            if (close > open) {

                green++;

                bullishBody +=
                    Math.abs(
                        close - open
                    );

            }

            else if (close < open) {

                red++;

                bearishBody +=
                    Math.abs(
                        close - open
                    );

            }

        }


        const total =
            green + red;


        if (!total) {

            return {
                regime: "UNKNOWN",
                strength: 0
            };

        }


        const greenPct =
            (green / total) * 100;


        const redPct =
            (red / total) * 100;


        const imbalance =
            Math.abs(
                greenPct -
                redPct
            );


        // ====================================================
        // RANGO
        // ====================================================

        if (imbalance < 15) {

            return {

                regime:
                    "RANGE",

                strength:
                    Number(
                        (100 - imbalance)
                            .toFixed(2)
                    ),

                greenPct,

                redPct

            };

        }


        // ====================================================
        // TENDENCIA ALCISTA
        // ====================================================

        if (
            greenPct >= 65 &&
            bullishBody > bearishBody
        ) {

            return {

                regime:
                    "TREND_UP",

                strength:
                    Number(
                        greenPct.toFixed(2)
                    ),

                greenPct,

                redPct

            };

        }


        // ====================================================
        // TENDENCIA BAJISTA
        // ====================================================

        if (
            redPct >= 65 &&
            bearishBody > bullishBody
        ) {

            return {

                regime:
                    "TREND_DOWN",

                strength:
                    Number(
                        redPct.toFixed(2)
                    ),

                greenPct,

                redPct

            };

        }


        // ====================================================
        // TRANSICIÓN
        // ====================================================

        return {

            regime:
                "TRANSITION",

            strength:
                Number(
                    imbalance.toFixed(2)
                ),

            greenPct,

            redPct

        };

    }


    // ========================================================
    // 📈 VOLATILIDAD
    // ========================================================

    calculateVolatility(candles) {

        if (
            !candles ||
            candles.length < 5
        ) {

            return {

                value: 0,

                averageRange: 0,

                ratio: 0,

                regime: "UNKNOWN"

            };

        }


        const recent =
            candles.slice(-10);


        const ranges =
            recent.map(c => {

                return (
                    this.number(c.high) -
                    this.number(c.low)
                );

            });


        const averageRange =
            ranges.length
                ? ranges.reduce(
                    (a, b) => a + b,
                    0
                ) / ranges.length
                : 0;


        const last5 =
            candles.slice(-5);


        const high =
            Math.max(
                ...last5.map(
                    c => this.number(c.high)
                )
            );


        const low =
            Math.min(
                ...last5.map(
                    c => this.number(c.low)
                )
            );


        const value =
            high - low;


        const ratio =
            averageRange > 0
                ? value / averageRange
                : 0;


        let regime =
            "NORMAL";


        if (ratio < 0.7) {

            regime =
                "LOW";

        }

        else if (ratio > 1.8) {

            regime =
                "HIGH";

        }


        return {

            value,

            averageRange,

            ratio,

            regime

        };

    }


    // ========================================================
    // 🕯️ FUERZA DE ÚLTIMAS VELAS
    // ========================================================

    calculateCandleStrength(candles) {

        const recent =
            candles.slice(-5);


        if (!recent.length) {

            return 0;

        }


        const strengths =
            recent.map(c => {

                const open =
                    this.number(c.open);

                const close =
                    this.number(c.close);

                const high =
                    this.number(c.high);

                const low =
                    this.number(c.low);


                const body =
                    Math.abs(
                        close - open
                    );


                const range =
                    high - low;


                if (range <= 0) {

                    return 0;

                }


                return body / range;

            });


        return Number(

            (
                strengths.reduce(
                    (a, b) => a + b,
                    0
                ) /
                strengths.length

            ).toFixed(4)

        );

    }


    // ========================================================
    // 🧠 RENDIMIENTO RECIENTE
    // ========================================================

    getRecentPerformance() {

        const recent =
            this.tradeHistory.slice(
                -this.config.RECENT_TRADES
            );


        if (!recent.length) {

            return {

                total: 0,

                wins: 0,

                losses: 0,

                winrate: 0,

                callWinrate: 0,

                putWinrate: 0

            };

        }


        const wins =
            recent.filter(
                t => t.result === "win"
            ).length;


        const losses =
            recent.filter(
                t => t.result === "loss"
            ).length;


        const calls =
            recent.filter(
                t => t.signal === "CALL"
            );


        const puts =
            recent.filter(
                t => t.signal === "PUT"
            );


        const callWins =
            calls.filter(
                t => t.result === "win"
            ).length;


        const putWins =
            puts.filter(
                t => t.result === "win"
            ).length;


        return {

            total:
                recent.length,

            wins,

            losses,

            winrate:
                (wins / recent.length) * 100,

            callWinrate:
                calls.length
                    ? (callWins / calls.length) * 100
                    : 0,

            putWinrate:
                puts.length
                    ? (putWins / puts.length) * 100
                    : 0

        };

    }


    // ========================================================
    // 📚 HISTORIAL DEL PATRÓN
    // ========================================================

    getPatternPerformance(pattern) {

        if (!pattern) {

            return null;

        }


        const trades =
            this.tradeHistory.filter(
                t =>
                    t.pattern === pattern
            );


        if (!trades.length) {

            return null;

        }


        const wins =
            trades.filter(
                t => t.result === "win"
            ).length;


        return {

            pattern,

            total:
                trades.length,

            wins,

            losses:
                trades.length - wins,

            winrate:
                (wins / trades.length) * 100

        };

    }


    // ========================================================
    // 🎯 ANALIZAR CONTEXTO
    // ========================================================

    analyze(
        candles,
        strategyResult = {},
        state = {}
    ) {

        if (
            !candles ||
            candles.length < this.config.MIN_CANDLES
        ) {

            return {

                enabled: false,

                confidence: 0,

                signal: null,

                reason:
                    "INSUFFICIENT_CANDLES"

            };

        }


        const regime =
            this.detectMarketRegime(
                candles
            );


        const volatility =
            this.calculateVolatility(
                candles
            );


        const candleStrength =
            this.calculateCandleStrength(
                candles
            );


        const recentPerformance =
            this.getRecentPerformance();


        const patternPerformance =
            this.getPatternPerformance(
                strategyResult.pattern
            );


        // ====================================================
        // SCORES INICIALES
        // ====================================================

        let callScore = 50;
        let putScore = 50;


        const reasons = [];


        // ====================================================
        // RÉGIMEN
        // ====================================================

        if (
            regime.regime ===
            "TREND_UP"
        ) {

            callScore += 15;

            putScore -= 10;

            reasons.push(
                "REGIME_TREND_UP"
            );

        }


        if (
            regime.regime ===
            "TREND_DOWN"
        ) {

            putScore += 15;

            callScore -= 10;

            reasons.push(
                "REGIME_TREND_DOWN"
            );

        }


        if (
            regime.regime ===
            "RANGE"
        ) {

            callScore -= 5;

            putScore -= 5;

            reasons.push(
                "REGIME_RANGE"
            );

        }


        // ====================================================
        // VOLATILIDAD
        // ====================================================

        if (
            volatility.regime ===
            "HIGH"
        ) {

            callScore -= 5;

            putScore -= 5;

            reasons.push(
                "HIGH_VOLATILITY"
            );

        }


        if (
            volatility.regime ===
            "LOW"
        ) {

            callScore -= 10;

            putScore -= 10;

            reasons.push(
                "LOW_VOLATILITY"
            );

        }


        // ====================================================
        // RESULTADO DE SYNTHETIC PRO
        // ====================================================

        if (
            strategyResult.signal ===
            "CALL"
        ) {

            callScore += 15;

            reasons.push(
                "SYNTHETIC_CALL"
            );

        }


        if (
            strategyResult.signal ===
            "PUT"
        ) {

            putScore += 15;

            reasons.push(
                "SYNTHETIC_PUT"
            );

        }


        // ====================================================
        // SCORE DE SYNTHETIC
        // ====================================================

        const baseCall =
            this.number(
                strategyResult.callScore
            );


        const basePut =
            this.number(
                strategyResult.putScore
            );


        if (baseCall > basePut) {

            callScore += 10;

        }


        if (basePut > baseCall) {

            putScore += 10;

        }


        // ====================================================
        // FUERZA
        // ====================================================

        if (
            candleStrength >= 0.75
        ) {

            if (
                regime.regime ===
                "TREND_UP"
            ) {

                callScore += 8;

            }

            if (
                regime.regime ===
                "TREND_DOWN"
            ) {

                putScore += 8;

            }

            reasons.push(
                "STRONG_CANDLES"
            );

        }


        // ====================================================
        // HISTORIAL DEL PATRÓN
        // ====================================================

        if (
            patternPerformance &&
            patternPerformance.total >= 5
        ) {

            if (
                patternPerformance.winrate >= 60
            ) {

                if (
                    strategyResult.signal ===
                    "CALL"
                ) {

                    callScore += 10;

                }

                if (
                    strategyResult.signal ===
                    "PUT"
                ) {

                    putScore += 10;

                }

                reasons.push(
                    "PATTERN_PERFORMING_WELL"
                );

            }


            if (
                patternPerformance.winrate < 45
            ) {

                if (
                    strategyResult.signal ===
                    "CALL"
                ) {

                    callScore -= 10;

                }

                if (
                    strategyResult.signal ===
                    "PUT"
                ) {

                    putScore -= 10;

                }

                reasons.push(
                    "PATTERN_PERFORMING_BADLY"
                );

            }

        }


        // ====================================================
        // APRENDIZAJE RECIENTE CALL
        // ====================================================

        if (
            recentPerformance.total >= 5
        ) {

            if (
                recentPerformance.callWinrate >= 65
            ) {

                callScore += 8;

                reasons.push(
                    "CALL_RECENT_EDGE"
                );

            }


            if (
                recentPerformance.callWinrate < 40
            ) {

                callScore -= 8;

                reasons.push(
                    "CALL_RECENT_WEAK"
                );

            }


            if (
                recentPerformance.putWinrate >= 65
            ) {

                putScore += 8;

                reasons.push(
                    "PUT_RECENT_EDGE"
                );

            }


            if (
                recentPerformance.putWinrate < 40
            ) {

                putScore -= 8;

                reasons.push(
                    "PUT_RECENT_WEAK"
                );

            }

        }


        // ====================================================
        // CLAMP
        // ====================================================

        callScore =
            this.clamp(
                callScore,
                0,
                100
            );


        putScore =
            this.clamp(
                putScore,
                0,
                100
            );


        // ====================================================
        // DECISIÓN
        // ====================================================

        const difference =
            Math.abs(
                callScore -
                putScore
            );


        let signal = null;


        if (
            difference >= 10
        ) {

            signal =
                callScore > putScore
                    ? "CALL"
                    : "PUT";

        }


        const confidence =
            Number(
                Math.max(
                    callScore,
                    putScore
                ).toFixed(2)
            );


        // ====================================================
        // NO OPERAR CON BAJA CONFIANZA
        // ====================================================

        if (
            confidence <
            this.config.MIN_CONFIDENCE
        ) {

            signal = null;

        }


       const approved =
    Boolean(
        strategyResult.signal &&
        signal &&
        strategyResult.signal === signal &&
        confidence >= this.config.MIN_CONFIDENCE
    );


const analysis = {

    enabled: true,

    signal,

    approved,

    confidence,

    syntheticSignal:
        strategyResult.signal ?? null,

    syntheticScore:
        this.number(
            strategyResult.score
        ),

    syntheticCallScore:
        baseCall,

    syntheticPutScore:
        basePut,

            callProbability:
                Number(
                    callScore.toFixed(2)
                ),

            putProbability:
                Number(
                    putScore.toFixed(2)
                ),

            difference,

            regime,

            volatility,

            candleStrength,

            recentPerformance,

            patternPerformance,

            reasons,

            martingale:
                this.number(
                    state.risk?.martingaleStep
                ),

            consecutiveLosses:
                this.number(
                    state.consecutiveLosses
                ),

            timestamp:
                Date.now()

        };


        this.lastAnalysis =
            analysis;


        return analysis;

    }


    // ========================================================
    // 🧠 APRENDER DE TRADE
    // ========================================================

    learn(tradeData = {}) {

        const trade = {

            timestamp:
                Date.now(),

            signal:
                tradeData.signal || null,

            result:
                tradeData.result || null,

            profit:
                this.number(
                    tradeData.profit
                ),

            pattern:
                tradeData.pattern || null,

            score:
                this.number(
                    tradeData.score
                ),

            callScore:
                this.number(
                    tradeData.callScore
                ),

            putScore:
                this.number(
                    tradeData.putScore
                ),

            confidence:
                this.number(
                    tradeData.confidence
                ),

            regime:
                tradeData.regime || null,

            volatility:
                this.number(
                    tradeData.volatility
                ),

            martingale:
                this.number(
                    tradeData.martingale
                )

        };


        this.tradeHistory.push(
            trade
        );


        // ====================================================
        // LIMITAR MEMÓRIA
        // ====================================================

        if (
            this.tradeHistory.length >
            this.config.MAX_LEARNING_MEMORY
        ) {

            this.tradeHistory.shift();

        }


        // ====================================================
        // ESTADÍSTICAS
        // ====================================================

        this.stats.totalTrades++;


        if (
            trade.result === "win"
        ) {

            this.stats.wins++;

        }

        else if (
            trade.result === "loss"
        ) {

            this.stats.losses++;

        }


        if (
            trade.signal === "CALL"
        ) {

            this.stats.callTrades++;

            if (
                trade.result === "win"
            ) {

                this.stats.callWins++;

            }

        }


        if (
            trade.signal === "PUT"
        ) {

            this.stats.putTrades++;

            if (
                trade.result === "win"
            ) {

                this.stats.putWins++;

            }

        }


        console.log(
            "🧠 INTELLIGENCE LEARN:",
            {

                signal:
                    trade.signal,

                result:
                    trade.result,

                pattern:
                    trade.pattern,

                profit:
                    trade.profit,

                confidence:
                    trade.confidence,

                regime:
                    trade.regime

            }
        );


        return this.getStats();

    }


    // ========================================================
    // 📊 ESTADÍSTICAS
    // ========================================================

    getStats() {

        const total =
            this.stats.totalTrades;


        return {

            ...this.stats,

            winrate:
                total
                    ? (
                        this.stats.wins /
                        total
                    ) * 100
                    : 0,

            callWinrate:
                this.stats.callTrades
                    ? (
                        this.stats.callWins /
                        this.stats.callTrades
                    ) * 100
                    : 0,

            putWinrate:
                this.stats.putTrades
                    ? (
                        this.stats.putWins /
                        this.stats.putTrades
                    ) * 100
                    : 0,

            memory:
                this.tradeHistory.length

        };

    }

}


module.exports =    IntelligenceEngine;