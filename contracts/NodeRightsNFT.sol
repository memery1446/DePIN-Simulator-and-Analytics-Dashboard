// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NodeRightsNFT
 * @dev ERC721 tokens representing DePIN node ownership rights
 * @notice Each NFT represents operational rights to a specific node type with staking requirements
 */
contract NodeRightsNFT is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {

    uint256 private _tokenIdCounter;

    // ============ ENUMS ============

    enum NodeType {
        STORAGE,    // Data storage nodes
        COMPUTE,    // Processing/computation nodes
        BANDWIDTH   // Network/relay nodes
    }

    enum NodeStatus {
        ACTIVE,
        SLASHED_MINOR,
        SLASHED_MAJOR,
        TERMINATED
    }

    // ============ STRUCTS ============

    struct NodeRights {
        NodeType nodeType;
        uint256 stakedETH;          // ETH staked for this node
        uint256 stakedDPN;          // DPN tokens staked
        uint256 mintedAt;           // Block timestamp when minted
        uint256 lastRewardClaim;    // Last reward claim timestamp
        NodeStatus status;          // Current node status
        uint256 totalUptime;        // Cumulative uptime in seconds
        uint256 performanceScore;   // 0-10000 (100.00% = 10000)
        string metadata;            // IPFS hash or JSON metadata
        bool isUpgraded;           // Whether node has been upgraded
    }

    struct NodeTypeConfig {
        uint256 minETHStake;       // Minimum ETH required
        uint256 minDPNStake;       // Minimum DPN tokens required
        uint256 baseRewardRate;    // Base reward per second (in DPN wei)
        uint256 maxCapacity;       // Maximum units this node type can handle
        bool isActive;             // Whether this node type accepts new registrations
    }

    // ============ STATE VARIABLES ============

    mapping(uint256 => NodeRights) public nodeRights;
    mapping(NodeType => NodeTypeConfig) public nodeTypeConfigs;
    mapping(address => uint256[]) public ownerNodes;
    mapping(uint256 => uint256) public nodeCapacityUsed; // Current capacity usage

    // Cross-chain simulation
    mapping(uint256 => string) public crossChainBridges; // tokenId => destination chain

    // Performance tracking
    mapping(uint256 => uint256) public lastPerformanceUpdate;

    // Reward calculation
    uint256 public constant PERFORMANCE_DECIMALS = 10000; // 100.00% = 10000
    uint256 public constant SLASHING_COOLDOWN = 7 days;

    // Contract addresses for integration
    address public participationContract;
    address public dpnTokenContract;
    address public rewardCalculatorContract;

    // ============ EVENTS ============

    event NodeRightsMinted(
        uint256 indexed tokenId,
        address indexed owner,
        NodeType nodeType,
        uint256 ethStaked,
        uint256 dpnStaked
    );

    event NodeUpgraded(
        uint256 indexed tokenId,
        uint256 additionalETH,
        uint256 additionalDPN,
        uint256 newPerformanceScore
    );

    event PerformanceUpdated(
        uint256 indexed tokenId,
        uint256 newScore,
        uint256 uptimeAdded,
        NodeStatus status
    );

    event NodeSlashed(
        uint256 indexed tokenId,
        NodeStatus newStatus,
        uint256 penaltyAmount,
        string reason
    );

    event CrossChainBridge(
        uint256 indexed tokenId,
        string destinationChain,
        address operator
    );

    event RewardsDistributed(
        uint256 indexed tokenId,
        uint256 rewardAmount,
        uint256 performanceBonus
    );

    // ============ CONSTRUCTOR ============

    constructor() ERC721("DePIN Node Rights", "DEPIN") Ownable(msg.sender) {
        // Initialize node type configurations
        _setupNodeTypes();
    }

    // ============ CORE FUNCTIONS ============

    /**
     * @dev Mint a new node rights NFT
     * @param nodeType Type of node to create
     * @param dpnStakeAmount Amount of DPN tokens to stake
     * @param metadata IPFS hash or metadata string
     */
    function mintNodeRights(
        NodeType nodeType,
        uint256 dpnStakeAmount,
        string memory metadata
    ) external payable nonReentrant {
        NodeTypeConfig memory config = nodeTypeConfigs[nodeType];
        require(config.isActive, "Node type not active");
        require(msg.value >= config.minETHStake, "Insufficient ETH stake");
        require(dpnStakeAmount >= config.minDPNStake, "Insufficient DPN stake");

        // Transfer DPN tokens (requires approval)
        // Note: In full implementation, you'd call DPN token contract here

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        // Create node rights
        nodeRights[tokenId] = NodeRights({
            nodeType: nodeType,
            stakedETH: msg.value,
            stakedDPN: dpnStakeAmount,
            mintedAt: block.timestamp,
            lastRewardClaim: block.timestamp,
            status: NodeStatus.ACTIVE,
            totalUptime: 0,
            performanceScore: PERFORMANCE_DECIMALS, // Start at 100%
            metadata: metadata,
            isUpgraded: false
        });

        // Track ownership
        ownerNodes[msg.sender].push(tokenId);

        // Mint NFT
        _safeMint(msg.sender, tokenId);

        emit NodeRightsMinted(tokenId, msg.sender, nodeType, msg.value, dpnStakeAmount);
    }

    /**
     * @dev Upgrade an existing node with additional stake
     * @param tokenId The node to upgrade
     * @param additionalDPN Additional DPN tokens to stake
     */
    function upgradeNode(uint256 tokenId, uint256 additionalDPN)
        external
        payable
        nonReentrant
    {
        require(_ownerOf(tokenId) != address(0), "Node does not exist");
        require(_ownerOf(tokenId) == msg.sender, "Not node owner");
        require(nodeRights[tokenId].status == NodeStatus.ACTIVE, "Node not active");

        NodeRights storage node = nodeRights[tokenId];

        // Update stakes
        node.stakedETH += msg.value;
        node.stakedDPN += additionalDPN;
        node.isUpgraded = true;

        // Performance boost for upgrades
        uint256 performanceBoost = (msg.value * 100) / node.stakedETH; // % boost
        node.performanceScore = _min(
            node.performanceScore + performanceBoost,
            PERFORMANCE_DECIMALS * 12 / 10 // Max 120%
        );

        emit NodeUpgraded(tokenId, msg.value, additionalDPN, node.performanceScore);
    }

    /**
     * @dev Update node performance (called by authorized performance tracker)
     * @param tokenId Node to update
     * @param uptimeSeconds Uptime to add (in seconds)
     * @param performanceScore New performance score (0-10000)
     */
    function updatePerformance(
        uint256 tokenId,
        uint256 uptimeSeconds,
        uint256 performanceScore
    ) external {
        require(_ownerOf(tokenId) != address(0), "Node does not exist");
        require(
            msg.sender == owner() || msg.sender == participationContract,
            "Unauthorized"
        );

        NodeRights storage node = nodeRights[tokenId];
        require(node.status != NodeStatus.TERMINATED, "Node terminated");

        // Update metrics
        node.totalUptime += uptimeSeconds;
        node.performanceScore = performanceScore;
        lastPerformanceUpdate[tokenId] = block.timestamp;

        // Check for slashing conditions (only if not already terminated)
        NodeStatus newStatus = _evaluateNodeStatus(performanceScore);
        if (newStatus != node.status) {
            _applySlashing(tokenId, newStatus);
        }

        emit PerformanceUpdated(tokenId, performanceScore, uptimeSeconds, node.status);
    }

    /**
     * @dev Simulate cross-chain bridging
     * @param tokenId Node to bridge
     * @param destinationChain Target chain identifier
     */
    function bridgeToChain(uint256 tokenId, string memory destinationChain)
        external
    {
        require(_ownerOf(tokenId) != address(0), "Node does not exist");
        require(_ownerOf(tokenId) == msg.sender, "Not node owner");

        crossChainBridges[tokenId] = destinationChain;

        emit CrossChainBridge(tokenId, destinationChain, msg.sender);
    }

    // ============ VIEW FUNCTIONS ============

    /**
     * @dev Get comprehensive node information
     */
    function getNodeDetails(uint256 tokenId)
        external
        view
        returns (
            NodeRights memory node,
            NodeTypeConfig memory config,
            uint256 timeStaked,
            uint256 estimatedRewards
        )
    {
        require(_ownerOf(tokenId) != address(0), "Node does not exist");

        node = nodeRights[tokenId];
        config = nodeTypeConfigs[node.nodeType];
        timeStaked = block.timestamp - node.mintedAt;
        estimatedRewards = _calculatePendingRewards(tokenId);
    }

    /**
     * @dev Get all nodes owned by an address
     */
    function getOwnerNodes(address owner) external view returns (uint256[] memory) {
        return ownerNodes[owner];
    }

    /**
     * @dev Get node type statistics
     */
    function getNodeTypeStats(NodeType nodeType)
        external
        view
        returns (
            uint256 totalNodes,
            uint256 totalStakedETH,
            uint256 averagePerformance,
            uint256 activeNodes
        )
    {
        uint256 supply = totalSupply();
        uint256 performanceSum = 0;

        for (uint256 i = 0; i < supply; i++) {
            uint256 tokenId = tokenByIndex(i);
            NodeRights memory node = nodeRights[tokenId];

            if (node.nodeType == nodeType) {
                totalNodes++;
                totalStakedETH += node.stakedETH;
                performanceSum += node.performanceScore;

                if (node.status == NodeStatus.ACTIVE) {
                    activeNodes++;
                }
            }
        }

        if (totalNodes > 0) {
            averagePerformance = performanceSum / totalNodes;
        }
    }

    // ============ INTERNAL FUNCTIONS ============

    function _setupNodeTypes() internal {
        // Pre-calculated reward rates (DPN per second)
        // 1 DPN/day = 1e18 / 86400 = 11574074074074 wei per second
        // 3 DPN/day = 3e18 / 86400 = 34722222222222 wei per second
        // 1.5 DPN/day = 1.5e18 / 86400 = 17361111111111 wei per second

        // Storage nodes: Reliable, lower stake, steady rewards
        nodeTypeConfigs[NodeType.STORAGE] = NodeTypeConfig({
            minETHStake: 1 ether,
            minDPNStake: 1000 ether,
            baseRewardRate: 11574074074074, // 1 DPN per day
            maxCapacity: 1000,
            isActive: true
        });

        // Compute nodes: High performance, higher stake, variable rewards
        nodeTypeConfigs[NodeType.COMPUTE] = NodeTypeConfig({
            minETHStake: 2 ether,
            minDPNStake: 2000 ether,
            baseRewardRate: 34722222222222, // 3 DPN per day
            maxCapacity: 500,
            isActive: true
        });

        // Bandwidth nodes: Network critical, medium stake, bonus rewards
        nodeTypeConfigs[NodeType.BANDWIDTH] = NodeTypeConfig({
            minETHStake: 0.5 ether,
            minDPNStake: 500 ether,
            baseRewardRate: 17361111111111, // 1.5 DPN per day
            maxCapacity: 2000,
            isActive: true
        });
    }

    function _evaluateNodeStatus(uint256 performanceScore)
        internal
        pure
        returns (NodeStatus)
    {
        if (performanceScore >= 9000) return NodeStatus.ACTIVE; // 90%+
        if (performanceScore >= 5000) return NodeStatus.SLASHED_MINOR; // 50-90%
        if (performanceScore >= 2000) return NodeStatus.SLASHED_MAJOR; // 20-50%
        return NodeStatus.TERMINATED; // <20%
    }

    function _applySlashing(uint256 tokenId, NodeStatus newStatus) internal {
        NodeRights storage node = nodeRights[tokenId];
        node.status = newStatus;

        string memory reason;
        uint256 penalty = 0;

        if (newStatus == NodeStatus.SLASHED_MINOR) {
            reason = "Low performance (50-90%)";
            penalty = node.stakedDPN * 5 / 100; // 5% DPN penalty
        } else if (newStatus == NodeStatus.SLASHED_MAJOR) {
            reason = "Poor performance (20-50%)";
            penalty = node.stakedDPN * 15 / 100; // 15% DPN penalty
        } else if (newStatus == NodeStatus.TERMINATED) {
            reason = "Critical failure (<20%)";
            penalty = node.stakedDPN; // Lose all DPN (keep ETH)
        }

        if (penalty > 0) {
            node.stakedDPN -= penalty;
            // In full implementation: transfer penalty to treasury
        }

        emit NodeSlashed(tokenId, newStatus, penalty, reason);
    }

    function _calculatePendingRewards(uint256 tokenId) internal view returns (uint256) {
        NodeRights memory node = nodeRights[tokenId];
        NodeTypeConfig memory config = nodeTypeConfigs[node.nodeType];

        if (node.status != NodeStatus.ACTIVE) return 0;

        uint256 timeElapsed = block.timestamp - node.lastRewardClaim;
        uint256 baseReward = config.baseRewardRate * timeElapsed;

        // Apply performance multiplier
        uint256 performanceMultiplier = node.performanceScore; // Already in basis points
        uint256 adjustedReward = (baseReward * performanceMultiplier) / PERFORMANCE_DECIMALS;

        // Apply staking multiplier (more stake = more rewards)
        uint256 stakingMultiplier = PERFORMANCE_DECIMALS +
            ((node.stakedETH - config.minETHStake) * 1000) / config.minETHStake;

        return (adjustedReward * stakingMultiplier) / PERFORMANCE_DECIMALS;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // ============ ADMIN FUNCTIONS ============

    function setParticipationContract(address _participation) external onlyOwner {
        participationContract = _participation;
    }

    function setDPNTokenContract(address _dpnToken) external onlyOwner {
        dpnTokenContract = _dpnToken;
    }

    function updateNodeTypeConfig(
        NodeType nodeType,
        uint256 minETHStake,
        uint256 minDPNStake,
        uint256 baseRewardRate,
        bool isActive
    ) external onlyOwner {
        NodeTypeConfig storage config = nodeTypeConfigs[nodeType];
        config.minETHStake = minETHStake;
        config.minDPNStake = minDPNStake;
        config.baseRewardRate = baseRewardRate;
        config.isActive = isActive;
    }

    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // ============ REQUIRED OVERRIDES FOR OPENZEPPELIN V5 ============

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        address previousOwner = super._update(to, tokenId, auth);

        // Update ownership tracking
        if (previousOwner != address(0) && to != address(0) && previousOwner != to) {
            // Remove from old owner's list
            uint256[] storage fromNodes = ownerNodes[previousOwner];
            for (uint256 i = 0; i < fromNodes.length; i++) {
                if (fromNodes[i] == tokenId) {
                    fromNodes[i] = fromNodes[fromNodes.length - 1];
                    fromNodes.pop();
                    break;
                }
            }

            // Add to new owner's list
            ownerNodes[to].push(tokenId);
        }

        return previousOwner;
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
