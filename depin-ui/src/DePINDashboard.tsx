import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// Add MetaMask types
declare global {
    interface Window {
        ethereum?: any;
        ethers?: any;
    }
}

// Contract addresses and ABIs
const CONTRACT_ADDRESSES = {
    NODE_REGISTRY: '0x2E2Ed0Cfd3AD2f1d34481277b3204d807Ca2F8c2',
    PARTICIPATION: '0xDC11f7E700A4c898AE5CAddB1082cFfa76512aDD',
    DPN_TOKEN: '0x21dF544947ba3E8b3c32561399E88B52Dc8b2823',
    NODE_RIGHTS_NFT: '0xD8a5a9b31c3C0232E196d518E89Fd8bF83AcAd43',
    STAKING_POOL: '0x51A1ceB83B83F1985a81C295d1fF28Afef186E02'
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

const STAKING_POOL_ABI = [
    "function stakeToPool(uint8 tier, uint8 lockPeriod) external payable",
    "function withdrawStake(uint256 positionId) external",
    "function claimRewards(uint256 positionId) external",
    "function claimAllRewards() external",
    "function getPositionDetails(address user, uint256 positionId) external view returns (tuple(uint8 tier, uint8 lockPeriod, uint256 amount, uint256 shares, uint256 stakedAt, uint256 unlocksAt, uint256 lastRewardClaim, bool isActive), uint256 pendingRewards, uint256 timeToUnlock, bool canWithdraw)",
    "function getUserPositions(address user) external view returns (tuple(uint8 tier, uint8 lockPeriod, uint256 amount, uint256 shares, uint256 stakedAt, uint256 unlocksAt, uint256 lastRewardClaim, bool isActive)[])",
    "function getPoolStats(uint8 tier) external view returns (tuple(uint256 minStake, uint256 tierMultiplier, uint256 baseRewardRate, uint256 totalStaked, uint256 totalShares, bool isActive), uint256 activeStakers, uint256 averageStake, uint256 poolUtilization)",
    "function getGlobalStats() external view returns (uint256 tvl, uint256 totalRewards, uint256 totalStakers, uint256[4] poolDistribution)",
    "function poolConfigs(uint8 tier) external view returns (uint256 minStake, uint256 tierMultiplier, uint256 baseRewardRate, uint256 totalStaked, uint256 totalShares, bool isActive)",
    "function userPositionCount(address user) external view returns (uint256)"
];

const GRAPHQL_ENDPOINT = 'http://localhost:8000/subgraphs/name/participation-subgraph';
const RPC_ENDPOINT = 'http://localhost:4000/rpc';

// Pool tier names and colors
const POOL_TIERS = [
    { name: 'Bronze', icon: '🥉', color: '#CD7F32', minStake: '0.1' },
    { name: 'Silver', icon: '🥈', color: '#C0C0C0', minStake: '1.0' },
    { name: 'Gold', icon: '🥇', color: '#FFD700', minStake: '5.0' },
    { name: 'Diamond', icon: '💎', color: '#B9F2FF', minStake: '20.0' }
];

const LOCK_PERIODS = [
    { name: 'No Lock', days: 0, multiplier: '1.0', bonus: '0%' },
    { name: '30 Days', days: 30, multiplier: '1.1', bonus: '+10%' },
    { name: '90 Days', days: 90, multiplier: '1.25', bonus: '+25%' },
    { name: '365 Days', days: 365, multiplier: '1.5', bonus: '+50%' }
];

// Utility functions
const formatAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
const formatEth = (wei: string | number): string => (parseFloat(wei.toString()) / 1e18).toFixed(2);
const formatTime = (timestamp: string): string => new Date(parseInt(timestamp) * 1000).toLocaleString();
const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Unlocked';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
};

const DePINDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'nodes' | 'pools'>('nodes');

    const [data, setData] = useState({
        nodes: [],
        stakes: [],
        rewards: [],
        uptimes: []
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [blockNumber, setBlockNumber] = useState<number | null>(null);

    // Wallet state
    const [wallet, setWallet] = useState<{
        isConnected: boolean;
        account: string | null;
        chainId: number | null;
        balance: string;
    }>({
        isConnected: false,
        account: null,
        chainId: null,
        balance: '0'
    });
    const [walletLoading, setWalletLoading] = useState<boolean>(false);
    const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
    const [userFilter, setUserFilter] = useState<'all' | 'mine'>('all');

    // Transaction state
    const [transactions, setTransactions] = useState<any[]>([]);
    const [stakeModal, setStakeModal] = useState({ isOpen: false, nodeId: '', amount: '' });
    const [registerModal, setRegisterModal] = useState({ isOpen: false, metadata: '' });
    const [userDpnBalance, setUserDpnBalance] = useState<string>('0');

    // Staking Pool state
    const [poolStakeModal, setPoolStakeModal] = useState({
        isOpen: false, tier: 0, lockPeriod: 0, amount: ''
    });
    const [userPositions, setUserPositions] = useState<any[]>([]);
    const [poolStats, setPoolStats] = useState<any[]>([]);
    const [globalPoolStats, setGlobalPoolStats] = useState({
        tvl: '0',
        totalRewards: '0',
        totalStakers: 0,
        poolDistribution: [0, 0, 0, 0]
    });

    // Contract interaction functions
    const getContract = (address: string, abi: string[]) => {
        if (!window.ethereum) throw new Error('MetaMask not available');
        const provider = new (window as any).ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        return new (window as any).ethers.Contract(address, abi, signer);
    };

    const addTransaction = (hash: string, type: string, details?: any) => {
        const newTx = { hash, type, status: 'pending', ...details };
        setTransactions(prev => [newTx, ...prev]);
        return newTx;
    };

    const updateTransaction = (hash: string, status: 'confirmed' | 'failed') => {
        setTransactions(prev => prev.map(tx =>
            tx.hash === hash ? { ...tx, status } : tx
        ));
    };

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
        setUserPositions([]);
        showNotification('success', 'Wallet disconnected');
    };

    const stakeToPool = async (tier: number, lockPeriod: number, amount: string) => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const amountWei = (window as any).ethers.utils.parseEther(amount);

            const tx = await contract.stakeToPool(tier, lockPeriod, { value: amountWei });
            addTransaction(tx.hash, 'pool_stake', { poolTier: tier, amount });

            showNotification('success', `Pool staking transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setPoolStakeModal({ isOpen: false, tier: 0, lockPeriod: 0, amount: '' });

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully staked ${amount} ETH in ${POOL_TIERS[tier].name} pool!`);
                fetchPoolData();
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Pool staking error:', error);
            showNotification('error', `Pool staking failed: ${error.message || 'Unknown error'}`);
        }
    };

    const fetchPoolData = async () => {
        if (!wallet.account) return;

        try {
            const contract = getContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);

            // Get user positions count
            const positionCount = await contract.userPositionCount(wallet.account);
            const positions: any[] = [];

            // Fetch each position details
            for (let i = 0; i < positionCount.toNumber(); i++) {
                try {
                    const positionDetails = await contract.getPositionDetails(wallet.account, i);
                    if (positionDetails[0].isActive) {
                        positions.push({
                            tier: positionDetails[0].tier,
                            lockPeriod: positionDetails[0].lockPeriod,
                            amount: (window as any).ethers.utils.formatEther(positionDetails[0].amount),
                            pendingRewards: (window as any).ethers.utils.formatEther(positionDetails[1]),
                            timeToUnlock: positionDetails[2].toNumber(),
                            canWithdraw: positionDetails[3]
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching position ${i}:`, error);
                }
            }

            setUserPositions(positions);

            // Fetch pool statistics
            const poolStatsArray: any[] = [];
            for (let tier = 0; tier < 4; tier++) {
                try {
                    const stats = await contract.getPoolStats(tier);
                    poolStatsArray.push({
                        minStake: (window as any).ethers.utils.formatEther(stats[0].minStake),
                        tierMultiplier: stats[0].tierMultiplier.toNumber(),
                        totalStaked: (window as any).ethers.utils.formatEther(stats[0].totalStaked)
                    });
                } catch (error) {
                    poolStatsArray.push({
                        minStake: '0',
                        tierMultiplier: 10000,
                        totalStaked: '0'
                    });
                }
            }

            setPoolStats(poolStatsArray);

            // Fetch global stats
            try {
                const globalStats = await contract.getGlobalStats();
                setGlobalPoolStats({
                    tvl: (window as any).ethers.utils.formatEther(globalStats[0]),
                    totalRewards: (window as any).ethers.utils.formatEther(globalStats[1]),
                    totalStakers: globalStats[2].toNumber(),
                    poolDistribution: globalStats[3].map((val: any) =>
                        parseFloat((window as any).ethers.utils.formatEther(val))
                    )
                });
            } catch (error) {
                console.error('Error fetching global stats:', error);
            }

        } catch (error) {
            console.error('Error fetching pool data:', error);
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

    // Effects
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

    useEffect(() => {
        if (wallet.isConnected) {
            fetchUserDpnBalance();
            fetchPoolData();
        }
    }, [wallet.isConnected, wallet.account]);

    useEffect(() => {
        fetchSubgraphData();
        const interval = setInterval(() => {
            fetchSubgraphData();
            if (wallet.isConnected) {
                fetchPoolData();
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [wallet.isConnected]);

    // Process data for charts
    const processChartData = () => {
        const poolDistributionData = POOL_TIERS.map((tier, index) => ({
            name: tier.name,
            value: globalPoolStats.poolDistribution[index] || 0,
            color: tier.color
        })).filter(item => item.value > 0);

        return { poolDistributionData };
    };

    const { poolDistributionData } = processChartData();

    // Calculate user pool totals
    const userPoolTotalStaked = userPositions.reduce((sum, pos) => sum + parseFloat(pos.amount), 0);
    const userPoolTotalRewards = userPositions.reduce((sum, pos) => sum + parseFloat(pos.pendingRewards), 0);

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
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '0',
                    marginBottom: '20px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    overflow: 'hidden'
                }}>
                    <div style={{ display: 'flex' }}>
                        <button
                            onClick={() => setActiveTab('nodes')}
                            style={{
                                flex: 1,
                                padding: '20px',
                                backgroundColor: activeTab === 'nodes' ? '#007bff' : 'transparent',
                                color: activeTab === 'nodes' ? 'white' : '#666',
                                border: 'none',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                borderBottom: activeTab === 'nodes' ? 'none' : '2px solid #e9ecef'
                            }}
                        >
                            🖥️ Node Operations
                        </button>
                        <button
                            onClick={() => setActiveTab('pools')}
                            style={{
                                flex: 1,
                                padding: '20px',
                                backgroundColor: activeTab === 'pools' ? '#007bff' : 'transparent',
                                color: activeTab === 'pools' ? 'white' : '#666',
                                border: 'none',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                borderBottom: activeTab === 'pools' ? 'none' : '2px solid #e9ecef'
                            }}
                        >
                            🏆 Staking Pools
                        </button>
                    </div>
                </div>

                {activeTab === 'pools' && (
                    <>
                        {/* Pool Overview Cards */}
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
                                <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL VALUE LOCKED</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#007bff' }}>
                                    {parseFloat(globalPoolStats.tvl).toFixed(2)} ETH
                                </div>
                            </div>
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                textAlign: 'center',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>POOL REWARDS</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#28a745' }}>
                                    {parseFloat(globalPoolStats.totalRewards).toFixed(2)} DPN
                                </div>
                            </div>
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                textAlign: 'center',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>ACTIVE STAKERS</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#6f42c1' }}>
                                    {globalPoolStats.totalStakers}
                                </div>
                            </div>
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                textAlign: 'center',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>YOUR POSITIONS</div>
                                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fd7e14' }}>
                                    {userPositions.length}
                                </div>
                            </div>
                        </div>

                        {/* User Pool Stats */}
                        {wallet.isConnected && userPositions.length > 0 && (
                            <div style={{
                                backgroundColor: '#e8f5e8',
                                borderRadius: '10px',
                                padding: '25px',
                                marginBottom: '20px',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                                border: '2px solid #28a745'
                            }}>
                                <h3 style={{ margin: '0 0 15px 0', color: '#155724' }}>
                                    🏆 Your Pool Activity
                                </h3>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '20px'
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                            {userPositions.length}
                                        </div>
                                        <div style={{ color: '#666' }}>Active Positions</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                            {userPoolTotalStaked.toFixed(2)} ETH
                                        </div>
                                        <div style={{ color: '#666' }}>Total Staked</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                            {userPoolTotalRewards.toFixed(4)} DPN
                                        </div>
                                        <div style={{ color: '#666' }}>Pending Rewards</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Pool Tiers */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                            gap: '20px',
                            marginBottom: '30px'
                        }}>
                            {POOL_TIERS.map((tier, index) => {
                                const stats = poolStats[index];
                                const multiplier = stats ? (stats.tierMultiplier / 100).toFixed(1) : '1.0';

                                return (
                                    <div key={index} style={{
                                        backgroundColor: 'white',
                                        borderRadius: '10px',
                                        padding: '25px',
                                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                                        border: `2px solid ${tier.color}`,
                                        position: 'relative'
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: '-10px',
                                            left: '20px',
                                            backgroundColor: tier.color,
                                            color: tier.name === 'Diamond' ? '#000' : '#fff',
                                            padding: '5px 15px',
                                            borderRadius: '15px',
                                            fontSize: '12px',
                                            fontWeight: 'bold'
                                        }}>
                                            {tier.icon} {tier.name.toUpperCase()}
                                        </div>

                                        <div style={{ marginTop: '20px' }}>
                                            <div style={{ marginBottom: '15px' }}>
                                                <div style={{ color: '#666', fontSize: '0.9rem' }}>Minimum Stake</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: tier.color }}>
                                                    {tier.minStake} ETH
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '15px' }}>
                                                <div style={{ color: '#666', fontSize: '0.9rem' }}>Reward Multiplier</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: tier.color }}>
                                                    {multiplier}x
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '20px' }}>
                                                <div style={{ color: '#666', fontSize: '0.9rem' }}>Total Staked</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                                    {stats ? parseFloat(stats.totalStaked).toFixed(2) : '0.00'} ETH
                                                </div>
                                            </div>

                                            {wallet.isConnected && (
                                                <button
                                                    onClick={() => setPoolStakeModal({
                                                        isOpen: true,
                                                        tier: index,
                                                        lockPeriod: 0,
                                                        amount: ''
                                                    })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '12px',
                                                        backgroundColor: tier.color,
                                                        color: tier.name === 'Diamond' ? '#000' : '#fff',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        fontSize: '14px',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    💎 Stake in {tier.name}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pool Distribution Chart */}
                        {poolDistributionData.length > 0 && (
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                marginBottom: '30px',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <h3 style={{ marginBottom: '20px', color: '#333' }}>Pool Distribution</h3>
                                <div style={{ width: '100%', height: '400px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={poolDistributionData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {poolDistributionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => [`${value.toFixed(2)} ETH`, 'Staked']} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* User Positions */}
                        {wallet.isConnected && userPositions.length > 0 && (
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <h3 style={{ marginBottom: '20px', color: '#333' }}>Your Staking Positions</h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Pool</th>
                                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Lock Period</th>
                                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Amount</th>
                                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Pending Rewards</th>
                                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Unlock Status</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {userPositions.map((position, index) => (
                                            <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                                    <span style={{
                                                        backgroundColor: POOL_TIERS[position.tier].color,
                                                        color: POOL_TIERS[position.tier].name === 'Diamond' ? '#000' : '#fff',
                                                        padding: '4px 12px',
                                                        borderRadius: '15px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {POOL_TIERS[position.tier].icon} {POOL_TIERS[position.tier].name}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 'bold' }}>
                                                            {LOCK_PERIODS[position.lockPeriod].name}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                                            {LOCK_PERIODS[position.lockPeriod].bonus}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                                    <div style={{ fontWeight: 'bold' }}>
                                                        {parseFloat(position.amount).toFixed(4)} ETH
                                                    </div>
                                                </td>
                                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                                    <div style={{ fontWeight: 'bold', color: '#28a745' }}>
                                                        {parseFloat(position.pendingRewards).toFixed(6)} DPN
                                                    </div>
                                                </td>
                                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                                    {position.canWithdraw ? (
                                                        <span style={{
                                                            backgroundColor: '#d4edda',
                                                            color: '#155724',
                                                            padding: '4px 12px',
                                                            borderRadius: '15px',
                                                            fontSize: '0.8rem'
                                                        }}>
                                                            🟢 Unlocked
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            backgroundColor: '#fff3cd',
                                                            color: '#856404',
                                                            padding: '4px 12px',
                                                            borderRadius: '15px',
                                                            fontSize: '0.8rem'
                                                        }}>
                                                            🔒 {formatTimeRemaining(position.timeToUnlock)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Empty state for pools */}
                        {wallet.isConnected && userPositions.length === 0 && (
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '40px',
                                textAlign: 'center',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                                color: '#666'
                            }}>
                                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🏆</div>
                                <h3 style={{ marginBottom: '10px' }}>No Pool Positions Yet</h3>
                                <p>Start earning multiplied rewards by staking in our tiered pools!</p>
                                <button
                                    onClick={() => setPoolStakeModal({
                                        isOpen: true,
                                        tier: 0,
                                        lockPeriod: 0,
                                        amount: ''
                                    })}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: '#007bff',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        marginTop: '15px'
                                    }}
                                >
                                    🥉 Start with Bronze Pool
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Pool Stake Modal */}
            {poolStakeModal.isOpen && (
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
                        maxWidth: '600px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>
                            💎 Stake in {POOL_TIERS[poolStakeModal.tier].name} Pool
                        </h2>
                        <p style={{ color: '#666', marginBottom: '20px' }}>
                            Stake ETH to earn {(poolStats[poolStakeModal.tier]?.tierMultiplier / 100 || 100).toFixed(1)}x multiplied rewards with optional time-lock bonuses.
                        </p>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Lock Period:
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                                {LOCK_PERIODS.map((period, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setPoolStakeModal(prev => ({...prev, lockPeriod: index}))}
                                        style={{
                                            padding: '12px',
                                            border: `2px solid ${poolStakeModal.lockPeriod === index ? POOL_TIERS[poolStakeModal.tier].color : '#e9ecef'}`,
                                            borderRadius: '8px',
                                            backgroundColor: poolStakeModal.lockPeriod === index ? POOL_TIERS[poolStakeModal.tier].color + '20' : 'white',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <div style={{ fontWeight: 'bold' }}>{period.name}</div>
                                        <div style={{ color: '#666' }}>{period.bonus}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Amount (ETH):
                            </label>
                            <input
                                type="number"
                                placeholder={`Minimum: ${POOL_TIERS[poolStakeModal.tier].minStake}`}
                                step="0.01"
                                value={poolStakeModal.amount}
                                onChange={(e) => setPoolStakeModal(prev => ({...prev, amount: e.target.value}))}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px solid #e9ecef',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    outline: 'none'
                                }}
                            />
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                                Minimum stake: {POOL_TIERS[poolStakeModal.tier].minStake} ETH
                            </div>
                        </div>

                        <div style={{
                            backgroundColor: '#f8f9fa',
                            padding: '15px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            border: '1px solid #e9ecef'
                        }}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Reward Calculation:</h4>
                            <div style={{ fontSize: '14px', color: '#666' }}>
                                <div>• Pool Multiplier: {(poolStats[poolStakeModal.tier]?.tierMultiplier / 100 || 100).toFixed(1)}x</div>
                                <div>• Time Bonus: {LOCK_PERIODS[poolStakeModal.lockPeriod].multiplier}</div>
                                <div style={{ fontWeight: 'bold', color: '#28a745', marginTop: '5px' }}>
                                    Total Multiplier: {((poolStats[poolStakeModal.tier]?.tierMultiplier / 100 || 100) * parseFloat(LOCK_PERIODS[poolStakeModal.lockPeriod].multiplier)).toFixed(2)}x
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setPoolStakeModal({ isOpen: false, tier: 0, lockPeriod: 0, amount: '' })}
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
                                onClick={() => stakeToPool(poolStakeModal.tier, poolStakeModal.lockPeriod, poolStakeModal.amount)}
                                disabled={!poolStakeModal.amount || parseFloat(poolStakeModal.amount) < parseFloat(POOL_TIERS[poolStakeModal.tier].minStake)}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: (!poolStakeModal.amount || parseFloat(poolStakeModal.amount) < parseFloat(POOL_TIERS[poolStakeModal.tier].minStake))
                                        ? '#6c757d' : POOL_TIERS[poolStakeModal.tier].color,
                                    color: POOL_TIERS[poolStakeModal.tier].name === 'Diamond' && poolStakeModal.amount && parseFloat(poolStakeModal.amount) >= parseFloat(POOL_TIERS[poolStakeModal.tier].minStake) ? '#000' : 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: (!poolStakeModal.amount || parseFloat(poolStakeModal.amount) < parseFloat(POOL_TIERS[poolStakeModal.tier].minStake))
                                        ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {POOL_TIERS[poolStakeModal.tier].icon} Stake in {POOL_TIERS[poolStakeModal.tier].name}
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
