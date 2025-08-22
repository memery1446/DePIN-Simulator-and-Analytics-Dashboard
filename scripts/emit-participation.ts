import { ethers } from "hardhat";

// Use your current localhost address, or override via env
const PARTICIPATION_ADDR =
    process.env.PARTICIPATION_ADDR ??
    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

async function main() {
    const [owner, addr1, addr2] = await ethers.getSigners();

    // Attach by ABI name + address (no hardhat-deploy needed)
    const participation = await ethers.getContractAt(
        "Participation",
        PARTICIPATION_ADDR
    );

    // ethers v6: address lives at .target (fallback to .address just in case)
    console.log(
        "Participation:",
        (participation as any).target ?? (participation as any).address
    );

    // 1) Try to register a node; if it already exists or the signature differs, skip
    try {
        const tx = await participation
            .connect(addr1)
            .registerNode("SG Node 1");
        await tx.wait();
        console.log("registerNode OK");
    } catch {
        console.log("registerNode skipped (already exists or different signature).");
    }

    // 2) recordUptime: try 3-arg then 2-arg variant to match your ABI
    try {
        const now = Math.floor(Date.now() / 1000);
        let tx;
        try {
            tx = await participation.connect(addr1).recordUptime(0, 60, now);
        } catch {
            tx = await (participation as any).connect(addr1).recordUptime(0, 60);
        }
        await tx.wait();
        console.log("recordUptime OK");
    } catch (e) {
        console.log("recordUptime failed; ensure nodeId=0 exists.");
    }

    // 3) Nudge chain so Graph has blocks to ingest
    for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
    }

    console.log("Done.");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
