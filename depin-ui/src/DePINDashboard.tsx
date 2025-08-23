import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Add MetaMask types
declare global {
    interface Window {
        ethereum?: any;
        ethers?: any;
    }
}

// Contract addresses - CONFIRMED WORKING from debug script
const CONTRACT_ADDRESSES = {
    DPN_TOKEN: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    NODE_REGISTRY: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    PARTICIPATION: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    STAKING_POOL: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    NODE_RIGHTS_NFT: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
};

// WORKING ABIs - confirmed by debug script
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
    "function claimAllRewards() external"
];

const PARTICIPATION_ABI = [
    "function stakeToNode(uint256 nodeId) external payable",
    "function claimReward(uint256 nodeId) external",
    "function registerNode(string memory metadata) external"
];

const GRAPHQL_ENDPOINT = 'http://localhost:8000/subgraphs/name/participation-subgraph';
const RPC_ENDPOINT = 'http://localhost:4000/rpc';

// Utility functions
const formatAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
const formatEth = (wei: string | number): string => (parseFloat(wei.toString()) / 1e18).toFixed(2);
const formatTime = (timestamp: string): string => new Date(parseInt(timestamp) * 1000).toLocaleString();

const DePINDashboard: React.FC = () => {
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

    // NEW: Contract-based data
    const [contractData, setContractData] = useState({
        dpnBalance: '0',
        stakingPositions: 0,
        totalSupply: '0'
    });

    // Transaction state
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

    // NEW: Fetch contract data directly
    const fetchContractData = async () => {
        if (!wallet.account) return;

        try {
            // Get DPN balance
            const dpnContract = getReadOnlyContract(CONTRACT_ADDRESSES.DPN_TOKEN, DPN_TOKEN_ABI);
            const balance = await dpnContract.balanceOf(wallet.account);
            const totalSupply = await dpnContract.totalSupply();

            // Get staking positions
            const stakingContract = getReadOnlyContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const positionCount = await stakingContract.userPositionCount(wallet.account);

            setContractData({
                dpnBalance: (window as any).ethers.utils.formatEther(balance),
                stakingPositions: positionCount.toNumber(),
                totalSupply: (window as any).ethers.utils.formatEther(totalSupply)
            });

            console.log('📊 Contract data loaded:', {
                dpnBalance: (window as any).ethers.utils.formatEther(balance),
                stakingPositions: positionCount.toNumber(),
                totalSupply: (window as any).ethers.utils.formatEther(totalSupply)
            });

        } catch (error) {
            console.error('Error fetching contract data:', error);
        }
    };

    // Pool staking function
    const stakeToPool = async (tier: number, lockPeriod: number, amount: string) => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const amountWei = (window as any).ethers.utils.parseEther(amount);

            const tx = await contract.stakeToPool(tier, lockPeriod, { value: amountWei });
            addTransaction(tx.hash, 'pool_stake', { tier, lockPeriod, amount });

            showNotification('success', `Pool staking transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setPoolStakeModal({ isOpen: false, tier: 0, lockPeriod: 0, amount: '' });

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully staked ${amount} ETH in pool!`);
                fetchContractData();
                fetchSubgraphData();
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Pool staking error:', error);
            showNotification('error', `Pool staking failed: ${error.message || 'Unknown error'}`);
        }
    };

    // Claim all rewards function
    const claimAllRewards = async () => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const tx = await contract.claimAllRewards();
            addTransaction(tx.hash, 'claim_all');

            showNotification('success', `Claim all transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully claimed all rewards!`);
                fetchContractData();
                fetchSubgraphData();
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Claim all error:', error);
            showNotification('error', `Claim all failed: ${error.message || 'Unknown error'}`);
        }
    };

    // Node operations
    const stakeForNode = async (nodeId: string, amount: string) => {
        if (!wallet.isConnected) {
            showNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
            const amountWei = (window as any).ethers.utils.parseEther(amount);

            const tx = await contract.stakeToNode(nodeId, { value: amountWei });
            addTransaction(tx.hash, 'stake', { nodeId, amount });

            showNotification('success', `Staking transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setStakeModal({ isOpen: false, nodeId: '', amount: '' });

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully staked ${amount} ETH on Node ${nodeId}!`);
                fetchSubgraphData();
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
            const tx = await contract.claimReward(nodeId);
            addTransaction(tx.hash, 'claim', { nodeId });

            showNotification('success', `Claim transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully claimed rewards for Node ${nodeId}!`);
                fetchContractData();
                fetchSubgraphData();
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
            const contract = getContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
            const tx = await contract.registerNode(metadata);
            addTransaction(tx.hash, 'register');

            showNotification('success', `Registration transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setRegisterModal({ isOpen: false, metadata: '' });

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                updateTransaction(tx.hash, 'confirmed');
                showNotification('success', `Successfully registered new node!`);
                fetchSubgraphData();
            } else {
                updateTransaction(tx.hash, 'failed');
                showNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Registration error:', error);
            showNotification('error', `Registration failed: ${error.message || 'Unknown error'}`);
        }
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
        setContractData({ dpnBalance: '0', stakingPositions: 0, totalSupply: '0' });
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
                            chainName: 'Hardhat Network',
                            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                            rpcUrls: ['http://localhost:8545'],
                        }],
                    });
                } catch (addError) {
                    showNotification('error', 'Failed to add Hardhat network. Please add manually.');
                }
            } else {
                showNotification('error', 'Failed to switch network. Please switch manually to Hardhat (Chain ID: 31337)');
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
                console.log("📊 Subgraph data loaded:", result.data);
            } else {
                console.log("⚠️ No subgraph data:", result);
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
            fetchContractData();
        }
    }, [wallet.isConnected, wallet.account]);

    useEffect(() => {
        fetchBlockNumber();
        fetchSubgraphData();
        const interval = setInterval(() => {
            fetchBlockNumber();
            fetchSubgraphData();
            if (wallet.isConnected) {
                fetchContractData();
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [wallet.isConnected]);

    // Process data for charts (if available)
    const processChartData = () => {
        const rewardTimeline = data.rewards
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

        const stakingByNode = data.nodes.map((node: any) => {
            const nodeStakes = data.stakes.filter((s: any) => s.nodeId === node.nodeId);
            const totalStaked = nodeStakes.reduce((sum, stake: any) => sum + parseFloat(stake.amount), 0);
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
        staked: formatEth(data.stakes.reduce((sum, stake: any) => sum + parseFloat(stake.amount), 0)),
        rewards: data.rewards.reduce((sum, reward: any) => sum + parseFloat(reward.amount), 0),
        uptime: data.uptimes.reduce((sum, uptime: any) => sum + parseFloat(uptime.minutesUp), 0)
    };

    // Filter nodes for table
    const filteredNodes = data.nodes.filter((node: any) => {
        const matchesSearch = node.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
            node.nodeId.includes(searchTerm);
        const matchesUser = userFilter === 'all' ||
            (userFilter === 'mine' && wallet.account &&
                node.owner.toLowerCase() === wallet.account.toLowerCase());
        return matchesSearch && matchesUser;
    });

    // Get user-specific data
    const userNodes = wallet.account ? data.nodes.filter((node: any) =>
        node.owner.toLowerCase() === wallet.account!.toLowerCase()
    ) : [];

    const userTotalStake = userNodes.reduce((sum, node: any) => {
        const nodeStakes = data.stakes.filter((s: any) => s.nodeId === node.nodeId);
        return sum + nodeStakes.reduce((stakeSum, stake: any) => stakeSum + parseFloat(stake.amount), 0);
    }, 0);

    const userTotalRewards = data.rewards
        .filter((reward: any) => wallet.account && reward.owner.toLowerCase() === wallet.account.toLowerCase())
        .reduce((sum, reward: any) => sum + parseFloat(reward.amount), 0);

    const tierNames = ['Bronze', 'Silver', 'Gold', 'Diamond'];

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
                                            ⚠️ Switch to Hardhat
                                        </button>
                                    )}
                                    <div style={{
                                        padding: '8px 16px',
                                        backgroundColor: wallet.chainId === 31337 ? '#28a745' : '#ffc107',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}>
                                        <div style={{ fontWeight: 'bold' }}>🔗 {formatAddress(wallet.account!)}</div>
                                        <div style={{ fontSize: '12px' }}>
                                            {wallet.balance} ETH | {parseFloat(contractData.dpnBalance).toFixed(0)} DPN
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

                {/* Contract Status Card */}
                {wallet.isConnected && (
                    <div style={{
                        backgroundColor: '#e8f5e8',
                        borderRadius: '10px',
                        padding: '25px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        border: '2px solid #28a745'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#155724' }}>
                            📊 Live Contract Data
                        </h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                    {parseFloat(contractData.dpnBalance).toFixed(0)}
                                </div>
                                <div style={{ color: '#666' }}>DPN Balance</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                    {contractData.stakingPositions}
                                </div>
                                <div style={{ color: '#666' }}>Staking Positions</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                    {parseFloat(contractData.totalSupply).toFixed(0)}
                                </div>
                                <div style={{ color: '#666' }}>DPN Total Supply</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* User Stats (when connected and has subgraph data) */}
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
                            👤 Your Node Activity (Subgraph Data)
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
                        </div>
                    </div>
                )}

                {/* Subgraph Status Warning */}
                {data.nodes.length === 0 && (
                    <div style={{
                        backgroundColor: '#fff3cd',
                        borderRadius: '10px',
                        padding: '20px',
                        marginBottom: '20px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        border: '2px solid #ffc107'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#856404' }}>
                            ⚠️ Subgraph Data Not Available
                        </h3>
                        <p style={{ margin: 0, color: '#856404' }}>
                            The subgraph is not returning any data yet. This could be because:
                        </p>
                        <ul style={{ color: '#856404', marginTop: '10px' }}>
                            <li>The subgraph needs to be redeployed to index from the current block</li>
                            <li>The test data was generated before the subgraph was running</li>
                            <li>Contract interactions will still work via direct contract calls</li>
                        </ul>
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
                                            {tx.type.replace('_', ' ')}
                                        </span>
                                        {tx.nodeId && ` Node ${tx.nodeId}`}
                                        {tx.tier !== undefined && ` ${tierNames[tx.tier]} Tier`}
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
                                        <code style={{ fontSize: '12px' }}>
                                            {tx.hash.slice(0, 8)}...
                                        </code>
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
                            <button
                                onClick={() => setPoolStakeModal({ isOpen: true, tier: 0, lockPeriod: 0, amount: '' })}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                🏆 Stake in Pool
                            </button>
                            <button
                                onClick={claimAllRewards}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#6f42c1',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                🎁 Claim All Rewards
                            </button>
                        </div>
                    </div>
                )}

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
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#007bff' }}>
                            {totals.nodes || 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '5px' }}>
                            {data.nodes.length === 0 ? 'From Subgraph' : 'From Contract Events'}
                        </div>
                    </div>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>TOTAL STAKED</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#28a745' }}>
                            {totals.staked || 'N/A'} ETH
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '5px' }}>
                            {data.stakes.length === 0 ? 'From Subgraph' : 'From Contract Events'}
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
                            {totals.rewards || 'N/A'} DPN
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '5px' }}>
                            {data.rewards.length === 0 ? 'From Subgraph' : 'From Contract Events'}
                        </div>
                    </div>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        textAlign: 'center',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', fontWeight: 'bold' }}>NETWORK UPTIME</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fd7e14' }}>
                            {totals.uptime || 'N/A'} min
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '5px' }}>
                            {data.uptimes.length === 0 ? 'From Subgraph' : 'From Contract Events'}
                        </div>
                    </div>
                </div>

                {/* Charts */}
                {(cumulativeRewardData.length > 0 || stakingByNode.length > 0) && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
                        gap: '20px',
                        marginBottom: '30px'
                    }}>
                        {cumulativeRewardData.length > 0 && (
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
                        )}

                        {stakingByNode.length > 0 && (
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
                        )}
                    </div>
                )}

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

                    {/* Search and Filter */}
                    {data.nodes.length > 0 && (
                        <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                    )}

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
                            {filteredNodes.map((node: any, index: number) => (
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
                                : data.nodes.length === 0
                                    ? "No nodes found in subgraph. Try registering a new node!"
                                    : "No nodes found matching your search criteria."
                            }
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
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
                        maxWidth: '500px',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>
                            🏆 Stake in Pool
                        </h2>
                        <p style={{ color: '#666', marginBottom: '20px' }}>
                            Choose a staking tier and lock period for better rewards.
                        </p>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Tier:
                            </label>
                            <select
                                value={poolStakeModal.tier}
                                onChange={(e) => setPoolStakeModal(prev => ({...prev, tier: parseInt(e.target.value)}))}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px solid #e9ecef',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    outline: 'none'
                                }}
                            >
                                {tierNames.map((name, index) => (
                                    <option key={index} value={index}>{name} (Tier {index})</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Lock Period:
                            </label>
                            <select
                                value={poolStakeModal.lockPeriod}
                                onChange={(e) => setPoolStakeModal(prev => ({...prev, lockPeriod: parseInt(e.target.value)}))}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '2px solid #e9ecef',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    outline: 'none'
                                }}
                            >
                                <option value={0}>No Lock (0 days)</option>
                                <option value={1}>30 days</option>
                                <option value={2}>90 days</option>
                                <option value={3}>365 days</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                Amount (ETH):
                            </label>
                            <input
                                type="number"
                                placeholder="0.1"
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
                                disabled={!poolStakeModal.amount || parseFloat(poolStakeModal.amount) <= 0}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: !poolStakeModal.amount || parseFloat(poolStakeModal.amount) <= 0
                                        ? '#6c757d' : '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: !poolStakeModal.amount || parseFloat(poolStakeModal.amount) <= 0
                                        ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Stake in Pool
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