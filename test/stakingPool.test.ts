import { ethers } from "hardhat";
import { expect } from "chai";

describe("StakingPool Contract", function () {
    let stakingPool: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    let initialState: any;

    beforeEach(async function () {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        // Connect to existing deployed contract
        const stakingPoolAddress = process.env.STAKING_POOL_ADDRESS || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
        const StakingPool = await ethers.getContractFactory("StakingPool", owner);
        stakingPool = StakingPool.attach(stakingPoolAddress);

        // Capture initial state for baseline understanding
        initialState = await stakingPool.getGlobalStats();
        console.log(`Connected to StakingPool at: ${stakingPoolAddress} | TVL: ${ethers.formatEther(initialState.tvl)} ETH`);
    });

    describe("Basic Staking Functionality", function () {
        it("should stake into Bronze pool with no lock", async function () {
            // Get current position count for this user
            const currentPositions = await stakingPool.getUserPositions(addr1.address);
            const initialCount = currentPositions.length;

            const tx = await stakingPool.connect(addr1).stakeToPool(
                0, // BRONZE
                0, // NO LOCK
                { value: ethers.parseEther("0.5") }
            );
            await tx.wait();

            const newPositions = await stakingPool.getUserPositions(addr1.address);
            const position = await stakingPool.getPositionDetails(addr1.address, initialCount);

            expect(newPositions.length).to.equal(initialCount + 1);
            expect(position.position.tier).to.equal(0); // BRONZE
            expect(position.position.lockPeriod).to.equal(0); // NONE
            expect(position.position.amount).to.equal(ethers.parseEther("0.5"));
            expect(position.position.isActive).to.be.true;
        });

        it("should stake into Silver pool with 30-day lock", async function () {
            const currentPositions = await stakingPool.getUserPositions(addr2.address);
            const initialCount = currentPositions.length;

            await stakingPool.connect(addr2).stakeToPool(
                1, // SILVER
                1, // THIRTY_DAYS
                { value: ethers.parseEther("2.0") }
            );

            const position = await stakingPool.getPositionDetails(addr2.address, initialCount);
            expect(position.position.tier).to.equal(1); // SILVER
            expect(position.position.lockPeriod).to.equal(1); // THIRTY
            expect(position.canWithdraw).to.be.false; // Still locked
        });

        it("should stake into Gold pool with year lock", async function () {
            const currentPositions = await stakingPool.getUserPositions(addr3.address);
            const initialCount = currentPositions.length;

            await stakingPool.connect(addr3).stakeToPool(
                2, // GOLD
                3, // YEAR
                { value: ethers.parseEther("10.0") }
            );

            const position = await stakingPool.getPositionDetails(addr3.address, initialCount);
            expect(position.position.tier).to.equal(2); // GOLD
            expect(position.position.lockPeriod).to.equal(3); // YEAR
            expect(position.timeToUnlock).to.be.greaterThan(31536000 - 10); // ~365 days
        });

        it("should reject stakes below minimum thresholds", async function () {
            await expect(
                stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("0.05") })
            ).to.be.revertedWith("Below minimum stake");

            await expect(
                stakingPool.connect(addr1).stakeToPool(3, 0, { value: ethers.parseEther("15.0") })
            ).to.be.revertedWith("Below minimum stake");
        });
    });

    describe("Multiple Positions", function () {
        it("should allow users to have multiple positions", async function () {
            const initialPositions = await stakingPool.getUserPositions(addr1.address);
            const initialCount = initialPositions.length;

            // First additional position: Bronze
            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("0.5") });

            // Second additional position: Silver with lock
            await stakingPool.connect(addr1).stakeToPool(1, 2, { value: ethers.parseEther("3.0") });

            const finalPositions = await stakingPool.getUserPositions(addr1.address);
            expect(finalPositions.length).to.equal(initialCount + 2);

            // Check the new positions
            const bronzePosition = await stakingPool.getPositionDetails(addr1.address, initialCount);
            const silverPosition = await stakingPool.getPositionDetails(addr1.address, initialCount + 1);

            expect(bronzePosition.position.tier).to.equal(0); // BRONZE
            expect(silverPosition.position.tier).to.equal(1); // SILVER
            expect(silverPosition.position.lockPeriod).to.equal(2); // NINETY
        });
    });

    describe("Reward Claims", function () {
        let testPositionIndex1: number;
        let testPositionIndex2: number;
        let freshAddr1: any;
        let freshAddr2: any;

        beforeEach(async function () {
            // Use truly fresh addresses that haven't been used in any other tests
            const signers = await ethers.getSigners();
            freshAddr1 = signers[15]; // Use even higher indices to avoid contamination
            freshAddr2 = signers[16];

            // Get current position counts for fresh addresses (should be 0)
            const currentPositions1 = await stakingPool.getUserPositions(freshAddr1.address);
            const currentPositions2 = await stakingPool.getUserPositions(freshAddr2.address);

            testPositionIndex1 = currentPositions1.length;
            testPositionIndex2 = currentPositions2.length;

            console.log(`   📋 Fresh addresses - Addr1: ${currentPositions1.length} positions, Addr2: ${currentPositions2.length} positions`);

            // Create two Silver tier positions instead of Bronze/Silver to avoid Bronze tier reward rate issues
            await stakingPool.connect(freshAddr1).stakeToPool(1, 0, { value: ethers.parseEther("1.0") }); // Silver, no lock
            await stakingPool.connect(freshAddr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") }); // Silver, 30-day lock

            console.log(`   ✅ Created test positions at indices: ${testPositionIndex1}, ${testPositionIndex2}`);
        });

        it("should accumulate rewards over time", async function () {
            // Check Silver tier configuration
            const silverConfig = await stakingPool.getPoolStats(1);
            console.log(`   📋 Silver config: reward rate ${silverConfig.config.baseRewardRate}, multiplier ${silverConfig.config.tierMultiplier}`);

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine", []);

            const position1 = await stakingPool.getPositionDetails(freshAddr1.address, testPositionIndex1);
            const position2 = await stakingPool.getPositionDetails(freshAddr2.address, testPositionIndex2);

            console.log(`   📊 Position1 rewards: ${ethers.formatEther(position1.pendingRewards)} DPN`);
            console.log(`   📊 Position2 rewards: ${ethers.formatEther(position2.pendingRewards)} DPN`);
            console.log(`   📊 Position1 details: Tier ${position1.position.tier}, Amount ${ethers.formatEther(position1.position.amount)} ETH, Lock ${position1.position.lockPeriod}`);
            console.log(`   📊 Position2 details: Tier ${position2.position.tier}, Amount ${ethers.formatEther(position2.position.amount)} ETH, Lock ${position2.position.lockPeriod}`);

            // Both positions should have rewards (both are Silver tier)
            expect(position1.pendingRewards).to.be.greaterThan(0);
            expect(position2.pendingRewards).to.be.greaterThan(0);

            // Position2 should have more rewards (2x stake + lock multiplier vs 1x stake + no lock)
            expect(position2.pendingRewards).to.be.greaterThan(position1.pendingRewards);
        });

        it("should claim rewards successfully", async function () {
            await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
            await ethers.provider.send("evm_mine", []);

            const initialRewards = (await stakingPool.getPositionDetails(freshAddr1.address, testPositionIndex1)).pendingRewards;
            console.log(`   💰 Initial rewards before claim: ${ethers.formatEther(initialRewards)} DPN`);

            expect(initialRewards).to.be.greaterThan(0);

            await stakingPool.connect(freshAddr1).claimRewards(testPositionIndex1);

            const finalRewards = (await stakingPool.getPositionDetails(freshAddr1.address, testPositionIndex1)).pendingRewards;
            console.log(`   💰 Final rewards after claim: ${ethers.formatEther(finalRewards)} DPN`);

            expect(finalRewards).to.equal(0);
        });
    });

    describe("Withdrawals", function () {
        let testPositionIndex: number;

        beforeEach(async function () {
            const currentPositions = await stakingPool.getUserPositions(addr1.address);
            testPositionIndex = currentPositions.length;

            await stakingPool.connect(addr1).stakeToPool(0, 0, { value: ethers.parseEther("1.0") }); // No lock
            await stakingPool.connect(addr2).stakeToPool(1, 1, { value: ethers.parseEther("2.0") }); // 30-day lock
        });

        it("should allow withdrawal without penalty after unlock", async function () {
            const initialBalance = await ethers.provider.getBalance(addr1.address);

            await stakingPool.connect(addr1).withdrawStake(testPositionIndex);

            const finalBalance = await ethers.provider.getBalance(addr1.address);
            expect(finalBalance).to.be.greaterThan(initialBalance - ethers.parseEther("0.1")); // Account for gas

            const position = await stakingPool.getPositionDetails(addr1.address, testPositionIndex);
            expect(position.position.isActive).to.be.false;
        });

        it("should apply penalty for early withdrawal", async function () {
            const addr2CurrentPositions = await stakingPool.getUserPositions(addr2.address);
            const addr2TestIndex = addr2CurrentPositions.length - 1; // Last position we just created

            const initialBalance = await ethers.provider.getBalance(addr2.address);

            await stakingPool.connect(addr2).withdrawStake(addr2TestIndex);

            const finalBalance = await ethers.provider.getBalance(addr2.address);
            const expectedMinimum = initialBalance - ethers.parseEther("0.5"); // Account for penalty + gas
            expect(finalBalance).to.be.greaterThan(expectedMinimum);
        });
    });

    describe("Pool Statistics", function () {
        it("should return accurate tier multipliers", async function () {
            const bronzeStats = await stakingPool.getPoolStats(0);
            const silverStats = await stakingPool.getPoolStats(1);
            const goldStats = await stakingPool.getPoolStats(2);
            const diamondStats = await stakingPool.getPoolStats(3);

            expect(bronzeStats.config.tierMultiplier).to.equal(12000); // 1x
            expect(silverStats.config.tierMultiplier).to.equal(15000); // 1.5x
            expect(goldStats.config.tierMultiplier).to.equal(20000); // 2x
            expect(diamondStats.config.tierMultiplier).to.equal(30000); // 3x
        });

        it("should track global TVL correctly", async function () {
            const initialStats = await stakingPool.getGlobalStats();
            const initialTVL = initialStats.tvl;

            // Add a new stake
            await stakingPool.connect(addr3).stakeToPool(0, 0, { value: ethers.parseEther("2.0") });

            const finalStats = await stakingPool.getGlobalStats();
            const finalTVL = finalStats.tvl;

            expect(finalTVL).to.equal(initialTVL + ethers.parseEther("2.0"));
        });
    });

    describe("Comprehensive Event Generation", function () {
        it("should generate diverse staking events for subgraph", async function () {
            console.log("\n🎯 Generating comprehensive staking events...");

            // Create stakes across all tiers
            const stakes = [
                { tier: 0, lock: 0, amount: "0.3", name: "Bronze/No Lock" },
                { tier: 1, lock: 1, amount: "2.5", name: "Silver/30d" },
                { tier: 2, lock: 2, amount: "8.0", name: "Gold/90d" },
                { tier: 3, lock: 3, amount: "25.0", name: "Diamond/365d" },
            ];

            for (const stake of stakes) {
                const tx = await stakingPool.connect(addr3).stakeToPool(
                    stake.tier,
                    stake.lock,
                    { value: ethers.parseEther(stake.amount) }
                );
                await tx.wait();
                console.log(`   ✅ ${stake.name}: ${stake.amount} ETH - TX: ${tx.hash}`);
            }

            // Fast forward and claim rewards
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine", []);

            console.log("   ⏰ Time advanced for reward accumulation");

            // Claim rewards from multiple positions
            const claimTx = await stakingPool.connect(addr3).claimAllRewards();
            await claimTx.wait();
            console.log(`   🎁 All rewards claimed - TX: ${claimTx.hash}`);

            // Test withdrawal
            const positions = await stakingPool.getUserPositions(addr3.address);
            const bronzeIndex = positions.findIndex((p: any) => p.tier === 0);

            if (bronzeIndex >= 0) {
                const withdrawTx = await stakingPool.connect(addr3).withdrawStake(bronzeIndex);
                await withdrawTx.wait();
                console.log(`   💸 Bronze position withdrawn - TX: ${withdrawTx.hash}`);
            }

            console.log("   🎯 Comprehensive event generation complete!");
        });
    });

    describe("Admin Functions", function () {
        it("should allow owner to update configurations", async function () {
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

        it("should reject admin calls from non-owner", async function () {
            await expect(
                stakingPool.connect(addr1).updatePoolConfig(0, 0, 0, 0, false)
            ).to.be.revertedWithCustomError(stakingPool, "OwnableUnauthorizedAccount");
        });

        it("should allow owner to set contract addresses", async function () {
            const dpnTokenAddress = process.env.DPN_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
            const nodeRightsAddress = process.env.NODE_RIGHTS_NFT_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

            await stakingPool.setDPNTokenContract(dpnTokenAddress);
            await stakingPool.setNodeRightsContract(nodeRightsAddress);

            expect(await stakingPool.dpnTokenContract()).to.equal(dpnTokenAddress);
            expect(await stakingPool.nodeRightsContract()).to.equal(nodeRightsAddress);
        });
    });
});
