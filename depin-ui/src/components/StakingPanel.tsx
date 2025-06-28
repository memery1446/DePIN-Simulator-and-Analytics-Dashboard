import React, { useState } from 'react';

const StakingPanel = () => {
    const [nodeId, setNodeId] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState<string | null>(null);

    const handleStake = async () => {
        try {
            const response = await fetch('http://localhost:4000/stake', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, amount }),
            });

            const data = await response.json();
            if (data.success) {
                setStatus(`✅ ${data.message}`);
            } else {
                setStatus(`❌ Error: ${data.message}`);
            }
        } catch (err: any) {
            setStatus(`❌ Failed to stake: ${err.message}`);
        }
    };

    return (
        <div style={{ marginTop: '2rem' }}>
            <h2>Stake to Node</h2>
            <div style={{ marginBottom: '1rem' }}>
                <label>Node ID:</label><br />
                <input
                    type="number"
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                    style={{ width: '200px' }}
                />
            </div>
            <div style={{ marginBottom: '1rem' }}>
                <label>Amount (AVAX):</label><br />
                <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{ width: '200px' }}
                />
            </div>
            <button onClick={handleStake}>Stake</button>
            {status && <p style={{ marginTop: '1rem' }}>{status}</p>}
        </div>
    );
};

export default StakingPanel;

