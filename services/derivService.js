const WebSocket = require("ws");
const axios = require("axios");

class DerivService {

    constructor(config = {}) {

        this.token =
            config.token;

        this.accountId =
            config.accountId;

        // ==========================================
        // WEBSOCKET
        // ==========================================

        this.ws = null;

        this.isConnected = false;

        this.connecting = false;

        this.manualDisconnect = false;

        // ==========================================
        // REQUESTS
        // ==========================================

        this.requestId = 1;

        this.pendingRequests =
            new Map();

        // ==========================================
        // TICKS
        //
        // subId -> {
        //    symbol,
        //    callback
        // }
        // ==========================================

        this.subscriptions =
            new Map();

        // ==========================================
        // CONTRATOS
        //
        // contractId -> {
        //    callback,
        //    subId
        // }
        // ==========================================

        this.contractSubscriptions =
            new Map();

        // ==========================================
        // subscriptionId -> contractId
        // ==========================================

        this.subscriptionMap =
            new Map();

        // ==========================================
        // RECONEXIÓN
        // ==========================================

        this.reconnectAttempts = 0;

        this.maxReconnects = 10;

        this.reconnectTimer = null;

        this.reconnectScheduled = false;

        // ==========================================
        // PING
        // ==========================================

        this.pingInterval = null;

    }


    // =========================================================
    // OBTENER URL WEBSOCKET MEDIANTE OTP
    // =========================================================

    async getWebSocketUrl() {

        const cleanAccountId =
            String(
                this.accountId
            ).trim();

        try {

            console.log(
                "🔐 Solicitando OTP WebSocket a Deriv..."
            );

            const response =
                await axios.post(

                    `https://api.derivws.com/trading/v1/options/accounts/${cleanAccountId}/otp`,

                    {},

                    {
                        headers: {

                            Authorization:
                                `Bearer ${this.token}`,

                            "Deriv-App-ID":
                                process.env.DERIV_APP_ID

                        }

                    }

                );

            const wsUrl =
                response.data?.data?.url;

            if (!wsUrl) {

                const error =
                    new Error(
                        "Deriv no devolvió una URL WebSocket"
                    );

                error.code =
                    "DERIV_WS_URL_MISSING";

                throw error;
            }

            console.log(
                "✅ OTP WebSocket obtenido"
            );

            return wsUrl;

        } catch (err) {

            console.error(
                "❌ ERROR OBTENIENDO OTP DERIV"
            );

            console.error(
                "STATUS:",
                err.response?.status
            );

            console.error(
                "DATA:",
                JSON.stringify(
                    err.response?.data,
                    null,
                    2
                )
            );

            console.error(
                "MESSAGE:",
                err.message
            );

            // ==========================================
            // TOKEN INVÁLIDO / EXPIRADO
            // ==========================================

            if (
                err.response?.status === 401
            ) {

                const tokenError =
                    new Error(
                        "El token de Deriv no es válido o ha expirado"
                    );

                tokenError.code =
                    "DERIV_TOKEN_INVALID";

                tokenError.status =
                    401;

                throw tokenError;
            }

            throw err;
        }

    }


    // =========================================================
    // CONNECT
    // =========================================================

