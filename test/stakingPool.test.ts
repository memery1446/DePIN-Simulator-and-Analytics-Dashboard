import { ethers } from "hardhat";
import { expect } from "chai";

describe("StakingPool Contract", function () {
    let stakingPool: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        const StakingPool = await ethers.getContractFactory("StakingPool", owner);
        stakingPool = await StakingPool.deploy();
        await stakingPool.waitForDeployment();
    });

    describe("Basic Staking Functionality", function () {
        it("should stake into Bronze pool with no lock", async function () {
            const tx = await stakingPool.connect(addr1).stakeToPool(
                0, // BRONZE
                0, // NO LOCK
                { value: ethers.parseEther("0.5") }
            );
            await tx.wait();

            const position = await stakingPool.getPositionDetails(addr1.address, 0);
            expect(position.position.tier).to.equal(0); // BRONZE
            expect(position.position.lockPeriod).to.equal(0); // NONE
            expect(position.position.amount).to.equal(ethers.parseEther("0.5"));
            expect(position.position.isActive).to.be.true;
        });

        it("should stake into Silver pool with 30-day lock", async function () {
            await stakingPool.connect(addr2).stakeToPool(
                1, // SILVER
                1, // THIRTY_DAYS
                { value: ethers.parseEther("2.0") }
            );

            const position = await stakingPool.getPositionDetails(addr2.address, 0);
            expect(position.position.tier).to.equal(1); // SILVER
            expect(position.position.lockPeriod).to.equal(1); // THIRTY
            expect(position.canWithdraw).to.be.false; // Still locked
        });

        it("should stake into Gold pool with year lock", async function () {
            await stakingPool.connect(addr3).stakeToPool(
                2, // GOLD
                3, // YEAR
                { value: ethers.parseEther("10.0") }
            );

            const position = await stakingPool.getPositionDetails(addr3.address, 0);
            expect(position.position.tier).to.equal(2); // GOLD
            expect(position.position.lockPeriod).to.equal(3); // YEAR
            expect(position.timeToUnlock).to.be.greaterThan(31536000 - 10); // ~365 days
        });

        it("should reject stakes below minimum thresholds", async function () {
            // Try Bronze with insufficient amount
            await expect(
                stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("0.05") })
            ).to.be.revertedWith("Below minimum stake");

            // Try Diamond with insufficient amount
            await expect(
                stakingPool.connect(addr1).stakeToPool(3, 0, { value: ethers.parseEther("15.0") })
            ).to.be.revertedWith("Below minimum stake");
        });
    });

    describe("Multiple Positions", function () {
        it("should allow users to have multiple positions", async function () {
            // First position: Bronze
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("0.5") });

            // Second position: Silver with lock
            await stakingPool.connect(addr1).stakeToPool(1, 2, { value: ethers.parseEther("3.0") });

            const positions = await stakingPool.getUserPositions(addr1.address);
            expect(positions.length).to.equal(2);
            expect(positions[0].tier).to.equal(0); // BRONZE
            expect(positions[1].tier).to.equal(1); // SILVER
            expect(positions[1].lockPeriod).to.equal(2); // NINETY
        });
    });

    describe("Reward Claims", function () {
        beforeEach(async function () {
            // Stake into different pools
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("1.0") });
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") });
        });

        it("should accumulate rewards over time", async function () {
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine", []);

            const position1 = await stakingPool.getPositionDetails(addr1.address, 0);
            const position2 = await stakingPool.getPositionDetails(addr2.address, 0);

            expect(position1.pendingRewards).to.be.greaterThan(0);
            expect(position2.pendingRewards).to.be.greaterThan(position1.pendingRewards); // Silver has higher multiplier
        });

        it("should claim rewards successfully", async function () {
            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
            await ethers.provider.send("evm_mine", []);

            const initialRewards = (await stakingPool.getPositionDetails(addr1.address, 0)).pendingRewards;
            expect(initialRewards).to.be.greaterThan(0);

            await stakingPool.connect(addr1).claimRewards(0);

            const finalRewards = (await stakingPool.getPositionDetails(addr1.address, 0)).pendingRewards;
            expect(finalRewards).to.equal(0);
        });

        it("should claim all rewards from multiple positions", async function () {
            // Add a second position for addr1
            await stakingPool.connect(addr1).stakeToPool(2, 2, { value: ethers.parseEther("8.0") });

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [7200]); // 2 hours
            await ethers.provider.send("evm_mine", []);

            await stakingPool.connect(addr1).claimAllRewards();

            const positions = await stakingPool.getUserPositions(addr1.address);
            for (let i = 0; i < positions.length; i++) {
                const position = await stakingPool.getPositionDetails(addr1.address, i);
                expect(position.pendingRewards).to.equal(0);
            }
        });
    });

    describe("Withdrawals", function () {
        beforeEach(async function () {
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("1.0") }); // No lock
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") }); // 30-day lock
        });

        it("should allow withdrawal without penalty after unlock", async function () {
            const initialBalance = await ethers.provider.getBalance(addr1.address);

            await stakingPool.connect(addr1).withdrawStake(0);

            const finalBalance = await ethers.provider.getBalance(addr1.address);
            expect(finalBalance).to.be.greaterThan(initialBalance); // Got most ETH back (minus gas)

            const position = await stakingPool.getPositionDetails(addr1.address, 0);
            expect(position.position.isActive).to.be.false;
        });

        it("should apply penalty for early withdrawal", async function () {
            const initialBalance = await ethers.provider.getBalance(addr2.address);

            // Early withdrawal from locked position
            await stakingPool.connect(addr2).withdrawStake(0);

            const finalBalance = await ethers.provider.getBalance(addr2.address);
            // Should get back 90% of stake (10% penalty) minus gas costs
            const expectedMinimum = initialBalance - ethers.parseEther("0.3"); // Account for penalty + gas
            expect(finalBalance).to.be.greaterThan(expectedMinimum);
        });
    });

    describe("Pool Statistics", function () {
        beforeEach(async function () {
            // Create stakes across different pools
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("0.5") });
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("3.0") });
            await stakingPool.connect(addr3).stakeToPool(2, 2, { value: ethers.parseEther("8.0") });
        });

        it("should return accurate pool statistics", async function () {
            const bronzeStats = await stakingPool.getPoolStats(0);
            const silverStats = await stakingPool.getPoolStats(1);
            const goldStats = await stakingPool.getPoolStats(2);

            expect(bronzeStats.config.totalStaked).to.equal(ethers.parseEther("0.5"));
            expect(silverStats.config.totalStaked).to.equal(ethers.parseEther("3.0"));
            expect(goldStats.config.totalStaked).to.equal(ethers.parseEther("8.0"));

            expect(bronzeStats.config.tierMultiplier).to.equal(10000); // 1x
            expect(silverStats.config.tierMultiplier).to.equal(15000); // 1.5x
            expect(goldStats.config.tierMultiplier).to.equal(20000); // 2x
        });

        it("should return accurate global statistics", async function () {
            const globalStats = await stakingPool.getGlobalStats();

            expect(globalStats.tvl).to.equal(ethers.parseEther("11.5")); // 0.5 + 3.0 + 8.0
            expect(globalStats.poolDistribution[0]).to.equal(ethers.parseEther("0.5")); // Bronze
            expect(globalStats.poolDistribution[1]).to.equal(ethers.parseEther("3.0")); // Silver
            expect(globalStats.poolDistribution[2]).to.equal(ethers.parseEther("8.0")); // Gold
            expect(globalStats.poolDistribution[3]).to.equal(0); // Diamond (empty)
        });
    });

    // COMPREHENSIVE SUBGRAPH EVENT GENERATION
    describe("Subgraph Event Generation", function () {
        it("should generate all StakingPool events for subgraph testing", async function () {
            const contractAddress = await stakingPool.getAddress();
            console.log("\n🏗️  StakingPool deployed at:", contractAddress);
            console.log("📝 Update your subgraph.yaml to include this contract");

            // 1. Stake into different pools with various lock periods
            console.log("\n1️⃣  Creating diverse staking positions...");

            const tx1 = await stakingPool.connect(addr1).stakeToPool(
                0, // BRONZE
                0, // NO LOCK
                { value: ethers.parseEther("0.3") }
            );
            await tx1.wait();
            console.log("   🥉 Bronze stake (0.3 ETH, no lock) by:", addr1.address, "TX:", tx1.hash);

            const tx2 = await stakingPool.connect(addr1).stakeToPool(
                1, // SILVER
                1, // 30 DAYS
                { value: ethers.parseEther("2.5") }
            );
            await tx2.wait();
            console.log("   🥈 Silver stake (2.5 ETH, 30d lock) by:", addr1.address, "TX:", tx2.hash);

            const tx3 = await stakingPool.connect(addr2).stakeToPool(
                0, // BRONZE
                2, // 90 DAYS
                { value: ethers.parseEther("0.8") }
            );
            await tx3.wait();
            console.log("   🥉 Bronze stake (0.8 ETH, 90d lock) by:", addr2.address, "TX:", tx3.hash);

            const tx4 = await stakingPool.connect(addr2).stakeToPool(
                2, // GOLD
                3, // 365 DAYS
                { value: ethers.parseEther("12.0") }
            );
            await tx4.wait();
            console.log("   🥇 Gold stake (12.0 ETH, 365d lock) by:", addr2.address, "TX:", tx4.hash);

            const tx5 = await stakingPool.connect(addr3).stakeToPool(
                3, // DIAMOND
                2, // 90 DAYS
                { value: ethers.parseEther("25.0") }
            );
            await tx5.wait();
            console.log("   💎 Diamond stake (25.0 ETH, 90d lock) by:", addr3.address, "TX:", tx5.hash);

            const tx6 = await stakingPool.connect(addr3).stakeToPool(
                1, // SILVER
                0, // NO LOCK
                { value: ethers.parseEther("4.2") }
            );
            await tx6.wait();
            console.log("   🥈 Silver stake (4.2 ETH, no lock) by:", addr3.address, "TX:", tx6.hash);

            // 2. Add more positions to create diverse portfolio
            console.log("\n2️⃣  Adding additional positions...");

            const tx7 = await stakingPool.connect(owner).stakeToPool(
                2, // GOLD
                1, // 30 DAYS
                { value: ethers.parseEther("8.7") }
            );
            await tx7.wait();
            console.log("   🥇 Gold stake (8.7 ETH, 30d lock) by:", owner.address, "TX:", tx7.hash);

            const tx8 = await stakingPool.connect(addr1).stakeToPool(
                3, // DIAMOND
                3, // 365 DAYS
                { value: ethers.parseEther("50.0") }
            );
            await tx8.wait();
            console.log("   💎 Diamond stake (50.0 ETH, 365d lock) by:", addr1.address, "TX:", tx8.hash);

            // 3. Fast forward time to accumulate rewards
            console.log("\n3️⃣  Fast forwarding time for reward accumulation...");
            await ethers.provider.send("evm_increaseTime", [86400 * 2]); // 2 days
            await ethers.provider.send("evm_mine", []);
            console.log("   ⏰ Fast forwarded 2 days for reward accumulation");

            // 4. Claim rewards from various positions
            console.log("\n4️⃣  Claiming rewards...");

            const tx9 = await stakingPool.connect(addr1).claimRewards(0); // Bronze position
            await tx9.wait();
            console.log("   🎁 Rewards claimed from Bronze position, TX:", tx9.hash);

            const tx10 = await stakingPool.connect(addr2).claimAllRewards(); // All positions
            await tx10.wait();
            console.log("   🎁 All rewards claimed by addr2, TX:", tx10.hash);

            const tx11 = await stakingPool.connect(addr3).claimRewards(1); // Silver position
            await tx11.wait();
            console.log("   🎁 Rewards claimed from Silver position, TX:", tx11.hash);

            // 5. Test early withdrawals (with penalty)
            console.log("\n5️⃣  Testing early withdrawals...");

            const tx12 = await stakingPool.connect(addr1).withdrawStake(0); // No lock Bronze
            await tx12.wait();
            console.log("   💸 No-penalty withdrawal from Bronze (no lock), TX:", tx12.hash);

            const tx13 = await stakingPool.connect(addr3).withdrawStake(1); // Early from Silver
            await tx13.wait();
            console.log("   ⚠️  Early withdrawal from Silver (10% penalty), TX:", tx13.hash);

            // 6. Add more time and more positions
            console.log("\n6️⃣  Adding more time and final positions...");

            await ethers.provider.send("evm_increaseTime", [86400 * 5]); // 5 more days
            await ethers.provider.send("evm_mine", []);

            const tx14 = await stakingPool.connect(owner).stakeToPool(
                1, // SILVER
                2, // 90 DAYS
                { value: ethers.parseEther("6.8") }
            );
            await tx14.wait();
            console.log("   🥈 Final Silver stake (6.8 ETH, 90d lock) by:", owner.address, "TX:", tx14.hash);

            // 7. Final reward claims
            console.log("\n7️⃣  Final reward claims...");

            const tx15 = await stakingPool.connect(addr1).claimAllRewards();
            await tx15.wait();
            console.log("   🎁 Final rewards claimed by addr1, TX:", tx15.hash);

            const tx16 = await stakingPool.connect(owner).claimRewards(0);
            await tx16.wait();
            console.log("   🎁 Rewards claimed from Gold position, TX:", tx16.hash);

            // 8. Test mature withdrawal (no penalty)
            console.log("\n8️⃣  Testing mature withdrawals...");

            // Fast forward past some lock periods
            await ethers.provider.send("evm_increaseTime", [86400 * 35]); // 35 days
            await ethers.provider.send("evm_mine", []);

            const tx17 = await stakingPool.connect(addr1).withdrawStake(1); // Silver 30-day should be unlocked
            await tx17.wait();
            console.log("   ✅ Mature withdrawal from Silver (no penalty), TX:", tx17.hash);

            const tx18 = await stakingPool.connect(owner).withdrawStake(0); // Gold 30-day should be unlocked
            await tx18.wait();
            console.log("   ✅ Mature withdrawal from Gold (no penalty), TX:", tx18.hash);

            console.log("\n🎯 All StakingPool events generated! Update your subgraph to index:");
            console.log("   📊 http://localhost:8000/subgraphs/name/staking-pool-subgraph");

            console.log("\n📝 Sample GraphQL query for StakingPool:");
            console.log(`
query {
  poolStakes: events(where: {eventName: "PoolStaked"}) {
    id
    user
    positionId
    tier
    lockPeriod
    amount
    shares
    timestamp
  }
  
  stakeWithdrawals: events(where: {eventName: "StakeWithdrawn"}) {
    id
    user
    positionId
    amount
    penalty
    timestamp
  }
  
  rewardsClaimed: events(where: {eventName: "RewardsClaimed"}) {
    id
    user
    positionId
    rewardAmount
    totalClaimed
    timestamp
  }
  
  poolStats: poolConfigs {
    id
    tier
    minStake
    tierMultiplier
    totalStaked
    totalShares
  }
}`);

            // Verify final state
            console.log("\n📈 Final Staking Pool Statistics:");

            const globalStats = await stakingPool.getGlobalStats();
            console.log("   Total Value Locked:", ethers.formatEther(globalStats.tvl), "ETH");
            console.log("   Total Rewards Distributed:", ethers.formatEther(globalStats.totalRewards), "DPN");

            const bronzeStats = await stakingPool.getPoolStats(0);
            const silverStats = await stakingPool.getPoolStats(1);
            const goldStats = await stakingPool.getPoolStats(2);
            const diamondStats = await stakingPool.getPoolStats(3);

            console.log("   🥉 Bronze Pool:", ethers.formatEther(bronzeStats.config.totalStaked), "ETH");
            console.log("   🥈 Silver Pool:", ethers.formatEther(silverStats.config.totalStaked), "ETH");
            console.log("   🥇 Gold Pool:", ethers.formatEther(goldStats.config.totalStaked), "ETH");
            console.log("   💎 Diamond Pool:", ethers.formatEther(diamondStats.config.totalStaked), "ETH");

            // Test assertions
            expect(globalStats.tvl).to.be.greaterThan(0);
            expect(globalStats.totalRewards).to.be.greaterThan(0);

            // Check that we have stakes in all tiers
            expect(bronzeStats.config.totalStaked).to.be.greaterThan(0);
            expect(silverStats.config.totalStaked).to.be.greaterThan(0);
            expect(goldStats.config.totalStaked).to.be.greaterThan(0);
            expect(diamondStats.config.totalStaked).to.be.greaterThan(0);

            // Verify tier multipliers are correct
            expect(bronzeStats.config.tierMultiplier).to.equal(10000); // 1x
            expect(silverStats.config.tierMultiplier).to.equal(15000); // 1.5x
            expect(goldStats.config.tierMultiplier).to.equal(20000); // 2x
            expect(diamondStats.config.tierMultiplier).to.equal(30000); // 3x

            console.log("   ✅ All tests passed! StakingPool ready for integration.");
        });
    });

    describe("Admin Functions", function () {
        it("should allow owner to update pool configurations", async function () {
            await stakingPool.updatePoolConfig(
                0, // BRONZE
                ethers.parseEther("0.2"), // New min stake
                12000, // New multiplier (1.2x)
                23148148148148, // New reward rate
                true
            );

            const updatedConfig = await stakingPool.poolConfigs(0);
            expect(updatedConfig.minStake).to.equal(ethers.parseEther("0.2"));
            expect(updatedConfig.tierMultiplier).to.equal(12000);
        });

        it("should allow owner to update lock configurations", async function () {
            await stakingPool.updateLockConfig(
                1, // THIRTY
                45, // 45 days instead of 30
                12000 // 1.2x multiplier instead of 1.1x
            );

            const updatedLock = await stakingPool.lockConfigs(1);
            expect(updatedLock.lockDays).to.equal(45);
            expect(updatedLock.timeMultiplier).to.equal(12000);
        });

        it("should reject admin calls from non-owner", async function () {
            await expect(
                stakingPool.connect(addr1).updatePoolConfig(0, 0, 0, 0, false)
            ).to.be.revertedWithCustomError(stakingPool, "OwnableUnauthorizedAccount");
        });

        it("should allow owner to set contract addresses", async function () {
            const mockDPN = "0x1234567890123456789012345678901234567890";
            const mockNodeRights = "0x0987654321098765432109876543210987654321";

            await stakingPool.setDPNTokenContract(mockDPN);
            await stakingPool.setNodeRightsContract(mockNodeRights);

            expect(await stakingPool.dpnTokenContract()).to.equal(mockDPN);
            expect(await stakingPool.nodeRightsContract()).to.equal(mockNodeRights);
        });
    });

    describe("Emergency Functions", function () {
        beforeEach(async function () {
            // Add some stakes to test emergency functions
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("1.0") });
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") });
        });

        it("should enable emergency withdraw with delay", async function () {
            await stakingPool.enableEmergencyWithdraw();

            const enabled = await stakingPool.emergencyWithdrawEnabled();
            expect(enabled).to.be.greaterThan(0);

            // Should not be able to withdraw immediately
            await expect(
                stakingPool.emergencyWithdraw()
            ).to.be.revertedWith("24h delay required");
        });

        it("should allow emergency withdraw after 24h delay", async function () {
            await stakingPool.enableEmergencyWithdraw();

            // Fast forward 25 hours
            await ethers.provider.send("evm_increaseTime", [25 * 3600]);
            await ethers.provider.send("evm_mine", []);

            const initialBalance = await ethers.provider.getBalance(owner.address);
            await stakingPool.emergencyWithdraw();
            const finalBalance = await ethers.provider.getBalance(owner.address);

            expect(finalBalance).to.be.greaterThan(initialBalance);
        });
    });
});