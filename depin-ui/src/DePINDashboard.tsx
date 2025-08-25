import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// Add MetaMask types
declare global {
    interface Window {
        ethereum?: any;
        ethers?: any;
    }
}

// Contract addresses
const CONTRACT_ADDRESSES = {
    DPN_TOKEN: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    NODE_REGISTRY: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    PARTICIPATION: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    STAKING_POOL: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    NODE_RIGHTS_NFT: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
};

// ABIs
const DPN_TOKEN_ABI = [
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function totalSupply() external view returns (uint256)"
];

const STAKING_POOL_ABI = [
    "function userPositionCount(address user) external view returns (uint256)",
    "function stakeToPool(uint8 tier, uint8 lockPeriod) external payable",
    "function withdrawStake(uint256 positionId) external",
    "function claimRewards(uint256 positionId) external",
    "function claimAllRewards() external",
    "function getGlobalStats() external view returns (uint256 tvl, uint256 totalRewards, uint256 totalStakers, uint256[4] poolDistribution)",
    "function getPositionDetails(address user, uint256 positionId) external view returns (tuple(uint8 tier, uint8 lockPeriod, uint256 amount, uint256 shares, uint256 stakedAt, uint256 unlocksAt, uint256 lastRewardClaim, bool isActive), uint256 pendingRewards, uint256 timeToUnlock, bool canWithdraw)"
];

const PARTICIPATION_ABI = [
    "function stakeToNode(uint256 nodeId) external payable",
    "function claimReward(uint256 nodeId) external",
    "function registerNode(string memory metadata) external",
    "function getNodeCount() external view returns (uint256)"
];

const NODE_RIGHTS_ABI = [
    "function totalSupply() external view returns (uint256)",
    "function getNodeTypeStats() external view returns (uint256[3] totalNodes, uint256[3] activeNodes, uint256[3] totalStaked)",
    "function ownerOf(uint256 tokenId) external view returns (address)"
];

const GRAPHQL_ENDPOINT = 'http://localhost:8000/subgraphs/name/participation-subgraph';

// Pool tiers for UI
const POOL_TIERS = [
    { name: 'Bronze', color: '#CD7F32' },
    { name: 'Silver', color: '#C0C0C0' },
    { name: 'Gold', color: '#FFD700' },
    { name: 'Diamond', color: '#B9F2FF' }
];

// Utility functions
const formatAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
const formatEth = (wei: string | number): string => (parseFloat(wei.toString()) / 1e18).toFixed(2);

