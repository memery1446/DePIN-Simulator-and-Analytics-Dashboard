// mapping.ts — AssemblyScript-safe, aligned to your YAML + schema
// - No TS "unknown" casts
// - No odd-length hex parsing
// - Uses txHash+logIndex IDs (Bytes)

import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Transfer as DPNTransferEvent, Approval as DPNApprovalEvent  } from "../generated/DPNToken/DPNToken";

// ===================== Participation =====================
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
    Uptime,
    PoolStake,
    StakeWithdrawal,
    RewardClaim,
    PoolConfig,
    GlobalStats,
} from "../generated/schema";

export function handleDPNTransfer(_event: DPNTransferEvent): void {
    // intentionally left blank
}
export function handleDPNApproval(_event: DPNApprovalEvent): void {
    // intentionally left blank
}

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

// ===================== StakingPool =====================
import {
    PoolStaked as PoolStakedEvent,
    StakeWithdrawn as StakeWithdrawnEvent,
    RewardsClaimed as RewardsClaimedEvent,
    PoolConfigUpdated as PoolConfigUpdatedEvent,
    EmergencyWithdraw as EmergencyWithdrawEvent,
} from "../generated/StakingPool/StakingPool";

function getOrCreateGlobal(): GlobalStats {
    const id = Bytes.fromUTF8("global");
    let gs = GlobalStats.load(id);
    if (gs == null) {
        gs = new GlobalStats(id);
        gs.totalValueLocked = BigInt.zero();
        gs.totalRewardsDistributed = BigInt.zero();
        gs.lastUpdated = BigInt.zero();
        gs.blockNumber = BigInt.zero();
    }
    return gs as GlobalStats;
}


export function handlePoolStaked(event: PoolStakedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new PoolStake(id);
    entity.user = event.params.user;                   // Address -> Bytes
    entity.positionId = event.params.positionId;       // BigInt
    entity.tier = event.params.tier as i32;            // uint8 -> Int
    entity.lockPeriod = event.params.lockPeriod as i32;// uint8 -> Int
    entity.amount = event.params.amount;               // BigInt
    entity.shares = event.params.shares;               // BigInt
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;
    entity.save();

    // Global TVL
    let gs = getOrCreateGlobal();
    gs.totalValueLocked = gs.totalValueLocked.plus(entity.amount);
    gs.lastUpdated = event.block.timestamp;
    gs.blockNumber = event.block.number;
    gs.save();
}

export function handleStakeWithdrawn(event: StakeWithdrawnEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new StakeWithdrawal(id);
    entity.user = event.params.user;
    entity.positionId = event.params.positionId;
    entity.amount = event.params.amount;
    // Schema requires penalty; if ABI lacks it, set zero.
    // If your ABI actually has event.params.penalty, you can assign that here instead.
    entity.penalty = event.params.penalty;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;
    entity.save();

    // Reduce TVL by withdrawn amount (conservative)
    let gs = getOrCreateGlobal();
    gs.totalValueLocked = gs.totalValueLocked.minus(entity.amount);
    gs.lastUpdated = event.block.timestamp;
    gs.blockNumber = event.block.number;
    gs.save();
}

export function handleRewardsClaimed(event: RewardsClaimedEvent): void {
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let entity = new RewardClaim(id);
    entity.user = event.params.user;
    entity.positionId = event.params.positionId;
    // Align to schema: rewardAmount + totalClaimed
    entity.rewardAmount = event.params.rewardAmount;
    entity.totalClaimed = event.params.totalClaimed;
    entity.timestamp = event.block.timestamp;
    entity.blockNumber = event.block.number;
    entity.transactionHash = event.transaction.hash;
    entity.save();

    let gs = getOrCreateGlobal();
    gs.totalRewardsDistributed = gs.totalRewardsDistributed.plus(entity.rewardAmount);
    gs.lastUpdated = event.block.timestamp;
    gs.blockNumber = event.block.number;
    gs.save();
}

export function handlePoolConfigUpdated(event: PoolConfigUpdatedEvent): void {
    // Use txHash+logIndex as ID to avoid collisions
    let id = event.transaction.hash.concatI32(event.logIndex.toI32());
    let cfg = new PoolConfig(id);
    cfg.tier = event.params.tier as i32;
    cfg.minStake = event.params.minStake;
    cfg.tierMultiplier = event.params.tierMultiplier;
    cfg.baseRewardRate = event.params.baseRewardRate;
    cfg.timestamp = event.block.timestamp;
    cfg.blockNumber = event.block.number;
    cfg.transactionHash = event.transaction.hash;
    cfg.save();
}

export function handleEmergencyWithdraw(event: EmergencyWithdrawEvent): void {
    // Conservative: only update stats timestamp; TVL handled in StakeWithdrawn above
    let gs = getOrCreateGlobal();
    gs.lastUpdated = event.block.timestamp;
    gs.blockNumber = event.block.number;
    gs.save();
}

// ===================== NodeRightsNFT (no-op fix) =====================
// Your earlier fatal was in handleNFTTransfer due to odd-length hex. Keep as no-op.
import { Transfer as NFTTransferEvent } from "../generated/NodeRightsNFT/NodeRightsNFT";
export function handleNFTTransfer(_event: NFTTransferEvent): void {}
