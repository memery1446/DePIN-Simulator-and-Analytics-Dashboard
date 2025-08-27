// depin-ui/src/contracts/index.ts
// No new folders. No Solidity changes.
// Uses env addresses + embedded minimal ABIs to match the deployed contracts.

import { Contract, type InterfaceAbi } from "ethers";

// ---- Addresses from .env.local ----
const env = (k: string) =>
    (typeof process !== "undefined" && process.env && (process.env as any)[k]) || undefined;

export const CONTRACT_ADDRESSES = {
    NODE_RIGHTS_NFT: env("REACT_APP_NODE_RIGHTS_NFT_ADDRESS") || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    PARTICIPATION:   env("REACT_APP_PARTICIPATION_ADDRESS")   || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    STAKING_POOL:    env("REACT_APP_STAKING_POOL_ADDRESS")    || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    DPN_TOKEN:       env("REACT_APP_DPN_TOKEN_ADDRESS")       || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NODE_REGISTRY:   env("REACT_APP_NODE_REGISTRY_ADDRESS")   || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
} as const;

export const EXPECTED_CHAIN_ID = Number(env("REACT_APP_CHAIN_ID") || 31337);

// ---- Minimal ABIs (just what your UI actually calls) ----
// NodeRightsNFT: getNodeTypeStats(uint8) -> (uint256, uint256, uint256, uint256), totalSupply()
const NodeRightsNFTAbi: InterfaceAbi = [
    {
        "inputs": [{ "internalType": "uint8", "name": "nodeType", "type": "uint8" }],
        "name": "getNodeTypeStats",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
];

// Participation: registerNode(string)
const ParticipationAbi: InterfaceAbi = [
    {
        "inputs": [{ "internalType": "string", "name": "metadata", "type": "string" }],
        "name": "registerNode",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

// StakingPool: getGlobalStats() -> (uint256 tvl, uint256 rewards, uint256 stakers, uint256[4] distro)
const StakingPoolAbi: InterfaceAbi = [
    {
        "inputs": [],
        "name": "getGlobalStats",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "uint256[4]", "name": "", "type": "uint256[4]" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// DPNToken: totalSupply()
const DPNTokenAbi: InterfaceAbi = [
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
];

// NodeRegistry: (minimal; not used by dashboard reads)
const NodeRegistryAbi: InterfaceAbi = [
    {
        "inputs": [{ "internalType": "string", "name": "metadata", "type": "string" }],
        "name": "registerNode",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

// ---- Contract factory (ethers v6) ----
export function getContracts(providerOrSigner: any) {
    const make = (addr: string, abi: InterfaceAbi) =>
        new Contract(addr, abi, providerOrSigner);

    return {
        nodeRightsNFT: make(CONTRACT_ADDRESSES.NODE_RIGHTS_NFT, NodeRightsNFTAbi),
        participation: make(CONTRACT_ADDRESSES.PARTICIPATION,   ParticipationAbi),
        stakingPool:   make(CONTRACT_ADDRESSES.STAKING_POOL,    StakingPoolAbi),
        dpnToken:      make(CONTRACT_ADDRESSES.DPN_TOKEN,       DPNTokenAbi),
        nodeRegistry:  make(CONTRACT_ADDRESSES.NODE_REGISTRY,   NodeRegistryAbi),
    };
}