    async connect() {

        // ==========================================
        // YA CONECTADO
        // ==========================================

        if (this.isConnected) {

            console.log(
                "ℹ️ DerivService ya está conectado"
            );

            return;
        }

        // ==========================================
        // YA CONECTANDO
        // ==========================================

        if (this.connecting) {

            console.log(
                "⏳ DerivService ya está conectando"
            );

            return;
        }

        this.connecting = true;

        this.manualDisconnect = false;

        // ==========================================
        // CANCELAR TIMER DE RECONEXIÓN
        // ==========================================

        if (this.reconnectTimer) {

            clearTimeout(
                this.reconnectTimer
            );

            this.reconnectTimer = null;

        }

        this.reconnectScheduled =
            false;

        try {

            // ==========================================
            // OBTENER NUEVO OTP
            // ==========================================

            const wsUrl =
                await this.getWebSocketUrl();

            console.log(
                "🌐 Creando WebSocket Deriv..."
            );

            // ==========================================
            // CREAR WS
            // ==========================================

            this.ws =
                new WebSocket(
                    wsUrl
                );

            // ==========================================
            // ESPERAR OPEN
            // ==========================================

            await new Promise(
                (resolve, reject) => {

                    let settled = false;

                    // ======================================
                    // OPEN
                    // ======================================

                    this.ws.on(
                        "open",
                        () => {

                            console.log(
                                "========================================"
                            );

                            console.log(
                                "✅ WEBSOCKET DERIV CONECTADO"
                            );

                            console.log(
                                "Account:",
                                this.accountId
                            );

                            console.log(
                                "========================================"
                            );

                            this.isConnected =
                                true;

                            this.connecting =
                                false;

                            // ==================================
                            // PING
                            // ==================================

                            this.startPing();

                            if (!settled) {

                                settled =
                                    true;

                                resolve();

                            }

                        }
                    );


                    // ======================================
                    // PONG
                    // ======================================

                    this.ws.on(
                        "pong",
                        () => {

                            console.log(
                                "💚 WS PONG"
                            );

                        }
                    );


                    // ======================================
                    // MESSAGE
                    // ======================================

                    this.ws.on(
                        "message",
                        (msg) => {

                            try {

                                const data =
                                    JSON.parse(
                                        msg
                                    );

                                // ==================================
                                // ERROR DEVUELTO POR DERIV
                                // ==================================

                                if (
                                    data.error
                                ) {

                                    console.error(
                                        "❌ DERIV WS ERROR:",
                                        data.error
                                    );

                                    if (
                                        data.req_id
                                    ) {

                                        const pending =
                                            this.pendingRequests.get(
                                                data.req_id
                                            );

                                        if (pending) {

                                            this.pendingRequests.delete(
                                                data.req_id
                                            );

                                            const error =
                                                new Error(
                                                    data.error.message ||
                                                    "Error de Deriv"
                                                );

                                            error.code =
                                                data.error.code;

                                            error.derivError =
                                                data.error;

                                            pending.reject(
                                                error
                                            );

                                        }

                                    }

                                    return;
                                }


                                // ==================================
                                // RESPUESTAS A REQUESTS
                                // ==================================

                                if (
                                    data.req_id
                                ) {

                                    const pending =
                                        this.pendingRequests.get(
                                            data.req_id
                                        );

                                    if (pending) {

                                        this.pendingRequests.delete(
                                            data.req_id
                                        );

                                        pending.resolve(
                                            data
                                        );

                                    }

                                }


                                // ==================================
                                // TICKS
                                // ==================================

                                if (
                                    data.tick &&
                                    data.subscription?.id
                                ) {

                                    const sub =
                                        this.subscriptions.get(
                                            data.subscription.id
                                        );

                                    if (!sub) {

                                        return;
                                    }

                                    const {
                                        quote: price,
                                        epoch
                                    } =
                                        data.tick;

                                    // ==================================
                                    // NUEVO FORMATO
                                    // ==================================

                                    if (
                                        typeof sub ===
                                        "object" &&
                                        sub.callback
                                    ) {

                                        sub.callback({

                                            price,

                                            epoch

                                        });

                                    }

                                    // ==================================
                                    // COMPATIBILIDAD CON FORMATO ANTIGUO
                                    // ==================================

                                    else if (
                                        typeof sub ===
                                        "function"
                                    ) {

                                        sub({

                                            price,

                                            epoch

                                        });

                                    }

                                    return;
                                }


                                // ==================================
                                // CONTRATOS ABIERTOS
                                // ==================================

                                if (
                                    data.proposal_open_contract &&
                                    data.subscription?.id
                                ) {

                                    const contractId =
                                        this.subscriptionMap.get(
                                            data.subscription.id
                                        );

                                    if (
                                        !contractId
                                    ) {

                                        return;
                                    }

                                    const sub =
                                        this.contractSubscriptions.get(
                                            contractId
                                        );

                                    if (!sub) {

                                        return;
                                    }

                                    const c =
                                        data.proposal_open_contract;

                                    sub.callback({

                                        contractId:
                                            c.contract_id,

                                        profit:
                                            Number(
                                                c.profit
                                            ),

                                        status:
                                            c.status,

                                        isSold:
                                            Boolean(
                                                c.is_sold
                                            ),

                                        entryPrice:
                                            c.entry_tick ??
                                            c.entry_spot ??
                                            c.buy_price,

                                        currentSpot:
                                            c.current_spot,

                                        exitSpot:
                                            c.exit_tick,

                                        dateStart:
                                            c.date_start,

                                        dateExpiry:
                                            c.date_expiry

                                    });

                                }

                            } catch (err) {

                                console.error(
                                    "❌ WS PARSE ERROR:",
                                    err.message
                                );

                            }

                        }
                    );


                    // ======================================
                    // ERROR
                    // ======================================

                    this.ws.on(
                        "error",
                        (err) => {

                            console.error(
                                "❌ WS ERROR:",
                                err.message
                            );

                            console.error(
                                "WS CODE:",
                                err.code
                            );

                            if (!settled) {

                                settled =
                                    true;

                                reject(
                                    err
                                );

                            }

                        }
                    );


                    // ======================================
                    // CLOSE
                    // ======================================

                    this.ws.on(
                        "close",
                        (code, reason) => {

                            console.log(
                                "========================================"
                            );

                            console.log(
                                "🔴 WS CLOSE"
                            );

                            console.log(
                                "Code:",
                                code
                            );

                            console.log(
                                "Reason:",
                                reason?.toString() ||
                                "Sin razón"
                            );

                            console.log(
                                "Connected BEFORE:",
                                this.isConnected
                            );

                            console.log(
                                "Time:",
                                new Date().toISOString()
                            );

                            console.log(
                                "========================================"
                            );


                            // ==================================
                            // ESTADO
                            // ==================================

                            this.isConnected =
                                false;

                            this.connecting =
                                false;


                            // ==================================
                            // PING
                            // ==================================

                            this.stopPing();


                            // ==================================
                            // REQUESTS PENDIENTES
                            // ==================================

                            for (
                                const pending
                                of this.pendingRequests.values()
                            ) {

                                pending.reject(
                                    new Error(
                                        `WebSocket cerrado. Code: ${code}`
                                    )
                                );

                            }

                            this.pendingRequests.clear();


                            // ==================================
                            // SI ESTABA CONECTANDO
                            // ==================================

                            if (!settled) {

                                settled =
                                    true;

                                reject(
                                    new Error(
                                        `WebSocket cerrado durante conexión. Code: ${code}`
                                    )
                                );

                            }


                            // ==================================
                            // RECONEXIÓN AUTOMÁTICA
                            // ==================================

                            if (
                                !this.manualDisconnect
                            ) {

                                console.log(
                                    "🔄 WS cerrado inesperadamente"
                                );

                                console.log(
                                    "🔄 Programando reconexión..."
                                );

                                this.scheduleReconnect();

                            }

                        }
                    );

                }
            );

        } catch (err) {

            this.connecting =
                false;

            this.isConnected =
                false;

            this.stopPing();


            // ==========================================
            // TOKEN INVÁLIDO
            // ==========================================

            if (
                err.code ===
                "DERIV_TOKEN_INVALID"
            ) {

                console.error(
                    "========================================"
                );

                console.error(
                    "🔴🔑 TOKEN DERIV INVÁLIDO O EXPIRADO"
                );

                console.error(
                    "🚫 NO SE REINTENTARÁ CON EL MISMO TOKEN"
                );

                console.error(
                    "========================================"
                );

                throw err;
            }


            // ==========================================
            // ERROR GENERAL
            // ==========================================

            console.error(
                "❌ DERIV CONNECT ERROR"
            );

            console.error(
                "STATUS:",
                err.response?.status
            );

            console.error(
                "DATA:",
                JSON.stringify(
                    err.response?.data,
                    null,
                    2
                )
            );

            console.error(
                "MESSAGE:",
                err.message
            );

            throw err;
        }

    }


