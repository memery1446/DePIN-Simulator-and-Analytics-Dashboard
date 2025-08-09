// test/integration.test.ts
import { ethers } from "hardhat";
import { expect } from "chai";

describe("DePIN Integration Tests", function () {
    let participation: any;
    let stakingPool: any;
    let nodeRights: any;
    let dpnToken: any;
    let nodeRegistry: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        // Deploy all contracts
        const DPNToken = await ethers.getContractFactory("DPNToken");
        dpnToken = await DPNToken.deploy(ethers.parseEther("1000000")); // 1M initial supply

        const NodeRegistry = await ethers.getContractFactory("NodeRegistry");
        nodeRegistry = await NodeRegistry.deploy();

        const Participation = await ethers.getContractFactory("Participation");
        participation = await Participation.deploy();

        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy();

        const NodeRightsNFT = await ethers.getContractFactory("NodeRightsNFT");
        nodeRights = await NodeRightsNFT.deploy();

        // Setup contract integrations
        await stakingPool.setDPNTokenContract(await dpnToken.getAddress());
        await stakingPool.setNodeRightsContract(await nodeRights.getAddress());
        await nodeRights.setDPNTokenContract(await dpnToken.getAddress());
        await nodeRights.setParticipationContract(await participation.getAddress());

        console.log("\n🏗️  All contracts deployed and linked:");
        console.log("   DPNToken:", await dpnToken.getAddress());
        console.log("   NodeRegistry:", await nodeRegistry.getAddress());
        console.log("   Participation:", await participation.getAddress());
        console.log("   StakingPool:", await stakingPool.getAddress());
        console.log("   NodeRightsNFT:", await nodeRights.getAddress());
    });

    describe("🔗 Cross-Contract Workflows", function () {
        it("should complete full DePIN node operator journey", async function () {
            console.log("\n🚀 Testing complete node operator workflow...");

            // 1. User stakes in StakingPool to build reputation
            console.log("\n1️⃣  Building reputation through staking...");
            await stakingPool.connect(addr1).stakeToPool(
                1, // SILVER tier
                1, // 30-day lock
                { value: ethers.parseEther("3.0") }
            );

            const stakingPosition = await stakingPool.getPositionDetails(addr1.address, 0);
            expect(stakingPosition.position.tier).to.equal(1);
            console.log("   ✅ Staked 3.0 ETH in Silver tier");

            // 2. User registers node in Participation system
            console.log("\n2️⃣  Registering operational node...");
            await participation.connect(addr1).registerNode("High-Performance Storage Node");

            const participationNode = await participation.nodes(0);
            expect(participationNode.owner).to.equal(addr1.address);
            console.log("   ✅ Node registered in participation system");

            // 3. User mints NodeRights NFT for the same node
            console.log("\n3️⃣  Minting node rights NFT...");

            // Give user some DPN tokens for staking
            await dpnToken.transfer(addr1.address, ethers.parseEther("2000"));
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("2000"));

            await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1500"), // 1500 DPN
                "ipfs://QmIntegratedNode",
                { value: ethers.parseEther("2.0") }
            );

            expect(await nodeRights.balanceOf(addr1.address)).to.equal(1);
            console.log("   ✅ NodeRights NFT minted");

            // 4. Node operates and records uptime
            console.log("\n4️⃣  Operating node and recording performance...");
            await participation.connect(addr1).recordUptime(0, 240); // 4 hours
            await nodeRights.updatePerformance(0, 14400, 9800); // 4h uptime, 98% performance

            const nodeDetails = await nodeRights.getNodeDetails(0);
            expect(nodeDetails.node.performanceScore).to.equal(9800);
            console.log("   ✅ Node performance recorded: 98% efficiency");

            // 5. Fast forward time for rewards
            console.log("\n5️⃣  Time passage for reward accumulation...");
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine", []);

            // 6. Claim rewards from both systems
            console.log("\n6️⃣  Claiming rewards from all sources...");
            await participation.connect(addr1).claimReward(0);
            await stakingPool.connect(addr1).claimRewards(0);

            console.log("   ✅ Rewards claimed from participation and staking");

            // 7. Upgrade node with additional resources
            console.log("\n7️⃣  Upgrading node capacity...");
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("500"));
            await nodeRights.connect(addr1).upgradeNode(
                0,
                ethers.parseEther("500"),
                { value: ethers.parseEther("1.0") }
            );

            const upgradedDetails = await nodeRights.getNodeDetails(0);
            expect(upgradedDetails.node.isUpgraded).to.be.true;
            console.log("   ✅ Node upgraded successfully");

            console.log("\n🎉 Complete workflow successful!");
        });

        it("should handle multi-user network effects", async function () {
            console.log("\n🌐 Testing network effects with multiple users...");

            // Setup: Multiple users with different strategies - FIXED amounts
            const users = [addr1, addr2, addr3];
            const strategies = [
                { tier: 0, lock: 0, ethAmount: "0.5", dpnAmount: "1000", nodeType: 0, ethNode: "1.0" }, // Bronze/Storage
                { tier: 1, lock: 2, ethAmount: "2.5", dpnAmount: "2000", nodeType: 1, ethNode: "2.0" }, // Silver/Compute
                { tier: 2, lock: 3, ethAmount: "8.0", dpnAmount: "500", nodeType: 2, ethNode: "0.5" }   // Gold/Bandwidth
            ];

            console.log("\n1️⃣  Setting up diverse user strategies...");

            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                const strategy = strategies[i];

                // Give DPN tokens
                await dpnToken.transfer(user.address, ethers.parseEther(strategy.dpnAmount));
                await dpnToken.connect(user).approve(await nodeRights.getAddress(), ethers.parseEther(strategy.dpnAmount));

                // Stake in pool
                await stakingPool.connect(user).stakeToPool(
                    strategy.tier,
                    strategy.lock,
                    { value: ethers.parseEther(strategy.ethAmount) }
                );

                // Register participation node
                await participation.connect(user).registerNode(`Node-${i}-Strategy-${strategy.tier}`);

                // Mint NFT - FIXED: Use proper minimum amounts for each node type
                await nodeRights.connect(user).mintNodeRights(
                    strategy.nodeType,
                    ethers.parseEther(strategy.dpnAmount),
                    `ipfs://QmNode${i}`,
                    { value: ethers.parseEther(strategy.ethNode) } // FIXED: Use proper ETH amounts
                );

                console.log(`   User ${i+1}: ${strategy.tier} tier, ${strategy.lock} lock, ${strategy.nodeType} node type`);
            }

            // Simulate different performance levels
            console.log("\n2️⃣  Simulating varied node performance...");
            const performances = [9800, 7500, 4000]; // Excellent, Good, Poor

            for (let i = 0; i < users.length; i++) {
                await participation.connect(users[i]).recordUptime(i, 120 + (i * 60)); // Different uptimes
                await nodeRights.updatePerformance(i, 7200, performances[i]);
                console.log(`   Node ${i}: ${performances[i]/100}% performance`);
            }

            // Fast forward and check ecosystem effects
            await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 1 week
            await ethers.provider.send("evm_mine", []);

            console.log("\n3️⃣  Analyzing network effects...");

            // Check how different strategies performed
            const globalStats = await stakingPool.getGlobalStats();
            console.log(`   Total Network TVL: ${ethers.formatEther(globalStats.tvl)} ETH`);

            const storageStats = await nodeRights.getNodeTypeStats(0);
            const computeStats = await nodeRights.getNodeTypeStats(1);
            const bandwidthStats = await nodeRights.getNodeTypeStats(2);

            console.log(`   Storage Nodes: ${storageStats.activeNodes}/${storageStats.totalNodes} active`);
            console.log(`   Compute Nodes: ${computeStats.activeNodes}/${computeStats.totalNodes} active`);
            console.log(`   Bandwidth Nodes: ${bandwidthStats.activeNodes}/${bandwidthStats.totalNodes} active`);

            // Verify network health
            expect(globalStats.tvl).to.be.greaterThan(ethers.parseEther("10"));
            expect(storageStats.totalNodes).to.equal(1);
            expect(computeStats.totalNodes).to.equal(1);
            expect(bandwidthStats.totalNodes).to.equal(1);

            console.log("   ✅ Network effects validated");
        });

        it("should handle slashing cascades and recovery", async function () {
            console.log("\n⚠️  Testing slashing cascades and recovery mechanisms...");

            // Setup a node operator with positions across multiple contracts
            await dpnToken.transfer(addr1.address, ethers.parseEther("5000")); // INCREASED amount
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("5000"));

            console.log("\n1️⃣  Setting up multi-contract positions...");

            // Multiple staking positions
            await stakingPool.connect(addr1).stakeToPool(1, 2, { value: ethers.parseEther("3.0") }); // Silver, 90-day
            await stakingPool.connect(addr1).stakeToPool(2, 1, { value: ethers.parseEther("6.0") }); // Gold, 30-day

            // Multiple nodes
            await participation.connect(addr1).registerNode("Primary Node");
            await participation.connect(addr1).registerNode("Backup Node");

            await nodeRights.connect(addr1).mintNodeRights(0, ethers.parseEther("1000"), "primary", { value: ethers.parseEther("1.0") }); // FIXED: Storage minimums
            await nodeRights.connect(addr1).mintNodeRights(1, ethers.parseEther("2000"), "backup", { value: ethers.parseEther("2.0") }); // FIXED: Compute minimums

            console.log("   ✅ Multi-contract positions established");

            // Simulate performance degradation
            console.log("\n2️⃣  Simulating performance degradation...");

            // Good performance initially
            await nodeRights.updatePerformance(0, 7200, 9500); // 95%
            await nodeRights.updatePerformance(1, 7200, 9200); // 92%

            // Performance decline leading to slashing
            await nodeRights.updatePerformance(0, 3600, 7000); // 70% - minor slash
            await nodeRights.updatePerformance(1, 3600, 8500); // 85% - still good

            let node0Details = await nodeRights.getNodeDetails(0);
            expect(node0Details.node.status).to.equal(1); // SLASHED_MINOR
            console.log("   ⚠️  Node 0: Minor slashing applied");

            // Further decline
            await nodeRights.updatePerformance(0, 1800, 3500); // 35% - major slash

            node0Details = await nodeRights.getNodeDetails(0);
            expect(node0Details.node.status).to.equal(2); // SLASHED_MAJOR
            console.log("   🚨 Node 0: Major slashing applied");

            // Test recovery mechanism
            console.log("\n3️⃣  Testing recovery mechanisms...");

            // Upgrade the slashed node
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("1000"));
            await nodeRights.connect(addr1).upgradeNode(0, ethers.parseEther("1000"), { value: ethers.parseEther("1.0") });

            // Improve performance over time
            await nodeRights.updatePerformance(0, 7200, 9000); // Recovery to 90%

            const recoveredDetails = await nodeRights.getNodeDetails(0);
            expect(recoveredDetails.node.isUpgraded).to.be.true;
            console.log("   🔄 Node 0: Recovery upgrade completed");

            // Verify other positions remained stable
            const positions = await stakingPool.getUserPositions(addr1.address);
            expect(positions.length).to.equal(2);
            expect(positions[0].isActive).to.be.true;
            expect(positions[1].isActive).to.be.true;
            console.log("   ✅ Staking positions remained stable during slashing");

            console.log("   ✅ Slashing cascade and recovery tested successfully");
        });
    });

    describe("🎯 Advanced Scenarios", function () {
        it("should handle governance and emergency scenarios", async function () {
            console.log("\n🏛️  Testing governance and emergency scenarios...");

            // Setup initial state
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("1.0") });
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") });

            console.log("\n1️⃣  Testing admin governance functions...");

            // Update pool configurations
            await stakingPool.updatePoolConfig(
                0, // BRONZE
                ethers.parseEther("0.2"), // Lower minimum
                12000, // 1.2x multiplier
                23148148148148, // Higher reward rate
                true
            );

            // Update node type configurations
            await nodeRights.updateNodeTypeConfig(
                0, // STORAGE
                ethers.parseEther("0.8"), // Lower ETH requirement
                ethers.parseEther("800"), // Lower DPN requirement
                34722222222222, // Higher reward rate
                true
            );

            console.log("   ✅ Pool and node configurations updated");

            // Test emergency procedures
            console.log("\n2️⃣  Testing emergency procedures...");

            await stakingPool.enableEmergencyWithdraw();
            const emergencyEnabled = await stakingPool.emergencyWithdrawEnabled();
            expect(emergencyEnabled).to.be.greaterThan(0);
            console.log("   ⚠️  Emergency withdrawal enabled (24h delay)");

            // Verify emergency withdraw requires delay
            await expect(
                stakingPool.emergencyWithdraw()
            ).to.be.revertedWith("24h delay required");
            console.log("   ✅ Emergency delay protection working");

            // Test admin-only restrictions
            await expect(
                stakingPool.connect(addr1).updatePoolConfig(0, 0, 0, 0, false)
            ).to.be.revertedWithCustomError(stakingPool, "OwnableUnauthorizedAccount");
            console.log("   ✅ Admin access control working");
        });

        it("should measure gas costs and optimization opportunities", async function () {
            console.log("\n⛽ Testing gas optimization scenarios...");

            let tx: any;
            let receipt: any;

            console.log("\n1️⃣  Measuring basic operation costs...");

            // Measure staking gas costs
            tx = await stakingPool.connect(addr1).stakeToPool(1, 1, { value: ethers.parseEther("2.0") });
            receipt = await tx.wait();
            console.log(`   Staking gas cost: ${receipt.gasUsed.toString()}`);

            // Measure node minting gas costs
            await dpnToken.transfer(addr1.address, ethers.parseEther("2000"));
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("2000"));

            tx = await nodeRights.connect(addr1).mintNodeRights(0, ethers.parseEther("1500"), "test", { value: ethers.parseEther("1.5") });
            receipt = await tx.wait();
            console.log(`   NFT minting gas cost: ${receipt.gasUsed.toString()}`);

            // Measure batch operations
            console.log("\n2️⃣  Testing batch operation efficiency...");

            const batchSize = 3;
            let totalGas = BigInt(0);

            for (let i = 0; i < batchSize; i++) {
                tx = await participation.connect(addr1).recordUptime(0, 60);
                receipt = await tx.wait();
                totalGas += receipt.gasUsed;
            }

            console.log(`   Average uptime recording: ${(totalGas / BigInt(batchSize)).toString()} gas`);

            // Test reward claiming efficiency
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine", []);

            tx = await stakingPool.connect(addr1).claimAllRewards();
            receipt = await tx.wait();
            console.log(`   Batch reward claim: ${receipt.gasUsed.toString()} gas`);

            console.log("   ✅ Gas measurements completed");
        });
    });

    describe("📊 Data Analytics & Reporting", function () {
        it("should generate comprehensive ecosystem analytics", async function () {
            console.log("\n📈 Generating comprehensive ecosystem analytics...");

            // Create diverse ecosystem state
            const scenarios = [
                { user: addr1, tier: 0, lock: 0, eth: "1.0", dpn: "1000", nodeType: 0, ethNode: "1.0", performance: 9500 },
                { user: addr2, tier: 1, lock: 1, eth: "3.0", dpn: "2000", nodeType: 1, ethNode: "2.0", performance: 8800 },
                { user: addr3, tier: 2, lock: 2, eth: "7.0", dpn: "500", nodeType: 2, ethNode: "0.5", performance: 9200 },
                { user: addr1, tier: 1, lock: 0, eth: "2.5", dpn: "1000", nodeType: 0, ethNode: "1.0", performance: 7500 }, // Second position
            ];

            console.log("\n1️⃣  Creating diverse ecosystem state...");

            for (let i = 0; i < scenarios.length; i++) {
                const s = scenarios[i];

                // Setup DPN tokens
                await dpnToken.transfer(s.user.address, ethers.parseEther(s.dpn));
                await dpnToken.connect(s.user).approve(await nodeRights.getAddress(), ethers.parseEther(s.dpn));

                // Create positions
                await stakingPool.connect(s.user).stakeToPool(s.tier, s.lock, { value: ethers.parseEther(s.eth) });
                await participation.connect(s.user).registerNode(`EcoNode-${i}`);
                await nodeRights.connect(s.user).mintNodeRights(s.nodeType, ethers.parseEther(s.dpn), `eco-${i}`, { value: ethers.parseEther(s.ethNode) }); // FIXED: Use proper ETH amounts

                // Set performance
                await nodeRights.updatePerformance(i, 7200, s.performance);
                await participation.connect(s.user).recordUptime(i, 180 + (i * 30));
            }

            // Simulate time passage
            await ethers.provider.send("evm_increaseTime", [86400 * 3]); // 3 days
            await ethers.provider.send("evm_mine", []);

            console.log("\n2️⃣  Collecting ecosystem analytics...");

            // Staking analytics
            const globalStats = await stakingPool.getGlobalStats();
            const bronzeStats = await stakingPool.getPoolStats(0);
            const silverStats = await stakingPool.getPoolStats(1);
            const goldStats = await stakingPool.getPoolStats(2);

            console.log("   📊 Staking Pool Analytics:");
            console.log(`      Total TVL: ${ethers.formatEther(globalStats.tvl)} ETH`);
            console.log(`      Bronze Pool: ${ethers.formatEther(bronzeStats.config.totalStaked)} ETH`);
            console.log(`      Silver Pool: ${ethers.formatEther(silverStats.config.totalStaked)} ETH`);
            console.log(`      Gold Pool: ${ethers.formatEther(goldStats.config.totalStaked)} ETH`);

            // Node analytics
            const storageStats = await nodeRights.getNodeTypeStats(0);
            const computeStats = await nodeRights.getNodeTypeStats(1);
            const bandwidthStats = await nodeRights.getNodeTypeStats(2);

            console.log("   📊 Node Network Analytics:");
            console.log(`      Storage: ${storageStats.totalNodes} nodes, ${ethers.formatEther(storageStats.totalStakedETH)} ETH`);
            console.log(`      Compute: ${computeStats.totalNodes} nodes, ${ethers.formatEther(computeStats.totalStakedETH)} ETH`);
            console.log(`      Bandwidth: ${bandwidthStats.totalNodes} nodes, ${ethers.formatEther(bandwidthStats.totalStakedETH)} ETH`);

            // User analytics
            const user1Positions = await stakingPool.getUserPositions(addr1.address);
            const user1Nodes = await nodeRights.getOwnerNodes(addr1.address);

            console.log("   📊 User Analytics (addr1):");
            console.log(`      Staking Positions: ${user1Positions.length}`);
            console.log(`      Node Rights: ${user1Nodes.length}`);

            // Verify ecosystem health
            expect(globalStats.tvl).to.be.greaterThan(ethers.parseEther("13"));
            expect(storageStats.totalNodes).to.equal(2);
            expect(computeStats.totalNodes).to.equal(1);
            expect(bandwidthStats.totalNodes).to.equal(1);

            console.log("   ✅ Ecosystem analytics generated successfully");
        });
    });
});
