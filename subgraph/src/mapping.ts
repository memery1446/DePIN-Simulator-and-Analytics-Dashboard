// =============================================================================
// REQUIRED IMPORTS (MISSING IMPORTS ADDED)
// =============================================================================

import { BigInt, Bytes } from "@graphprotocol/graph-ts"

// =============================================================================
// EXISTING IMPORTS AND HANDLERS (PRESERVED EXACTLY AS-IS)
// =============================================================================

import {
    NodeRegistered,
    RewardClaimed,
    StakeUpdated,
    UptimeRecorded,
} from "../generated/Participation/Participation";
import {
    Node,
    Reward,
    Stake,
    Uptime
} from "../generated/schema";

export function handleNodeRegistered(event: NodeRegistered): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new Node(id);
    entity.nodeId = event.params.nodeId;
    entity.owner = event.params.owner;
    entity.timestamp = event.params.timestamp;
    entity.save();
}

export function handleRewardClaimed(event: RewardClaimed): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new Reward(id);
    entity.nodeId = event.params.nodeId;
    entity.owner = event.params.owner;
    entity.amount = event.params.amount;
    entity.timestamp = event.params.timestamp;
    entity.save();
}

export function handleStakeUpdated(event: StakeUpdated): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new Stake(id);
    entity.nodeId = event.params.nodeId;
    entity.staker = event.params.staker;
    entity.amount = event.params.amount;
    entity.timestamp = event.params.timestamp;
    entity.save();
}

export function handleUptimeRecorded(event: UptimeRecorded): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new Uptime(id);
    entity.nodeId = event.params.nodeId;
    entity.minutesUp = event.params.minutesUp;
    entity.timestamp = event.params.timestamp;
    entity.save();
}

// =============================================================================
// NEW IMPORTS AND HANDLERS FOR STAKING POOL
// =============================================================================

import {
    PoolStaked as PoolStakedEvent,
    StakeWithdrawn as StakeWithdrawnEvent,
    RewardsClaimed as RewardsClaimedEvent,
    PoolConfigUpdated as PoolConfigUpdatedEvent,
    EmergencyWithdraw as EmergencyWithdrawEvent
} from "../generated/StakingPool/StakingPool";

import {
    PoolStake,
    StakeWithdrawal,
    RewardClaim,
    PoolConfig,
    GlobalStats
} from "../generated/schema";

export function handlePoolStaked(event: PoolStakedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new PoolStake(id);

    entity.user = event.params.user;
    entity.positionId = event.params.positionId;
    entity.tier = event.params.tier;
    entity.lockPeriod = event.params.lockPeriod;
    entity.amount = event.params.amount;
    entity.shares = event.params.shares;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();

    // Update global stats
    updateGlobalStats(event.params.amount, event.block.timestamp, event.block.number);
}