    // =========================================================
    // START PING
    // =========================================================

    startPing() {

        this.stopPing();

        this.pingInterval =
            setInterval(
                () => {

                    if (
                        this.ws &&
                        this.ws.readyState ===
                        WebSocket.OPEN
                    ) {

                        try {

                            this.ws.ping();

                            console.log(
                                "💓 WS PING"
                            );

                        } catch (err) {

                            console.error(
                                "❌ WS PING ERROR:",
                                err.message
                            );

                        }

                    }

                },
                30000
            );

    }


    // =========================================================
    // STOP PING
    // =========================================================

    stopPing() {

        if (
            this.pingInterval
        ) {

            clearInterval(
                this.pingInterval
            );

            this.pingInterval =
                null;

        }

    }


    // =========================================================
    // PROGRAMAR RECONEXIÓN
    // =========================================================

    scheduleReconnect() {

        if (
            this.manualDisconnect
        ) {

            return;
        }

        if (
            this.isConnected
        ) {

            return;
        }

        if (
            this.connecting
        ) {

            return;
        }

        if (
            this.reconnectScheduled
        ) {

            return;
        }

        if (
            this.reconnectAttempts >=
            this.maxReconnects
        ) {

            console.error(
                "❌ MÁXIMO DE RECONEXIONES ALCANZADO:",
                this.maxReconnects
            );

            return;
        }


        this.reconnectScheduled =
            true;


        const attempt =
            this.reconnectAttempts + 1;


        const delay =
            Math.min(
                1000 *
                Math.pow(
                    2,
                    attempt - 1
                ),
                30000
            );


        console.log(
            `🔄 RECONEXIÓN ${attempt}/${this.maxReconnects} EN ${delay}ms`
        );


        this.reconnectTimer =
            setTimeout(
                async () => {

                    this.reconnectTimer =
                        null;

                    this.reconnectScheduled =
                        false;

                    await this.reconnect();

                },
                delay
            );

    }


