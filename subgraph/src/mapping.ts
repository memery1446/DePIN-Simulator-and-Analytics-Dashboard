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
