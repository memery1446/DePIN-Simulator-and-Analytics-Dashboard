import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with:", deployer.address);

    const initialSupply = ethers.parseEther("1000000");

    // Deploy DPNToken
    const DPNToken = await ethers.getContractFactory("DPNToken");
    const dpn = await DPNToken.deploy(initialSupply);
    await dpn.waitForDeployment();
    console.log("✅ DPN Token deployed to:", await dpn.getAddress());

    // Deploy NodeRegistry
    const NodeRegistry = await ethers.getContractFactory("NodeRegistry");
    const nodeRegistry = await NodeRegistry.deploy();
    await nodeRegistry.waitForDeployment();
    console.log("✅ NodeRegistry deployed to:", await nodeRegistry.getAddress());

    // Deploy Participation (inherits NodeRegistry)
    const Participation = await ethers.getContractFactory("Participation");
    const participation = await Participation.deploy();
    await participation.waitForDeployment();
    console.log("✅ Participation contract deployed to:", await participation.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