    // =========================================================
    // RECONNECT
    // =========================================================

    async reconnect() {

        if (
            this.manualDisconnect
        ) {

            return;
        }

        if (
            this.isConnected
        ) {

            return;
        }

        if (
            this.connecting
        ) {

            return;
        }

        if (
            this.reconnectAttempts >=
            this.maxReconnects
        ) {

            console.error(
                "❌ Máximo de reconexiones alcanzado"
            );

            return;
        }


        this.reconnectAttempts++;

        const attempt =
            this.reconnectAttempts;


        console.log(
            "========================================"
        );

        console.log(
            `🔄 RECONEXIÓN ${attempt}/${this.maxReconnects}`
        );

        console.log(
            "========================================"
        );


        try {

            // ==========================================
            // NUEVO OTP + NUEVO WEBSOCKET
            // ==========================================

            await this.connect();


            console.log(
                "✅ RECONEXIÓN WS EXITOSA"
            );


            // ==========================================
            // RECUPERAR TICKS
            // ==========================================

            await this.reSubscribeTicks();


            // ==========================================
            // RECUPERAR CONTRATOS
            // ==========================================

            await this.reSubscribeAll();


            console.log(
                "========================================"
            );

            console.log(
                "✅ RECONEXIÓN COMPLETAMENTE RECUPERADA"
            );

            console.log(
                "========================================"
            );


            // ==========================================
            // RESET CONTADOR
            // ==========================================

            this.reconnectAttempts =
                0;


        } catch (err) {

            console.error(
                "❌ ERROR EN RECONEXIÓN:",
                err.message
            );


            // ==========================================
            // TOKEN INVÁLIDO
            // ==========================================

            if (
                err.code ===
                "DERIV_TOKEN_INVALID"
            ) {

                console.error(
                    "========================================"
                );

                console.error(
                    "🔴 TOKEN DERIV INVÁLIDO / EXPIRADO"
                );

                console.error(
                    "🚫 RECONEXIÓN DETENIDA"
                );

                console.error(
                    "========================================"
                );

                return;
            }


            // ==========================================
            // ASEGURAR ESTADO
            // ==========================================

            this.isConnected =
                false;

            this.connecting =
                false;


            // ==========================================
            // OTRO INTENTO
            // ==========================================

            this.scheduleReconnect();

        }

    }


