import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface PoolDashboardProps {
    globalStats: {
        tvl: string;
        totalRewards: string;
        totalStakers: number;
        poolDistribution: number[];
    };
    userTotalStaked: number;
    userTotalRewards: number;
    userPositionCount: number;
    poolDistributionData: Array<{
        name: string;
        value: number;
        color: string;
    }>;
}

const PoolDashboard: React.FC<PoolDashboardProps> = ({
                                                         globalStats,
                                                         userTotalStaked,
                                                         userTotalRewards,
                                                         userPositionCount,
                                                         poolDistributionData
                                                     }) => {
    return (
        <div style={{ marginBottom: '30px' }}>
            {/* Global Pool Overview Cards */}
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
                        {parseFloat(globalStats.tvl).toFixed(2)} ETH
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#28a745', marginTop: '5px' }}>
                        ${(parseFloat(globalStats.tvl) * 2500).toLocaleString()} USD
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
                        {parseFloat(globalStats.totalRewards).toFixed(2)} DPN
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                        Total distributed
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
                        {globalStats.totalStakers}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                        Across all pools
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
                        {userPositionCount}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
                        Active stakes
                    </div>
                </div>
            </div>

            {/* User Pool Stats */}
            {userPositionCount > 0 && (
                <div style={{
                    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    background: '#e8f5e8',
                    borderRadius: '10px',
                    padding: '25px',
                    marginBottom: '30px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                    border: '2px solid #28a745'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h3 style={{ margin: '0', color: '#155724', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            🏆 Your Pool Activity
                        </h3>
                        <div style={{
                            backgroundColor: '#28a745',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '15px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                        }}>
                            ACTIVE INVESTOR
                        </div>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '20px'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                {userPositionCount}
                            </div>
                            <div style={{ color: '#666', fontSize: '0.9rem' }}>Active Positions</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                {userTotalStaked.toFixed(2)} ETH
                            </div>
                            <div style={{ color: '#666', fontSize: '0.9rem' }}>Total Staked</div>
                            <div style={{ color: '#28a745', fontSize: '0.8rem' }}>
                                ${(userTotalStaked * 2500).toLocaleString()} USD
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                {userTotalRewards.toFixed(4)} DPN
                            </div>
                            <div style={{ color: '#666', fontSize: '0.9rem' }}>Pending Rewards</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '2rem',
                                fontWeight: 'bold',
                                color: '#155724',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px'
                            }}>
                                {userTotalStaked > 0 ? ((userTotalRewards / userTotalStaked) * 100).toFixed(2) : '0.00'}%
                                {userTotalRewards > 0 && (
                                    <span style={{ fontSize: '1rem', color: '#28a745' }}>📈</span>
                                )}
                            </div>
                            <div style={{ color: '#666', fontSize: '0.9rem' }}>Current Yield</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pool Distribution Chart and Analytics */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: poolDistributionData.length > 0 ? '1fr 1fr' : '1fr',
                gap: '20px',
                marginBottom: '30px'
            }}>
                {/* Pool Distribution Chart */}
                {poolDistributionData.length > 0 && (
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '25px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                    }}>
                        <h3 style={{ marginBottom: '20px', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            📊 Pool Distribution
                        </h3>
                        <div style={{ width: '100%', height: '300px' }}>
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

                        {/* Legend */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '10px',
                            marginTop: '15px'
                        }}>
                            {poolDistributionData.map((item, index) => (
                                <div key={index} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.9rem'
                                }}>
                                    <div style={{
                                        width: '12px',
                                        height: '12px',
                                        backgroundColor: item.color,
                                        borderRadius: '2px'
                                    }}></div>
                                    <span>{item.name}: {item.value.toFixed(2)} ETH</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pool Analytics */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '25px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                }}>
                    <h3 style={{ marginBottom: '20px', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        📈 Pool Analytics
                    </h3>

                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px' }}>Average Pool Size</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#007bff' }}>
                            {globalStats.totalStakers > 0
                                ? (parseFloat(globalStats.tvl) / globalStats.totalStakers).toFixed(3)
                                : '0.000'
                            } ETH
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px' }}>Network Utilization</div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            color: '#28a745'
                        }}>
                            {globalStats.totalStakers > 0 ? '🟢 Active' : '🟡 Initializing'}
                            <span style={{ fontSize: '0.9rem', color: '#666' }}>
                                ({globalStats.totalStakers} participants)
                            </span>
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '5px' }}>Pool Diversity Index</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6f42c1' }}>
                            {poolDistributionData.length}/4
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                            Active pool tiers
                        </div>
                    </div>

                    {/* Pool Health Indicators */}
                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '15px',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef'
                    }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#333' }}>
                            🏥 Pool Health
                        </div>
                        <div style={{ fontSize: '0.9rem' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '5px'
                            }}>
                                <span>Liquidity:</span>
                                <span style={{
                                    color: parseFloat(globalStats.tvl) > 10 ? '#28a745' : '#ffc107',
                                    fontWeight: 'bold'
                                }}>
                                    {parseFloat(globalStats.tvl) > 10 ? 'High' : 'Growing'}
                                </span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '5px'
                            }}>
                                <span>Participation:</span>
                                <span style={{
                                    color: globalStats.totalStakers > 5 ? '#28a745' : '#007bff',
                                    fontWeight: 'bold'
                                }}>
                                    {globalStats.totalStakers > 5 ? 'Strong' : 'Active'}
                                </span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>Distribution:</span>
                                <span style={{
                                    color: poolDistributionData.length > 2 ? '#28a745' : '#ffc107',
                                    fontWeight: 'bold'
                                }}>
                                    {poolDistributionData.length > 2 ? 'Diverse' : 'Developing'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PoolDashboard;
