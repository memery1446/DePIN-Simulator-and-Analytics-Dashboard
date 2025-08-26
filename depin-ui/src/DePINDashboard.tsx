import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    BrowserProvider,
    Contract,
    formatEther,
    parseEther,
    type BigNumberish,
} from "ethers";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    PieChart,
    Pie,
    Cell,
} from "recharts";

/**
 * ======= Addresses =======
 * Replace these with your generated contract-addresses.json import when available:
 *   import CONTRACT_ADDRESSES from "./contract-addresses.json";
 */
const CONTRACT_ADDRESSES = {
    NODE_RIGHTS_NFT: process.env.REACT_APP_NODE_RIGHTS_NFT_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    PARTICIPATION: process.env.REACT_APP_PARTICIPATION_ADDRESS || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    STAKING_POOL: process.env.REACT_APP_STAKING_POOL_ADDRESS || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    DPN_TOKEN: process.env.REACT_APP_DPN_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    NODE_REGISTRY: process.env.REACT_APP_NODE_REGISTRY_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};

// Debug log to verify addresses
console.log("Contract addresses loaded:", CONTRACT_ADDRESSES);

/**
 * ======= Minimal ABIs (only what we actually call) =======
 * Swap to your real ABIs later.
 */
const NODE_RIGHTS_ABI = [
    { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    // getNodeTypeStats(uint8) -> (totalNodes, totalStakedETH, averagePerformance, activeNodes)
    {
        inputs: [{ internalType: "uint8", name: "nodeType", type: "uint8" }],
        name: "getNodeTypeStats",
        outputs: [
            { internalType: "uint256", name: "totalNodes", type: "uint256" },
            { internalType: "uint256", name: "totalStakedETH", type: "uint256" },
            { internalType: "uint256", name: "averagePerformance", type: "uint256" },
            { internalType: "uint256", name: "activeNodes", type: "uint256" },
        ],
        stateMutability: "view",
        type: "function",
    },
];

const PARTICIPATION_ABI = [
    {
        inputs: [{ internalType: "string", name: "metadataJson", type: "string" }],
        name: "registerNode",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    { inputs: [], name: "getNodeCount", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
];

const STAKING_POOL_ABI = [
    // getGlobalStats() -> (tvlETH, totalRewardsDPN, totalStakers, uint256[4] poolDistribution)
    {
        inputs: [],
        name: "getGlobalStats",
        outputs: [
            { internalType: "uint256", name: "tvlETH", type: "uint256" },
            { internalType: "uint256", name: "totalRewardsDPN", type: "uint256" },
            { internalType: "uint256", name: "totalStakers", type: "uint256" },
            { internalType: "uint256[4]", name: "poolDistribution", type: "uint256[4]" },
        ],
        stateMutability: "view",
        type: "function",
    },
];

// ---------- Helpers ----------
function shortAddr(a?: string) {
    if (!a) return "";
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
}
function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}
function fromWei(v: BigNumberish) {
    try {
        return parseFloat(formatEther(v));
    } catch {
        return 0;
    }
}
function toWeiStr(eth: string) {
    return parseEther(eth || "0").toString();
}

// ---------- Wallet + Contracts ----------
function getInjectedProvider(): BrowserProvider | null {
    if (typeof window !== "undefined" && (window as any).ethereum) {
        return new BrowserProvider((window as any).ethereum);
    }
    return null;
}
function getReadOnlyContract(address: string, abi: any) {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No injected provider");
    return new Contract(address, abi, provider);
}
async function getWriteContract(address: string, abi: any) {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No injected provider");
    const signer = await provider.getSigner();
    return new Contract(address, abi, signer);
}

// ---------- Types ----------
type NodeTypeKey = "storage" | "compute" | "bandwidth";
type NodeTypeStats = Record<NodeTypeKey, { total: number; active: number; staked: string }>;
type LiveData = {
    totalNodes: number;
    totalStaked: string; // ETH as string
    totalRewards: string; // DPN as string
    networkUptime: number;
    poolDistribution: number[]; // 4 buckets
    nodeTypeStats: NodeTypeStats;
};
type UserData = {
    dpnBalance: string; // placeholder
    stakingPositions: number;
    totalSupply: string; // from NFT
    userTotalStaked: number;
    userTotalRewards: number;
};

// ---------- Component ----------
const DePINDashboard: React.FC = () => {
    // Wallet
    const [wallet, setWallet] = useState<{
        isConnected: boolean;
        address?: string;
        chainId?: string;
        ethBalance?: string;
    }>({ isConnected: false });

    // UI state
    const [notif, setNotif] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
    const showNotification = (kind: "success" | "error", msg: string) => {
        setNotif({ kind, msg });
        setTimeout(() => setNotif(null), 3500);
    };

    // Data state
    const [liveData, setLiveData] = useState<LiveData>({
        totalNodes: 0,
        totalStaked: "0",
        totalRewards: "0",
        networkUptime: 0,
        poolDistribution: [0, 0, 0, 0],
        nodeTypeStats: {
            storage: { total: 0, active: 0, staked: "0" },
            compute: { total: 0, active: 0, staked: "0" },
            bandwidth: { total: 0, active: 0, staked: "0" },
        },
    });
    const [userContractData, setUserContractData] = useState<UserData>({
        dpnBalance: "0",
        stakingPositions: 0,
        totalSupply: "0",
        userTotalStaked: 0,
        userTotalRewards: 0,
    });

    // Modals
    const [registerModal, setRegisterModal] = useState<{ isOpen: boolean; metadata: string }>({
        isOpen: false,
        metadata:
            '{"type":"storage","location":"New York, USA","capacity":"10TB","bandwidth":"1Gbps","uptime_sla":"99.9%","hardware":"Intel Xeon, 64GB RAM","contact":"operator@example.com"}',
    });
    const [poolStakeModal, setPoolStakeModal] = useState<{
        isOpen: boolean;
        tier: number;
        lockPeriod: number;
        amount: string;
    }>({ isOpen: false, tier: 0, lockPeriod: 0, amount: "" });

    // Connect / Disconnect
    const connect = useCallback(async () => {
        try {
            const provider = getInjectedProvider();
            if (!provider) throw new Error("MetaMask (or another wallet) not detected.");
            // request accounts (v6)
            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            const network = await provider.getNetwork();
            const balWei = await provider.getBalance(address);
            setWallet({
                isConnected: true,
                address,
                chainId: network.chainId.toString(),
                ethBalance: parseFloat(formatEther(balWei)).toFixed(4),
            });
            showNotification("success", "Wallet connected");
        } catch (e: any) {
            showNotification("error", e?.message || "Failed to connect");
        }
    }, []);
    const disconnect = useCallback(() => {
        setWallet({ isConnected: false });
        showNotification("success", "Disconnected");
    }, []);

    // React to wallet/chain changes
    useEffect(() => {
        const provider = getInjectedProvider();
        if (!provider) return;
        const eth = (provider as any).provider; // underlying EIP-1193 provider
        const onAccounts = (accounts: string[]) => {
            if (accounts.length === 0) setWallet({ isConnected: false });
            else connect();
        };
        const onChain = () => connect();
        eth?.on?.("accountsChanged", onAccounts);
        eth?.on?.("chainChanged", onChain);
        return () => {
            eth?.removeListener?.("accountsChanged", onAccounts);
            eth?.removeListener?.("chainChanged", onChain);
        };
    }, [connect]);

    // -------- Fetchers --------
    // Live contract data for overview cards
    const fetchLiveContractData = useCallback(async () => {
        try {
            let tvl = "0";
            let totalRewards = "0";
            let totalStakers = 0;
            let poolDistribution = [0, 0, 0, 0];
            let totalNodes = 0;

            // 1) Staking pool global stats
            try {
                const staking = getReadOnlyContract(CONTRACT_ADDRESSES.STAKING_POOL, STAKING_POOL_ABI);
                const gs = await staking.getGlobalStats();
                tvl = formatEther(gs[0]);
                totalRewards = formatEther(gs[1]);
                totalStakers = Number(gs[2]);
                poolDistribution = (gs[3] as any[]).map((n) => fromWei(n));
                console.log("✅ Staking pool data loaded:", { tvl, totalRewards, totalStakers });
            } catch (err) {
                console.error("❌ Failed to get staking pool data:", err);
            }

            await delay(400);

            // 2) NFT supply (total nodes)
            try {
                const nft = getReadOnlyContract(CONTRACT_ADDRESSES.NODE_RIGHTS_NFT, NODE_RIGHTS_ABI);
                const total = await nft.totalSupply();
                totalNodes = Number(total);
                console.log("✅ NFT total supply loaded:", totalNodes);
            } catch (err) {
                console.error("❌ Failed to get NFT totalSupply:", err);
            }

            await delay(700);

            // 3) Node type stats (call per type to avoid revert)
            const nodeTypeStats: NodeTypeStats = {
                storage: { total: 0, active: 0, staked: "0" },
                compute: { total: 0, active: 0, staked: "0" },
                bandwidth: { total: 0, active: 0, staked: "0" },
            };
            try {
                const nft = getReadOnlyContract(CONTRACT_ADDRESSES.NODE_RIGHTS_NFT, NODE_RIGHTS_ABI);
                const asKey = (i: number): NodeTypeKey => (i === 0 ? "storage" : i === 1 ? "compute" : "bandwidth");
                for (let i = 0; i < 3; i++) {
                    const s = await nft.getNodeTypeStats(i);
                    const key = asKey(i);
                    const totalN = Number((s as any).totalNodes ?? s[0]);
                    const activeN = Number((s as any).activeNodes ?? s[3]);
                    const staked = formatEther(((s as any).totalStakedETH ?? s[1]) as BigNumberish);
                    nodeTypeStats[key] = { total: totalN, active: activeN, staked };
                }
                console.log("✅ Node type stats loaded:", nodeTypeStats);
            } catch (err: any) {
                console.error("❌ Failed to get node type stats:", err?.message || err);
            }

            // 4) Participation fallback for total nodes
            await delay(400);
            if (totalNodes === 0) {
                try {
                    const part = getReadOnlyContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
                    const cnt = await part.getNodeCount();
                    totalNodes = Number(cnt);
                    console.log("✅ Participation fallback nodeCount:", totalNodes);
                } catch (err) {
                    console.error("❌ Failed participation fallback:", err);
                }
            }

            // Update state
            setLiveData((prev) => ({
                ...prev,
                totalNodes,
                totalStaked: tvl,
                totalRewards,
                networkUptime: prev.networkUptime || Math.floor(Math.random() * 10000), // placeholder
                poolDistribution,
                nodeTypeStats,
            }));

            console.log("📊 Final live data update:", {
                totalNodes,
                totalStaked: tvl,
                totalRewards,
                poolDistribution,
                nodeTypeStats,
            });
        } catch (error) {
            console.error("❌ Critical error in fetchLiveContractData:", error);
        }
    }, []);

    // User-specific data (placeholder wiring)
    const fetchUserContractData = useCallback(async () => {
        try {
            if (!wallet.isConnected || !wallet.address) {
                setUserContractData((prev) => ({ ...prev, stakingPositions: 0, userTotalStaked: 0, userTotalRewards: 0 }));
                return;
            }
            // Minimal: show 1 active position if any TVL exists && user is connected (demo)
            const stakingPositions = 1;
            const userTotalStaked = 1.0;
            const userTotalRewards = 0.0001;
            const nft = getReadOnlyContract(CONTRACT_ADDRESSES.NODE_RIGHTS_NFT, NODE_RIGHTS_ABI);
            let totalSupply = "0";
            try {
                totalSupply = (await nft.totalSupply()).toString();
            } catch {}
            setUserContractData({
                dpnBalance: "1000000", // placeholder for demo
                stakingPositions,
                totalSupply,
                userTotalStaked,
                userTotalRewards,
            });
        } catch (e) {
            console.error("❌ fetchUserContractData error:", e);
        }
    }, [wallet.isConnected, wallet.address]);

    // Subgraph data (placeholder message)
    const fetchSubgraphData = useCallback(async () => {
        // wire this later to your The Graph endpoint
        return;
    }, []);

    // Auto-refresh
    useEffect(() => {
        fetchLiveContractData();
        fetchUserContractData();
        fetchSubgraphData();
        const id = setInterval(() => {
            fetchLiveContractData();
            fetchUserContractData();
        }, 10_000);
        return () => clearInterval(id);
    }, [fetchLiveContractData, fetchUserContractData, fetchSubgraphData]);

    // Actions
    async function registerNewNode(metadata: string) {
        try {
            // normalize JSON
            let obj: any = {};
            try {
                obj = JSON.parse(metadata);
            } catch (e) {
                showNotification("error", "Invalid JSON");
                return;
            }
            // ensure known keys
            const normalized = {
                type: String(obj.type ?? "storage"),
                location: String(obj.location ?? "Unknown"),
                capacity: String(obj.capacity ?? ""),
                bandwidth: String(obj.bandwidth ?? ""),
                uptime_sla: String(obj.uptime_sla ?? ""),
                hardware: String(obj.hardware ?? ""),
                contact: String(obj.contact ?? ""),
            };
            const json = JSON.stringify(normalized);

            const contract = await getWriteContract(CONTRACT_ADDRESSES.PARTICIPATION, PARTICIPATION_ABI);
            const tx = await contract.registerNode(json);
            showNotification("success", "Registering node (pending)...");
            await tx.wait();
            showNotification("success", "Node registered ✅");
            setRegisterModal({ isOpen: false, metadata: "" });
            await delay(500);
            fetchLiveContractData();
        } catch (e: any) {
            console.error("registerNewNode error:", e);
            showNotification("error", e?.message || "Failed to register node");
        }
    }

    async function stakeToPool(tier: number, lockPeriod: number, amountEth: string) {
        // Wire this to your actual StakingPool deposit when ready
        showNotification("success", `Pretend-staked ${amountEth || "0"} ETH to Tier ${tier}, Lock ${lockPeriod}`);
    }

    async function claimAllRewards() {
        // Wire this to your actual claim function when ready
        showNotification("success", "Pretend-claimed rewards 🎁");
    }

    // Chart Data
    const chartData = useMemo(() => {
        // Fake 24h cumulative curve for now
        const pts = Array.from({ length: 25 }, (_, i) => ({
            time: `${(i * 24) / 24}:00`.padStart(5, "0"),
            cumulative: Math.max(0, i - 1),
        }));
        const poolDistributionData = ["Bronze", "Silver", "Gold", "Diamond"].map((name, i) => ({
            name,
            value: liveData.poolDistribution[i] ?? 0,
            color: ["#0d6efd", "#6f42c1", "#20c997", "#fd7e14"][i],
        }));
        return { cumulativeRewardData: pts, poolDistributionData };
    }, [liveData.poolDistribution]);

    return (
        <div style={{ maxWidth: 1050, margin: "0 auto", padding: 20, fontFamily: "Inter, system-ui, Arial" }}>
            {/* Notification */}
            {notif && (
                <div
                    style={{
                        position: "fixed",
                        top: 16,
                        right: 16,
                        background: notif.kind === "success" ? "#d1e7dd" : "#f8d7da",
                        color: "#000",
                        border: `1px solid ${notif.kind === "success" ? "#badbcc" : "#f5c2c7"}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        zIndex: 999,
                    }}
                >
                    {notif.msg}
                </div>
            )}

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0 }}>DePIN Network Analytics</h1>
                    <div style={{ color: "#6c757d" }}>Real-time monitoring of decentralized infrastructure network</div>
                </div>
                <div>
                    {!wallet.isConnected ? (
                        <button
                            onClick={connect}
                            style={{
                                padding: "10px 16px",
                                background: "#0d6efd",
                                color: "white",
                                border: "none",
                                borderRadius: 8,
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            Connect Wallet
                        </button>
                    ) : (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div
                                style={{
                                    background: "white",
                                    border: "1px solid #e9ecef",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    textAlign: "right",
                                }}
                            >
                                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{shortAddr(wallet.address)}</div>
                                <div style={{ fontSize: 12, color: "#6c757d" }}>
                                    {wallet.ethBalance ?? "0.0000"} ETH | {Number(userContractData.dpnBalance).toLocaleString()} DPN
                                </div>
                            </div>
                            <button
                                onClick={disconnect}
                                style={{
                                    padding: "8px 12px",
                                    background: "white",
                                    color: "#dc3545",
                                    border: "1px solid #dc3545",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Live indicator */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 14,
                    color: "#28a745",
                    fontWeight: 600,
                }}
            >
                <span style={{ width: 8, height: 8, background: "#28a745", borderRadius: "50%" }} />
                🟢 Live
            </div>

            {/* Live Contract Data Cards */}
            {wallet.isConnected && userContractData.stakingPositions > 0 && (
                <div
                    style={{
                        backgroundColor: "#e8f5e8",
                        borderRadius: "10px",
                        padding: "25px",
                        marginBottom: "20px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                        border: "2px solid #28a745",
                    }}
                >
                    <h3 style={{ margin: "0 0 15px 0", color: "#155724" }}>📊 Your Live Portfolio</h3>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: "20px",
                        }}
                    >
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#155724" }}>
                                {userContractData.stakingPositions}
                            </div>
                            <div style={{ color: "#666" }}>Active Positions</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#155724" }}>
                                {userTotalStakedDisplay(userContractData.userTotalStaked)} ETH
                            </div>
                            <div style={{ color: "#666" }}>Total Staked</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#155724" }}>
                                {userContractData.userTotalRewards.toFixed(4)} DPN
                            </div>
                            <div style={{ color: "#666" }}>Pending Rewards</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons (when connected) */}
            {wallet.isConnected && (
                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "20px",
                        marginBottom: "20px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <h3 style={{ margin: "0 0 15px 0", color: "#333" }}>🚀 Quick Actions</h3>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <button
                            onClick={() => setRegisterModal({ isOpen: true, metadata: "" })}
                            style={{
                                padding: "12px 24px",
                                backgroundColor: "#28a745",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                fontSize: "14px",
                                fontWeight: "bold",
                                cursor: "pointer",
                            }}
                        >
                            📡 Register New Node
                        </button>
                        <button
                            onClick={() => setPoolStakeModal({ isOpen: true, tier: 0, lockPeriod: 0, amount: "" })}
                            style={{
                                padding: "12px 24px",
                                backgroundColor: "#007bff",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                fontSize: "14px",
                                fontWeight: "bold",
                                cursor: "pointer",
                            }}
                        >
                            🏆 Stake in Pool
                        </button>
                        <button
                            onClick={claimAllRewards}
                            style={{
                                padding: "12px 24px",
                                backgroundColor: "#6f42c1",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                fontSize: "14px",
                                fontWeight: "bold",
                                cursor: "pointer",
                            }}
                        >
                            🎁 Claim All Rewards
                        </button>
                        <button
                            onClick={() => {
                                // Force refresh all data
                                setLiveData({
                                    totalNodes: 0,
                                    totalStaked: "0",
                                    totalRewards: "0",
                                    networkUptime: 0,
                                    poolDistribution: [0, 0, 0, 0],
                                    nodeTypeStats: {
                                        storage: { total: 0, active: 0, staked: "0" },
                                        compute: { total: 0, active: 0, staked: "0" },
                                        bandwidth: { total: 0, active: 0, staked: "0" },
                                    },
                                });
                                setUserContractData({
                                    dpnBalance: "0",
                                    stakingPositions: 0,
                                    totalSupply: "0",
                                    userTotalStaked: 0,
                                    userTotalRewards: 0,
                                });
                                fetchLiveContractData();
                                fetchUserContractData();
                                fetchSubgraphData();
                                showNotification("success", "Data refreshed from contracts");
                            }}
                            style={{
                                padding: "12px 24px",
                                backgroundColor: "#dc3545",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                fontSize: "14px",
                                fontWeight: "bold",
                                cursor: "pointer",
                            }}
                        >
                            🔄 Force Refresh
                        </button>
                    </div>
                </div>
            )}

            {/* Main Overview Cards */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    gap: "20px",
                    marginBottom: "30px",
                }}
            >
                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "25px",
                        textAlign: "center",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>TOTAL NODES</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#007bff" }}>
                        {liveData.totalNodes.toLocaleString()}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#28a745", marginTop: "5px" }}>Live from NFT Contract</div>
                </div>

                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "25px",
                        textAlign: "center",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>TOTAL STAKED (TVL)</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#28a745" }}>
                        {parseFloat(liveData.totalStaked).toFixed(2)} ETH
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6c757d", marginTop: "5px" }}>From StakingPool.getGlobalStats()</div>
                </div>

                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "25px",
                        textAlign: "center",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>TOTAL REWARDS</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#6f42c1" }}>
                        {parseFloat(liveData.totalRewards).toFixed(2)} DPN
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6c757d", marginTop: "5px" }}>From StakingPool.getGlobalStats()</div>
                </div>

                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "25px",
                        textAlign: "center",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>ACTIVE NETWORK UPTIME</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#17a2b8" }}>
                        {liveData.networkUptime.toLocaleString()} min
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6c757d", marginTop: "5px" }}>Placeholder (wire later)</div>
                </div>
            </div>

            {/* Charts */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "20px",
                    marginBottom: "30px",
                }}
            >
                {/* Cumulative Rewards Line */}
                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "20px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Cumulative Rewards</h3>
                    <div style={{ width: "100%", height: 260 }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData.cumulativeRewardData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="cumulative" stroke="#007bff" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Pool Distribution Pie */}
                <div
                    style={{
                        backgroundColor: "white",
                        borderRadius: "10px",
                        padding: "20px",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                >
                    <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Pool Distribution</h3>
                    <div
                        style={{
                            width: "100%",
                            height: 260,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={chartData.poolDistributionData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    label
                                >
                                    {chartData.poolDistributionData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Node Type Stats */}
            <div
                style={{
                    backgroundColor: "white",
                    borderRadius: "10px",
                    padding: "20px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    marginBottom: "30px",
                }}
            >
                <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Node Infrastructure Overview</h3>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                        <tr style={{ backgroundColor: "#f1f3f5" }}>
                            <th style={{ padding: "10px", textAlign: "left" }}>Type</th>
                            <th style={{ padding: "10px", textAlign: "right" }}>Total</th>
                            <th style={{ padding: "10px", textAlign: "right" }}>Active</th>
                            <th style={{ padding: "10px", textAlign: "right" }}>Staked (ETH)</th>
                        </tr>
                        </thead>
                        <tbody>
                        {(["storage", "compute", "bandwidth"] as const).map((k) => (
                            <tr key={k} style={{ borderTop: "1px solid #e9ecef" }}>
                                <td style={{ padding: "10px" }}>{k[0].toUpperCase() + k.slice(1)}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{liveData.nodeTypeStats[k].total}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{liveData.nodeTypeStats[k].active}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{liveData.nodeTypeStats[k].staked}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {/* Register Node Modal */}
            {registerModal.isOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                >
                    <div
                        style={{
                            background: "white",
                            borderRadius: "10px",
                            width: "min(640px, 90vw)",
                            padding: "20px",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>📡 Register New Node</h3>
                        <p style={{ color: "#555" }}>Paste JSON metadata (we’ll normalize it):</p>
                        <textarea
                            value={registerModal.metadata}
                            onChange={(e) => setRegisterModal({ ...registerModal, metadata: e.target.value })}
                            placeholder='{"type":"storage","location":"New York, USA","capacity":"10TB","bandwidth":"1Gbps","uptime_sla":"99.9%","hardware":"Intel Xeon, 64GB RAM","contact":"operator@example.com"}'
                            style={{
                                width: "100%",
                                height: "180px",
                                fontFamily: "monospace",
                                borderRadius: "8px",
                                border: "1px solid #ced4da",
                                padding: "10px",
                            }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                            <button
                                onClick={() => setRegisterModal({ isOpen: false, metadata: "" })}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: 8,
                                    border: "1px solid #ced4da",
                                    background: "white",
                                    cursor: "pointer",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => registerNewNode(registerModal.metadata)}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "#28a745",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                }}
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pool Stake Modal */}
            {poolStakeModal.isOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                    }}
                >
                    <div
                        style={{
                            background: "white",
                            borderRadius: "10px",
                            width: "min(560px, 90vw)",
                            padding: "20px",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>🏆 Stake in Pool</h3>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 12, color: "#666" }}>Tier</span>
                                <select
                                    value={poolStakeModal.tier}
                                    onChange={(e) => setPoolStakeModal({ ...poolStakeModal, tier: parseInt(e.target.value, 10) })}
                                    style={{ padding: "10px", borderRadius: 8, border: "1px solid #ced4da" }}
                                >
                                    <option value={0}>Bronze</option>
                                    <option value={1}>Silver</option>
                                    <option value={2}>Gold</option>
                                    <option value={3}>Diamond</option>
                                </select>
                            </label>

                            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 12, color: "#666" }}>Lock Period</span>
                                <select
                                    value={poolStakeModal.lockPeriod}
                                    onChange={(e) =>
                                        setPoolStakeModal({ ...poolStakeModal, lockPeriod: parseInt(e.target.value, 10) })
                                    }
                                    style={{ padding: "10px", borderRadius: 8, border: "1px solid #ced4da" }}
                                >
                                    <option value={0}>None</option>
                                    <option value={1}>30 days</option>
                                    <option value={2}>90 days</option>
                                    <option value={3}>180 days</option>
                                </select>
                            </label>
                        </div>

                        <label style={{ display: "block", marginTop: 12 }}>
                            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Amount (ETH)</div>
                            <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={poolStakeModal.amount}
                                onChange={(e) => setPoolStakeModal({ ...poolStakeModal, amount: e.target.value })}
                                placeholder="0.05"
                                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #ced4da" }}
                            />
                        </label>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                            <button
                                onClick={() => setPoolStakeModal({ isOpen: false, tier: 0, lockPeriod: 0, amount: "" })}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: 8,
                                    border: "1px solid #ced4da",
                                    background: "white",
                                    cursor: "pointer",
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => stakeToPool(poolStakeModal.tier, poolStakeModal.lockPeriod, poolStakeModal.amount)}
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "#007bff",
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                }}
                            >
                                Stake
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Simple display helper for user total staked
function userTotalStakedDisplay(v: number) {
    try {
        if (!isFinite(v)) return "0.0000";
        return v.toFixed(4);
    } catch {
        return "0.0000";
    }
}

export default DePINDashboard;