    // =========================================================
    // BALANCE
    // =========================================================

    async getBalance() {

        const res =
            await this.send({
                balance: 1
            });

        return res.balance;

    }


    // =========================================================
    // CONTRACT
    // =========================================================

    async getContract(
        contractId
    ) {

        const res =
            await this.send({

                proposal_open_contract:
                    1,

                contract_id:
                    contractId

            });

        return res.proposal_open_contract;

    }


    // =========================================================
    // SUBSCRIBE TICKS
    // =========================================================

    async subscribeTicks(
        symbol,
        callback
    ) {

        if (
            !this.isConnected
        ) {

            throw new Error(
                "WebSocket no conectado"
            );

        }


        const res =
            await this.send({

                ticks:
                    symbol,

                subscribe:
                    1

            });


        if (
            !res.subscription?.id
        ) {

            throw new Error(
                "No se recibió subscription.id"
            );

        }


        const subId =
            res.subscription.id;


        // ==========================================
        // GUARDAR INFORMACIÓN PARA RECONEXIÓN
        // ==========================================

        this.subscriptions.set(
            subId,
            {

                symbol,

                callback

            }
        );


        console.log(
            "📡 Tick suscrito:",
            symbol,
            "Sub:",
            subId
        );


        return subId;

    }


    // =========================================================
    // RE-SUBSCRIBE TICKS
    // =========================================================

    async reSubscribeTicks() {

        console.log(
            "🔁 Re-suscribiendo ticks..."
        );


        // ==========================================
        // COPIAR SUSCRIPCIONES
        // ==========================================

        const subscriptions =
            Array.from(
                this.subscriptions.values()
            );


        // ==========================================
        // LIMPIAR IDs VIEJOS
        // ==========================================

        this.subscriptions.clear();


        // ==========================================
        // RECUPERAR CADA TICK
        // ==========================================

        for (
            const sub
            of subscriptions
        ) {

            try {

                if (
                    !sub ||
                    !sub.symbol ||
                    !sub.callback
                ) {

                    continue;
                }


                console.log(
                    "🔄 Recuperando tick:",
                    sub.symbol
                );


                const res =
                    await this.send({

                        ticks:
                            sub.symbol,

                        subscribe:
                            1

                    });


                if (
                    !res.subscription?.id
                ) {

                    console.error(
                        "❌ No se recibió nuevo subscription.id:",
                        sub.symbol
                    );

                    continue;
                }


                const newSubId =
                    res.subscription.id;


                this.subscriptions.set(
                    newSubId,
                    {

                        symbol:
                            sub.symbol,

                        callback:
                            sub.callback

                    }
                );


                console.log(
                    "✅ Tick re-suscrito:",
                    sub.symbol,
                    "Nuevo Sub:",
                    newSubId
                );


            } catch (err) {

                console.error(
                    "❌ Error re-suscribiendo tick:",
                    sub.symbol,
                    err.message
                );

            }

        }

    }


    // =========================================================
    // BUY CONTRACT
    // =========================================================

