import { ethers } from "hardhat";

async function main() {
    const initialSupply = ethers.parseEther("1000000"); // Ethers v6 format
    const DPN = await ethers.getContractFactory("DPNToken");
    const dpn = await DPN.deploy(initialSupply); // returns a contract instance

    await dpn.waitForDeployment(); // Ethers v6 replacement for .deployed()

    console.log("DPN Token deployed to:", await dpn.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
