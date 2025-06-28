import { ethers } from "hardhat";
import { expect } from "chai";

describe("Participation Contract", function () {
    let participation: any;
    let owner: any;
    let addr1: any;
    let addr2: any;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        const Participation = await ethers.getContractFactory("Participation", owner);
        participation = await Participation.deploy();
        await participation.waitForDeployment();
    });

    it("should register two nodes", async function () {
        await participation.connect(addr1).registerNode("Node 1");
        await participation.connect(addr2).registerNode("Node 2");

        const node1 = await participation.nodes(0);
        const node2 = await participation.nodes(1);

        expect(node1.owner).to.equal(addr1.address);
        expect(node2.owner).to.equal(addr2.address);
    });

    it("should record uptime and earn rewards", async function () {
        await participation.connect(addr1).registerNode("Node A");
        await participation.connect(addr1).recordUptime(0, 15);

        const stats = await participation.stats(0);
        expect(stats.uptime).to.equal(15);
        expect(stats.earned).to.equal(15);
    });

    it("should claim rewards and reset earned", async function () {
        await participation.connect(addr1).registerNode("Node B");
        await participation.connect(addr1).recordUptime(0, 10);

        await participation.connect(addr1).claimReward(0);

        const statsAfter = await participation.stats(0);
        expect(statsAfter.earned).to.equal(0);
    });

    it("should stake to a node", async function () {
        await participation.connect(addr1).registerNode("Node C");

        await participation.connect(owner).stakeToNode(0, {
            value: ethers.parseEther("1.0")
        });

        const stake = await participation.nodeStakes(0);
        expect(stake).to.equal(ethers.parseEther("1.0"));
    });

    // NEW SECTION: Comprehensive test for subgraph event generation
    describe("Subgraph Event Generation", function () {
        it("should generate all events for subgraph testing", async function () {
            const contractAddress = await participation.getAddress();
            console.log("\n🏗️  Contract deployed at:", contractAddress);
            console.log("📝 Update your subgraph.yaml with this address if needed");

            // 1. Register multiple nodes
            console.log("\n1️⃣  Registering nodes...");
            const tx1 = await participation.connect(addr1).registerNode("DePIN Node Alpha");
            await tx1.wait();
            console.log("   ✅ Node 0 registered by:", addr1.address, "TX:", tx1.hash);

            const tx2 = await participation.connect(addr2).registerNode("DePIN Node Beta");
            await tx2.wait();
            console.log("   ✅ Node 1 registered by:", addr2.address, "TX:", tx2.hash);

            const tx3 = await participation.connect(owner).registerNode("DePIN Node Gamma");
            await tx3.wait();
            console.log("   ✅ Node 2 registered by:", owner.address, "TX:", tx3.hash);

            // 2. Record uptime for nodes
            console.log("\n2️⃣  Recording uptime...");
            const tx4 = await participation.connect(addr1).recordUptime(0, 120); // 2 hours
            await tx4.wait();
            console.log("   ⏰ Node 0: 120 minutes uptime, TX:", tx4.hash);

            const tx5 = await participation.connect(addr2).recordUptime(1, 90);  // 1.5 hours
            await tx5.wait();
            console.log("   ⏰ Node 1: 90 minutes uptime, TX:", tx5.hash);

            const tx6 = await participation.connect(owner).recordUptime(2, 180); // 3 hours
            await tx6.wait();
            console.log("   ⏰ Node 2: 180 minutes uptime, TX:", tx6.hash);

            // 3. Multiple stakings
            console.log("\n3️⃣  Adding stakes...");
            const tx7 = await participation.connect(owner).stakeToNode(0, {
                value: ethers.parseEther("2.5")
            });
            await tx7.wait();
            console.log("   💰 Staked 2.5 ETH to Node 0, TX:", tx7.hash);

            const tx8 = await participation.connect(addr1).stakeToNode(1, {
                value: ethers.parseEther("1.8")
            });
            await tx8.wait();
            console.log("   💰 Staked 1.8 ETH to Node 1, TX:", tx8.hash);

            const tx9 = await participation.connect(addr2).stakeToNode(2, {
                value: ethers.parseEther("3.2")
            });
            await tx9.wait();
            console.log("   💰 Staked 3.2 ETH to Node 2, TX:", tx9.hash);

            // 4. More uptime to generate rewards
            console.log("\n4️⃣  Adding more uptime...");
            const tx10 = await participation.connect(addr1).recordUptime(0, 60);
            await tx10.wait();
            console.log("   ⏰ Node 0: +60 minutes, TX:", tx10.hash);

            const tx11 = await participation.connect(addr2).recordUptime(1, 45);
            await tx11.wait();
            console.log("   ⏰ Node 1: +45 minutes, TX:", tx11.hash);

            // 5. Claim rewards
            console.log("\n5️⃣  Claiming rewards...");
            const tx12 = await participation.connect(addr1).claimReward(0);
            await tx12.wait();
            console.log("   🎁 Node 0 rewards claimed, TX:", tx12.hash);

            const tx13 = await participation.connect(addr2).claimReward(1);
            await tx13.wait();
            console.log("   🎁 Node 1 rewards claimed, TX:", tx13.hash);

            // 6. Additional stakes after rewards
            console.log("\n6️⃣  Adding final stakes...");
            const tx14 = await participation.connect(addr2).stakeToNode(0, {
                value: ethers.parseEther("1.0")
            });
            await tx14.wait();
            console.log("   💰 Additional 1.0 ETH staked to Node 0, TX:", tx14.hash);

            console.log("\n🎯 All events generated! Check your subgraph at:");
            console.log("   📊 http://localhost:8000/subgraphs/name/participation-subgraph");
            console.log("\n📝 Try this GraphQL query:");
            console.log(`
query {
  nodes(orderBy: timestamp) {
    id
    nodeId
    owner
    timestamp
  }
  uptimes(orderBy: timestamp) {
    id
    nodeId
    minutesUp
    timestamp
  }
  stakes(orderBy: timestamp) {
    id
    nodeId
    staker
    amount
    timestamp
  }
  rewards(orderBy: timestamp) {
    id
    nodeId
    owner
    amount
    timestamp
  }
}`);

            // Verify final state
            const finalStats0 = await participation.stats(0);
            const finalStats1 = await participation.stats(1);
            const finalStats2 = await participation.stats(2);

            expect(finalStats0.uptime).to.equal(180); // 120 + 60
            expect(finalStats1.uptime).to.equal(135); // 90 + 45
            expect(finalStats2.uptime).to.equal(180);

            expect(finalStats0.earned).to.equal(0); // Claimed
            expect(finalStats1.earned).to.equal(0); // Claimed
            expect(finalStats2.earned).to.equal(180); // Not claimed yet

            const totalStake0 = await participation.nodeStakes(0);
            const totalStake1 = await participation.nodeStakes(1);
            const totalStake2 = await participation.nodeStakes(2);

            expect(totalStake0).to.equal(ethers.parseEther("3.5")); // 2.5 + 1.0
            expect(totalStake1).to.equal(ethers.parseEther("1.8"));
            expect(totalStake2).to.equal(ethers.parseEther("3.2"));
        });
    });
});