    async buyContract({
        amount,
        contract_type,
        symbol
    }) {

        const res =
            await this.send({

                buy:
                    1,

                price:
                    amount,

                parameters: {

                    amount,

                    basis:
                        "stake",

                    contract_type,

                    currency:
                        "USD",

                    duration:
                        1,

                    duration_unit:
                        "m",

                    underlying_symbol:
                        symbol

                }

            });


        console.log(
            "🟢 BUY:",
            {

                contractId:
                    res.buy?.contract_id,

                transactionId:
                    res.buy?.transaction_id

            }
        );


        return res;

    }


    // =========================================================
    // WATCH CONTRACT
    // =========================================================

    async watchContract(
        contractId,
        callback
    ) {

        if (
            !this.isConnected
        ) {

            throw new Error(
                "WebSocket no conectado"
            );

        }


        console.log(
            "👀 Watch:",
            contractId
        );


        const res =
            await this.send({

                proposal_open_contract:
                    1,

                contract_id:
                    contractId,

                subscribe:
                    1

            });


        if (
            !res.subscription?.id
        ) {

            throw new Error(
                "No se recibió subscription.id"
            );

        }


        const subId =
            res.subscription.id;


        this.subscriptionMap.set(
            subId,
            contractId
        );


        this.contractSubscriptions.set(
            contractId,
            {

                callback,

                subId

            }
        );


        console.log(
            "✅ Contrato suscrito:",
            contractId,
            "Sub:",
            subId
        );


        return subId;

    }


    // =========================================================
    // RE-SUBSCRIBE CONTRACTS
    // =========================================================

    async reSubscribeAll() {

        console.log(
            "🔁 Re-suscribiendo contratos..."
        );


        for (
            const [
                contractId,
                sub
            ]
            of this.contractSubscriptions.entries()
        ) {

            try {

                console.log(
                    "🔄 Recuperando contrato:",
                    contractId
                );


                const res =
                    await this.send({

                        proposal_open_contract:
                            1,

                        contract_id:
                            contractId,

                        subscribe:
                            1

                    });


                if (
                    res.subscription?.id
                ) {

                    // ==================================
                    // ELIMINAR SUB ANTIGUA
                    // ==================================

                    this.subscriptionMap.delete(
                        sub.subId
                    );


                    // ==================================
                    // NUEVA SUB
                    // ==================================

                    const newSubId =
                        res.subscription.id;


                    sub.subId =
                        newSubId;


                    this.subscriptionMap.set(
                        newSubId,
                        contractId
                    );


                    console.log(
                        "✅ Contrato recuperado:",
                        contractId,
                        "Nuevo Sub:",
                        newSubId
                    );

                } else {

                    console.warn(
                        "⚠️ Deriv no devolvió subscription para contrato:",
                        contractId
                    );

                }


            } catch (err) {

                console.error(
                    "❌ Error recuperando contrato:",
                    contractId,
                    err.message
                );

            }

        }

    }


    // =========================================================
    // SEND
    // =========================================================

    send(data) {

        return new Promise(
            (resolve, reject) => {

                if (
                    !this.ws ||
                    this.ws.readyState !==
                    WebSocket.OPEN
                ) {

                    return reject(
                        new Error(
                            "WebSocket no conectado"
                        )
                    );

                }


                const req_id =
                    this.requestId++;


                // ==========================================
                // TIMEOUT
                // ==========================================

                const timeout =
                    setTimeout(
                        () => {

                            this.pendingRequests.delete(
                                req_id
                            );


                            reject(
                                new Error(
                                    "Request timeout"
                                )
                            );

                        },
                        10000
                    );


                // ==========================================
                // GUARDAR REQUEST
                // ==========================================

                this.pendingRequests.set(
                    req_id,
                    {

                        resolve:
                            (res) => {

                                clearTimeout(
                                    timeout
                                );

                                resolve(
                                    res
                                );

                            },


                        reject:
                            (err) => {

                                clearTimeout(
                                    timeout
                                );

                                reject(
                                    err
                                );

                            }

                    }
                );


                // ==========================================
                // SEND WS
                // ==========================================

                try {

                    this.ws.send(
                        JSON.stringify({

                            ...data,

                            req_id

                        })
                    );


                } catch (err) {

                    clearTimeout(
                        timeout
                    );


                    this.pendingRequests.delete(
                        req_id
                    );


                    reject(
                        err
                    );

                }

            }
        );

    }


