import { ethers } from "hardhat";

async function main() {
    const [deployer, addr1, addr2, addr3] = await ethers.getSigners();
    console.log("Deploying contracts with:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

    const initialSupply = ethers.parseEther("1000000");

    // Deploy DPNToken
    console.log("\n🚀 Deploying DPNToken...");
    const DPNToken = await ethers.getContractFactory("DPNToken");
    const dpn = await DPNToken.deploy(initialSupply);
    await dpn.waitForDeployment();
    const dpnAddress = await dpn.getAddress();
    console.log("✅ DPN Token deployed to:", dpnAddress);

    // Deploy NodeRegistry
    console.log("\n🚀 Deploying NodeRegistry...");
    const NodeRegistry = await ethers.getContractFactory("NodeRegistry");
    const nodeRegistry = await NodeRegistry.deploy();
    await nodeRegistry.waitForDeployment();
    const nodeRegistryAddress = await nodeRegistry.getAddress();
    console.log("✅ NodeRegistry deployed to:", nodeRegistryAddress);

    // Deploy NodeRightsNFT
    console.log("\n🚀 Deploying NodeRightsNFT...");
    const NodeRightsNFT = await ethers.getContractFactory("NodeRightsNFT");
    const nodeRights = await NodeRightsNFT.deploy();
    await nodeRights.waitForDeployment();
    const nodeRightsAddress = await nodeRights.getAddress();
    console.log("✅ NodeRightsNFT deployed to:", nodeRightsAddress);

    // Deploy Participation (inherits NodeRegistry)
    console.log("\n🚀 Deploying Participation...");
    const Participation = await ethers.getContractFactory("Participation");
    const participation = await Participation.deploy();
    await participation.waitForDeployment();
    const participationAddress = await participation.getAddress();
    console.log("✅ Participation contract deployed to:", participationAddress);

    // Deploy StakingPool
    console.log("\n🚀 Deploying StakingPool...");
    const StakingPool = await ethers.getContractFactory("StakingPool");
    const stakingPool = await StakingPool.deploy();
    await stakingPool.waitForDeployment();
    const stakingPoolAddress = await stakingPool.getAddress();
    console.log("✅ StakingPool deployed to:", stakingPoolAddress);

    // Set up contract connections
    console.log("\n🔗 Setting up contract connections...");

    // Connect DPN token to NodeRights
    await nodeRights.setDPNTokenContract(dpnAddress);
    console.log("✅ NodeRights connected to DPN Token");

    // Connect Participation to NodeRights
    await nodeRights.setParticipationContract(participationAddress);
    console.log("✅ NodeRights connected to Participation");

    // Connect StakingPool to DPN token and NodeRights
    await stakingPool.setDPNTokenContract(dpnAddress);
    await stakingPool.setNodeRightsContract(nodeRightsAddress);
    console.log("✅ StakingPool connected to DPN Token and NodeRights");

    // 🎯 SET UP INITIAL TEST DATA FOR CONSISTENT TESTING & SUBGRAPH
    console.log("\n🎯 Setting up initial test data...");

    // Create baseline stakes that tests can build upon
    await stakingPool.connect(deployer).stakeToPool(0, 0, { value: ethers.parseEther("1.0") }); // Bronze, no lock
    console.log("✅ Created baseline Bronze stake");

    await stakingPool.connect(addr1).stakeToPool(1, 1, { value: ethers.parseEther("3.0") }); // Silver, 30d lock
    console.log("✅ Created baseline Silver stake");

    await stakingPool.connect(addr2).stakeToPool(2, 2, { value: ethers.parseEther("8.0") }); // Gold, 90d lock
    console.log("✅ Created baseline Gold stake");

    // Create baseline NodeRights NFTs for testing
    console.log("\n🎯 Setting up baseline NodeRights NFTs...");

    await nodeRights.connect(deployer).mintNodeRights(
        0, // STORAGE
        ethers.parseEther("1000"),
        "ipfs://QmBaselineStorage",
        { value: ethers.parseEther("1.0") }
    );
    console.log("✅ Created baseline Storage node (NFT #0)");

    await nodeRights.connect(addr1).mintNodeRights(
        1, // COMPUTE
        ethers.parseEther("2000"),
        "ipfs://QmBaselineCompute",
        { value: ethers.parseEther("2.5") }
    );
    console.log("✅ Created baseline Compute node (NFT #1)");

    await nodeRights.connect(addr2).mintNodeRights(
        2, // BANDWIDTH
        ethers.parseEther("500"),
        "ipfs://QmBaselineBandwidth",
        { value: ethers.parseEther("0.5") }
    );
    console.log("✅ Created baseline Bandwidth node (NFT #2)");

    // Display deployment summary
    console.log("\n📋 DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log("DPN Token:       ", dpnAddress);
    console.log("NodeRegistry:    ", nodeRegistryAddress);
    console.log("NodeRightsNFT:   ", nodeRightsAddress);
    console.log("Participation:   ", participationAddress);
    console.log("StakingPool:     ", stakingPoolAddress);
    console.log("=".repeat(50));

    // Display initial token supply
    const totalSupply = await dpn.totalSupply();
    console.log(`\n💰 DPN Token Supply: ${ethers.formatEther(totalSupply)} DPN`);

    // Display StakingPool configuration
    console.log("\n🏆 StakingPool Tiers:");
    const tiers = ["BRONZE", "SILVER", "GOLD", "DIAMOND"];
    for (let i = 0; i < 4; i++) {
        const poolConfig = await stakingPool.poolConfigs(i);
        console.log(`  ${tiers[i]}: ${ethers.formatEther(poolConfig.minStake)} ETH min, ${poolConfig.tierMultiplier/100}% multiplier`);
    }

    // Display initial staking state
    const globalStats = await stakingPool.getGlobalStats();
    console.log("\n📊 Initial Staking State:");
    console.log(`  Total Value Locked: ${ethers.formatEther(globalStats.tvl)} ETH`);

    // Display initial NodeRights state
    const totalNodes = await nodeRights.totalSupply();
    const storageStats = await nodeRights.getNodeTypeStats(0);
    const computeStats = await nodeRights.getNodeTypeStats(1);
    const bandwidthStats = await nodeRights.getNodeTypeStats(2);

    console.log("\n🎯 Initial NodeRights State:");
    console.log(`  Total Nodes: ${totalNodes}`);
    console.log(`  Storage: ${storageStats.totalNodes} | Compute: ${computeStats.totalNodes} | Bandwidth: ${bandwidthStats.totalNodes}`);

    // Display initial Participation state
    const node0 = await participation.nodes(0);
    const node1 = await participation.nodes(1);
    const stats0 = await participation.stats(0);
    const stats1 = await participation.stats(1);

    console.log("\n🎯 Initial Participation State:");
    console.log(`  Registered Nodes: 2`);
    console.log(`  Node 0: ${stats0.uptime}min uptime, ${ethers.formatEther(await participation.nodeStakes(0))} ETH staked`);
    console.log(`  Node 1: ${stats1.uptime}min uptime, ${ethers.formatEther(await participation.nodeStakes(1))} ETH staked`);
    console.log("  Ready for testing and subgraph indexing!");

    console.log("\n🎯 Deployment completed successfully!");
    console.log("📝 Update your .env file with these addresses for testing");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
