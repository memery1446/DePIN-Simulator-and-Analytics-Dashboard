import React, { useEffect, useState } from 'react';

const NodeList = () => {
    const [nodes, setNodes] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchNodes = async () => {
            try {
                const response = await fetch('http://localhost:4000/nodes');
                const data = await response.json();
                setNodes(data);
            } catch (err: any) {
                setError(err.message || 'Unknown error');
            }
        };

        fetchNodes();
    }, []);

    return (
        <div style={{ marginTop: '2rem' }}>
            <h2>Registered Nodes</h2>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            <ul>
                {nodes.map((node) => (
                    <li key={node.id} style={{ marginBottom: '1rem' }}>
                        <strong>Node ID:</strong> {node.id}<br />
                        <strong>Owner:</strong> {node.owner}<br />
                        <strong>Metadata:</strong> {node.metadata}<br />
                        <strong>Status:</strong> {node.status}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default NodeList;