    // =========================================================
    // FORGET CONTRACT
    // =========================================================

    async forgetContract(
        contractId
    ) {

        const sub =
            this.contractSubscriptions.get(
                contractId
            );


        if (!sub) {

            return;
        }


        try {

            if (
                this.isConnected
            ) {

                await this.send({

                    forget:
                        sub.subId

                });

            }

        } catch (err) {

            console.warn(
                "⚠️ Error forget:",
                err.message
            );

        } finally {

            this.subscriptionMap.delete(
                sub.subId
            );


            this.contractSubscriptions.delete(
                contractId
            );


            console.log(
                "🧹 Suscripción eliminada:",
                contractId
            );

        }

    }


    // =========================================================
    // UNSUBSCRIBE TICK
    // =========================================================

    async unsubscribe(
        subId
    ) {

        const sub =
            this.subscriptions.get(
                subId
            );


        try {

            if (
                this.isConnected
            ) {

                await this.send({

                    forget:
                        subId

                });

            }

        } catch (err) {

            console.warn(
                "⚠️ Error unsubscribe:",
                err.message
            );

        } finally {

            this.subscriptions.delete(
                subId
            );


            console.log(
                "🧹 Tick eliminado:",
                sub?.symbol
            );

        }

    }


    // =========================================================
    // DISCONNECT MANUAL
    // =========================================================

    disconnect() {

        console.log(
            "🛑 Desconectando DerivService manualmente..."
        );


        // ==========================================
        // BLOQUEAR RECONEXIÓN
        // ==========================================

        this.manualDisconnect =
            true;


        // ==========================================
        // CANCELAR RECONNECT TIMER
        // ==========================================

        if (
            this.reconnectTimer
        ) {

            clearTimeout(
                this.reconnectTimer
            );

            this.reconnectTimer =
                null;

        }


        this.reconnectScheduled =
            false;


        // ==========================================
        // PING
        // ==========================================

        this.stopPing();


        // ==========================================
        // WS
        // ==========================================

        if (this.ws) {

            try {

                // Al eliminar listeners evitamos
                // que close() dispare reconnect().

                this.ws.removeAllListeners();

                this.ws.close();

            } catch (err) {

                console.error(
                    "❌ Error cerrando WS:",
                    err.message
                );

            }

            this.ws =
                null;

        }


        // ==========================================
        // ESTADO
        // ==========================================

        this.isConnected =
            false;

        this.connecting =
            false;


        // ==========================================
        // REQUESTS
        // ==========================================

        for (
            const pending
            of this.pendingRequests.values()
        ) {

            pending.reject(
                new Error(
                    "DerivService desconectado manualmente"
                )
            );

        }


        this.pendingRequests.clear();


        // ==========================================
        // SUSCRIPCIONES
        // ==========================================

        this.subscriptions.clear();

        this.contractSubscriptions.clear();

        this.subscriptionMap.clear();


        console.log(
            "🛑 DerivService desconectado"
        );

    }


    // =========================================================
    // CANDLES
    // =========================================================

    async getCandles(
        symbol,
        granularity = 60,
        count = 100
    ) {

        const res =
            await this.send({

                ticks_history:
                    symbol,

                style:
                    "candles",

                granularity,

                count,

                end:
                    "latest",

                adjust_start_time:
                    1

            });


        if (
            !res.candles
        ) {

            return [];

        }


        return res.candles.map(
            c => ({

                open:
                    c.open,

                high:
                    c.high,

                low:
                    c.low,

                close:
                    c.close,

                time:
                    c.epoch

            })
        );

    }

}


module.exports =
    DerivService;