pragma solidity ^0.8.0;

contract NodeRegistry {
  struct Node {
    address owner;
    string metadata;
    uint256 registeredAt;
  }
  mapping(uint256 => Node) public nodes;
  uint256 public nextId;

  event NodeRegistered(uint256 indexed nodeId, address indexed owner, uint256 timestamp);

  function registerNode(string calldata metadata) external {
    nodes[nextId] = Node(msg.sender, metadata, block.timestamp);
    emit NodeRegistered(nextId, msg.sender, block.timestamp);
    nextId++;
  }
}
