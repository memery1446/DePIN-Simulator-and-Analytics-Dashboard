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
});
