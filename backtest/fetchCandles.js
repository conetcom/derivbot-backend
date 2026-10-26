// ============================================================
// fetchCandles.js  -  Descarga velas históricas de Deriv
// ============================================================
//
// Uso (desde /root/derivbot-backend, donde ya existe `ws`):
//
//   node backtest/fetchCandles.js --symbol R_75 --granularity 60 --days 30 \
//        --out backtest/data/R_75_60.json
//
// Opciones:
//   --symbol       R_75, R_100, etc.                (por defecto R_75)
//   --granularity  segundos por vela: 60, 120, 180, 300... (por defecto 60)
//   --days         cuántos días hacia atrás          (por defecto 30)
//   --out          archivo de salida JSON
//   --url          WebSocket de Deriv. Usa el MISMO que tu bot
//                  (míralo en services/derivService.js)
//   --app-id       app_id si tu URL lo necesita      (por defecto 1089)
//
// Los datos de mercado son públicos: NO necesitas token.
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------
// Lógica de paginación (recibe `send`, por eso es testeable
// sin red)
// ------------------------------------------------------------

async function fetchAll({
    send,
    symbol,
    granularity,
    days,
    chunk = 5000,
    nowEpoch = Math.floor(Date.now() / 1000),
    pauseMs = 250,
    onProgress = () => {}
}) {

    const startEpoch = nowEpoch - days * 86400;

    const byEpoch = new Map();

    let end = "latest";
    let guard = 0;

    while (guard++ < 500) {

        const res = await send({

            ticks_history: symbol,
            adjust_start_time: 1,
            count: chunk,
            end,
            granularity,
            style: "candles"
        });

        if (res.error) {

            throw new Error(
                `Deriv: ${res.error.code} - ${res.error.message}`
            );
        }

        const candles = res.candles || [];

        if (!candles.length) break;

        let added = 0;

        for (const c of candles) {

            if (!byEpoch.has(c.epoch)) {

                byEpoch.set(c.epoch, c);
                added++;
            }
        }

        const oldest = candles[0].epoch;

        onProgress({
            total: byEpoch.size,
            oldest,
            added
        });

        if (oldest <= startEpoch) break;

        // Sin velas nuevas = no hay más historial
        if (added === 0) break;

        end = oldest - 1;

        await sleep(pauseMs);
    }

    let list = [...byEpoch.values()]
        .sort((a, b) => a.epoch - b.epoch)
        .filter(c => c.epoch >= startEpoch);

    // La última vela puede estar formándose: se descarta
    const last = list[list.length - 1];

    if (last && last.epoch + granularity > nowEpoch) {

        list = list.slice(0, -1);
    }

    return list.map(c => ({

        epoch: Number(c.epoch),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close)
    }));
}

// ------------------------------------------------------------
// Cliente WebSocket mínimo
// ------------------------------------------------------------

function createClient(url) {

    let WS;

    try {
        WS = require("ws");
    } catch (e) {
        WS = global.WebSocket;
    }

    if (!WS) {

        throw new Error(
            "No hay librería WebSocket. Ejecuta el script desde la " +
            "carpeta del backend (donde está node_modules/ws)."
        );
    }

    const socket = new WS(url);

    let reqId = 0;
    const pending = new Map();

    const onMessage = raw => {

        const text = typeof raw === "string"
            ? raw
            : (raw && raw.data ? raw.data : raw.toString());

        let msg;

        try { msg = JSON.parse(text); } catch (e) { return; }

        const waiter = pending.get(msg.req_id);

        if (waiter) {

            pending.delete(msg.req_id);
            waiter(msg);
        }
    };

    if (socket.on) socket.on("message", onMessage);
    else socket.onmessage = onMessage;

    const ready = new Promise((resolve, reject) => {

        if (socket.on) {
            socket.on("open", resolve);
            socket.on("error", reject);
        } else {
            socket.onopen = resolve;
            socket.onerror = reject;
        }
    });

    return {

        ready,

        send(request) {

            return new Promise((resolve, reject) => {

                const id = ++reqId;

                const timer = setTimeout(() => {

                    pending.delete(id);
                    reject(new Error("Timeout esperando a Deriv"));

                }, 30000);

                pending.set(id, msg => {

                    clearTimeout(timer);
                    resolve(msg);
                });

                socket.send(JSON.stringify({ ...request, req_id: id }));
            });
        },

        close() { try { socket.close(); } catch (e) {} }
    };
}


async function main() {
    const args = parseArgs(process.argv);

    const symbol = args.symbol || "R_75";
    const granularity = Number(args.granularity || 60);
    const days = Number(args.days || 30);

    if (!Number.isInteger(granularity) || granularity <= 0) {
        throw new Error("La granularidad debe ser un entero positivo.");
    }

    if (!Number.isFinite(days) || days <= 0) {
        throw new Error("El número de días debe ser mayor que cero.");
    }

    const out =
        args.out ||
        path.join(
            "backtest",
            "data",
            `${symbol}_${granularity}.json`
        );

    const appId = args["app-id"] || "1089";

    // WebSocket público de Deriv: no requiere token para velas públicas.
    const url =
    args.url ||
    "wss://api.derivws.com/trading/v1/options/ws/public";

    console.log("Conectando al WebSocket público de Deriv...");
    console.log("Símbolo:", symbol);
    console.log("Granularidad:", granularity);
    console.log("Días:", days);

    const client = createClient(url);

    try {
        await client.ready;

        console.log("✅ WebSocket conectado.");

        const candles = await fetchAll({
            send: client.send,
            symbol,
            granularity,
            days,

            onProgress: p => {
                console.log(
                    `Velas recibidas: ${p.total} | ` +
                    `más antigua: ${new Date(
                        p.oldest * 1000
                    ).toISOString()}`
                );
            }
        });

        if (!candles.length) {
            throw new Error(
                "Deriv no devolvió velas para el símbolo y período solicitados."
            );
        }

        fs.mkdirSync(path.dirname(out), {
            recursive: true
        });

        fs.writeFileSync(
            out,
            JSON.stringify({
                symbol,
                granularity,
                candles
            }, null, 2),
            "utf8"
        );

        console.log(`\n✅ Descarga completada: ${candles.length} velas`);
        console.log("Archivo:", path.resolve(out));
        console.log(
            "Desde:",
            new Date(candles[0].epoch * 1000).toISOString()
        );
        console.log(
            "Hasta:",
            new Date(
                candles[candles.length - 1].epoch * 1000
            ).toISOString()
        );
    } finally {
        client.close();
    }
}


module.exports = { fetchAll, parseArgs };

if (require.main === module) {

    main().catch(error => {

        console.error("❌", error.message);
        process.exit(1);
    });
}
