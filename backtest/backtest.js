// ============================================================
// backtest.js  -  Simula tu estrategia con velas históricas
// ============================================================
//
// Uso:
//
//   node backtest/backtest.js \
//        --file backtest/data/R_75_60.json \
//        --strategy bot/strategies/smaStrategy.js \
//        --window 100 --duration 1 --payout 0.885
//
// Opciones principales:
//   --file        JSON de fetchCandles.js
//   --strategy    ruta de smaStrategy.js (la MISMA que usa el bot)
//   --window      velas que recibe la estrategia (ventana deslizante).
//                 Usa el valor real de tu bot (log de closedCandles.length)
//   --duration    duración del contrato EN VELAS (1 = una vela)
//   --payout      ganancia por unidad apostada si gana (0.885 = 88.5%)
//   --from/--to   filtro de fechas (YYYY-MM-DD)
//   --balance     balance inicial para simular martingala   (1000)
//   --base-pct    % del balance como apuesta base           (0.157)
//   --max-level   nivel máximo de martingala                (7)
//   --no-martingale  solo estadísticas de apuesta fija
//   --control N   corre N series ALEATORIAS (mismas velas barajadas) y
//                 compara: si la estrategia "gana" igual en el azar,
//                 el resultado real es ruido
//   --csv         archivo de salida con cada operación
//
// Supuestos (iguales a los de Deriv rise/fall):
//   - La señal sale con la vela i ya CERRADA; entrada ~ cierre de i.
//   - Salida = cierre de la vela i+duration.
//   - CALL gana si salida > entrada, PUT si salida < entrada.
//     Empate = pérdida.
//   - Una operación a la vez: mientras hay una abierta no se llama
//     a la estrategia (como hace tu bot).
//
// ============================================================

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {

    const args = {};

    for (let i = 2; i < argv.length; i++) {

        if (argv[i].startsWith("--")) {

            const key = argv[i].slice(2);
            const next = argv[i + 1];

            if (next === undefined || next.startsWith("--")) {
                args[key] = true;
            } else {
                args[key] = next;
                i++;
            }
        }
    }

    return args;
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

function wilson(w, n, z = 1.96) {

    if (!n) return [0, 0];

    const p = w / n;
    const den = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / den;
    const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;

    return [c - h, c + h];
}

function mulberry32(seed) {

    let a = seed >>> 0;

    return function () {

        a |= 0; a = (a + 0x6D2B79F5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function loadStrategy(file) {

    const mod = require(path.resolve(file));

    const fn =
        typeof mod === "function"
            ? mod
            : (mod.smaStrategy || mod.handler);

    if (typeof fn !== "function") {

        throw new Error(`No encuentro la función de estrategia en ${file}`);
    }

    return fn;
}

// ------------------------------------------------------------
// Simulación de señales
// ------------------------------------------------------------

function runSignals(candles, strategy, { window, duration }) {

    const trades = [];
    const state = {};

    let i = window - 1;

    while (i + duration < candles.length) {

        const slice = candles.slice(i - window + 1, i + 1);

        // Seguridad anti-"mirar el futuro"
        if (slice[slice.length - 1] !== candles[i]) {

            throw new Error("La ventana incluye velas futuras");
        }

        let result;

        try {

            result = strategy(slice, state);

        } catch (error) {

            throw new Error(`La estrategia falló en la vela ${i}: ${error.message}`);
        }

        if (result && result.signal) {

            const entry = candles[i].close;
            const exit = candles[i + duration].close;

            const win =
                result.signal === "CALL"
                    ? exit > entry
                    : exit < entry;

            const a = result.analysis || {};

            trades.push({

                index: i,
                epoch: candles[i].epoch,
                signal: result.signal,
                entryType: result.entryType || "(sin entryType)",
                score: result.score,
                counterTrend: result.counterTrend ?? null,
                regime: a.marketRegime ?? null,
                ratio: a.maDistanceRatio ?? null,
                symmetryClass: a.symmetryClass ?? null,
                ma50Slope: a.ma50Slope ?? null,
                entry,
                exit,
                win
            });

            // Operación abierta: no se consulta la estrategia
            i += duration;

        } else {

            i += 1;
        }
    }

    return trades;
}

// ------------------------------------------------------------
// Estadísticas
// ------------------------------------------------------------

function summarize(trades, payout) {

    const n = trades.length;
    const w = trades.filter(t => t.win).length;

    const be = 1 / (1 + payout);
    const [lo, hi] = wilson(w, n);

    const z = n
        ? (w / n - be) / Math.sqrt(be * (1 - be) / n)
        : 0;

    let streak = 0;
    let maxStreak = 0;

    for (const t of trades) {

        streak = t.win ? 0 : streak + 1;
        maxStreak = Math.max(maxStreak, streak);
    }

    return {

        n,
        wins: w,
        winRate: n ? w / n : 0,
        lo, hi,
        breakeven: be,
        z,
        flatUnits: w * payout - (n - w),
        evPerStake: n ? (w * payout - (n - w)) / n : 0,
        maxLossStreak: maxStreak
    };
}

function simulateMartingale(trades, {
    payout, balance, basePct, maxLevel
}) {

    let bal = balance;
    let peak = bal;
    let maxDd = 0;
    let level = 0;
    let base = 0;
    let maxLevelReached = 0;
    let ruined = false;

    const curve = [bal];

    for (const t of trades) {

        if (level === 0) base = bal * basePct / 100;

        const stake = base * Math.pow(2, level);

        if (stake > bal) {

            ruined = true;
            break;
        }

        maxLevelReached = Math.max(maxLevelReached, level);

        if (t.win) {

            bal += stake * payout;
            level = 0;

        } else {

            bal -= stake;
            level = level >= maxLevel ? 0 : level + 1;
        }

        peak = Math.max(peak, bal);
        maxDd = Math.max(maxDd, (peak - bal) / peak);

        curve.push(bal);
    }

    return {

        finalBalance: bal,
        returnPct: (bal / balance - 1) * 100,
        maxDrawdownPct: maxDd * 100,
        maxLevelReached,
        ruined
    };
}

function groupTable(trades, key, payout, title) {

    const groups = {};

    for (const t of trades) {

        const k = String(t[key]);

        (groups[k] = groups[k] || []).push(t);
    }

    console.log(`\n-- ${title}`);

    for (const [k, list] of Object.entries(groups).sort()) {

        const s = summarize(list, payout);

        console.log(
            `   ${k.padEnd(26)} n=${String(s.n).padStart(5)}  ` +
            `acierto=${(s.winRate * 100).toFixed(1).padStart(5)}%  ` +
            `IC95=[${(s.lo * 100).toFixed(1)}, ${(s.hi * 100).toFixed(1)}]  ` +
            `EV=${s.evPerStake >= 0 ? "+" : ""}${s.evPerStake.toFixed(3)}`
        );
    }
}

// ------------------------------------------------------------
// Control aleatorio: baraja las FORMAS de vela
// ------------------------------------------------------------

function shuffledCandles(candles, seed) {

    const rnd = mulberry32(seed);

    const shapes = candles.map(c => ({

        dc: c.close - c.open,
        dh: c.high - c.open,
        dl: c.low - c.open
    }));

    for (let i = shapes.length - 1; i > 0; i--) {

        const j = Math.floor(rnd() * (i + 1));

        [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
    }

    const out = [];

    let prevClose = candles[0].open;

    for (let i = 0; i < shapes.length; i++) {

        const open = prevClose;
        const s = shapes[i];

        out.push({

            epoch: candles[i].epoch,
            open,
            high: open + s.dh,
            low: open + s.dl,
            close: open + s.dc
        });

        prevClose = open + s.dc;
    }

    return out;
}

// ------------------------------------------------------------
// Programa principal
// ------------------------------------------------------------

function main() {

    const args = parseArgs(process.argv);

    if (!args.file || !args.strategy) {

        console.error(
            "Uso: node backtest.js --file velas.json --strategy ruta/smaStrategy.js " +
            "[--window 100] [--duration 1] [--payout 0.885] [--control 20]"
        );

        process.exit(1);
    }

    const window = Number(args.window || 100);
    const duration = Number(args.duration || 1);
    const payout = Number(args.payout || 0.885);
    const balance = Number(args.balance || 1000);
    const basePct = Number(args["base-pct"] || 0.157);
    const maxLevel = Number(args["max-level"] || 7);

    const raw = JSON.parse(fs.readFileSync(args.file, "utf8"));

    let candles = raw.candles || raw;

    if (args.from) {

        const t = Date.parse(args.from) / 1000;
        candles = candles.filter(c => c.epoch >= t);
    }

    if (args.to) {

        const t = Date.parse(args.to) / 1000 + 86400;
        candles = candles.filter(c => c.epoch < t);
    }

    if (candles.length < window + duration + 10) {

        console.error("Muy pocas velas para esta ventana.");
        process.exit(1);
    }

    const strategy = loadStrategy(args.strategy);

    console.log("=".repeat(64));
    console.log(` BACKTEST  ${raw.symbol || ""}  velas=${candles.length}  ventana=${window}  duración=${duration} vela(s)`);
    console.log(` desde ${new Date(candles[0].epoch * 1000).toISOString()}`);
    console.log(` hasta ${new Date(candles[candles.length - 1].epoch * 1000).toISOString()}`);
    console.log("=".repeat(64));

    const t0 = Date.now();

    const trades = runSignals(candles, strategy, { window, duration });

    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    const s = summarize(trades, payout);

    console.log(`\nOperaciones: ${s.n}   (calculado en ${secs}s)`);

    if (!s.n) {

        console.log("La estrategia no generó señales en este periodo.");
        return;
    }

    console.log(
        `Aciertos:    ${s.wins}/${s.n} = ${(s.winRate * 100).toFixed(1)}%   ` +
        `IC95 [${(s.lo * 100).toFixed(1)}%, ${(s.hi * 100).toFixed(1)}%]`
    );
    console.log(`Equilibrio:  ${(s.breakeven * 100).toFixed(1)}%   (z = ${s.z.toFixed(2)})`);
    console.log(
        `Apuesta fija: ${s.flatUnits >= 0 ? "+" : ""}${s.flatUnits.toFixed(1)} unidades  ` +
        `(${s.evPerStake >= 0 ? "+" : ""}${s.evPerStake.toFixed(3)} por operación)`
    );
    console.log(`Racha perdedora máxima: ${s.maxLossStreak}`);

    if (!args["no-martingale"]) {

        const m = simulateMartingale(trades, { payout, balance, basePct, maxLevel });

        console.log(
            `\nMartingala (base ${basePct}%, máx. nivel ${maxLevel}) desde ${balance}:\n` +
            `   balance final ${m.finalBalance.toFixed(2)}  (${m.returnPct >= 0 ? "+" : ""}${m.returnPct.toFixed(1)}%)\n` +
            `   drawdown máximo ${m.maxDrawdownPct.toFixed(1)}%   nivel máximo ${m.maxLevelReached}` +
            (m.ruined ? "   ⚠️ CUENTA QUEBRADA" : "")
        );
    }

    groupTable(trades, "entryType", payout, "Por tipo de entrada");
    groupTable(trades, "signal", payout, "Por señal");
    groupTable(trades, "regime", payout, "Por régimen de mercado");
    groupTable(trades, "symmetryClass", payout, "Por clase de simetría");

    // ---------- CSV ----------

    if (args.csv) {

        const cols = Object.keys(trades[0]);

        const lines = [cols.join(",")].concat(
            trades.map(t =>
                cols.map(c =>
                    c === "epoch"
                        ? new Date(t[c] * 1000).toISOString()
                        : t[c]
                ).join(",")
            )
        );

        fs.writeFileSync(args.csv, lines.join("\n"));

        console.log(`\nOperaciones guardadas en ${args.csv}`);
    }

    // ---------- CONTROL ALEATORIO ----------

    const controlRuns = Number(args.control || 0);

    if (controlRuns > 0) {

        console.log(`\n== CONTROL: ${controlRuns} series aleatorias (velas barajadas) ==`);

        const rates = [];
        const counts = [];

        for (let r = 0; r < controlRuns; r++) {

            const fake = shuffledCandles(candles, 1000 + r);

            const ct = runSignals(fake, strategy, { window, duration });

            const cs = summarize(ct, payout);

            rates.push(cs.winRate);
            counts.push(cs.n);

            process.stdout.write(`   ${r + 1}/${controlRuns}  acierto=${(cs.winRate * 100).toFixed(1)}%  n=${cs.n}\r`);
        }

        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        const sorted = [...rates].sort((a, b) => a - b);
        const geReal = rates.filter(x => x >= s.winRate).length;

        console.log(
            `\n   acierto en azar: media ${(mean * 100).toFixed(1)}%  ` +
            `mín ${(sorted[0] * 100).toFixed(1)}%  máx ${(sorted[sorted.length - 1] * 100).toFixed(1)}%`
        );
        console.log(
            `   series al azar con acierto >= el real (${(s.winRate * 100).toFixed(1)}%): ` +
            `${geReal}/${controlRuns}`
        );
        console.log(
            "   Lectura: si el resultado real está dentro del rango del azar, " +
            "no se distingue de la suerte."
        );
    }

    console.log("\nAviso: un backtest en datos usados para ajustar parámetros es optimista. " +
        "Valida con un periodo que NO hayas usado para decidir.");
}

module.exports = { runSignals, summarize, simulateMartingale, shuffledCandles };

if (require.main === module) main();
