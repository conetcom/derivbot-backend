const pool = require("../config/db");


// ============================================================
// 💾 GUARDAR ESTADÍSTICAS INICIALES
// ============================================================

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

        VALUES (

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

            data.analysis?.trend ?? null,

            data.analysis?.bos ?? false,

            data.analysis?.pullback ?? false,

            data.analysis?.momentum ?? false,

            data.analysis?.strength ?? null,

            data.analysis?.volatility ?? null,

            data.analysis?.pattern ?? null,

            data.analysis?.pctGreen ?? 0,

            data.analysis?.pctRed ?? 0,

            data.stake,

            data.martingale,

            data.balanceBefore,

            data.analysis?.callScore ?? 0,

            data.analysis?.putScore ?? 0,

            data.analysis?.sma ?? null

        ]

    );

}


// ============================================================
// 🏁 ACTUALIZAR RESULTADO DEL TRADE
// ============================================================

async function updateTradeStatistics(
    tradeId,
    data
) {

    // ----------------------------------------------------------
    // RESULTADO
    // ----------------------------------------------------------

    const result =
        data.result ??
        data.tradeResult ??
        null;


    // ----------------------------------------------------------
    // VALIDACIÓN
    // ----------------------------------------------------------

    if (
        result !== "win" &&
        result !== "loss"
    ) {

        console.error(
            "❌ RESULTADO INVÁLIDO EN updateTradeStatistics:",
            {

                tradeId,

                result,

                data

            }
        );

        throw new Error(
            `Resultado de trade inválido: ${result}`
        );

    }


    // ----------------------------------------------------------
    // LOG
    // ----------------------------------------------------------

    console.log(
        "💾 ACTUALIZANDO TRADE STATISTICS:",
        {

            tradeId,

            balanceAfter:
                data.balanceAfter,

            result,

            profit:
                data.profit

        }
    );


    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

    const response =
        await pool.query(

            `
            UPDATE trade_statistics

            SET

                balance_after = $1,

                result = $2

            WHERE trade_id = $3

            RETURNING *

            `,

            [

                data.balanceAfter,

                result,

                tradeId

            ]

        );


    // ----------------------------------------------------------
    // VERIFICAR QUE REALMENTE SE ACTUALIZÓ
    // ----------------------------------------------------------

    if (
        response.rowCount === 0
    ) {

        console.error(
            "❌ NO SE ENCONTRÓ trade_statistics PARA trade_id:",
            tradeId
        );

        return null;

    }


    console.log(
        "✅ TRADE STATISTICS ACTUALIZADO:",
        {

            tradeId,

            result,

            balanceAfter:
                data.balanceAfter

        }
    );


    return response.rows[0];

}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

    saveTradeStatistics,

    updateTradeStatistics

};