import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';

const RewardChart = () => {
    const [rewards, setRewards] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRewards = async () => {
            try {
                const res = await fetch('http://localhost:4000/rewards');
                const data = await res.json();
                setRewards(data);
            } catch (err: any) {
                setError(err.message || 'Unknown error');
            }
        };

        fetchRewards();
    }, []);

    // Group rewards by timestamp
    const chartData = Object.values(
        rewards.reduce((acc: any, entry: any) => {
            const date = new Date(entry.timestamp * 1000).toLocaleTimeString();
            if (!acc[date]) acc[date] = { time: date };
            acc[date][`node${entry.nodeId}`] = entry.reward;
            return acc;
        }, {})
    );

    return (
        <div style={{ marginTop: '2rem' }}>
            <h2>Reward Chart</h2>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid stroke="#ccc" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="node0" stroke="#8884d8" name="Node 0" />
                    <Line type="monotone" dataKey="node1" stroke="#82ca9d" name="Node 1" />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default RewardChart;

