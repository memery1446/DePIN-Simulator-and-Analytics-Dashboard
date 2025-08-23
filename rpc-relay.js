// rpc-relay.js
// JSON-RPC relay for Graph Node ↔ Hardhat (or any EVM RPC).
// - Accepts POST "/" and POST "/rpc" (so ETHEREUM_RPC can include or omit the path)
// - Binds to 0.0.0.0 so Docker can reach it via host.docker.internal
// - Simple health endpoint
// - Safe timeouts + keep-alive
// - Works with single or batch JSON-RPC

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();

// ---------- Config ----------
const PORT = Number(process.env.PORT) || 4000;
// Upstream EVM node (Hardhat by default). You can override with env:
//   HARDHAT_RPC=http://127.0.0.1:8545  node rpc-relay.js
// or HARDHAT_RPC=http://host.docker.internal:8545 if you prefer.
const UPSTREAM = process.env.HARDHAT_RPC || 'http://127.0.0.1:8545';

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '2mb', strict: false }));

// Keep-alive agents to reduce socket churn
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const client = axios.create({
    baseURL: UPSTREAM,
    timeout: 12_000, // ms
    httpAgent,
    httpsAgent,
    // Do NOT set headers here; pass through from request below.
});

// Simple logger (optional; comment out if too chatty)
app.use((req, _res, next) => {
    if (req.method === 'POST' && (req.path === '/' || req.path === '/rpc')) {
        // Avoid dumping huge bodies; log method & first method name
        const body = req.body;
        const sig = Array.isArray(body)
            ? `[batch x${body.length}]`
            : body && body.method
                ? body.method
                : 'unknown';
        // eslint-disable-next-line no-console
        console.log(`[relay] ${req.ip} -> ${req.method} ${req.path} ${sig}`);
    }
    next();
});

// ---------- Handlers ----------
async function forwardJsonRpc(req, res) {
    try {
        // Pass Content-Type; others (like auth) can be added if needed
        const hdrs = { 'Content-Type': 'application/json' };

        const upstreamRes = await client.post('/', req.body, { headers: hdrs });
        res.status(upstreamRes.status).json(upstreamRes.data);
    } catch (err) {
        const status = err.response?.status || 502;
        const data = err.response?.data;

        console.error(
            '[relay] upstream error:',
            err.message,
            data ? ` body=${JSON.stringify(data).slice(0, 500)}` : ''
        );

        // Return JSON-RPC-ish error envelope if possible
        if (Array.isArray(req.body)) {
            // Batch request → batch error
            return res.status(status).json(
                req.body.map((item) => ({
                    jsonrpc: '2.0',
                    id: item?.id ?? null,
                    error: { code: -32000, message: `RPC relay upstream error: ${err.message}` },
                }))
            );
        }

        return res.status(status).json({
            jsonrpc: '2.0',
            id: req.body?.id ?? null,
            error: { code: -32000, message: `RPC relay upstream error: ${err.message}` },
        });
    }
}

// Accept JSON-RPC at both "/" and "/rpc"
app.post('/', forwardJsonRpc);
app.post('/rpc', forwardJsonRpc);

// Health + info
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) =>
    res.status(200).send(
        `OK\nRelay: http://0.0.0.0:${PORT}\nUpstream: ${UPSTREAM}\nPOST / or /rpc with JSON-RPC`
    )
);

// ---------- Start ----------
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 RPC relay listening on http://0.0.0.0:${PORT}`);
    console.log(`🔗 Proxying JSON-RPC to ${UPSTREAM}`);
    console.log('   Accepting POST / and POST /rpc');
});
