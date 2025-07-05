import { ethers } from "hardhat";
import { expect } from "chai";

describe("NodeRightsNFT Contract", function () {
    let nodeRights: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        const NodeRightsNFT = await ethers.getContractFactory("NodeRightsNFT", owner);
        nodeRights = await NodeRightsNFT.deploy();
        await nodeRights.waitForDeployment();
    });

    describe("Basic NFT Functionality", function () {
        it("should mint storage node rights", async function () {
            const tx = await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"), // 1000 DPN
                "ipfs://QmStorageNodeMetadata",
                { value: ethers.parseEther("1.5") } // 1.5 ETH (above minimum)
            );
            await tx.wait();

            expect(await nodeRights.balanceOf(addr1.address)).to.equal(1);
            expect(await nodeRights.ownerOf(0)).to.equal(addr1.address);

            const nodeDetails = await nodeRights.getNodeDetails(0);
            expect(nodeDetails.node.nodeType).to.equal(0); // STORAGE
            expect(nodeDetails.node.stakedETH).to.equal(ethers.parseEther("1.5"));
            expect(nodeDetails.node.stakedDPN).to.equal(ethers.parseEther("1000"));
        });

        it("should mint compute node rights", async function () {
            await nodeRights.connect(addr2).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2500"), // 2500 DPN (above minimum)
                "ipfs://QmComputeNodeMetadata",
                { value: ethers.parseEther("3.0") } // 3.0 ETH
            );

            const nodeDetails = await nodeRights.getNodeDetails(0);
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
                    { value: ethers.parseEther("0.5") } // Below 1 ETH minimum
                )
            ).to.be.revertedWith("Insufficient ETH stake");

            // Try to mint with insufficient DPN
            await expect(
                nodeRights.connect(addr1).mintNodeRights(
                    0, // STORAGE
                    ethers.parseEther("500"), // Below 1000 DPN minimum
                    "metadata",
                    { value: ethers.parseEther("1.5") }
                )
            ).to.be.revertedWith("Insufficient DPN stake");
        });
    });

    describe("Node Upgrades", function () {
        beforeEach(async function () {
            // Mint a storage node first
            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "metadata",
                { value: ethers.parseEther("1.0") }
            );
        });

        it("should upgrade node with additional stakes", async function () {
            const initialDetails = await nodeRights.getNodeDetails(0);
            const initialScore = initialDetails.node.performanceScore;

            await nodeRights.connect(addr1).upgradeNode(
                0,
                ethers.parseEther("500"), // Additional DPN
                { value: ethers.parseEther("0.5") } // Additional ETH
            );

            const upgradedDetails = await nodeRights.getNodeDetails(0);
            expect(upgradedDetails.node.stakedETH).to.equal(ethers.parseEther("1.5"));
            expect(upgradedDetails.node.stakedDPN).to.equal(ethers.parseEther("1500"));
            expect(upgradedDetails.node.isUpgraded).to.be.true;
            expect(upgradedDetails.node.performanceScore).to.be.greaterThan(initialScore);
        });

        it("should reject upgrade from non-owner", async function () {
            await expect(
                nodeRights.connect(addr2).upgradeNode(
                    0,
                    ethers.parseEther("500"),
                    { value: ethers.parseEther("0.5") }
                )
            ).to.be.revertedWith("Not node owner");
        });
    });

    describe("Performance Tracking & Slashing", function () {
        beforeEach(async function () {
            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "metadata",
                { value: ethers.parseEther("1.0") }
            );
        });

        it("should update performance for active nodes", async function () {
            await nodeRights.updatePerformance(
                0,
                3600, // 1 hour uptime
                9500  // 95% performance
            );

            const nodeDetails = await nodeRights.getNodeDetails(0);
            expect(nodeDetails.node.totalUptime).to.equal(3600);
            expect(nodeDetails.node.performanceScore).to.equal(9500);
            expect(nodeDetails.node.status).to.equal(0); // ACTIVE
        });

        it("should apply minor slashing for poor performance", async function () {
            const initialDetails = await nodeRights.getNodeDetails(0);
            const initialDPN = initialDetails.node.stakedDPN;

            await nodeRights.updatePerformance(
                0,
                1800, // 30 min uptime
                7000  // 70% performance (triggers minor slash)
            );

            const slashedDetails = await nodeRights.getNodeDetails(0);
            expect(slashedDetails.node.status).to.equal(1); // SLASHED_MINOR
            expect(slashedDetails.node.stakedDPN).to.be.lessThan(initialDPN); // 5% penalty
        });

        it("should apply major slashing for critical performance", async function () {
            await nodeRights.updatePerformance(
                0,
                600,  // 10 min uptime
                3000  // 30% performance (triggers major slash)
            );

            const slashedDetails = await nodeRights.getNodeDetails(0);
            expect(slashedDetails.node.status).to.equal(2); // SLASHED_MAJOR
        });

        it("should terminate node for severe performance failure", async function () {
            const initialDetails = await nodeRights.getNodeDetails(0);
            const initialDPN = initialDetails.node.stakedDPN;

            await nodeRights.updatePerformance(
                0,
                60,   // 1 min uptime
                1000  // 10% performance (triggers termination)
            );

            const terminatedDetails = await nodeRights.getNodeDetails(0);
            expect(terminatedDetails.node.status).to.equal(3); // TERMINATED
            expect(terminatedDetails.node.stakedDPN).to.equal(0); // Lose all DPN
        });
    });

    describe("Cross-Chain Features", function () {
        beforeEach(async function () {
            await nodeRights.connect(addr1).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2000"),
                "metadata",
                { value: ethers.parseEther("2.0") }
            );
        });

        it("should simulate cross-chain bridge", async function () {
            await nodeRights.connect(addr1).bridgeToChain(0, "ethereum-mainnet");

            const bridgeDestination = await nodeRights.crossChainBridges(0);
            expect(bridgeDestination).to.equal("ethereum-mainnet");
        });

        it("should reject bridge from non-owner", async function () {
            await expect(
                nodeRights.connect(addr2).bridgeToChain(0, "polygon")
            ).to.be.revertedWith("Not node owner");
        });
    });

    describe("Analytics & View Functions", function () {
        beforeEach(async function () {
            // Create multiple nodes for analytics
            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "storage-metadata",
                { value: ethers.parseEther("1.2") }
            );

            await nodeRights.connect(addr2).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2500"),
                "compute-metadata",
                { value: ethers.parseEther("3.5") }
            );

            await nodeRights.connect(addr3).mintNodeRights(
                2, // BANDWIDTH
                ethers.parseEther("800"),
                "bandwidth-metadata",
                { value: ethers.parseEther("0.8") }
            );
        });

        it("should return owner nodes correctly", async function () {
            const addr1Nodes = await nodeRights.getOwnerNodes(addr1.address);
            const addr2Nodes = await nodeRights.getOwnerNodes(addr2.address);

            expect(addr1Nodes.length).to.equal(1);
            expect(addr2Nodes.length).to.equal(1);
            expect(addr1Nodes[0]).to.equal(0);
            expect(addr2Nodes[0]).to.equal(1);
        });

        it("should calculate node type statistics", async function () {
            const storageStats = await nodeRights.getNodeTypeStats(0); // STORAGE
            const computeStats = await nodeRights.getNodeTypeStats(1); // COMPUTE

            expect(storageStats.totalNodes).to.equal(1);
            expect(storageStats.activeNodes).to.equal(1);
            expect(storageStats.totalStakedETH).to.equal(ethers.parseEther("1.2"));

            expect(computeStats.totalNodes).to.equal(1);
            expect(computeStats.totalStakedETH).to.equal(ethers.parseEther("3.5"));
        });

        it("should return comprehensive node details", async function () {
            const details = await nodeRights.getNodeDetails(0);

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
            console.log("📝 Update your subgraph.yaml to include this contract");

            // 1. Mint different types of nodes
            console.log("\n1️⃣  Minting Node Rights NFTs...");

            const tx1 = await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1200"),
                "ipfs://QmStorageAlpha",
                { value: ethers.parseEther("1.5") }
            );
            await tx1.wait();
            console.log("   🗄️  Storage Node #0 minted by:", addr1.address, "TX:", tx1.hash);

            const tx2 = await nodeRights.connect(addr2).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("2800"),
                "ipfs://QmComputeBeta",
                { value: ethers.parseEther("4.0") }
            );
            await tx2.wait();
            console.log("   💻 Compute Node #1 minted by:", addr2.address, "TX:", tx2.hash);

            const tx3 = await nodeRights.connect(addr3).mintNodeRights(
                2, // BANDWIDTH
                ethers.parseEther("600"),
                "ipfs://QmBandwidthGamma",
                { value: ethers.parseEther("0.7") }
            );
            await tx3.wait();
            console.log("   📡 Bandwidth Node #2 minted by:", addr3.address, "TX:", tx3.hash);

            const tx4 = await nodeRights.connect(addr1).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("3000"),
                "ipfs://QmComputeDelta",
                { value: ethers.parseEther("5.5") }
            );
            await tx4.wait();
            console.log("   💻 Compute Node #3 minted by:", addr1.address, "TX:", tx4.hash);

            // 2. Upgrade some nodes
            console.log("\n2️⃣  Upgrading nodes...");

            const tx5 = await nodeRights.connect(addr1).upgradeNode(
                0,
                ethers.parseEther("500"),
                { value: ethers.parseEther("0.8") }
            );
            await tx5.wait();
            console.log("   ⬆️  Node #0 upgraded (+0.8 ETH, +500 DPN), TX:", tx5.hash);

            const tx6 = await nodeRights.connect(addr2).upgradeNode(
                1,
                ethers.parseEther("1200"),
                { value: ethers.parseEther("2.0") }
            );
            await tx6.wait();
            console.log("   ⬆️  Node #1 upgraded (+2.0 ETH, +1200 DPN), TX:", tx6.hash);

            // 3. Performance updates and slashing scenarios
            console.log("\n3️⃣  Performance tracking...");

            const tx7 = await nodeRights.updatePerformance(0, 7200, 9800); // Excellent
            await tx7.wait();
            console.log("   📊 Node #0: 2h uptime, 98% performance (Active), TX:", tx7.hash);

            const tx8 = await nodeRights.updatePerformance(1, 5400, 9200); // Good
            await tx8.wait();
            console.log("   📊 Node #1: 1.5h uptime, 92% performance (Active), TX:", tx8.hash);

            const tx9 = await nodeRights.updatePerformance(2, 1800, 7500); // Minor slash
            await tx9.wait();
            console.log("   ⚠️  Node #2: 0.5h uptime, 75% performance (Minor Slash), TX:", tx9.hash);

            const tx10 = await nodeRights.updatePerformance(3, 10800, 9600); // Excellent
            await tx10.wait();
            console.log("   📊 Node #3: 3h uptime, 96% performance (Active), TX:", tx10.hash);

            // 4. More performance updates for slashing demonstration
            console.log("\n4️⃣  Demonstrating slashing mechanics...");

            const tx11 = await nodeRights.updatePerformance(2, 900, 4500); // Major slash
            await tx11.wait();
            console.log("   🚨 Node #2: Poor performance, 45% (Major Slash), TX:", tx11.hash);

            // Create a node to terminate
            const tx12 = await nodeRights.connect(addr3).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1000"),
                "ipfs://QmFailingNode",
                { value: ethers.parseEther("1.0") }
            );
            await tx12.wait();
            console.log("   🗄️  Storage Node #4 minted (will be terminated), TX:", tx12.hash);

            const tx13 = await nodeRights.updatePerformance(4, 300, 1500); // Termination
            await tx13.wait();
            console.log("   💀 Node #4: Critical failure, 15% (Terminated), TX:", tx13.hash);

            // 5. Cross-chain bridging simulation
            console.log("\n5️⃣  Cross-chain bridging...");

            const tx14 = await nodeRights.connect(addr1).bridgeToChain(0, "ethereum-mainnet");
            await tx14.wait();
            console.log("   🌉 Node #0 bridged to ethereum-mainnet, TX:", tx14.hash);

            const tx15 = await nodeRights.connect(addr2).bridgeToChain(1, "polygon-matic");
            await tx15.wait();
            console.log("   🌉 Node #1 bridged to polygon-matic, TX:", tx15.hash);

            const tx16 = await nodeRights.connect(addr1).bridgeToChain(3, "avalanche-subnet");
            await tx16.wait();
            console.log("   🌉 Node #3 bridged to avalanche-subnet, TX:", tx16.hash);

            // 6. Additional performance updates
            console.log("\n6️⃣  Additional performance data...");

            const tx17 = await nodeRights.updatePerformance(0, 3600, 9900); // More uptime
            await tx17.wait();
            console.log("   📊 Node #0: +1h uptime, 99% performance, TX:", tx17.hash);

            const tx18 = await nodeRights.updatePerformance(1, 7200, 8800); // Slight decline
            await tx18.wait();
            console.log("   📊 Node #1: +2h uptime, 88% performance, TX:", tx18.hash);

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

            const totalSupply = await nodeRights.totalSupply();
            console.log("   Total Nodes:", totalSupply.toString());

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

            // Test assertions
            expect(totalSupply).to.equal(5);
            expect(storageStats.totalNodes).to.equal(2); // Node 0 and 4
            expect(computeStats.totalNodes).to.equal(2); // Node 1 and 3
            expect(bandwidthStats.totalNodes).to.equal(1); // Node 2

            // Check specific node states
            const node0 = await nodeRights.getNodeDetails(0);
            const node2 = await nodeRights.getNodeDetails(2);
            const node4 = await nodeRights.getNodeDetails(4);

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
        });

        it("should reject admin calls from non-owner", async function () {
            await expect(
                nodeRights.connect(addr1).updateNodeTypeConfig(0, 0, 0, 0, false)
            ).to.be.revertedWithCustomError(nodeRights, "OwnableUnauthorizedAccount");
        });
    });
});
