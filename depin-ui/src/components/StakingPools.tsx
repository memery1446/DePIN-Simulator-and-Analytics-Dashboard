import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import PoolDashboard from './PoolDashboard';
import UserPositions from './UserPositions';

// Contract addresses
const CONTRACT_ADDRESSES = {
    STAKING_POOL: '0x51A1ceB83B83F1985a81C295d1fF28Afef186E02'
};

const STAKING_POOL_ABI = [
    "function stakeToPool(uint8 tier, uint8 lockPeriod) external payable",
    "function withdrawStake(uint256 positionId) external",
    "function claimRewards(uint256 positionId) external",
    "function claimAllRewards() external",
    "function getPositionDetails(address user, uint256 positionId) external view returns (tuple(uint8 tier, uint8 lockPeriod, uint256 amount, uint256 shares, uint256 stakedAt, uint256 unlocksAt, uint256 lastRewardClaim, bool isActive), uint256 pendingRewards, uint256 timeToUnlock, bool canWithdraw)",
    "function getUserPositions(address user) external view returns (tuple(uint8 tier, uint8 lockPeriod, uint256 amount, uint256 shares, uint256 stakedAt, uint256 unlocksAt, uint256 lastRewardClaim, bool isActive)[])",
    "function getPoolStats(uint8 tier) external view returns (tuple(uint256 minStake, uint256 tierMultiplier, uint256 baseRewardRate, uint256 totalStaked, uint256 totalShares, bool isActive), uint256 activeStakers, uint256 averageStake, uint256 poolUtilization)",
    "function getGlobalStats() external view returns (uint256 tvl, uint256 totalRewards, uint256 totalStakers, uint256[4] poolDistribution)",
    "function userPositionCount(address user) external view returns (uint256)"
];

// Pool tier configuration
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

interface StakingPoolsProps {
    wallet: {
        isConnected: boolean;
        account: string | null;
        chainId: number | null;
        balance: string;
    };
    onNotification: (type: 'success' | 'error', message: string) => void;
    onTransaction: (hash: string, type: string, details?: any) => void;
    onUpdateTransaction: (hash: string, status: 'confirmed' | 'failed') => void;
}

interface PoolStakeModalState {
    isOpen: boolean;
    tier: number;
    lockPeriod: number;
    amount: string;
}

