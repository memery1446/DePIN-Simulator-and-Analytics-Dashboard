// rpc-relay.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 4000;

// Updated to connect to Hardhat node instead of Avalanche subnet
const HARDHAT_RPC = 'http://127.0.0.1:8545';

app.use(cors());
app.use(express.json());

app.post('/rpc', async (req, res) => {
    try {
        const response = await axios.post(HARDHAT_RPC, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('RPC Relay Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 RPC relay running at http://localhost:${PORT}/rpc`);
    console.log(`🔗 Proxying requests to Hardhat node at ${HARDHAT_RPC}`);
});

app.get('/nodes', (req, res) => {
    res.json([
        { id: 0, owner: "0x1234...abcd", metadata: "Node Alpha", status: "active" },
        { id: 1, owner: "0x5678...efgh", metadata: "Node Beta", status: "inactive" },
        { id: 2, owner: "0x9abc...ijkl", metadata: "Node Gamma", status: "active" }
    ]);
});

app.post('/stake', (req, res) => {
    const { nodeId, amount } = req.body;
    console.log(`🔗 Stake received: ${amount} to node ${nodeId}`);
    res.json({ success: true, message: `Staked ${amount} to node ${nodeId}` });
});

app.get('/rewards', (req, res) => {
    res.json([
        { nodeId: 0, timestamp: 1719000000, reward: 10 },
        { nodeId: 0, timestamp: 1719003600, reward: 12 },
        { nodeId: 0, timestamp: 1719007200, reward: 15 },
        { nodeId: 1, timestamp: 1719000000, reward: 5 },
        { nodeId: 1, timestamp: 1719003600, reward: 8 },
        { nodeId: 1, timestamp: 1719007200, reward: 9 }
    ]);
});
