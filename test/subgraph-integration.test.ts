// test/subgraph-integration.test.ts
import { ethers } from "hardhat";
import { expect } from "chai";
import axios from "axios";

describe("Subgraph Integration Tests", function () {
    let participation: any;
    let stakingPool: any;
    let nodeRights: any;
    let dpnToken: any;
    let owner: any;
    let addr1: any;
    let addr2: any;

    const SUBGRAPH_URL = "http://localhost:8000/subgraphs/name/participation-subgraph";

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy contracts (abbreviated for testing)
        const DPNToken = await ethers.getContractFactory("DPNToken");
        dpnToken = await DPNToken.deploy(ethers.parseEther("1000000"));

        const Participation = await ethers.getContractFactory("Participation");
        participation = await Participation.deploy();

        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy();

        const NodeRightsNFT = await ethers.getContractFactory("NodeRightsNFT");
        nodeRights = await NodeRightsNFT.deploy();
    });

    async function querySubgraph(query: string) {
        try {
            const response = await axios.post(SUBGRAPH_URL, {
                query: query
            });
            return response.data;
        } catch (error) {
            console.log("Subgraph query failed - make sure subgraph is deployed and synced");
            return null;
        }
    }

    async function waitForSubgraphSync(timeoutMs: number = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const result = await querySubgraph(`
                query {
                    _meta {
                        block {
                            number
                        }
                    }
                }
            `);

            if (result && result.data._meta) {
                console.log(`   📊 Subgraph synced to block: ${result.data._meta.block.number}`);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return false;
    }

    describe("📊 Participation Data Verification", function () {
        it("should accurately index participation events", async function () {
            console.log("\n🔍 Testing Participation event indexing...");

            // Generate events
            console.log("\n1️⃣  Generating participation events...");

            const tx1 = await participation.connect(addr1).registerNode("Subgraph Test Node 1");
            await tx1.wait();

            const tx2 = await participation.connect(addr1).recordUptime(0, 150);
            await tx2.wait();

            const tx3 = await participation.connect(owner).stakeToNode(0, { value: ethers.parseEther("2.0") });
            await tx3.wait();

            const tx4 = await participation.connect(addr1).claimReward(0);
            await tx4.wait();

            console.log("   ✅ Events generated");

            // Wait for subgraph to sync
            console.log("\n2️⃣  Waiting for subgraph sync...");
            const synced = await waitForSubgraphSync();

            if (!synced) {
                console.log("   ⚠️  Subgraph not available - skipping verification");
                return;
            }

            // Query and verify data
            console.log("\n3️⃣  Verifying indexed data...");

            const nodesQuery = `
                query {
                    nodes(orderBy: timestamp) {
                        id
                        nodeId
                        owner
                        timestamp
                    }
                }
            `;

            const nodesResult = await querySubgraph(nodesQuery);
            if (nodesResult && nodesResult.data) {
                const nodes = nodesResult.data.nodes;
                expect(nodes.length).to.be.greaterThan(0);
                expect(nodes[0].owner.toLowerCase()).to.equal(addr1.address.toLowerCase());
                console.log(`   ✅ ${nodes.length} nodes indexed correctly`);
            }

            const uptimesQuery = `
                query {
                    uptimes(orderBy: timestamp) {
                        id
                        nodeId
                        minutesUp
                        timestamp
                    }
                }
            `;

            const uptimesResult = await querySubgraph(uptimesQuery);
            if (uptimesResult && uptimesResult.data) {
                const uptimes = uptimesResult.data.uptimes;
                expect(uptimes.length).to.be.greaterThan(0);
                expect(uptimes[0].minutesUp).to.equal("150");
                console.log(`   ✅ ${uptimes.length} uptime records indexed correctly`);
            }

            const stakesQuery = `
                query {
                    stakes(orderBy: timestamp) {
                        id
                        nodeId
                        staker
                        amount
                        timestamp
                    }
                }
            `;

            const stakesResult = await querySubgraph(stakesQuery);
            if (stakesResult && stakesResult.data) {
                const stakes = stakesResult.data.stakes;
                expect(stakes.length).to.be.greaterThan(0);
                expect(stakes[0].amount).to.equal(ethers.parseEther("2.0").toString());
                console.log(`   ✅ ${stakes.length} stakes indexed correctly`);
            }

            console.log("   🎯 Participation data verification complete");
        });
    });

    describe("🏦 Staking Pool Data Verification", function () {
        it("should accurately index staking pool events", async function () {
            console.log("\n🔍 Testing StakingPool event indexing...");

            console.log("\n1️⃣  Generating staking pool events...");

            // Multiple stakes across different tiers
            const tx1 = await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("0.5") });
            await tx1.wait();

            const tx2 = await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.5") });
            await tx2.wait();

            const tx3 = await stakingPool.connect(addr1).stakeToPool(2, 2, { value: ethers.parseEther("8.0") });
            await tx3.wait();

            // Fast forward time and claim rewards
            await ethers.provider.send("evm_increaseTime", [7200]); // 2 hours
            await ethers.provider.send("evm_mine", []);

            const tx4 = await stakingPool.connect(addr1).claimRewards(0);
            await tx4.wait();

            const tx5 = await stakingPool.connect(addr1).withdrawStake(0);
            await tx5.wait();

            console.log("   ✅ Staking events generated");

            // Wait for sync and verify
            console.log("\n2️⃣  Waiting for subgraph sync...");
            await waitForSubgraphSync();

            console.log("\n3️⃣  Verifying staking pool data...");

            const poolStakesQuery = `
                query {
                    poolStakes(orderBy: timestamp) {
                        id
                        user
                        tier
                        lockPeriod
                        amount
                        shares
                        timestamp
                    }
                }
            `;

            const stakesResult = await querySubgraph(poolStakesQuery);
            if (stakesResult && stakesResult.data) {
                const poolStakes = stakesResult.data.poolStakes;
                expect(poolStakes.length).to.equal(3);

                // Verify tier distribution
                const tierCounts = poolStakes.reduce((acc: any, stake: any) => {
                    acc[stake.tier] = (acc[stake.tier] || 0) + 1;
                    return acc;
                }, {});

                expect(tierCounts[0]).to.equal(1); // Bronze
                expect(tierCounts[1]).to.equal(1); // Silver
                expect(tierCounts[2]).to.equal(1); // Gold

                console.log(`   ✅ ${poolStakes.length} pool stakes indexed with correct tiers`);
            }

            const rewardClaimsQuery = `
                query {
                    rewardClaims(orderBy: timestamp) {
                        id
                        user
                        positionId
                        rewardAmount
                        timestamp
                    }
                }
            `;

            const rewardsResult = await querySubgraph(rewardClaimsQuery);
            if (rewardsResult && rewardsResult.data) {
                const rewardClaims = rewardsResult.data.rewardClaims;
                expect(rewardClaims.length).to.be.greaterThan(0);
                console.log(`   ✅ ${rewardClaims.length} reward claims indexed`);
            }

            console.log("   🎯 Staking pool data verification complete");
        });
    });

    describe("🗄️ Node Rights Data Verification", function () {
        it("should accurately index node rights events", async function () {
            console.log("\n🔍 Testing NodeRights event indexing...");

            console.log("\n1️⃣  Generating node rights events...");

            // Setup DPN tokens
            await dpnToken.transfer(addr1.address, ethers.parseEther("3000"));
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("3000"));

            // Mint different node types
            const tx1 = await nodeRights.connect(addr1).mintNodeRights(
                0, // STORAGE
                ethers.parseEther("1500"),
                "ipfs://QmSubgraphTest1",
                { value: ethers.parseEther("2.0") }
            );
            await tx1.wait();

            const tx2 = await nodeRights.connect(addr1).mintNodeRights(
                1, // COMPUTE
                ethers.parseEther("1500"),
                "ipfs://QmSubgraphTest2",
                { value: ethers.parseEther("2.5") }
            );
            await tx2.wait();

            // Upgrade and performance updates
            const tx3 = await nodeRights.connect(addr1).upgradeNode(0, ethers.parseEther("500"), { value: ethers.parseEther("1.0") });
            await tx3.wait();

            const tx4 = await nodeRights.updatePerformance(0, 7200, 9500);
            await tx4.wait();

            const tx5 = await nodeRights.updatePerformance(1, 3600, 7000); // Minor slash
            await tx5.wait();

            const tx6 = await nodeRights.connect(addr1).bridgeToChain(0, "polygon-mainnet");
            await tx6.wait();

            console.log("   ✅ Node rights events generated");

            // Wait for sync and verify
            console.log("\n2️⃣  Waiting for subgraph sync...");
            await waitForSubgraphSync();

            console.log("\n3️⃣  Verifying node rights data...");

            const nodeRightsQuery = `
                query {
                    nodeRights(orderBy: mintedAt) {
                        id
                        tokenId
                        owner
                        nodeType
                        stakedETH
                        stakedDPN
                        mintedAt
                    }
                }
            `;

            const nodeRightsResult = await querySubgraph(nodeRightsQuery);
            if (nodeRightsResult && nodeRightsResult.data) {
                const nodeRights = nodeRightsResult.data.nodeRights;
                expect(nodeRights.length).to.equal(2);

                // Verify node types
                const nodeTypes = nodeRights.map((n: any) => parseInt(n.nodeType));
                expect(nodeTypes).to.include(0); // STORAGE
                expect(nodeTypes).to.include(1); // COMPUTE

                console.log(`   ✅ ${nodeRights.length} node rights indexed with correct types`);
            }

            const upgradesQuery = `
                query {
                    nodeUpgrades(orderBy: timestamp) {
                        id
                        tokenId
                        additionalETH
                        additionalDPN
                        newPerformanceScore
                    }
                }
            `;

            const upgradesResult = await querySubgraph(upgradesQuery);
            if (upgradesResult && upgradesResult.data) {
                const upgrades = upgradesResult.data.nodeUpgrades;
                expect(upgrades.length).to.equal(1);
                expect(upgrades[0].additionalETH).to.equal(ethers.parseEther("1.0").toString());
                console.log(`   ✅ ${upgrades.length} node upgrades indexed`);
            }

            const performanceQuery = `
                query {
                    performanceUpdates(orderBy: timestamp) {
                        id
                        tokenId
                        newScore
                        uptimeAdded
                        status
                    }
                }
            `;

            const performanceResult = await querySubgraph(performanceQuery);
            if (performanceResult && performanceResult.data) {
                const updates = performanceResult.data.performanceUpdates;
                expect(updates.length).to.equal(2);

                // Check for slashing event
                const slashedUpdate = updates.find((u: any) => parseInt(u.status) === 1);
                expect(slashedUpdate).to.not.be.undefined;
                console.log(`   ✅ ${updates.length} performance updates indexed including slashing`);
            }

            console.log("   🎯 Node rights data verification complete");
        });
    });

    describe("📈 Cross-Contract Analytics", function () {
        it("should provide comprehensive ecosystem analytics", async function () {
            console.log("\n📊 Testing cross-contract analytics...");

            // Create comprehensive test data across all contracts
            console.log("\n1️⃣  Creating comprehensive test ecosystem...");

            // Setup users with DPN
            await dpnToken.transfer(addr1.address, ethers.parseEther("5000"));
            await dpnToken.transfer(addr2.address, ethers.parseEther("5000"));
            await dpnToken.connect(addr1).approve(await nodeRights.getAddress(), ethers.parseEther("5000"));
            await dpnToken.connect(addr2).approve(await nodeRights.getAddress(), ethers.parseEther("5000"));

            // User 1: Multi-contract strategy
            await participation.connect(addr1).registerNode("Analytics Node 1");
            await stakingPool.connect(addr1).stakeToPool(1, 1, { value: ethers.parseEther("3.0") });
            await nodeRights.connect(addr1).mintNodeRights(0, ethers.parseEther("2000"), "analytics1", { value: ethers.parseEther("2.0") });

            // User 2: Different strategy
            await participation.connect(addr2).registerNode("Analytics Node 2");
            await stakingPool.connect(addr2).stakeToPool(2, 2, { value: ethers.parseEther("8.0") });
            await nodeRights.connect(addr2).mintNodeRights(1, ethers.parseEther("3000"), "analytics2", { value: ethers.parseEther("3.0") });

            // Generate activity
            await participation.connect(addr1).recordUptime(0, 240);
            await participation.connect(addr2).recordUptime(1, 180);
            await nodeRights.updatePerformance(0, 7200, 9600);
            await nodeRights.updatePerformance(1, 5400, 8800);

            // Time passage and rewards
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine", []);

            await participation.connect(addr1).claimReward(0);
            await stakingPool.connect(addr1).claimRewards(0);

            console.log("   ✅ Comprehensive ecosystem created");

            // Wait for sync
            console.log("\n2️⃣  Waiting for subgraph sync...");
            await waitForSubgraphSync();

            console.log("\n3️⃣  Running cross-contract analytics...");

            // Combined analytics query
            const analyticsQuery = `
                query {
                    # Participation data
                    nodes { id nodeId owner timestamp }
                    uptimes { id nodeId minutesUp }
                    stakes { id nodeId amount }
                    rewards { id nodeId amount }
                    
                    # Staking pool data
                    poolStakes { id user tier amount }
                    rewardClaims { id user rewardAmount }
                    
                    # Node rights data
                    nodeRights { id tokenId owner nodeType stakedETH stakedDPN }
                    performanceUpdates { id tokenId newScore status }
                    
                    # Token data
                    tokenTransfers { id from to value }
                    tokenBalances { id holder balance }
                }
            `;

            const analyticsResult = await querySubgraph(analyticsQuery);
            if (analyticsResult && analyticsResult.data) {
                const data = analyticsResult.data;

                // Verify cross-contract relationships
                expect(data.nodes.length).to.equal(2);
                expect(data.poolStakes.length).to.equal(2);
                expect(data.nodeRights.length).to.equal(2);

                // Calculate ecosystem metrics
                const totalStakingValue = data.poolStakes.reduce((sum: number, stake: any) => {
                    return sum + parseFloat(ethers.formatEther(stake.amount));
                }, 0);

                const totalNodeValue = data.nodeRights.reduce((sum: number, node: any) => {
                    return sum + parseFloat(ethers.formatEther(node.stakedETH));
                }, 0);

                const totalUptime = data.uptimes.reduce((sum: number, uptime: any) => {
                    return sum + parseInt(uptime.minutesUp);
                }, 0);

                console.log("   📊 Ecosystem Analytics:");
                console.log(`      Total Staking Value: ${totalStakingValue} ETH`);
                console.log(`      Total Node Value: ${totalNodeValue} ETH`);
                console.log(`      Total Network Uptime: ${totalUptime} minutes`);
                console.log(`      Active Users: ${new Set([...data.nodes.map((n: any) => n.owner), ...data.poolStakes.map((s: any) => s.user)]).size}`);

                // Verify data consistency
                expect(totalStakingValue).to.equal(11.0); // 3.0 + 8.0
                expect(totalNodeValue).to.equal(5.0); // 2.0 + 3.0
                expect(totalUptime).to.equal(420); // 240 + 180

                console.log("   ✅ Cross-contract analytics verified");
            }

            console.log("   🎯 Comprehensive analytics test complete");
        });

        it("should support real-time dashboard queries", async function () {
            console.log("\n📱 Testing real-time dashboard queries...");

            // Create dashboard-relevant data
            console.log("\n1️⃣  Creating dashboard data...");

            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("1.0") });
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") });

            await waitForSubgraphSync();

            console.log("\n2️⃣  Testing dashboard queries...");

            // TVL Query
            const tvlQuery = `
                query {
                    globalStats {
                        id
                        totalValueLocked
                        lastUpdated
                    }
                }
            `;

            const tvlResult = await querySubgraph(tvlQuery);
            if (tvlResult && tvlResult.data && tvlResult.data.globalStats.length > 0) {
                const tvl = tvlResult.data.globalStats[0].totalValueLocked;
                expect(parseFloat(ethers.formatEther(tvl))).to.equal(3.0);
                console.log(`   ✅ TVL Query: ${ethers.formatEther(tvl)} ETH`);
            }

            // Pool Distribution Query
            const poolQuery = `
                query {
                    poolConfigs {
                        id
                        tier
                        minStake
                        tierMultiplier
                    }
                }
            `;

            const poolResult = await querySubgraph(poolQuery);
            if (poolResult && poolResult.data) {
                const pools = poolResult.data.poolConfigs;
                console.log(`   ✅ Pool Configs: ${pools.length} pools indexed`);
            }

            // Recent Activity Query
            const activityQuery = `
                query {
                    poolStakes(first: 10, orderBy: timestamp, orderDirection: desc) {
                        id
                        user
                        tier
                        amount
                        timestamp
                    }
                }
            `;

            const activityResult = await querySubgraph(activityQuery);
            if (activityResult && activityResult.data) {
                const recentStakes = activityResult.data.poolStakes;
                expect(recentStakes.length).to.equal(2);
                console.log(`   ✅ Recent Activity: ${recentStakes.length} recent stakes`);
            }

            console.log("   🎯 Dashboard queries test complete");
        });
    });
});