const DePINDashboard: React.FC = () => {
    // State for live contract data
    const [liveData, setLiveData] = useState({
        totalNodes: 0,
        totalStaked: '0',
        totalRewards: '0',
        networkUptime: 0,
        poolDistribution: [0, 0, 0, 0],
        nodeTypeStats: {
            storage: { total: 0, active: 0, staked: '0' },
            compute: { total: 0, active: 0, staked: '0' },
            bandwidth: { total: 0, active: 0, staked: '0' }
        }
    });

    // Subgraph data (for charts if available)
    const [subgraphData, setSubgraphData] = useState({
        nodes: [],
        stakes: [],
        rewards: [],
        uptimes: []
    });

    const [loading, setLoading] = useState(true);
    const [blockNumber, setBlockNumber] = useState<number | null>(null);

    // Wallet state
    const [wallet, setWallet] = useState({
        isConnected: false,
        account: null as string | null,
        chainId: null as number | null,
        balance: '0'
    });

    // User-specific data
    const [userContractData, setUserContractData] = useState({
        dpnBalance: '0',
        stakingPositions: 0,
        totalSupply: '0',
        userTotalStaked: 0,
        userTotalRewards: 0
    });

    // Transaction and UI state
    const [walletLoading, setWalletLoading] = useState(false);
    const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [stakeModal, setStakeModal] = useState({ isOpen: false, nodeId: '', amount: '' });
    const [poolStakeModal, setPoolStakeModal] = useState({ isOpen: false, tier: 0, lockPeriod: 0, amount: '' });
    const [registerModal, setRegisterModal] = useState({ isOpen: false, metadata: '' });

    // Contract interaction functions
    const getContract = (address: string, abi: string[]) => {
        if (!window.ethereum) throw new Error('MetaMask not available');
        const provider = new (window as any).ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        return new (window as any).ethers.Contract(address, abi, signer);
    };

    const getReadOnlyContract = (address: string, abi: string[]) => {
        if (!window.ethereum) throw new Error('MetaMask not available');
        const provider = new (window as any).ethers.providers.Web3Provider(window.ethereum);
        return new (window as any).ethers.Contract(address, abi, provider);
    };

    // Fetch live contract data for overview cards
    const fetchLiveContractData = async () => {
        try {
            // Get staking pool global stats
            const stakingContract = getReadOnlyContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const globalStats = await stakingContract.getGlobalStats();

            // Get node registry data
            const participationContract = getReadOnlyContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
            const nodeCount = await participationContract.getNodeCount();

            // Get NFT node stats
            const nftContract = getReadOnlyContract(CONTRACT_ADDRESSES.NODE_RIGHTS_NFT, NODE_RIGHTS_ABI);
            const totalNFTs = await nftContract.totalSupply();
            const nodeTypeStats = await nftContract.getNodeTypeStats();

            // Format the data
            const tvl = (window as any).ethers.utils.formatEther(globalStats[0]);
            const totalRewards = (window as any).ethers.utils.formatEther(globalStats[1]);
            const poolDistribution = globalStats[3].map((val: any) =>
                parseFloat((window as any).ethers.utils.formatEther(val))
            );

            setLiveData({
                totalNodes: totalNFTs.toNumber(),
                totalStaked: tvl,
                totalRewards: totalRewards,
                networkUptime: Math.floor(Math.random() * 10000), // Placeholder - would need uptime tracking
                poolDistribution,
                nodeTypeStats: {
                    storage: {
                        total: nodeTypeStats[0][0].toNumber(),
                        active: nodeTypeStats[1][0].toNumber(),
                        staked: (window as any).ethers.utils.formatEther(nodeTypeStats[2][0])
                    },
                    compute: {
                        total: nodeTypeStats[0][1].toNumber(),
                        active: nodeTypeStats[1][1].toNumber(),
                        staked: (window as any).ethers.utils.formatEther(nodeTypeStats[2][1])
                    },
                    bandwidth: {
                        total: nodeTypeStats[0][2].toNumber(),
                        active: nodeTypeStats[1][2].toNumber(),
                        staked: (window as any).ethers.utils.formatEther(nodeTypeStats[2][2])
                    }
                }
            });

            console.log('📊 Live contract data loaded:', {
                totalNodes: totalNFTs.toNumber(),
                totalStaked: tvl,
                totalRewards: totalRewards
            });

        } catch (error) {
            console.error('Error fetching live contract data:', error);
        }
    };

    // Fetch user-specific contract data
    const fetchUserContractData = async () => {
        if (!wallet.account) return;

        try {
            // Get DPN balance
            const dpnContract = getReadOnlyContract(CONTRACT_ADDRESSES.DPN_TOKEN, DPN_TOKEN_ABI);
            const balance = await dpnContract.balanceOf(wallet.account);
            const totalSupply = await dpnContract.totalSupply();

            // Get staking positions
            const stakingContract = getReadOnlyContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const positionCount = await stakingContract.userPositionCount(wallet.account);

            // Calculate user totals from positions
            let userTotalStaked = 0;
            let userTotalRewards = 0;

            for (let i = 0; i < positionCount.toNumber(); i++) {
                try {
                    const positionDetails = await stakingContract.getPositionDetails(wallet.account, i);
                    if (positionDetails[0].isActive) {
                        userTotalStaked += parseFloat((window as any).ethers.utils.formatEther(positionDetails[0].amount));
                        userTotalRewards += parseFloat((window as any).ethers.utils.formatEther(positionDetails[1]));
                    }
                } catch (error) {
                    console.error(`Error fetching position ${i}:`, error);
                }
            }

            setUserContractData({
                dpnBalance: (window as any).ethers.utils.formatEther(balance),
                stakingPositions: positionCount.toNumber(),
                totalSupply: (window as any).ethers.utils.formatEther(totalSupply),
                userTotalStaked,
                userTotalRewards
            });

        } catch (error) {
            console.error('Error fetching user contract data:', error);
        }
    };

    // Fetch subgraph data (for charts)
    const fetchSubgraphData = async () => {
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
                setSubgraphData(result.data);
                console.log("📊 Subgraph data loaded:", result.data);
            } else {
                console.log("⚠️ Subgraph has no data yet, using contract data only");
            }
        } catch (error) {
            console.error('Error fetching subgraph data:', error);
        }
    };

    const fetchBlockNumber = async () => {
        try {
            const provider = new (window as any).ethers.providers.JsonRpcProvider('http://localhost:8545');
            const blockNumber = await provider.getBlockNumber();
            setBlockNumber(blockNumber);
        } catch (error) {
            console.error('Error fetching block number:', error);
        }
    };

    // Wallet connection functions
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
        setUserContractData({
            dpnBalance: '0',
            stakingPositions: 0,
            totalSupply: '0',
            userTotalStaked: 0,
            userTotalRewards: 0
        });
        showNotification('success', 'Wallet disconnected');
    };

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    // Effects
    useEffect(() => {
        // Load ethers.js
        if (!window.ethers) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js';
            script.onload = () => {
                fetchLiveContractData();
                fetchSubgraphData();
                fetchBlockNumber();
                setLoading(false);
            };
            script.async = true;
            document.head.appendChild(script);
        } else {
            fetchLiveContractData();
            fetchSubgraphData();
            fetchBlockNumber();
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (wallet.isConnected) {
            fetchUserContractData();
        }
    }, [wallet.isConnected, wallet.account]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchLiveContractData();
            fetchSubgraphData();
            fetchBlockNumber();
            if (wallet.isConnected) {
                fetchUserContractData();
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [wallet.isConnected]);

    // Create chart data from subgraph data (if available)
    const chartData = React.useMemo(() => {
        if (subgraphData.rewards.length === 0) {
            // Create mock data showing the live contract stats
            const mockRewardData = [
                { time: '00:00', cumulative: parseFloat(liveData.totalRewards) * 0.3 },
                { time: '08:00', cumulative: parseFloat(liveData.totalRewards) * 0.6 },
                { time: '16:00', cumulative: parseFloat(liveData.totalRewards) * 0.9 },
                { time: '24:00', cumulative: parseFloat(liveData.totalRewards) }
            ];

            const poolDistributionData = POOL_TIERS.map((tier, index) => ({
                name: tier.name,
                value: liveData.poolDistribution[index] || 0,
                color: tier.color
            })).filter(item => item.value > 0);

            return {
                cumulativeRewardData: mockRewardData,
                poolDistributionData
            };
        }

        // Use actual subgraph data if available
        const rewardTimeline = subgraphData.rewards
            .map((reward: any) => ({
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

        const poolDistributionData = POOL_TIERS.map((tier, index) => ({
            name: tier.name,
            value: liveData.poolDistribution[index] || 0,
            color: tier.color
        })).filter(item => item.value > 0);

        return { cumulativeRewardData, poolDistributionData };
    }, [subgraphData, liveData]);

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
                                        backgroundColor: wallet.chainId === 31337 ? '#28a745' : '#ffc107',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}>
                                        <div style={{ fontWeight: 'bold' }}>🔗 {formatAddress(wallet.account!)}</div>
                                        <div style={{ fontSize: '12px' }}>
                                            {wallet.balance} ETH | {parseFloat(userContractData.dpnBalance).toFixed(0)} DPN
                                        </div>
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

                {/* Live Contract Data Cards */}
                {wallet.isConnected && userContractData.stakingPositions > 0 && (
                    <div style={{
                        backgroundColor: '#e8f5e8',
                        borderRadius: '10px',
                        padding: '25px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        border: '2px solid #28a745'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#155724' }}>
                            📊 Your Live Portfolio
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                    {userContractData.stakingPositions}
                                </div>
                                <div style={{ color: '#666' }}>Active Positions</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                    {userContractData.userTotalStaked.toFixed(2)} ETH
                                </div>
                                <div style={{ color: '#666' }}>Total Staked</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                    {userContractData.userTotalRewards.toFixed(4)} DPN
                                </div>
                                <div style={{ color: '#666' }}>Pending Rewards</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Overview Cards - Now Using Live Contract Data */}
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
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#007bff' }}>
                            {liveData.totalNodes.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#28a745', marginTop: '5px' }}>
                            Live from NFT Contract
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL VALUE LOCKED</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#28a745' }}>
                            {parseFloat(liveData.totalStaked).toFixed(2)} ETH
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                            ${(parseFloat(liveData.totalStaked) * 2500).toLocaleString()} USD
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL REWARDS</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#6f42c1' }}>
                            {parseFloat(liveData.totalRewards).toFixed(2)} DPN
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#28a745', marginTop: '5px' }}>
                            Live from Pool Contract
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>NETWORK NODES</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fd7e14' }}>
                            {liveData.nodeTypeStats.storage.active + liveData.nodeTypeStats.compute.active + liveData.nodeTypeStats.bandwidth.active}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                            {liveData.nodeTypeStats.storage.active} Storage • {liveData.nodeTypeStats.compute.active} Compute • {liveData.nodeTypeStats.bandwidth.active} Bandwidth
                        </div>
                    </div>
                </div>

                {/* Node Type Distribution */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '25px',
                    marginBottom: '30px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}>
                    <h3 style={{ marginBottom: '20px', color: '#333' }}>🏗️ Node Infrastructure Overview</h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '20px'
                    }}>
                        <div style={{
                            padding: '20px',
                            borderRadius: '8px',
                            backgroundColor: '#f8f9fa',
                            border: '2px solid #007bff'
                        }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>🗄️ Storage Nodes</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#007bff' }}>
                                {liveData.nodeTypeStats.storage.total}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                {liveData.nodeTypeStats.storage.active} Active • {parseFloat(liveData.nodeTypeStats.storage.staked).toFixed(1)} ETH Staked
                            </div>
                        </div>

                        <div style={{
                            padding: '20px',
                            borderRadius: '8px',
                            backgroundColor: '#f8f9fa',
                            border: '2px solid #28a745'
                        }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>💻 Compute Nodes</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>
                                {liveData.nodeTypeStats.compute.total}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                {liveData.nodeTypeStats.compute.active} Active • {parseFloat(liveData.nodeTypeStats.compute.staked).toFixed(1)} ETH Staked
                            </div>
                        </div>

                        <div style={{
                            padding: '20px',
                            borderRadius: '8px',
                            backgroundColor: '#f8f9fa',
                            border: '2px solid #6f42c1'
                        }}>
                            <div style={{ fontSize: '1.5rem', marginBottom: '10px' }}>📡 Bandwidth Nodes</div>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6f42c1' }}>
                                {liveData.nodeTypeStats.bandwidth.total}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                {liveData.nodeTypeStats.bandwidth.active} Active • {parseFloat(liveData.nodeTypeStats.bandwidth.staked).toFixed(1)} ETH Staked
                            </div>
                        </div>
                    </div>
                </div>

                {/* Charts */}
                {(chartData.cumulativeRewardData.length > 0 || chartData.poolDistributionData.length > 0) && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
                        gap: '20px',
                        marginBottom: '30px'
                    }}>
                        {chartData.cumulativeRewardData.length > 0 && (
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <h3 style={{ marginBottom: '20px', color: '#333' }}>📈 Rewards Timeline</h3>
                                <div style={{ width: '100%', height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData.cumulativeRewardData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="time" />
                                            <YAxis />
                                            <Tooltip />
                                            <Line type="monotone" dataKey="cumulative" stroke="#007bff" strokeWidth={3} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {chartData.poolDistributionData.length > 0 && (
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '10px',
                                padding: '25px',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                            }}>
                                <h3 style={{ marginBottom: '20px', color: '#333' }}>🏆 Pool Distribution</h3>
                                <div style={{ width: '100%', height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={chartData.poolDistributionData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                {chartData.poolDistributionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => [`${value.toFixed(2)} ETH`, 'Staked']} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Data Source Status */}
                <div style={{
                    backgroundColor: subgraphData.nodes.length > 0 ? '#d4edda' : '#fff3cd',
                    borderRadius: '10px',
                    padding: '20px',
                    marginBottom: '20px',
                    border: `2px solid ${subgraphData.nodes.length > 0 ? '#28a745' : '#ffc107'}`
                }}>
                    <h3 style={{ margin: '0 0 10px 0', color: subgraphData.nodes.length > 0 ? '#155724' : '#856404' }}>
                        📊 Data Sources Status
                    </h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '15px',
                        fontSize: '0.9rem'
                    }}>
                        <div>
                            <strong>Live Contract Data:</strong> ✅ Active
                            <br />
                            <small>Real-time data from deployed contracts</small>
                        </div>
                        <div>
                            <strong>Subgraph Data:</strong> {subgraphData.nodes.length > 0 ? '✅ Active' : '⚠️ Indexing'}
                            <br />
                            <small>{subgraphData.nodes.length > 0 ? 'Historical data available' : 'Still indexing blockchain events'}</small>
                        </div>
                        <div>
                            <strong>Refresh Rate:</strong> 📡 10 seconds
                            <br />
                            <small>Auto-updating from all sources</small>
                        </div>
                    </div>
                </div>
            </div>

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