const StakingPools: React.FC<StakingPoolsProps> = ({
                                                       wallet,
                                                       onNotification,
                                                       onTransaction,
                                                       onUpdateTransaction
                                                   }) => {
    const [poolStakeModal, setPoolStakeModal] = useState<PoolStakeModalState>({
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
    const [loading, setLoading] = useState(false);

    // Contract interaction functions
    const getContract = (address: string, abi: string[]) => {
        if (!window.ethereum) throw new Error('MetaMask not available');
        const provider = new (window as any).ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        return new (window as any).ethers.Contract(address, abi, signer);
    };

    const stakeToPool = async (tier: number, lockPeriod: number, amount: string) => {
        if (!wallet.isConnected) {
            onNotification('error', 'Please connect your wallet first');
            return;
        }

        try {
            const contract = getContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
            const amountWei = (window as any).ethers.utils.parseEther(amount);

            const tx = await contract.stakeToPool(tier, lockPeriod, { value: amountWei });
            onTransaction(tx.hash, 'pool_stake', { poolTier: tier, amount });

            onNotification('success', `Pool staking transaction submitted! Hash: ${tx.hash.slice(0, 10)}...`);
            setPoolStakeModal({ isOpen: false, tier: 0, lockPeriod: 0, amount: '' });

            const receipt = await tx.wait();
            if (receipt.status === 1) {
                onUpdateTransaction(tx.hash, 'confirmed');
                onNotification('success', `Successfully staked ${amount} ETH in ${POOL_TIERS[tier].name} pool!`);
                fetchPoolData();
            } else {
                onUpdateTransaction(tx.hash, 'failed');
                onNotification('error', 'Transaction failed');
            }
        } catch (error: any) {
            console.error('Pool staking error:', error);
            onNotification('error', `Pool staking failed: ${error.message || 'Unknown error'}`);
        }
    };

    const fetchPoolData = async () => {
        if (!wallet.account) return;

        try {
            setLoading(true);
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
                            id: i,
                            tier: positionDetails[0].tier,
                            lockPeriod: positionDetails[0].lockPeriod,
                            amount: (window as any).ethers.utils.formatEther(positionDetails[0].amount),
                            pendingRewards: (window as any).ethers.utils.formatEther(positionDetails[1]),
                            timeToUnlock: positionDetails[2].toNumber(),
                            canWithdraw: positionDetails[3],
                            stakedAt: positionDetails[0].stakedAt.toNumber(),
                            unlocksAt: positionDetails[0].unlocksAt.toNumber()
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
                        totalStaked: (window as any).ethers.utils.formatEther(stats[0].totalStaked),
                        totalShares: (window as any).ethers.utils.formatEther(stats[0].totalShares),
                        activeStakers: stats[1].toNumber(),
                        isActive: stats[0].isActive
                    });
                } catch (error) {
                    poolStatsArray.push({
                        minStake: POOL_TIERS[tier].minStake,
                        tierMultiplier: tier === 0 ? 10000 : tier === 1 ? 15000 : tier === 2 ? 20000 : 30000,
                        totalStaked: '0',
                        totalShares: '0',
                        activeStakers: 0,
                        isActive: true
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
            onNotification('error', 'Failed to fetch pool data');
        } finally {
            setLoading(false);
        }
    };

    // Effects
    useEffect(() => {
        if (wallet.isConnected) {
            fetchPoolData();
        }
    }, [wallet.isConnected, wallet.account]);

    useEffect(() => {
        if (wallet.isConnected) {
            const interval = setInterval(fetchPoolData, 10000); // Refresh every 10 seconds
            return () => clearInterval(interval);
        }
    }, [wallet.isConnected]);

    // Calculate user totals
    const userPoolTotalStaked = userPositions.reduce((sum, pos) => sum + parseFloat(pos.amount), 0);
    const userPoolTotalRewards = userPositions.reduce((sum, pos) => sum + parseFloat(pos.pendingRewards), 0);

    // Process data for pool distribution chart
    const poolDistributionData = POOL_TIERS.map((tier, index) => ({
        name: tier.name,
        value: globalPoolStats.poolDistribution[index] || 0,
        color: tier.color
    })).filter(item => item.value > 0);

    return (
        <div style={{ padding: '0' }}>
            {/* Pool Dashboard */}
            <PoolDashboard
                globalStats={globalPoolStats}
                userTotalStaked={userPoolTotalStaked}
                userTotalRewards={userPoolTotalRewards}
                userPositionCount={userPositions.length}
                poolDistributionData={poolDistributionData}
            />

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
                                    <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                        {stats?.activeStakers || 0} stakers
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
                                        disabled={loading}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            backgroundColor: loading ? '#6c757d' : tier.color,
                                            color: tier.name === 'Diamond' && !loading ? '#000' : '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            cursor: loading ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {loading ? '⏳ Loading...' : `💎 Stake in ${tier.name}`}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* User Positions */}
            {wallet.isConnected && (
                <UserPositions
                    positions={userPositions}
                    onClaimRewards={(positionId) => {
                        // Implementation will be in UserPositions component
                    }}
                    onWithdrawStake={(positionId) => {
                        // Implementation will be in UserPositions component
                    }}
                    onClaimAllRewards={() => {
                        // Implementation will be in UserPositions component
                    }}
                    loading={loading}
                />
            )}

            {/* Empty state for pools */}
            {wallet.isConnected && userPositions.length === 0 && (
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '40px',
                    textAlign: 'center',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    color: '#666',
                    marginTop: '30px'
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
                            backgroundColor: '#CD7F32',
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
        </div>
    );
};

export default StakingPools;
