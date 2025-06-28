// App.tsx
import React, { useEffect, useState } from 'react';
import NodeList from './components/NodeList';
import StakingPanel from './components/StakingPanel';


const App = () => {
    const [blockNumber, setBlockNumber] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBlock = async () => {
            try {
                const res = await fetch('http://localhost:4000/rpc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_blockNumber',
                        params: [],
                        id: 1,
                    }),
                });

                const data = await res.json();
                if (data.result) {
                    setBlockNumber(parseInt(data.result, 16).toString());
                } else {
                    setError(JSON.stringify(data));
                }
            } catch (err: any) {
                setError(err.message || 'Unknown error');
            }
        };

        fetchBlock();
    }, []);

    return (
        <div style={{ padding: '2rem' }}>
            <h1>DePIN Simulator</h1>
            {blockNumber && <p>Current Block: {blockNumber}</p>}
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}

            <NodeList />
            <StakingPanel />

        </div>
    );

};

export default App;
