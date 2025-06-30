import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, ResponsiveContainer } from 'recharts';

// Add MetaMask types
declare global {
    interface Window {
        ethereum?: any;
        ethers?: any;
    }
}

// Contract addresses and ABIs
const CONTRACT_ADDRESSES = {
    NODE_REGISTRY: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
    PARTICIPATION: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Update with your actual address
    DPN_TOKEN: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' // Update with your actual address
};

const NODE_REGISTRY_ABI = [
    "function registerNode(string memory metadata) external",
    "function getNode(uint256 nodeId) external view returns (address owner, string memory metadata, bool isActive)",
    "function getNodeCount() external view returns (uint256)"
];

const PARTICIPATION_ABI = [
    "function stakeForNode(uint256 nodeId) external payable",
    "function claimRewards(uint256 nodeId) external",
    "function getStake(uint256 nodeId) external view returns (uint256)",
    "function getRewards(address user) external view returns (uint256)",
    "function getNodeOwner(uint256 nodeId) external view returns (address)"
];

const DPN_TOKEN_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)"
];

const GRAPHQL_ENDPOINT = 'http://localhost:8000/subgraphs/name/participation-subgraph';
const RPC_ENDPOINT = 'http://localhost:4000/rpc';

// Utility functions
const formatAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
const formatEth = (wei: string | number): string => (parseFloat(wei.toString()) / 1e18).toFixed(2);
const formatTime = (timestamp: string): string => new Date(parseInt(timestamp) * 1000).toLocaleString();

interface Node {
    id: string;
    nodeId: string;
    owner: string;
    timestamp: string;
}

interface Stake {
    id: string;
    nodeId: string;
    staker: string;
    amount: string;
    timestamp: string;
}

interface Reward {
    id: string;
    nodeId: string;
    owner: string;
    amount: string;
    timestamp: string;
}

interface Uptime {
    id: string;
    nodeId: string;
    minutesUp: string;
    timestamp: string;
}

interface SubgraphData {
    nodes: Node[];
    stakes: Stake[];
    rewards: Reward[];
    uptimes: Uptime[];
}

interface WalletState {
    isConnected: boolean;
    account: string | null;
    chainId: number | null;
    balance: string;
}

interface Transaction {
    hash: string;
    type: 'stake' | 'claim' | 'register';
    status: 'pending' | 'confirmed' | 'failed';
    nodeId?: string;
    amount?: string;
}

interface StakeModalState {
    isOpen: boolean;
    nodeId: string;
    amount: string;
}

interface RegisterModalState {
    isOpen: boolean;
    metadata: string;
}

