function buildSignal(data = {}) {

    return {

        // ==============================
        // RESULTADO PRINCIPAL
        // ==============================

        signal: data.signal ?? null,

        score: Number(data.score) || 0,

        strategy: data.strategy ?? null,


        // ==============================
        // DATOS PRINCIPALES PARA ENGINE
        // ==============================

        callScore: Number(data.callScore) || 0,

        putScore: Number(data.putScore) || 0,

        pattern: data.pattern ?? null,

        pctGreen: Number(data.pctGreen) || 0,

        pctRed: Number(data.pctRed) || 0,

        total: Number(
            data.total ??
            data.historyTotal ??
            0
        ) || 0,

        historyEdge: Number(data.historyEdge) || 0,

        historyDirection: data.historyDirection ?? null,


        // ==============================
        // ANÁLISIS COMPLETO
        // ==============================

        analysis: {

            trend: data.trend ?? null,

            bos: data.bos ?? false,

            pullback: data.pullback ?? false,

            momentum: data.momentum ?? false,

            strength: data.strength ?? null,

            volatility: data.volatility ?? null,

            pattern: data.pattern ?? null,

            pctGreen: Number(data.pctGreen) || 0,

            pctRed: Number(data.pctRed) || 0,

            callScore: Number(data.callScore) || 0,

            putScore: Number(data.putScore) || 0,

            total: Number(
                data.total ??
                data.historyTotal ??
                0
            ) || 0,

            historyEdge: Number(data.historyEdge) || 0,

            historyDirection: data.historyDirection ?? null,

            sma: data.sma ?? null

        }

    };
}

module.exports = buildSignal;

