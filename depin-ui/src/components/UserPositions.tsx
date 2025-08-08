import React from 'react';

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

interface UserPositionsProps {
    positions: Array<{
        id: number;
        tier: number;
        lockPeriod: number;
        amount: string;
        pendingRewards: string;
        timeToUnlock: number;
        canWithdraw: boolean;
        stakedAt: number;
        unlocksAt: number;
    }>;
    onClaimRewards: (positionId: number) => void;
    onWithdrawStake: (positionId: number) => void;
    onClaimAllRewards: () => void;
    loading: boolean;
}

const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Unlocked';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const UserPositions: React.FC<UserPositionsProps> = ({
                                                         positions,
                                                         onClaimRewards,
                                                         onWithdrawStake,
                                                         onClaimAllRewards,
                                                         loading
                                                     }) => {
    if (positions.length === 0) {
        return null; // Component will be hidden, empty state handled by parent
    }

    const totalPendingRewards = positions.reduce((sum, pos) => sum + parseFloat(pos.pendingRewards), 0);
    const hasClaimableRewards = totalPendingRewards > 0;

    return (
        <div style={{ marginBottom: '30px' }}>
            {/* Positions Header with Claim All Button */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: '10px',
                padding: '25px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                marginBottom: '20px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '15px'
                }}>
                    <div>
                        <h3 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            👤 Your Staking Positions
                            <span style={{
                                backgroundColor: '#007bff',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}>
                                {positions.length}
                            </span>
                        </h3>
                        <p style={{ margin: '0', color: '#666', fontSize: '0.9rem' }}>
                            Manage your pool stakes and claim rewards
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#28a745' }}>
                                {totalPendingRewards.toFixed(4)} DPN
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                Total Pending
                            </div>
                        </div>
                        <button
                            onClick={onClaimAllRewards}
                            disabled={!hasClaimableRewards || loading}
                            style={{
                                padding: '12px 20px',
                                backgroundColor: hasClaimableRewards && !loading ? '#28a745' : '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                cursor: hasClaimableRewards && !loading ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            {loading ? '⏳' : '🎁'} Claim All Rewards
                        </button>
                    </div>
                </div>
            </div>

            {/* Positions Table */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: '10px',
                padding: '25px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                        <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Pool</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Lock Period</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Amount</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Pending Rewards</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Status</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Staked At</th>
                            <th style={{ padding: '15px', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem', fontWeight: 'bold' }}>Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {positions.map((position, index) => (
                            <tr key={position.id} style={{
                                backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa',
                                borderLeft: `4px solid ${POOL_TIERS[position.tier].color}`,
                                transition: 'all 0.2s ease'
                            }}>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            backgroundColor: POOL_TIERS[position.tier].color,
                                            color: POOL_TIERS[position.tier].name === 'Diamond' ? '#000' : '#fff',
                                            padding: '6px 12px',
                                            borderRadius: '15px',
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            {POOL_TIERS[position.tier].icon} {POOL_TIERS[position.tier].name}
                                        </span>
                                    </div>
                                </td>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                            {LOCK_PERIODS[position.lockPeriod].name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#28a745', fontWeight: 'bold' }}>
                                            {LOCK_PERIODS[position.lockPeriod].bonus}
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                                            {parseFloat(position.amount).toFixed(4)} ETH
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                            ${(parseFloat(position.amount) * 2500).toLocaleString()} USD
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    <div>
                                        <div style={{
                                            fontWeight: 'bold',
                                            fontSize: '0.95rem',
                                            color: parseFloat(position.pendingRewards) > 0 ? '#28a745' : '#666'
                                        }}>
                                            {parseFloat(position.pendingRewards).toFixed(6)} DPN
                                        </div>
                                        {parseFloat(position.pendingRewards) > 0 && (
                                            <div style={{ fontSize: '0.8rem', color: '#28a745' }}>
                                                ⚡ Ready to claim
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    {position.canWithdraw ? (
                                        <span style={{
                                            backgroundColor: '#d4edda',
                                            color: '#155724',
                                            padding: '6px 12px',
                                            borderRadius: '15px',
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            width: 'fit-content'
                                        }}>
                                            🟢 Unlocked
                                        </span>
                                    ) : (
                                        <span style={{
                                            backgroundColor: '#fff3cd',
                                            color: '#856404',
                                            padding: '6px 12px',
                                            borderRadius: '15px',
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            width: 'fit-content'
                                        }}>
                                            🔒 {formatTimeRemaining(position.timeToUnlock)}
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                        {formatDate(position.stakedAt)}
                                    </div>
                                    {!position.canWithdraw && (
                                        <div style={{ fontSize: '0.8rem', color: '#856404' }}>
                                            Unlocks: {formatDate(position.unlocksAt)}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '15px', borderBottom: '1px solid #dee2e6' }}>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => onClaimRewards(position.id)}
                                            disabled={parseFloat(position.pendingRewards) === 0 || loading}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: parseFloat(position.pendingRewards) > 0 && !loading ? '#28a745' : '#6c757d',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                fontWeight: 'bold',
                                                cursor: parseFloat(position.pendingRewards) > 0 && !loading ? 'pointer' : 'not-allowed',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            {loading ? '⏳' : '🎁'} Claim
                                        </button>
                                        <button
                                            onClick={() => onWithdrawStake(position.id)}
                                            disabled={loading}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: loading ? '#6c757d' : position.canWithdraw ? '#dc3545' : '#ffc107',
                                                color: loading ? 'white' : position.canWithdraw ? 'white' : '#212529',
                                                border: 'none',
                                                borderRadius: '4px',
                                                fontSize: '12px',
                                                fontWeight: 'bold',
                                                cursor: loading ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            {loading ? '⏳' : position.canWithdraw ? '💸' : '⚠️'}
                                            {position.canWithdraw ? 'Withdraw' : 'Early Exit'}
                                        </button>
                                    </div>
                                    {!position.canWithdraw && (
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: '#856404',
                                            marginTop: '4px',
                                            fontStyle: 'italic'
                                        }}>
                                            10% penalty applies
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                {/* Summary Row */}
                <div style={{
                    backgroundColor: '#f8f9fa',
                    padding: '15px',
                    borderRadius: '8px',
                    marginTop: '20px',
                    border: '1px solid #dee2e6'
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '20px',
                        alignItems: 'center'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#007bff' }}>
                                {positions.length}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Positions</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#007bff' }}>
                                {positions.reduce((sum, pos) => sum + parseFloat(pos.amount), 0).toFixed(3)} ETH
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Staked</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#28a745' }}>
                                {totalPendingRewards.toFixed(4)} DPN
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>Total Pending</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#6f42c1' }}>
                                {positions.filter(p => p.canWithdraw).length}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#666' }}>Ready to Withdraw</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Position Management Tips */}
            <div style={{
                backgroundColor: '#e3f2fd',
                borderRadius: '10px',
                padding: '20px',
                marginTop: '20px',
                border: '2px solid #2196f3'
            }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#1976d2', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    💡 Position Management Tips
                </h4>
                <div style={{ fontSize: '0.9rem', color: '#666', lineHeight: '1.5' }}>
                    <div style={{ marginBottom: '8px' }}>
                        • <strong>Claim Regularly:</strong> Rewards accumulate continuously - claim them to compound your earnings
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                        • <strong>Lock Period Strategy:</strong> Longer locks earn higher multipliers but reduce flexibility
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                        • <strong>Early Withdrawal:</strong> 10% penalty applies to early exits from locked positions
                    </div>
                    <div>
                        • <strong>Gas Optimization:</strong> Use "Claim All" button to save on transaction fees when claiming multiple positions
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserPositions;
