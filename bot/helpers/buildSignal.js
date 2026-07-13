function buildSignal(data) {

    return {

        signal: data.signal,

        score: data.score,

        strategy: data.strategy,

        analysis: {

            trend: data.trend ?? null,

            bos: data.bos ?? false,

            pullback: data.pullback ?? false,

            momentum: data.momentum ?? false,

            strength: data.strength ?? null,

            volatility: data.volatility ?? null,

            pattern: data.pattern ?? null,

            pctGreen: data.pctGreen ?? null,

            pctRed: data.pctRed ?? null,

            callScore: data.callScore ?? 0,

            putScore: data.putScore ?? 0,

            sma: data.sma ?? null

        }

    };

}

module.exports = buildSignal;