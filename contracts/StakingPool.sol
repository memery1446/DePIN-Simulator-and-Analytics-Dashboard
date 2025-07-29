// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title StakingPool
 * @dev Tiered staking pools with time-lock bonuses for DePIN network
 * @notice Users stake ETH into tiered pools to earn DPN rewards with multipliers
 */
contract StakingPool is Ownable, ReentrancyGuard {

    // ============ ENUMS ============

    enum PoolTier {
        BRONZE,   // 0.1+ ETH → 1x rewards
        SILVER,   // 1+ ETH → 1.5x rewards
        GOLD,     // 5+ ETH → 2x rewards
        DIAMOND   // 20+ ETH → 3x rewards
    }

    enum LockPeriod {
        NONE,      // No lock → 1x time bonus
        THIRTY,    // 30 days → 1.1x time bonus
        NINETY,    // 90 days → 1.25x time bonus
        YEAR       // 365 days → 1.5x time bonus
    }

    // ============ STRUCTS ============

    struct PoolConfig {
        uint256 minStake;           // Minimum ETH to enter pool
        uint256 tierMultiplier;     // Reward multiplier (basis points, 10000 = 1x)
        uint256 baseRewardRate;     // DPN rewards per second per ETH
        uint256 totalStaked;        // Total ETH staked in this pool
        uint256 totalShares;        // Total shares in this pool
        bool isActive;              // Whether pool accepts new stakes
    }

    struct LockConfig {
        uint256 lockDays;           // Lock period in days
        uint256 timeMultiplier;     // Time bonus multiplier (basis points)
    }

    struct StakePosition {
        PoolTier tier;              // Which pool tier
        LockPeriod lockPeriod;      // Lock period chosen
        uint256 amount;             // ETH staked
        uint256 shares;             // Share of pool owned
        uint256 stakedAt;           // When stake was created
        uint256 unlocksAt;          // When stake can be withdrawn
        uint256 lastRewardClaim;    // Last reward claim timestamp
        bool isActive;              // Whether position is active
    }

    // ============ STATE VARIABLES ============

    // Pool configurations
    mapping(PoolTier => PoolConfig) public poolConfigs;
    mapping(LockPeriod => LockConfig) public lockConfigs;

    // User positions
    mapping(address => StakePosition[]) public userPositions;
    mapping(address => uint256) public userPositionCount;

    // Global metrics
    uint256 public totalValueLocked;
    uint256 public totalRewardsDistributed;
    uint256 public emergencyWithdrawEnabled;

    // Contract integration
    address public dpnTokenContract;
    address public nodeRightsContract;

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant SECONDS_PER_DAY = 86400;

    // ============ EVENTS ============

    event PoolStaked(
        address indexed user,
        uint256 indexed positionId,
        PoolTier tier,
        LockPeriod lockPeriod,
        uint256 amount,
        uint256 shares
    );

    event StakeWithdrawn(
        address indexed user,
        uint256 indexed positionId,
        uint256 amount,
        uint256 penalty
    );

    event RewardsClaimed(
        address indexed user,
        uint256 indexed positionId,
        uint256 rewardAmount,
        uint256 totalClaimed
    );

    event PoolConfigUpdated(
        PoolTier tier,
        uint256 minStake,
        uint256 tierMultiplier,
        uint256 baseRewardRate
    );

    event EmergencyWithdraw(
        address indexed user,
        uint256 amount
    );

    // ============ CONSTRUCTOR ============

    constructor() Ownable(msg.sender) {
        _setupPoolConfigurations();
        _setupLockConfigurations();
    }

    // ============ CORE STAKING FUNCTIONS ============

    /**
     * @dev Stake ETH into a specific pool tier with chosen lock period
     * @param tier Pool tier to stake into
     * @param lockPeriod Lock period for time bonus
     */
    function stakeToPool(PoolTier tier, LockPeriod lockPeriod)
        external
        payable
        nonReentrant
    {
        require(msg.value > 0, "Must stake ETH");

        PoolConfig storage pool = poolConfigs[tier];
        require(pool.isActive, "Pool not active");
        require(msg.value >= pool.minStake, "Below minimum stake");

        LockConfig memory lockConfig = lockConfigs[lockPeriod];

        // Calculate shares (proportional to stake amount)
        uint256 shares = _calculateShares(tier, msg.value);

        // Create position
        uint256 positionId = userPositionCount[msg.sender];
        userPositions[msg.sender].push(StakePosition({
            tier: tier,
            lockPeriod: lockPeriod,
            amount: msg.value,
            shares: shares,
            stakedAt: block.timestamp,
            unlocksAt: block.timestamp + (lockConfig.lockDays * SECONDS_PER_DAY),
            lastRewardClaim: block.timestamp,
            isActive: true
        }));

        userPositionCount[msg.sender]++;

        // Update pool metrics
        pool.totalStaked += msg.value;
        pool.totalShares += shares;
        totalValueLocked += msg.value;

        emit PoolStaked(msg.sender, positionId, tier, lockPeriod, msg.value, shares);
    }

    /**
     * @dev Withdraw stake from a position (with early withdrawal penalty if applicable)
     * @param positionId Position to withdraw from
     */
    function withdrawStake(uint256 positionId) external nonReentrant {
        require(positionId < userPositions[msg.sender].length, "Invalid position");

        StakePosition storage position = userPositions[msg.sender][positionId];
        require(position.isActive, "Position not active");
        require(position.amount > 0, "No stake to withdraw");

        // Calculate penalty for early withdrawal
        uint256 penalty = 0;
        uint256 withdrawAmount = position.amount;

        if (block.timestamp < position.unlocksAt) {
            // Early withdrawal: 10% penalty
            penalty = position.amount * 1000 / BASIS_POINTS; // 10%
            withdrawAmount = position.amount - penalty;
        }

        // Update pool metrics
        PoolConfig storage pool = poolConfigs[position.tier];
        pool.totalStaked -= position.amount;
        pool.totalShares -= position.shares;
        totalValueLocked -= position.amount;

        // Deactivate position
        position.isActive = false;
        position.amount = 0;
        position.shares = 0;

        // Transfer ETH (minus penalty)
        if (withdrawAmount > 0) {
            payable(msg.sender).transfer(withdrawAmount);
        }

        // Penalty goes to contract (could be redistributed to other stakers)

        emit StakeWithdrawn(msg.sender, positionId, withdrawAmount, penalty);
    }

    /**
     * @dev Claim accumulated rewards for a position
     * @param positionId Position to claim rewards for
     */
    function claimRewards(uint256 positionId) external nonReentrant {
        require(positionId < userPositions[msg.sender].length, "Invalid position");

        StakePosition storage position = userPositions[msg.sender][positionId];
        require(position.isActive, "Position not active");

        uint256 rewardAmount = _calculatePendingRewards(msg.sender, positionId);
        require(rewardAmount > 0, "No rewards to claim");

        // Update claim timestamp
        position.lastRewardClaim = block.timestamp;
        totalRewardsDistributed += rewardAmount;

        // Transfer DPN rewards (simulate - in full implementation would call DPN token)
        // IERC20(dpnTokenContract).transfer(msg.sender, rewardAmount);

        emit RewardsClaimed(msg.sender, positionId, rewardAmount, totalRewardsDistributed);
    }

    /**
     * @dev Claim rewards from all active positions
     */
    function claimAllRewards() external nonReentrant {
        uint256 totalReward = 0;
        uint256 positionCount = userPositions[msg.sender].length;

        for (uint256 i = 0; i < positionCount; i++) {
            StakePosition storage position = userPositions[msg.sender][i];
            if (!position.isActive) continue;

            uint256 positionReward = _calculatePendingRewards(msg.sender, i);
            if (positionReward > 0) {
                position.lastRewardClaim = block.timestamp;
                totalReward += positionReward;
            }
        }

        require(totalReward > 0, "No rewards to claim");
        totalRewardsDistributed += totalReward;

        // Transfer total DPN rewards
        // IERC20(dpnTokenContract).transfer(msg.sender, totalReward);

        emit RewardsClaimed(msg.sender, type(uint256).max, totalReward, totalRewardsDistributed);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Get detailed information about a user's position
     */
    function getPositionDetails(address user, uint256 positionId)
        external
        view
        returns (
            StakePosition memory position,
            uint256 pendingRewards,
            uint256 timeToUnlock,
            bool canWithdraw
        )
    {
        require(positionId < userPositions[user].length, "Invalid position");

        position = userPositions[user][positionId];
        pendingRewards = _calculatePendingRewards(user, positionId);

        if (block.timestamp >= position.unlocksAt) {
            timeToUnlock = 0;
            canWithdraw = true;
        } else {
            timeToUnlock = position.unlocksAt - block.timestamp;
            canWithdraw = false;
        }
    }

    /**
     * @dev Get all positions for a user
     */
    function getUserPositions(address user)
        external
        view
        returns (StakePosition[] memory)
    {
        return userPositions[user];
    }

    /**
     * @dev Get pool statistics
     */
    function getPoolStats(PoolTier tier)
        external
        view
        returns (
            PoolConfig memory config,
            uint256 activeStakers,
            uint256 averageStake,
            uint256 poolUtilization
        )
    {
        config = poolConfigs[tier];

        // Calculate active stakers (would need to track this in production)
        activeStakers = 0; // Simplified for demo

        if (config.totalShares > 0) {
            averageStake = config.totalStaked / config.totalShares;
        }

        // Pool utilization as percentage of total TVL
        if (totalValueLocked > 0) {
            poolUtilization = (config.totalStaked * BASIS_POINTS) / totalValueLocked;
        }
    }

    /**
     * @dev Get global staking statistics
     */
    function getGlobalStats()
        external
        view
        returns (
            uint256 tvl,
            uint256 totalRewards,
            uint256 totalStakers,
            uint256[4] memory poolDistribution
        )
    {
        tvl = totalValueLocked;
        totalRewards = totalRewardsDistributed;
        totalStakers = 0; // Would track this in production

        // Pool distribution
        poolDistribution[0] = poolConfigs[PoolTier.BRONZE].totalStaked;
        poolDistribution[1] = poolConfigs[PoolTier.SILVER].totalStaked;
        poolDistribution[2] = poolConfigs[PoolTier.GOLD].totalStaked;
        poolDistribution[3] = poolConfigs[PoolTier.DIAMOND].totalStaked;
    }

    // ============ INTERNAL FUNCTIONS ============

    function _setupPoolConfigurations() internal {
        // Bronze Pool: 0.1+ ETH → 1x rewards
        poolConfigs[PoolTier.BRONZE] = PoolConfig({
            minStake: 0.1 ether,
            tierMultiplier: 10000, // 1x
            baseRewardRate: 11574074074074, // 1 DPN per day per ETH (matching NodeRights)
            totalStaked: 0,
            totalShares: 0,
            isActive: true
        });

        // Silver Pool: 1+ ETH → 1.5x rewards
        poolConfigs[PoolTier.SILVER] = PoolConfig({
            minStake: 1 ether,
            tierMultiplier: 15000, // 1.5x
            baseRewardRate: 11574074074074,
            totalStaked: 0,
            totalShares: 0,
            isActive: true
        });

        // Gold Pool: 5+ ETH → 2x rewards
        poolConfigs[PoolTier.GOLD] = PoolConfig({
            minStake: 5 ether,
            tierMultiplier: 20000, // 2x
            baseRewardRate: 11574074074074,
            totalStaked: 0,
            totalShares: 0,
            isActive: true
        });

        // Diamond Pool: 20+ ETH → 3x rewards
        poolConfigs[PoolTier.DIAMOND] = PoolConfig({
            minStake: 20 ether,
            tierMultiplier: 30000, // 3x
            baseRewardRate: 11574074074074,
            totalStaked: 0,
            totalShares: 0,
            isActive: true
        });
    }

    function _setupLockConfigurations() internal {
        lockConfigs[LockPeriod.NONE] = LockConfig({
            lockDays: 0,
            timeMultiplier: 10000 // 1x (no bonus)
        });

        lockConfigs[LockPeriod.THIRTY] = LockConfig({
            lockDays: 30,
            timeMultiplier: 11000 // 1.1x (+10% bonus)
        });

        lockConfigs[LockPeriod.NINETY] = LockConfig({
            lockDays: 90,
            timeMultiplier: 12500 // 1.25x (+25% bonus)
        });

        lockConfigs[LockPeriod.YEAR] = LockConfig({
            lockDays: 365,
            timeMultiplier: 15000 // 1.5x (+50% bonus)
        });
    }

    function _calculateShares(PoolTier /* tier */, uint256 amount) internal pure returns (uint256) {
        // Simple 1:1 shares to ETH for now
        // In production, could implement tier-based share calculation
        return amount;
    }

    function _calculatePendingRewards(address user, uint256 positionId)
        internal
        view
        returns (uint256)
    {
        if (positionId >= userPositions[user].length) return 0;

        StakePosition memory position = userPositions[user][positionId];
        if (!position.isActive) return 0;

        PoolConfig memory pool = poolConfigs[position.tier];
        LockConfig memory lockConfig = lockConfigs[position.lockPeriod];

        // Time elapsed since last claim
        uint256 timeElapsed = block.timestamp - position.lastRewardClaim;

        // Base reward = baseRewardRate * amount * timeElapsed
        uint256 baseReward = (pool.baseRewardRate * position.amount * timeElapsed) / 1 ether;

        // Apply tier multiplier
        uint256 tierReward = (baseReward * pool.tierMultiplier) / BASIS_POINTS;

        // Apply time lock multiplier
        uint256 finalReward = (tierReward * lockConfig.timeMultiplier) / BASIS_POINTS;

        return finalReward;
    }

    // ============ ADMIN FUNCTIONS ============

    function setDPNTokenContract(address _dpnToken) external onlyOwner {
        dpnTokenContract = _dpnToken;
    }

    function setNodeRightsContract(address _nodeRights) external onlyOwner {
        nodeRightsContract = _nodeRights;
    }

    function updatePoolConfig(
        PoolTier tier,
        uint256 minStake,
        uint256 tierMultiplier,
        uint256 baseRewardRate,
        bool isActive
    ) external onlyOwner {
        PoolConfig storage pool = poolConfigs[tier];
        pool.minStake = minStake;
        pool.tierMultiplier = tierMultiplier;
        pool.baseRewardRate = baseRewardRate;
        pool.isActive = isActive;

        emit PoolConfigUpdated(tier, minStake, tierMultiplier, baseRewardRate);
    }

    function updateLockConfig(
        LockPeriod lockPeriod,
        uint256 lockDays,
        uint256 timeMultiplier
    ) external onlyOwner {
        lockConfigs[lockPeriod] = LockConfig({
            lockDays: lockDays,
            timeMultiplier: timeMultiplier
        });
    }

    // Emergency functions
    function enableEmergencyWithdraw() external onlyOwner {
        emergencyWithdrawEnabled = block.timestamp;
    }

    function emergencyWithdraw() external {
        require(emergencyWithdrawEnabled > 0, "Emergency not enabled");
        require(block.timestamp >= emergencyWithdrawEnabled + 24 hours, "24h delay required");

        uint256 balance = address(this).balance;
        payable(owner()).transfer(balance);

        emit EmergencyWithdraw(owner(), balance);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
