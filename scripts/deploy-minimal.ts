import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
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

    // Deploy Participation
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

    // Set up contract connections ONLY
    console.log("\n🔗 Setting up contract connections...");
    await nodeRights.setDPNTokenContract(dpnAddress);
    console.log("✅ NodeRights connected to DPN Token");

    await nodeRights.setParticipationContract(participationAddress);
    console.log("✅ NodeRights connected to Participation");

    await stakingPool.setDPNTokenContract(dpnAddress);
    await stakingPool.setNodeRightsContract(nodeRightsAddress);
    console.log("✅ StakingPool connected to DPN Token and NodeRights");

    // Display deployment summary - NO TEST DATA
    console.log("\n📋 CLEAN DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log("DPN Token:       ", dpnAddress);
    console.log("NodeRegistry:    ", nodeRegistryAddress);
    console.log("NodeRightsNFT:   ", nodeRightsAddress);
    console.log("Participation:   ", participationAddress);
    console.log("StakingPool:     ", stakingPoolAddress);
    console.log("=".repeat(50));

    // Verify clean state
    const totalSupply = await dpn.totalSupply();
    const globalStats = await stakingPool.getGlobalStats();
    const totalNodes = await nodeRights.totalSupply();

    console.log(`\n💰 DPN Token Supply: ${ethers.formatEther(totalSupply)} DPN`);
    console.log(`📊 StakingPool TVL: ${ethers.formatEther(globalStats.tvl)} ETH (should be 0.00)`);
    console.log(`🎯 Total NodeRights: ${totalNodes} (should be 0)`);

    console.log("\n✨ Clean deployment completed!");
    console.log("📱 Ready for UI testing with zero balances");
    console.log("🔧 Update your UI contract addresses:");
    console.log(`   DPN_TOKEN: '${dpnAddress}',`);
    console.log(`   PARTICIPATION: '${participationAddress}',`);
    console.log(`   STAKING_POOL: '${stakingPoolAddress}',`);
    console.log(`   NODE_RIGHTS_NFT: '${nodeRightsAddress}'`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});