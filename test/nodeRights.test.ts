import { ethers } from "hardhat";
import { expect } from "chai";

describe("NodeRightsNFT Contract", function () {
    let nodeRights: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    let initialState: any;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        // Connect to existing deployed contract
        const nodeRightsAddress = process.env.NODE_RIGHTS_NFT_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
        const NodeRightsNFT = await ethers.getContractFactory("NodeRightsNFT", owner);
        nodeRights = NodeRightsNFT.attach(nodeRightsAddress);

        // Capture initial state for baseline understanding
        initialState = {
            totalSupply: await nodeRights.totalSupply(),
            storageStats: await nodeRights.getNodeTypeStats(0),
            computeStats: await nodeRights.getNodeTypeStats(1),
            bandwidthStats: await nodeRights.getNodeTypeStats(2)
        };

        console.log(`Connected to NodeRightsNFT at: ${nodeRightsAddress} | Total NFTs: ${initialState.totalSupply}`);
    });

    describe("Basic NFT Functionality", function () {
        it("should mint storage node rights", async function () {
            const initialBalance = await nodeRights.balanceOf(addr1.address);
            const initialTotalSupply = await nodeRights.totalSupply();

            const tx = await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"), // 1000 DPN
                "ipfs://QmStorageNodeMetadata",
                { value: ethers.parseEther("1.5") } // 1.5 ETH (above minimum)
            );
            await tx.wait();

            expect(await nodeRights.balanceOf(addr1.address)).to.equal(initialBalance + 1n);
            expect(await nodeRights.totalSupply()).to.equal(initialTotalSupply + 1n);

            const tokenId = initialTotalSupply; // Next token ID
            expect(await nodeRights.ownerOf(tokenId)).to.equal(addr1.address);

            const nodeDetails = await nodeRights.getNodeDetails(tokenId);
            expect(nodeDetails.node.nodeType).to.equal(0); // STORAGE
            expect(nodeDetails.node.stakedETH).to.equal(ethers.parseEther("1.5"));
            expect(nodeDetails.node.stakedDPN).to.equal(ethers.parseEther("1000"));
        });

        it("should mint compute node rights", async function () {
            const initialTotalSupply = await nodeRights.totalSupply();

            await nodeRights.connect(addr2).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2500"), // 2500 DPN (above minimum)
                "ipfs://QmComputeNodeMetadata",
                { value: ethers.parseEther("3.0") } // 3.0 ETH
            );

            const tokenId = initialTotalSupply;
            const nodeDetails = await nodeRights.getNodeDetails(tokenId);
            expect(nodeDetails.node.nodeType).to.equal(1); // COMPUTE
            expect(nodeDetails.node.performanceScore).to.equal(10000); // 100%
        });

        it("should reject insufficient stakes", async function () {
            // Try to mint storage node with insufficient ETH
            await expect(
                nodeRights.connect(addr1).mintNodeRights(
                    0, // STORAGE
                    ethers.parseEther("1000"),
                    "metadata",
                    { value: ethers.parseEther("0.001") } // Way below ANY minimum
                )
            ).to.be.revertedWith("Insufficient ETH stake");

// Try to mint with insufficient DPN
            await expect(
                nodeRights.connect(addr1).mintNodeRights(
                    0, // STORAGE
                    ethers.parseEther("1"), // Way below ANY minimum
                    "metadata",
                    { value: ethers.parseEther("1.5") }
                )
            ).to.be.revertedWith("Insufficient DPN stake");
        });
    });

    describe("Node Upgrades", function () {
        let testNodeId: any;

        beforeEach(async function () {
            // Mint a fresh node for upgrade testing
            const initialSupply = await nodeRights.totalSupply();
            testNodeId = initialSupply;

            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "metadata",
                { value: ethers.parseEther("1.0") }
            );
        });

        it("should upgrade node with additional stakes", async function () {
            const initialDetails = await nodeRights.getNodeDetails(testNodeId);
            const initialScore = initialDetails.node.performanceScore;

            await nodeRights.connect(addr1).upgradeNode(
                testNodeId,
                ethers.parseEther("500"), // Additional DPN
                { value: ethers.parseEther("0.5") } // Additional ETH
            );

            const upgradedDetails = await nodeRights.getNodeDetails(testNodeId);
            expect(upgradedDetails.node.stakedETH).to.equal(ethers.parseEther("1.5"));
            expect(upgradedDetails.node.stakedDPN).to.equal(ethers.parseEther("1500"));
            expect(upgradedDetails.node.isUpgraded).to.be.true;
            expect(upgradedDetails.node.performanceScore).to.be.greaterThan(initialScore);
        });

        it("should reject upgrade from non-owner", async function () {
            await expect(
                nodeRights.connect(addr2).upgradeNode(
                    testNodeId,
                    ethers.parseEther("500"),
                    { value: ethers.parseEther("0.5") }
                )
            ).to.be.revertedWith("Not node owner");
        });
    });

    describe("Performance Tracking & Slashing", function () {
        let testNodeId: any;

        beforeEach(async function () {
            const initialSupply = await nodeRights.totalSupply();
            testNodeId = initialSupply;

            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "metadata",
                { value: ethers.parseEther("1.0") }
            );
        });

        it("should update performance for active nodes", async function () {
            await nodeRights.updatePerformance(
                testNodeId,
                3600, // 1 hour uptime
                9500  // 95% performance
            );

            const nodeDetails = await nodeRights.getNodeDetails(testNodeId);
            expect(nodeDetails.node.totalUptime).to.equal(3600);
            expect(nodeDetails.node.performanceScore).to.equal(9500);
            expect(nodeDetails.node.status).to.equal(0); // ACTIVE
        });

        it("should apply minor slashing for poor performance", async function () {
            const initialDetails = await nodeRights.getNodeDetails(testNodeId);
            const initialDPN = initialDetails.node.stakedDPN;

            await nodeRights.updatePerformance(
                testNodeId,
                1800, // 30 min uptime
                7000  // 70% performance (triggers minor slash)
            );

            const slashedDetails = await nodeRights.getNodeDetails(testNodeId);
            expect(slashedDetails.node.status).to.equal(1); // SLASHED_MINOR
            expect(slashedDetails.node.stakedDPN).to.be.lessThan(initialDPN); // 5% penalty
        });

        it("should apply major slashing for critical performance", async function () {
            await nodeRights.updatePerformance(
                testNodeId,
                600,  // 10 min uptime
                3000  // 30% performance (triggers major slash)
            );

            const slashedDetails = await nodeRights.getNodeDetails(testNodeId);
            expect(slashedDetails.node.status).to.equal(2); // SLASHED_MAJOR
        });

        it("should terminate node for severe performance failure", async function () {
            await nodeRights.updatePerformance(
                testNodeId,
                60,   // 1 min uptime
                1000  // 10% performance (triggers termination)
            );

            const terminatedDetails = await nodeRights.getNodeDetails(testNodeId);
            expect(terminatedDetails.node.status).to.equal(3); // TERMINATED
            expect(terminatedDetails.node.stakedDPN).to.equal(0); // Lose all DPN
        });
    });

    describe("Cross-Chain Features", function () {
        let testNodeId: any;

        beforeEach(async function () {
            const initialSupply = await nodeRights.totalSupply();
            testNodeId = initialSupply;

            await nodeRights.connect(addr1).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2000"),
                "metadata",
                { value: ethers.parseEther("2.0") }
            );
        });

        it("should simulate cross-chain bridge", async function () {
            await nodeRights.connect(addr1).bridgeToChain(testNodeId, "ethereum-mainnet");

            const bridgeDestination = await nodeRights.crossChainBridges(testNodeId);
            expect(bridgeDestination).to.equal("ethereum-mainnet");
        });

        it("should reject bridge from non-owner", async function () {
            await expect(
                nodeRights.connect(addr2).bridgeToChain(testNodeId, "polygon")
            ).to.be.revertedWith("Not node owner");
        });
    });

    describe("Analytics & View Functions", function () {
        let newNodeIds: any[] = [];

        beforeEach(async function () {
            // Create multiple fresh nodes for analytics
            const initialSupply = await nodeRights.totalSupply();

            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "storage-metadata",
                { value: ethers.parseEther("1.2") }
            );
            newNodeIds.push(initialSupply);

            await nodeRights.connect(addr2).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2500"),
                "compute-metadata",
                { value: ethers.parseEther("3.5") }
            );
            newNodeIds.push(initialSupply + 1n);

            await nodeRights.connect(addr3).mintNodeRights(
                2, // BANDWIDTH
                ethers.parseEther("800"),
                "bandwidth-metadata",
                { value: ethers.parseEther("0.8") }
            );
            newNodeIds.push(initialSupply + 2n);
        });

        it("should return owner nodes correctly", async function () {
            const addr1Nodes = await nodeRights.getOwnerNodes(addr1.address);
            const addr2Nodes = await nodeRights.getOwnerNodes(addr2.address);
            const addr3Nodes = await nodeRights.getOwnerNodes(addr3.address);

            // Should include both baseline and new nodes
            expect(addr1Nodes.length).to.be.greaterThan(0);
            expect(addr2Nodes.length).to.be.greaterThan(0);
            expect(addr3Nodes.length).to.be.greaterThan(0);

            // Check that new nodes are included
            expect(addr1Nodes).to.include(newNodeIds[0]);
            expect(addr2Nodes).to.include(newNodeIds[1]);
            expect(addr3Nodes).to.include(newNodeIds[2]);
        });

        it("should calculate node type statistics", async function () {
            const storageStats = await nodeRights.getNodeTypeStats(0); // STORAGE
            const computeStats = await nodeRights.getNodeTypeStats(1); // COMPUTE
            const bandwidthStats = await nodeRights.getNodeTypeStats(2); // BANDWIDTH

            // Should include baseline + new nodes
            expect(storageStats.totalNodes).to.be.greaterThan(initialState.storageStats.totalNodes);
            expect(computeStats.totalNodes).to.be.greaterThan(initialState.computeStats.totalNodes);
            expect(bandwidthStats.totalNodes).to.be.greaterThan(initialState.bandwidthStats.totalNodes);
        });

        it("should return comprehensive node details", async function () {
            const details = await nodeRights.getNodeDetails(newNodeIds[0]);

            expect(details.node.nodeType).to.equal(0); // STORAGE
            expect(details.config.minETHStake).to.equal(ethers.parseEther("1"));
            expect(details.timeStaked).to.be.greaterThan(0);
        });
    });

    // COMPREHENSIVE SUBGRAPH EVENT GENERATION
    describe("Subgraph Event Generation", function () {
        it("should generate all NodeRights events for subgraph testing", async function () {
            const contractAddress = await nodeRights.getAddress();
            console.log("\n🏗️  NodeRightsNFT deployed at:", contractAddress);
            console.log("📋 Update your subgraph.yaml to include this contract");

            // 1. Mint different types of nodes
            console.log("\n1️⃣  Minting Node Rights NFTs...");

            const initialSupply = await nodeRights.totalSupply();
            let nodeCounter = Number(initialSupply);

            const tx1 = await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1200"),
                "ipfs://QmStorageAlpha",
                { value: ethers.parseEther("1.5") }
            );
            await tx1.wait();
            console.log(`   🗄️  Storage Node #${nodeCounter} minted by:`, addr1.address, "TX:", tx1.hash);
            nodeCounter++;

            const tx2 = await nodeRights.connect(addr2).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2800"),
                "ipfs://QmComputeBeta",
                { value: ethers.parseEther("4.0") }
            );
            await tx2.wait();
            console.log(`   💻 Compute Node #${nodeCounter} minted by:`, addr2.address, "TX:", tx2.hash);
            nodeCounter++;

            const tx3 = await nodeRights.connect(addr3).mintNodeRights(
                2, // BANDWIDTH
                ethers.parseEther("600"),
                "ipfs://QmBandwidthGamma",
                { value: ethers.parseEther("0.7") }
            );
            await tx3.wait();
            console.log(`   📡 Bandwidth Node #${nodeCounter} minted by:`, addr3.address, "TX:", tx3.hash);
            nodeCounter++;

            const tx4 = await nodeRights.connect(addr1).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("3000"),
                "ipfs://QmComputeDelta",
                { value: ethers.parseEther("5.5") }
            );
            await tx4.wait();
            console.log(`   💻 Compute Node #${nodeCounter} minted by:`, addr1.address, "TX:", tx4.hash);

            const storageNodeId = Number(initialSupply);
            const computeNodeId = Number(initialSupply) + 1;
            const bandwidthNodeId = Number(initialSupply) + 2;
            const secondComputeNodeId = Number(initialSupply) + 3;

            // 2. Upgrade some nodes
            console.log("\n2️⃣  Upgrading nodes...");

            const tx5 = await nodeRights.connect(addr1).upgradeNode(
                storageNodeId,
                ethers.parseEther("500"),
                { value: ethers.parseEther("0.8") }
            );
            await tx5.wait();
            console.log(`   ⬆️  Node #${storageNodeId} upgraded (+0.8 ETH, +500 DPN), TX:`, tx5.hash);

            const tx6 = await nodeRights.connect(addr2).upgradeNode(
                computeNodeId,
                ethers.parseEther("1200"),
                { value: ethers.parseEther("2.0") }
            );
            await tx6.wait();
            console.log(`   ⬆️  Node #${computeNodeId} upgraded (+2.0 ETH, +1200 DPN), TX:`, tx6.hash);

            // 3. Performance updates and slashing scenarios
            console.log("\n3️⃣  Performance tracking...");

            const tx7 = await nodeRights.updatePerformance(storageNodeId, 7200, 9800); // Excellent
            await tx7.wait();
            console.log(`   📊 Node #${storageNodeId}: 2h uptime, 98% performance (Active), TX:`, tx7.hash);

            const tx8 = await nodeRights.updatePerformance(computeNodeId, 5400, 9200); // Good
            await tx8.wait();
            console.log(`   📊 Node #${computeNodeId}: 1.5h uptime, 92% performance (Active), TX:`, tx8.hash);

            const tx9 = await nodeRights.updatePerformance(bandwidthNodeId, 1800, 7500); // Minor slash
            await tx9.wait();
            console.log(`   ⚠️  Node #${bandwidthNodeId}: 0.5h uptime, 75% performance (Minor Slash), TX:`, tx9.hash);

            const tx10 = await nodeRights.updatePerformance(secondComputeNodeId, 10800, 9600); // Excellent
            await tx10.wait();
            console.log(`   📊 Node #${secondComputeNodeId}: 3h uptime, 96% performance (Active), TX:`, tx10.hash);

            // 4. More performance updates for slashing demonstration
            console.log("\n4️⃣  Demonstrating slashing mechanics...");

            const tx11 = await nodeRights.updatePerformance(bandwidthNodeId, 900, 4500); // Major slash
            await tx11.wait();
            console.log(`   🚨 Node #${bandwidthNodeId}: Poor performance, 45% (Major Slash), TX:`, tx11.hash);

            // Create a node to terminate
            const failingNodeId = nodeCounter;
            const tx12 = await nodeRights.connect(addr3).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "ipfs://QmFailingNode",
                { value: ethers.parseEther("1.0") }
            );
            await tx12.wait();
            console.log(`   🗄️  Storage Node #${failingNodeId} minted (will be terminated), TX:`, tx12.hash);

            const tx13 = await nodeRights.updatePerformance(failingNodeId, 300, 1500); // Termination
            await tx13.wait();
            console.log(`   💀 Node #${failingNodeId}: Critical failure, 15% (Terminated), TX:`, tx13.hash);

            // 5. Cross-chain bridging simulation
            console.log("\n5️⃣  Cross-chain bridging...");

            const tx14 = await nodeRights.connect(addr1).bridgeToChain(storageNodeId, "ethereum-mainnet");
            await tx14.wait();
            console.log(`   🌉 Node #${storageNodeId} bridged to ethereum-mainnet, TX:`, tx14.hash);

            const tx15 = await nodeRights.connect(addr2).bridgeToChain(computeNodeId, "polygon-matic");
            await tx15.wait();
            console.log(`   🌉 Node #${computeNodeId} bridged to polygon-matic, TX:`, tx15.hash);

            const tx16 = await nodeRights.connect(addr1).bridgeToChain(secondComputeNodeId, "avalanche-subnet");
            await tx16.wait();
            console.log(`   🌉 Node #${secondComputeNodeId} bridged to avalanche-subnet, TX:`, tx16.hash);

            // 6. Additional performance updates
            console.log("\n6️⃣  Additional performance data...");

            const tx17 = await nodeRights.updatePerformance(storageNodeId, 3600, 9900); // More uptime
            await tx17.wait();
            console.log(`   📊 Node #${storageNodeId}: +1h uptime, 99% performance, TX:`, tx17.hash);

            const tx18 = await nodeRights.updatePerformance(computeNodeId, 7200, 8800); // Slight decline
            await tx18.wait();
            console.log(`   📊 Node #${computeNodeId}: +2h uptime, 88% performance, TX:`, tx18.hash);

            console.log("\n🎯 All NodeRights events generated! Update your subgraph to index:");
            console.log("   📊 http://localhost:8000/subgraphs/name/participation-subgraph");

            console.log("\n📝 Sample GraphQL query for NodeRights:");
            console.log(`
query {
  nodeRightsMinted: events(where: {eventName: "NodeRightsMinted"}) {
    id
    tokenId
    owner
    nodeType
    ethStaked
    dpnStaked
    timestamp
  }
  
  nodeUpgrades: events(where: {eventName: "NodeUpgraded"}) {
    id
    tokenId
    additionalETH
    additionalDPN
    newPerformanceScore
  }
  
  performanceUpdates: events(where: {eventName: "PerformanceUpdated"}) {
    id
    tokenId
    newScore
    uptimeAdded
    status
  }
  
  nodeSlashings: events(where: {eventName: "NodeSlashed"}) {
    id
    tokenId
    newStatus
    penaltyAmount
    reason
  }
  
  crossChainBridges: events(where: {eventName: "CrossChainBridge"}) {
    id
    tokenId
    destinationChain
    operator
  }
}`);

            // Verify final state
            console.log("\n📈 Final Network Statistics:");

            const finalTotalSupply = await nodeRights.totalSupply();
            console.log("   Total Nodes:", finalTotalSupply.toString());

            const storageStats = await nodeRights.getNodeTypeStats(0);
            console.log("   Storage Nodes:", storageStats.totalNodes.toString(),
                "| Active:", storageStats.activeNodes.toString(),
                "| Total Staked:", ethers.formatEther(storageStats.totalStakedETH), "ETH");

            const computeStats = await nodeRights.getNodeTypeStats(1);
            console.log("   Compute Nodes:", computeStats.totalNodes.toString(),
                "| Active:", computeStats.activeNodes.toString(),
                "| Total Staked:", ethers.formatEther(computeStats.totalStakedETH), "ETH");

            const bandwidthStats = await nodeRights.getNodeTypeStats(2);
            console.log("   Bandwidth Nodes:", bandwidthStats.totalNodes.toString(),
                "| Active:", bandwidthStats.activeNodes.toString(),
                "| Total Staked:", ethers.formatEther(bandwidthStats.totalStakedETH), "ETH");

            // Test assertions for additional nodes created in this test
            expect(finalTotalSupply).to.be.greaterThan(initialSupply);

            // Check specific node states
            const node0 = await nodeRights.getNodeDetails(storageNodeId);
            const node2 = await nodeRights.getNodeDetails(bandwidthNodeId);
            const node4 = await nodeRights.getNodeDetails(failingNodeId);

            expect(node0.node.status).to.equal(0); // ACTIVE
            expect(node0.node.isUpgraded).to.be.true;
            expect(node2.node.status).to.equal(2); // SLASHED_MAJOR
            expect(node4.node.status).to.equal(3); // TERMINATED

            console.log("   ✅ All tests passed! Contract ready for integration.");
        });
    });

    describe("Admin Functions", function () {
        it("should allow owner to update node type configs", async function () {
            await nodeRights.updateNodeTypeConfig(
                0, // STORAGE
                ethers.parseEther("2"), // New min ETH
                ethers.parseEther("2000"), // New min DPN
                23148148148148, // New reward rate (2 DPN per day)
                true
            );

            // Verify the new minimums are enforced
            await expect(
                nodeRights.connect(addr1).mintNodeRights(
                    0,
                    ethers.parseEther("1500"), // Below new minimum
                    "metadata",
                    { value: ethers.parseEther("1.8") } // Below new minimum
                )
            ).to.be.revertedWith("Insufficient ETH stake");

            // Reset the config back to original for other tests
            await nodeRights.updateNodeTypeConfig(
                0, // STORAGE
                ethers.parseEther("1"), // Back to original
                ethers.parseEther("1000"), // Back to original
                23148148148148,
                true
            );
        });

        it("should reject admin calls from non-owner", async function () {
            await expect(
                nodeRights.connect(addr1).updateNodeTypeConfig(0, 0, 0, 0, false)
            ).to.be.revertedWithCustomError(nodeRights, "OwnableUnauthorizedAccount");
        });
    });
});
