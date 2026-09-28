const pool = require("../config/db");


// ============================================================
// 💾 GUARDAR ESTADÍSTICAS INICIALES
// ============================================================

async function saveTradeStatistics(data) {

    const analysis =
        data.analysis || {};

    const result =
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
                sma,

                ma10_distance,
                ma50_distance,
                ma_distance,
                ma_distance_ratio,
                symmetry_class,

                ma10_slope,
                ma10_slope_direction,
                ma10_slope_acceleration,

                ma50_lateral,
                ma50_slope,

                candle_sequence_direction,
                candle_sequence_count,
                candle_sequence_strength,

                direction_change_detected,
                direction_change_direction,

                entry_type
            )

            VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,$9,$10,
                $11,$12,$13,$14,$15,
                $16,$17,$18,$19,$20,

                $21,$22,$23,$24,$25,
                $26,$27,$28,
                $29,$30,
                $31,$32,$33,
                $34,$35,
                $36
            )

            RETURNING *
            `,
            [

                data.tradeId,

                data.strategy,

                data.symbol,

                data.signal,

                data.score,

                analysis.trend ?? null,

                analysis.bos ?? null,

                analysis.pullback ?? null,

                analysis.momentum ?? null,

                analysis.strength ?? null,

                analysis.volatility ?? null,

                analysis.pattern ?? null,

                analysis.pctGreen ?? null,

                analysis.pctRed ?? null,

                data.stake,

                data.martingale,

                data.balanceBefore,

                analysis.callScore ?? null,

                analysis.putScore ?? null,

                analysis.sma ?? null,


                // ==========================================
                // NUEVA INFORMACIÓN SMA
                // ==========================================

                analysis.ma10Distance ?? null,

                analysis.ma50Distance ?? null,

                analysis.maDistance ?? null,

                analysis.maDistanceRatio ?? null,

                analysis.symmetryClass ?? null,


                analysis.ma10Slope ?? null,

                analysis.ma10SlopeDirection ?? null,

                analysis.ma10SlopeAcceleration ?? null,


                analysis.ma50Lateral ?? null,

                analysis.ma50Slope ?? null,


                analysis.candleSequenceDirection ?? null,

                analysis.candleSequenceCount ?? null,

                analysis.candleSequenceStrength ?? null,


                analysis.directionChangeDetected ?? null,

                analysis.directionChangeDirection ?? null,


                data.entryType ?? null
            ]
        );


    console.log(
        "📊 TRADE STATISTICS SMA:",
        {
            tradeId:
                data.tradeId,

            entryType:
                data.entryType,

            ma10Distance:
                analysis.ma10Distance,

            ma50Distance:
                analysis.ma50Distance,

            maDistance:
                analysis.maDistance,

            ratio:
                analysis.maDistanceRatio,

            symmetry:
                analysis.symmetryClass
        }
    );


    return result.rows[0];
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