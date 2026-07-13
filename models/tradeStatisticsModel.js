const pool = require("../config/db");


async function saveTradeStatistics(data) {

    await pool.query(

        `

        INSERT INTO trade_statistics (

            trade_id,

            strategy,

            symbol,

            signal,

            score,

            trend,

            bos,

            pullback,

            momentum,

            strength,

            volatility,

            pattern,

            pct_green,

            pct_red,

            stake,

            martingale,

            balance_before,

            call_score,

            put_score,

            sma

        )

        VALUES(

            $1,$2,$3,$4,$5,

            $6,$7,$8,$9,$10,

            $11,$12,$13,$14,$15,

            $16,$17,$18,$19,$20

        )

        `,

        [

            data.tradeId,

            data.strategy,

            data.symbol,

            data.signal,

            data.score,

            data.analysis.trend,

            data.analysis.bos,

            data.analysis.pullback,

            data.analysis.momentum,

            data.analysis.strength,

            data.analysis.volatility,

            data.analysis.pattern,

            data.analysis.pctGreen,

            data.analysis.pctRed,

            data.stake,

            data.martingale,

            data.balanceBefore,

            data.analysis.callScore,

            data.analysis.putScore,

            data.analysis.sma

        ]

    );

}

module.exports = {

    saveTradeStatistics

};