export function handleStakeWithdrawn(event: StakeWithdrawnEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new StakeWithdrawal(id);

    entity.user = event.params.user;
    entity.positionId = event.params.positionId;
    entity.amount = event.params.amount;
    entity.penalty = event.params.penalty;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleRewardsClaimed(event: RewardsClaimedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new RewardClaim(id);

    entity.user = event.params.user;
    entity.positionId = event.params.positionId;
    entity.rewardAmount = event.params.rewardAmount;
    entity.totalClaimed = event.params.totalClaimed;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handlePoolConfigUpdated(event: PoolConfigUpdatedEvent): void {
    // Use transaction hash + tier as Bytes ID
    let id = event.transaction.hash.concatI32(event.params.tier);
    let entity = PoolConfig.load(id);
    if (!entity) {
        entity = new PoolConfig(id);
    }

    entity.tier = event.params.tier;
    entity.minStake = event.params.minStake;
    entity.tierMultiplier = event.params.tierMultiplier;
    entity.baseRewardRate = event.params.baseRewardRate;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleEmergencyWithdraw(event: EmergencyWithdrawEvent): void {
    // Log emergency withdrawals - could create separate entity if needed
}

// =============================================================================
// NEW IMPORTS AND HANDLERS FOR NODE RIGHTS NFT
// =============================================================================

import {
    NodeRightsMinted as NodeRightsMintedEvent,
    NodeUpgraded as NodeUpgradedEvent,
    PerformanceUpdated as PerformanceUpdatedEvent,
    NodeSlashed as NodeSlashedEvent,
    CrossChainBridge as CrossChainBridgeEvent,
    RewardsDistributed as RewardsDistributedEvent,
    Transfer as NFTTransferEvent
} from "../generated/NodeRightsNFT/NodeRightsNFT";

import {
    NodeRights,
    NodeUpgrade,
    PerformanceUpdate,
    NodeSlashing,
    CrossChainBridge,
    RewardDistribution
} from "../generated/schema";

export function handleNodeRightsMinted(event: NodeRightsMintedEvent): void {
    // Use transaction hash + token ID as Bytes ID
    let id = event.transaction.hash.concat(Bytes.fromHexString(event.params.tokenId.toHexString()));
    let entity = new NodeRights(id);

    entity.tokenId = event.params.tokenId;
    entity.owner = event.params.owner;
    entity.nodeType = event.params.nodeType;
    entity.stakedETH = event.params.ethStaked;
    entity.stakedDPN = event.params.dpnStaked;
    entity.mintedAt = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleNodeUpgraded(event: NodeUpgradedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new NodeUpgrade(id);

    entity.tokenId = event.params.tokenId;
    entity.additionalETH = event.params.additionalETH;
    entity.additionalDPN = event.params.additionalDPN;
    entity.newPerformanceScore = event.params.newPerformanceScore;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();

    // Update the NodeRights entity - find by tokenId
    let nodeRightsId = findNodeRightsId(event.params.tokenId);
    if (nodeRightsId) {
        let nodeRights = NodeRights.load(nodeRightsId);
        if (nodeRights) {
            nodeRights.stakedETH = nodeRights.stakedETH.plus(event.params.additionalETH);
            nodeRights.stakedDPN = nodeRights.stakedDPN.plus(event.params.additionalDPN);
            nodeRights.save();
        }
    }
}

export function handlePerformanceUpdated(event: PerformanceUpdatedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new PerformanceUpdate(id);

    entity.tokenId = event.params.tokenId;
    entity.newScore = event.params.newScore;
    entity.uptimeAdded = event.params.uptimeAdded;
    entity.status = event.params.status;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleNodeSlashed(event: NodeSlashedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new NodeSlashing(id);

    entity.tokenId = event.params.tokenId;
    entity.newStatus = event.params.newStatus;
    entity.penaltyAmount = event.params.penaltyAmount;
    entity.reason = event.params.reason;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleCrossChainBridge(event: CrossChainBridgeEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new CrossChainBridge(id);

    entity.tokenId = event.params.tokenId;
    entity.destinationChain = event.params.destinationChain;
    entity.operator = event.params.operator;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleRewardsDistributed(event: RewardsDistributedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new RewardDistribution(id);

    entity.tokenId = event.params.tokenId;
    entity.rewardAmount = event.params.rewardAmount;
    entity.performanceBonus = event.params.performanceBonus;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

export function handleNFTTransfer(event: NFTTransferEvent): void {
    // Handle NFT transfers (ownership changes)
    let nodeRightsId = findNodeRightsId(event.params.tokenId);
    if (nodeRightsId && event.params.to.toHexString() != "0x0000000000000000000000000000000000000000") {
        let nodeRights = NodeRights.load(nodeRightsId);
        if (nodeRights) {
            nodeRights.owner = event.params.to;
            nodeRights.save();
        }
    }
}

// =============================================================================
// NEW IMPORTS AND HANDLERS FOR DPN TOKEN
// =============================================================================

import {
    Transfer as DPNTransferEvent,
    Approval as DPNApprovalEvent
} from "../generated/DPNToken/DPNToken";

import {
    TokenTransfer,
    TokenBalance
} from "../generated/schema";

export function handleDPNTransfer(event: DPNTransferEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new TokenTransfer(id);

    entity.from = event.params.from;
    entity.to = event.params.to;
    entity.value = event.params.value;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();

    // Update balances for both from and to addresses
    updateTokenBalance(event.params.from, event.params.value.neg(), event.block.timestamp);
    updateTokenBalance(event.params.to, event.params.value, event.block.timestamp);
}

export function handleDPNApproval(event: DPNApprovalEvent): void {
    // Track approvals if needed for analytics
}

// =============================================================================
// NEW IMPORTS AND HANDLERS FOR NODE REGISTRY
// =============================================================================

import {
    NodeRegistered as NodeRegistryRegisteredEvent
} from "../generated/NodeRegistry/NodeRegistry";

import {
    RegisteredNode
} from "../generated/schema";

export function handleNodeRegistryRegistered(event: NodeRegistryRegisteredEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new RegisteredNode(id);

    entity.nodeId = event.params.nodeId;
    entity.owner = event.params.owner;
    entity.registeredAt = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;

    entity.save();
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function updateGlobalStats(stakedAmount: BigInt, timestamp: BigInt, blockNumber: BigInt): void {
    let id = Bytes.fromUTF8("global");
    let entity = GlobalStats.load(id);
    if (!entity) {
        entity = new GlobalStats(id);
        entity.totalValueLocked = BigInt.fromI32(0);
        entity.totalRewardsDistributed = BigInt.fromI32(0);
    }

    entity.totalValueLocked = entity.totalValueLocked.plus(stakedAmount);
    entity.lastUpdated = timestamp;
    entity.blockNumber = blockNumber;

    entity.save();
}

function updateTokenBalance(address: Bytes, change: BigInt, timestamp: BigInt): void {
    if (address.toHexString() == "0x0000000000000000000000000000000000000000") {
        return; // Skip zero address
    }

    let entity = TokenBalance.load(address);
    if (!entity) {
        entity = new TokenBalance(address);
        entity.holder = address;
        entity.balance = BigInt.fromI32(0);
    }

    entity.balance = entity.balance.plus(change);
    entity.lastUpdated = timestamp;

    entity.save();
}

// Helper function to find NodeRights entity by tokenId (simplified)
function findNodeRightsId(tokenId: BigInt): Bytes | null {
    // This is a simplified approach - in production you'd want a more efficient lookup
    // For now, we'll create a deterministic ID based on tokenId
    return Bytes.fromUTF8("nodeRights-").concat(Bytes.fromHexString(tokenId.toHexString()));
}
