pragma solidity ^0.8.0;
import "./NodeRegistry.sol";

contract Participation is NodeRegistry {
  struct Stats {
    uint256 uptime;
    uint256 lastUpdate;
    uint256 earned;
  }
  mapping(uint256 => Stats) public stats;
  mapping(uint256 => uint256) public nodeStakes;

  event UptimeRecorded(uint256 indexed nodeId, uint256 minutesUp, uint256 timestamp);
  event RewardClaimed(uint256 indexed nodeId, address indexed owner, uint256 amount, uint256 timestamp);
  event StakeUpdated(uint256 indexed nodeId, address indexed staker, uint256 amount, uint256 timestamp);


  function recordUptime(uint256 nodeId, uint256 minutesUp) external {
    stats[nodeId].uptime += minutesUp;
    stats[nodeId].lastUpdate = block.timestamp;
    stats[nodeId].earned += minutesUp; // 1 token per minute (static rate)
    emit UptimeRecorded(nodeId, minutesUp, block.timestamp);
  }

  function claimReward(uint256 nodeId) external {
    require(nodes[nodeId].owner == msg.sender, "Not owner");
    uint256 amount = stats[nodeId].earned;
    stats[nodeId].earned = 0;
    emit RewardClaimed(nodeId, msg.sender, amount, block.timestamp);
    // optionally mint tokens
  }

  function stakeToNode(uint256 nodeId) external payable {
    require(msg.value > 0, "Send funds");
    nodeStakes[nodeId] += msg.value;
    emit StakeUpdated(nodeId, msg.sender, msg.value, block.timestamp);
  }
}