const DePINDashboard: React.FC = () => {
    const [data, setData] = useState<SubgraphData>({
        nodes: [],
        stakes: [],
        rewards: [],
        uptimes: []
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [blockNumber, setBlockNumber] = useState<number | null>(null);

    // Wallet state
    const [wallet, setWallet] = useState<WalletState>({
        isConnected: false,
        account: null,
        chainId: null,
        balance: '0'
    });
    const [walletLoading, setWalletLoading] = useState<boolean>(false);
    const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
    const [userFilter, setUserFilter] = useState<'all' | 'mine'>('all');

    // Transaction state
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [stakeModal, setStakeModal] = useState<StakeModalState>({ isOpen: false, nodeId: '', amount: '' });
    const [registerModal, setRegisterModal] = useState<RegisterModalState>({ isOpen: false, metadata: '' });
    const [userDpnBalance, setUserDpnBalance] = useState<string>('0');

    // Contract interaction functions
    const getContract = (address: string, abi: string[]) => {
        if (!window.ethereum) throw new Error('MetaMask not available');

        const provider = new (window as any).ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        return new (window as any).ethers.Contract(address, abi, signer);
    };

    const addTransaction = (hash: string, type: 'stake' | 'claim' | 'register', nodeId?: string, amount?: string) => {
        const newTx: Transaction = { hash, type, status: 'pending', nodeId, amount };
        setTransactions(prev => [newTx, ...prev]);
        return newTx;
    };

    const updateTransaction = (hash: string, status: 'confirmed' | 'failed') => {
        setTransactions(prev => prev.map(tx =>
            tx.hash === hash ? { ...tx, status } : tx
        ));
    };

    const stakeForNode = async (nodeId: string, amount: string) => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
            const amountWei = (window as any).ethers.utils.parseEther(amount);

            const tx = await contract.stakeForNode(nodeId, { value: amountWei });
            addTransaction(tx.hash, 'stake', nodeId, amount);

            showNotification('success', `Staking transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setStakeModal({ isOpen: false, nodeId: '', amount: '' });

            // Wait for confirmation
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully staked ${amount} ETH on Node ${nodeId}!`);
                fetchSubgraphData(); // Refresh data
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Staking error:', error);
            showNotification('error', `Staking failed: ${error.message || 'Unknown error'}`);
        }
    };

    const claimRewards = async (nodeId: string) => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
            const tx = await contract.claimRewards(nodeId);
            addTransaction(tx.hash, 'claim', nodeId);

            showNotification('success', `Claim transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully claimed rewards for Node ${nodeId}!`);
                fetchSubgraphData(); // Refresh data
                fetchUserDpnBalance(); // Update DPN balance
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Claim error:', error);
            showNotification('error', `Claim failed: ${error.message || 'Unknown error'}`);
        }
    };

    const registerNewNode = async (metadata: string) => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.NODE_REGISTRY, NODE_REGISTRY_ABI);
            const tx = await contract.registerNode(metadata);
            addTransaction(tx.hash, 'register');

            showNotification('success', `Registration transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setRegisterModal({ isOpen: false, metadata: '' });

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully registered new node!`);
                fetchSubgraphData(); // Refresh data
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Registration error:', error);
            showNotification('error', `Registration failed: ${error.message || 'Unknown error'}`);
        }
    };

    const fetchUserDpnBalance = async () => {
        if (!wallet.account) return;

        try {
            const contract = getContract(CONTRACT_ADDRESSES.DPN_TOKEN, DPN_TOKEN_ABI);
            const balance = await contract.balanceOf(wallet.account);
            setUserDpnBalance((window as any).ethers.utils.formatEther(balance));
        } catch (error) {
            console.error('Error fetching DPN balance:', error);
        }
    };

    // Wallet functions
    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const connectWallet = async () => {
        if (!window.ethereum) {
            showNotification('error', 'MetaMask not detected. Please install MetaMask.');
            return;
        }

        try {
            setWalletLoading(true);
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });

            if (accounts.length > 0) {
                const balance = await window.ethereum.request({
                    method: 'eth_getBalance',
                    params: [accounts[0], 'latest']
                });

                const balanceInEth = (parseInt(balance, 16) / Math.pow(10, 18)).toFixed(4);

                setWallet({
                    isConnected: true,
                    account: accounts[0],
                    chainId: parseInt(chainId, 16),
                    balance: balanceInEth
                });

                showNotification('success', 'Wallet connected successfully!');
            }
        } catch (error) {
            showNotification('error', 'Failed to connect wallet. Please try again.');
            console.error('Wallet connection error:', error);
        } finally {
            setWalletLoading(false);
        }
    };

    const disconnectWallet = () => {
        setWallet({
            isConnected: false,
            account: null,
            chainId: null,
            balance: '0'
        });
        setUserFilter('all');
        showNotification('success', 'Wallet disconnected');
    };

    const switchToHardhatNetwork = async () => {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0x7A69' }], // 31337 in hex
            });
        } catch (error: any) {
            if (error.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x7A69',
                            chainName: 'Hardhat Localhost',
                            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                            rpcUrls: ['http://127.0.0.1:8545'],
                        }],
                    });
                } catch (addError) {
                    showNotification('error', 'Failed to add Hardhat network');
                }
            }
        }
    };

    const fetchBlockNumber = async (): Promise<void> => {
        try {
            const res = await fetch(RPC_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_blockNumber',
                    params: [],
                    id: 1,
                }),
            });
            const result = await res.json();
            if (result.result) {
                setBlockNumber(parseInt(result.result, 16));
            }
        } catch (error) {
            console.error('Error fetching block number:', error);
        }
    };

    const fetchSubgraphData = async (): Promise<void> => {
        try {
            const query = `
        {
          nodes(orderBy: timestamp) {
            id
            nodeId
            owner
            timestamp
          }
          stakes(orderBy: timestamp) {
            id
            nodeId
            staker
            amount
            timestamp
          }
          rewards(orderBy: timestamp) {
            id
            nodeId
            owner
            amount
            timestamp
          }
          uptimes(orderBy: timestamp) {
            id
            nodeId
            minutesUp
            timestamp
          }
        }
      `;

            const response = await fetch(GRAPHQL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });

            const result = await response.json();
            if (result.data) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Error fetching subgraph data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Handle MetaMask events and load ethers
    useEffect(() => {
        // Load ethers.js
        if (!window.ethers) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js';
            script.async = true;
            document.head.appendChild(script);
        }

        if (window.ethereum) {
            const handleAccountsChanged = (accounts: string[]) => {
                if (accounts.length === 0) {
                    disconnectWallet();
                } else if (accounts[0] !== wallet.account) {
                    connectWallet();
                }
            };

            const handleChainChanged = () => {
                window.location.reload();
            };

            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                window.ethereum.removeListener('chainChanged', handleChainChanged);
            };
        }
    }, [wallet.account]);

    // Fetch DPN balance when wallet connects
    useEffect(() => {
        if (wallet.isConnected) {
            fetchUserDpnBalance();
        }
    }, [wallet.isConnected, wallet.account]);

    useEffect(() => {
        fetchBlockNumber();
        fetchSubgraphData();
        const interval = setInterval(() => {
            fetchBlockNumber();
            fetchSubgraphData();
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // Process data for charts
    const processChartData = () => {
        // Cumulative rewards over time
        const rewardTimeline = data.rewards
            .map(reward => ({
                time: new Date(parseInt(reward.timestamp) * 1000).toLocaleDateString(),
                amount: parseFloat(reward.amount),
                timestamp: parseInt(reward.timestamp)
            }))
            .sort((a, b) => a.timestamp - b.timestamp);

        let cumulative = 0;
        const cumulativeRewardData = rewardTimeline.map(item => {
            cumulative += item.amount;
            return { ...item, cumulative };
        });

        // Staking by node
        const stakingByNode = data.nodes.map(node => {
            const nodeStakes = data.stakes.filter(s => s.nodeId === node.nodeId);
            const totalStaked = nodeStakes.reduce((sum, stake) => sum + parseFloat(stake.amount), 0);
            return {
                nodeId: `Node ${node.nodeId}`,
                staked: parseFloat(formatEth(totalStaked))
            };
        });

        return { cumulativeRewardData, stakingByNode };
    };

    const { cumulativeRewardData, stakingByNode } = processChartData();

    // Calculate totals
    const totals = {
        nodes: data.nodes.length,
        staked: formatEth(data.stakes.reduce((sum, stake) => sum + parseFloat(stake.amount), 0)),
        rewards: data.rewards.reduce((sum, reward) => sum + parseFloat(reward.amount), 0),
        uptime: data.uptimes.reduce((sum, uptime) => sum + parseFloat(uptime.minutesUp), 0)
    };

    // Filter nodes for table
    const filteredNodes = data.nodes.filter(node => {
        const matchesSearch = node.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
            node.nodeId.includes(searchTerm);
        const matchesUser = userFilter === 'all' ||
            (userFilter === 'mine' && wallet.account &&
                node.owner.toLowerCase() === wallet.account.toLowerCase());
        return matchesSearch && matchesUser;
    });

    // Get user-specific data
    const userNodes = wallet.account ? data.nodes.filter(node =>
        node.owner.toLowerCase() === wallet.account!.toLowerCase()
    ) : [];

    const userTotalStake = userNodes.reduce((sum, node) => {
        const nodeStakes = data.stakes.filter(s => s.nodeId === node.nodeId);
        return sum + nodeStakes.reduce((stakeSum, stake) => stakeSum + parseFloat(stake.amount), 0);
    }, 0);

    const userTotalRewards = data.rewards
        .filter(reward => wallet.account && reward.owner.toLowerCase() === wallet.account.toLowerCase())
        .reduce((sum, reward) => sum + parseFloat(reward.amount), 0);

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f8f9fa'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        border: '4px solid #007bff',
                        borderTop: '4px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 20px'
                    }}></div>
                    <h2>Loading DePIN Analytics...</h2>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f8f9fa',
            padding: '20px'
        }}>
            {/* Notification */}
            {notification && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    zIndex: 1000,
                    padding: '16px 20px',
                    borderRadius: '8px',
                    backgroundColor: notification.type === 'success' ? '#28a745' : '#dc3545',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                }}>
                    {notification.type === 'success' ? '✅' : '❌'} {notification.message}
                </div>
            )}

            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '30px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '20px'
                    }}>
                        <div>
                            <h1 style={{
                                fontSize: '2.5rem',
                                fontWeight: 'bold',
                                color: '#333',
                                margin: '0 0 10px 0'
                            }}>
                                DePIN Network Analytics
                            </h1>
                            <p style={{ color: '#666', margin: 0 }}>
                                Real-time monitoring of decentralized infrastructure network
                            </p>
                        </div>

                        {/* Wallet Section */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            {wallet.isConnected ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {wallet.chainId !== 31337 && (
                                        <button
                                            onClick={switchToHardhatNetwork}
                                            style={{
                                                padding: '8px 16px',
                                                backgroundColor: '#ffc107',
                                                color: '#212529',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Switch to Hardhat
                                        </button>
                                    )}
                                    <div style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#28a745',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}>
                                        <div style={{ fontWeight: 'bold' }}>🔗 {formatAddress(wallet.account!)}</div>
                                        <div style={{ fontSize: '12px' }}>{wallet.balance} ETH</div>
                                    </div>
                                    <button
                                        onClick={disconnectWallet}
                                        style={{
                                            padding: '8px 16px',
                                            backgroundColor: '#6c757d',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={connectWallet}
                                    disabled={walletLoading}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: '#007bff',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        cursor: walletLoading ? 'not-allowed' : 'pointer',
                                        opacity: walletLoading ? 0.7 : 1
                                    }}
                                >
                                    {walletLoading ? '🔄 Connecting...' : '🦊 Connect Wallet'}
                                </button>
                            )}

                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#666', fontSize: '0.9rem' }}>Current Block</div>
                                <div style={{
                                    fontSize: '1.8rem',
                                    fontWeight: 'bold',
                                    color: '#007bff'
                                }}>
                                    {blockNumber?.toLocaleString()}
                                </div>
                                <div style={{ color: '#28a745', fontSize: '0.8rem' }}>🟢 Live</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* User Stats (when connected) */}
                {wallet.isConnected && userNodes.length > 0 && (
                    <div style={{
                        backgroundColor: '#e3f2fd',
                        borderRadius: '10px',
                        padding: '25px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        border: '2px solid #2196f3'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#1976d2' }}>
                            👤 Your Network Activity
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>
                                    {userNodes.length}
                                </div>
                                <div style={{ color: '#666' }}>Your Nodes</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>
                                    {formatEth(userTotalStake)} ETH
                                </div>
                                <div style={{ color: '#666' }}>Total Staked</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>
                                    {userTotalRewards.toFixed(2)} DPN
                                </div>
                                <div style={{ color: '#666' }}>Rewards Earned</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1976d2' }}>
                                    {parseFloat(userDpnBalance).toFixed(2)} DPN
                                </div>
                                <div style={{ color: '#666' }}>DPN Balance</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transaction Status (when connected) */}
                {wallet.isConnected && transactions.length > 0 && (
                    <div style={{
                        backgroundColor: '#fff3cd',
                        borderRadius: '10px',
                        padding: '20px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        border: '2px solid #ffc107'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#856404' }}>
                            ⏳ Recent Transactions
                        </h3>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {transactions.slice(0, 5).map((tx) => (
                                <div key={tx.hash} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 0',
                                    borderBottom: '1px solid #ffeaa7'
                                }}>
                                    <div>
                                        <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                                            {tx.type}
                                        </span>
                                        {tx.nodeId && ` Node ${tx.nodeId}`}
                                        {tx.amount && ` (${tx.amount} ETH)`}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '10px',
                                            fontWeight: 'bold',
                                            backgroundColor:
                                                tx.status === 'confirmed' ? '#d4edda' :
                                                    tx.status === 'failed' ? '#f8d7da' : '#fff3cd',
                                            color:
                                                tx.status === 'confirmed' ? '#155724' :
                                                    tx.status === 'failed' ? '#721c24' : '#856404'
                                        }}>
                                            {tx.status === 'pending' ? '⏳ Pending' :
                                                tx.status === 'confirmed' ? '✅ Confirmed' : '❌ Failed'}
                                        </span>
                                        <a
                                            href={`https://etherscan.io/tx/${tx.hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#007bff', fontSize: '12px' }}
                                        >
                                            {tx.hash.slice(0, 8)}...
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Buttons (when connected) */}
                {wallet.isConnected && (
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '20px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>🚀 Quick Actions</h3>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setRegisterModal({ isOpen: true, metadata: '' })}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                📡 Register New Node
                            </button>
                        </div>
                    </div>
                )}

                {/* Search and Filter */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '20px',
                    marginBottom: '20px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="🔍 Search by node ID or owner address..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                flex: 1,
                                minWidth: '300px',
                                padding: '12px 16px',
                                border: '2px solid #e9ecef',
                                borderRadius: '8px',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                        {wallet.isConnected && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    onClick={() => setUserFilter('all')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        backgroundColor: userFilter === 'all' ? '#007bff' : '#f8f9fa',
                                        color: userFilter === 'all' ? 'white' : '#666'
                                    }}
                                >
                                    All Nodes
                                </button>
                                <button
                                    onClick={() => setUserFilter('mine')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        backgroundColor: userFilter === 'mine' ? '#007bff' : '#f8f9fa',
                                        color: userFilter === 'mine' ? 'white' : '#666'
                                    }}
                                >
                                    My Nodes ({userNodes.length})
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Overview Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '20px',
                    marginBottom: '30px'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL NODES</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#007bff' }}>{totals.nodes}</div>
                    </div>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL STAKED</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#28a745' }}>{totals.staked} ETH</div>
                    </div>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL REWARDS</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#6f42c1' }}>{totals.rewards} DPN</div>
                    </div>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>NETWORK UPTIME</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fd7e14' }}>{totals.uptime} min</div>
                    </div>
                </div>

                {/* Charts */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
                    gap: '20px',
                    marginBottom: '30px'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ marginBottom: '20px', color: '#333' }}>Cumulative Rewards Over Time</h3>
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={cumulativeRewardData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="time" />
                                    <YAxis />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="cumulative" stroke="#007bff" strokeWidth={3} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ marginBottom: '20px', color: '#333' }}>Staking by Node</h3>
                        <div style={{ width: '100%', height: '300px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stakingByNode}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="nodeId" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="staked" fill="#28a745" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Node Table */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '25px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}>
                    <h3 style={{ marginBottom: '20px', color: '#333' }}>
                        Registered Nodes {wallet.isConnected && userFilter === 'mine' && `(Your Nodes: ${userNodes.length})`}
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                            <tr style={{ backgroundColor: '#f8f9fa' }}>
                                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Node ID</th>
                                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Owner</th>
                                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Registered</th>
                                <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Status</th>
                                {wallet.isConnected && (
                                    <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Actions</th>
                                )}
                            </tr>
                            </thead>
                            <tbody>
                            {filteredNodes.map((node, index) => (
                                <tr key={node.id} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                                    <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                      <span style={{
                          backgroundColor: '#007bff',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '15px',
                          fontSize: '0.8rem',
                          marginRight: '10px'
                      }}>
                        {node.nodeId}
                      </span>
                                        Node {node.nodeId}
                                    </td>
                                    <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <code style={{ backgroundColor: '#f8f9fa', padding: '4px 8px', borderRadius: '4px' }}>
                                                {formatAddress(node.owner)}
                                            </code>
                                            {wallet.account && node.owner.toLowerCase() === wallet.account.toLowerCase() && (
                                                <span style={{
                                                    backgroundColor: '#007bff',
                                                    color: 'white',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold'
                                                }}>
                                                    YOU
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                        {formatTime(node.timestamp)}
                                    </td>
                                    <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                      <span style={{
                          backgroundColor: '#d4edda',
                          color: '#155724',
                          padding: '4px 12px',
                          borderRadius: '15px',
                          fontSize: '0.8rem'
                      }}>
                        🟢 Active
                      </span>
                                    </td>
                                    {wallet.isConnected && (
                                        <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => setStakeModal({
                                                        isOpen: true,
                                                        nodeId: node.nodeId,
                                                        amount: ''
                                                    })}
                                                    style={{
                                                        padding: '6px 12px',
                                                        backgroundColor: '#007bff',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        fontSize: '12px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    💰 Stake
                                                </button>
                                                {wallet.account && node.owner.toLowerCase() === wallet.account.toLowerCase() && (
                                                    <button
                                                        onClick={() => claimRewards(node.nodeId)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            backgroundColor: '#28a745',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            fontSize: '12px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        🎁 Claim
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredNodes.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: '#666'
                        }}>
                            {userFilter === 'mine'
                                ? "You don't own any nodes yet."
                                : "No nodes found matching your search criteria."
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* Stake Modal */}
            {stakeModal.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '30px',
                        width: '90%',
                        maxWidth: '500px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>
                            💰 Stake ETH on Node {stakeModal.nodeId}
                        </h2>
                        <p style={{ color: '#666', marginBottom: '20px' }}>
                            Stake ETH to earn rewards from this node's operations.
                        </p>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Amount (ETH):
                            </label>
                            <input
                                type="number"
                                placeholder="0.1"
                                step="0.01"
                                value={stakeModal.amount}
                                onChange={(e) => setStakeModal(prev => ({...prev, amount: e.target.value}))}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px solid #e9ecef',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setStakeModal({ isOpen: false, nodeId: '', amount: '' })}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => stakeForNode(stakeModal.nodeId, stakeModal.amount)}
                                disabled={!stakeModal.amount || parseFloat(stakeModal.amount) <= 0}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: !stakeModal.amount || parseFloat(stakeModal.amount) <= 0
                                        ? '#6c757d' : '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: !stakeModal.amount || parseFloat(stakeModal.amount) <= 0
                                        ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Stake ETH
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Register Node Modal */}
            {registerModal.isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '30px',
                        width: '90%',
                        maxWidth: '500px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>
                            📡 Register New Node
                        </h2>
                        <p style={{ color: '#666', marginBottom: '20px' }}>
                            Register your infrastructure node to participate in the DePIN network.
                        </p>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Node Metadata (JSON):
                            </label>
                            <textarea
                                placeholder='{"location": "US-East", "type": "storage", "capacity": "1TB"}'
                                value={registerModal.metadata}
                                onChange={(e) => setRegisterModal(prev => ({...prev, metadata: e.target.value}))}
                                rows={4}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px solid #e9ecef',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    outline: 'none',
                                    fontFamily: 'monospace'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setRegisterModal({ isOpen: false, metadata: '' })}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => registerNewNode(registerModal.metadata)}
                                disabled={!registerModal.metadata.trim()}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: !registerModal.metadata.trim() ? '#6c757d' : '#28a745',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: !registerModal.metadata.trim() ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Register Node
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default DePINDashboard;
