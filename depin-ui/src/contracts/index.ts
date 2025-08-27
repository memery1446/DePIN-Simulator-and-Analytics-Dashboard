// depin-ui/src/contracts/index.ts
// One place to define addresses + ABIs and return ethers v6 Contract objects.
//
// No contract changes. Uses your .env.local addresses and the ABIs you attached.

import { Contract, Interface, type InterfaceAbi } from "ethers";

// ---- Env helpers (CRA + Vite compatible) ----
const ENV = (k: string): string | undefined => {
    // Vite
    // @ts-ignore
    const vite = (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env[k]) as string | undefined;
    // CRA / Node
    // @ts-ignore
    const cra = (typeof process !== "undefined" && process.env && (process.env as any)[k]) as string | undefined;
    return vite ?? cra;
};

// ---- Addresses (from .env.local with safe fallbacks to your last deploy) ----
export const CONTRACT_ADDRESSES = {
    NODE_RIGHTS_NFT: ENV("REACT_APP_NODE_RIGHTS_NFT_ADDRESS") ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    PARTICIPATION:   ENV("REACT_APP_PARTICIPATION_ADDRESS")   ?? "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    STAKING_POOL:    ENV("REACT_APP_STAKING_POOL_ADDRESS")    ?? "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    DPN_TOKEN:       ENV("REACT_APP_DPN_TOKEN_ADDRESS")       ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NODE_REGISTRY:   ENV("REACT_APP_NODE_REGISTRY_ADDRESS")   ?? "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
} as const;

export const EXPECTED_CHAIN_ID = Number(ENV("REACT_APP_CHAIN_ID") ?? 31337);

// ---- ABIs (these must be your latest artifacts copied under src/contracts/abi) ----
import NodeRightsNFTAbi from "./abi/NodeRightsNFT.json";
import ParticipationAbi from "./abi/Participation.json";
import StakingPoolAbi from "./abi/StakingPool.json";
import DPNTokenAbi from "./abi/DPNToken.json";
import NodeRegistryAbi from "./abi/NodeRegistry.json";

// Narrow type for ABIs
const asAbi = (a: unknown) => a as InterfaceAbi;

// Optional: quick debug to prove we’re using the expected selectors at runtime
function logSelectorsOnce() {
    if ((logSelectorsOnce as any)._did) return;
    (logSelectorsOnce as any)._did = true;

    try {
        const nftI = new Interface(asAbi(NodeRightsNFTAbi));
        const partI = new Interface(asAbi(ParticipationAbi));
        const poolI = new Interface(asAbi(StakingPoolAbi));

        // These are the exact sig hashes your UI relies on
        console.log("[ABI] getNodeTypeStats(uint8) =>", nftI.getSighash("getNodeTypeStats(uint8)"));
        console.log("[ABI] registerNode(string)    =>", partI.getSighash("registerNode(string)"));
        console.log("[ABI] getGlobalStats()        =>", poolI.getSighash("getGlobalStats()"));
    } catch (e) {
        console.warn("Selector debug skipped:", e);
    }
}

/**
 * getContracts(providerOrSigner)
 * Pass your BrowserProvider signer (for writes) or any Provider (for reads).
 * This keeps your components simple: they just call getContracts(provider/signer).
 */
export function getContracts(providerOrSigner: any) {
    // Prove the ABIs used at runtime (dev only)
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        logSelectorsOnce();
    }

    // Build contracts from the ABIs you attached (no TypeChain factories; prevents stale ABI issues)
    const make = (addr: string, abi: any) => new Contract(addr, asAbi(abi), providerOrSigner);

    const contracts = {
        nodeRightsNFT: make(CONTRACT_ADDRESSES.NODE_RIGHTS_NFT, NodeRightsNFTAbi),
        participation: make(CONTRACT_ADDRESSES.PARTICIPATION,   ParticipationAbi),
        stakingPool:   make(CONTRACT_ADDRESSES.STAKING_POOL,    StakingPoolAbi),
        dpnToken:      make(CONTRACT_ADDRESSES.DPN_TOKEN,       DPNTokenAbi),
        nodeRegistry:  make(CONTRACT_ADDRESSES.NODE_REGISTRY,   NodeRegistryAbi),
    };

    return contracts;
}
