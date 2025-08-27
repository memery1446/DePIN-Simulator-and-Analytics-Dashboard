import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, JsonRpcProvider, formatEther } from "ethers";
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
import { getContracts, CONTRACT_ADDRESSES } from "./contracts";

// Direct JSON-RPC for safe reads
const READ_URL = process.env.REACT_APP_NETWORK_URL || "http://127.0.0.1:8545";
const getReadProvider = () => new JsonRpcProvider(READ_URL);

// Backoff window for flaky calls
const STATS_BACKOFF_MS = 60_000;

console.log("Contract addresses loaded:", CONTRACT_ADDRESSES);

// ---------- Helpers ----------
function shortAddr(a?: string) {
    if (!a) return "";
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
}
function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}
function getInjectedProvider(): BrowserProvider | null {
    if (typeof window !== "undefined" && (window as any).ethereum) {
        return new BrowserProvider((window as any).ethereum);
    }
    return null;
}

// ---------- Types ----------
type NodeTypeKey = "storage" | "compute" | "bandwidth";
type NodeTypeStats = Record<NodeTypeKey, { total: number; active: number; staked: string }>;
type LiveData = {
    totalNodes: number;
    totalStaked: string; // ETH (string)
    totalRewards: string; // DPN (string)
    networkUptime: number;
    poolDistribution: number[];
    nodeTypeStats: NodeTypeStats;
};
type UserData = {
    dpnBalance: string;
    stakingPositions: number;
    totalSupply: string;
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

    // Toast
    const [notif, setNotif] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
    const showNotification = (kind: "success" | "error", msg: string) => {
        setNotif({ kind, msg });
        setTimeout(() => setNotif(null), 3500);
    };

    // Backoff
    const statsBackoffUntil = useRef(0);

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

    // Connect / disconnect
    const connect = useCallback(async () => {
        try {
            const provider = getInjectedProvider();
            if (!provider) throw new Error("MetaMask (or another wallet) not detected.");
            await provider.send("eth_requestAccounts", []);
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            const network = await provider.getNetwork();
            const balWei = await provider.getBalance(address);
            setWallet({
                isConnected: true,
                address,
                chainId: String(network.chainId),
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
        if (typeof window === "undefined" || !(window as any).ethereum) return;
        const ethereum = (window as any).ethereum;

        const onAccounts = (accounts: string[]) => {
            if (accounts.length === 0) {
                setWallet({ isConnected: false });
            } else {
                connect();
            }
        };
        const onChain = () => {
            connect();
        };

        ethereum.on("accountsChanged", onAccounts);
        ethereum.on("chainChanged", onChain);
        return () => {
            ethereum.removeListener("accountsChanged", onAccounts);
            ethereum.removeListener("chainChanged", onChain);
        };
    }, [connect]);

    // -------- Fetchers --------
    // NOTE: no wallet dependency (silences the ESLint warning)
    const fetchLiveContractData = useCallback(async () => {
        try {
            console.log("🔄 Starting contract data fetch...");

            const provider = getReadProvider();
            const contracts = getContracts(provider);

            // 1) Pool
            let tvl = "0.0";
            let totalRewards = "0.0";
            let totalStakers = 0;
            let poolDistribution: number[] = [0, 0, 0, 0];

            try {
                const globalStats = await contracts.stakingPool.getGlobalStats();
                tvl = formatEther(globalStats[0]);
                totalRewards = formatEther(globalStats[1]);
                totalStakers = Number(globalStats[2]);
                poolDistribution = (globalStats[3] as any[]).map((n) => {
                    try {
                        return parseFloat(formatEther(n));
                    } catch {
                        return 0;
                    }
                });
                console.log("✅ Staking pool data loaded:", { tvl, totalRewards, totalStakers });
            } catch (err: any) {
                console.error("❌ Failed to get staking pool data:", err?.message || err);
            }

            await delay(300);

            // 2) Total nodes: prefer Participation.nextId(), fallback to NFT.totalSupply()
            let totalNodes = 0;
            try {
                const nextIdRaw = await contracts.participation.nextId().catch(() => null as any);
                const nftSupplyRaw = await contracts.nodeRightsNFT.totalSupply().catch(() => null as any);

                const toNum = (x: any) => {
                    try {
                        if (x == null) return 0;
                        if (typeof x === "string" || typeof x === "number") return Number(x);
                        if (typeof x?.toString === "function") return Number(x.toString());
                    } catch {}
                    return 0;
                };

                const nextIdNum = toNum(nextIdRaw);
                const nftSupplyNum = toNum(nftSupplyRaw);
                totalNodes = nextIdNum > 0 ? nextIdNum : nftSupplyNum;

                console.log("✅ Node counts:", {
                    byRegistryNextId: String(nextIdNum),
                    byNftTotalSupply: String(nftSupplyNum),
                    totalNodes,
                });
            } catch (err: any) {
                console.error("❌ Failed to get total nodes:", err?.message || err);
            }

            await delay(300);

            // 3) Per-type stats via NFT (may be zero depending on your flow)
            const nodeTypeStats: NodeTypeStats = {
                storage: { total: 0, active: 0, staked: "0" },
                compute: { total: 0, active: 0, staked: "0" },
                bandwidth: { total: 0, active: 0, staked: "0" },
            };

            if (Date.now() >= statsBackoffUntil.current) {
                try {
                    const asKey = (i: number): NodeTypeKey => (i === 0 ? "storage" : i === 1 ? "compute" : "bandwidth");
                    for (let i = 0; i < 3; i++) {
                        try {
                            const stats = await contracts.nodeRightsNFT.getNodeTypeStats(i);
                            const key = asKey(i);
                            nodeTypeStats[key] = {
                                total: Number(stats[0]),
                                active: Number(stats[3]),
                                staked: formatEther(stats[1]),
                            };
                            console.log(`✅ Node type ${key} stats:`, nodeTypeStats[key]);
                        } catch (typeErr: any) {
                            console.warn(`⚠️ Failed to get stats for node type ${i}:`, typeErr?.message || typeErr);
                        }
                    }
                } catch (err: any) {
                    console.error("❌ Node type stats failed:", err?.message || err);
                    statsBackoffUntil.current = Date.now() + STATS_BACKOFF_MS;
                }
            } else {
                console.warn("⏳ Skipping getNodeTypeStats during backoff");
            }

            // If NFT totals are zero but we know nodes exist, derive counts from registry metadata
            const currentTotals =
                nodeTypeStats.storage.total + nodeTypeStats.compute.total + nodeTypeStats.bandwidth.total;

            if (currentTotals === 0 && totalNodes > 0) {
                try {
                    const nextIdRaw2 = await contracts.participation.nextId().catch(() => 0 as any);
                    const cap = (typeof nextIdRaw2?.toString === "function" ? Number(nextIdRaw2.toString()) : Number(nextIdRaw2)) || 0;
                    if (cap > 0) {
                        let storage = 0,
                            compute = 0,
                            bandwidth = 0;

                        for (let id = 0; id < cap; id++) {
                            try {
                                const rec = await contracts.participation.nodes(id);
                                const metadata: string = rec[1] ?? "";
                                let t = "";
                                try {
                                    t = (JSON.parse(metadata).type || "").toString().toLowerCase();
                                } catch {}
                                if (t.startsWith("stor")) storage++;
                                else if (t.startsWith("comp")) compute++;
                                else if (t.startsWith("band")) bandwidth++;
                                else storage++;
                            } catch {
                                // skip row
                            }
                        }

                        nodeTypeStats.storage.total = storage;
                        nodeTypeStats.compute.total = compute;
                        nodeTypeStats.bandwidth.total = bandwidth;
                        nodeTypeStats.storage.active = storage;
                        nodeTypeStats.compute.active = compute;
                        nodeTypeStats.bandwidth.active = bandwidth;

                        const tvlNum = parseFloat(tvl || "0");
                        const denom = Math.max(storage + compute + bandwidth, 1);
                        nodeTypeStats.storage.staked = (tvlNum * (storage / denom)).toFixed(2);
                        nodeTypeStats.compute.staked = (tvlNum * (compute / denom)).toFixed(2);
                        nodeTypeStats.bandwidth.staked = (tvlNum * (bandwidth / denom)).toFixed(2);

                        console.log("ℹ️ Derived nodeTypeStats from registry metadata.");
                    }
                } catch (err: any) {
                    console.warn("⚠️ Registry scan failed:", err?.message || err);
                }
            }

            // 4) Update state
            setLiveData((prev) => ({
                ...prev,
                totalNodes,
                totalStaked: tvl,
                totalRewards,
                networkUptime: prev.networkUptime || Math.floor(Math.random() * 1000),
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
        } catch (error: any) {
            console.error("❌ Critical error in fetchLiveContractData:", error);
        }
    }, []); // <- no wallet dep

    const fetchUserContractData = useCallback(async () => {
        try {
            if (!wallet.isConnected || !wallet.address) {
                setUserContractData((prev) => ({
                    ...prev,
                    stakingPositions: 0,
                    userTotalStaked: 0,
                    userTotalRewards: 0,
                }));
                return;
            }

            const provider = getInjectedProvider();
            if (!provider) return;

            const contracts = getContracts(provider);

            let totalSupply = "0";
            try {
                const supply = await contracts.nodeRightsNFT.totalSupply();
                totalSupply = String(typeof supply?.toString === "function" ? supply.toString() : supply);
            } catch (err) {
                console.error("Failed to get totalSupply:", err);
            }

            const stakingPositions = totalSupply !== "0" ? 1 : 0;
            const userTotalStaked = stakingPositions > 0 ? 1.0 : 0;
            const userTotalRewards = stakingPositions > 0 ? 0.0001 : 0;

            setUserContractData({
                dpnBalance: "1000000", // demo
                stakingPositions,
                totalSupply,
                userTotalStaked,
                userTotalRewards,
            });
        } catch (e) {
            console.error("fetchUserContractData error:", e);
        }
    }, [wallet.isConnected, wallet.address]);

    const fetchSubgraphData = useCallback(async () => {
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
            console.log("Starting node registration...");

            if (!wallet.isConnected) {
                showNotification("error", "Please connect your wallet first");
                return;
            }

            // Normalize JSON
            let obj: any = {};
            try {
                obj = JSON.parse(metadata || "{}");
            } catch {
                showNotification("error", "Invalid JSON format");
                return;
            }

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
            console.log("Normalized metadata:", json);

            const injected = getInjectedProvider();
            if (!injected) throw new Error("No Web3 provider found");

            // Ensure expected chain (avoid BigInt usage)
            const net = await injected.getNetwork();
            const expected = String(process.env.REACT_APP_CHAIN_ID ?? "31337");
            const netId = (net as any)?.chainId?.toString ? (net as any).chainId.toString() : String(net.chainId);
            if (netId !== expected) {
                const hex = "0x" + Number(expected).toString(16);
                try {
                    await (window as any).ethereum.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: hex }],
                    });
                } catch (e) {
                    showNotification("error", `Wrong network (${netId}). Please switch to ${expected} and try again.`);
                    return;
                }
            }

            const signer = await injected.getSigner();
            const contracts = getContracts(signer);
            const from = await signer.getAddress();

            // Optional preflight; ignore failure
            try {
                if ((contracts.participation as any)?.registerNode?.staticCall) {
                    await (contracts.participation as any).registerNode.staticCall(json, { from });
                }
            } catch (preErr) {
                console.warn("Preflight/staticCall failed (will still prompt):", preErr);
            }

            console.log("Submitting transaction...");
            showNotification("success", "Submitting registration transaction...");

            const tx = await contracts.participation.registerNode(json);
            console.log("Transaction submitted:", tx.hash);
            showNotification("success", `Transaction submitted: ${tx.hash.slice(0, 10)}...`);

            const receipt = await tx.wait();
            console.log("Transaction confirmed:", receipt);

            showNotification("success", "Node registered successfully!");
            setRegisterModal({ isOpen: false, metadata: "" });

            setTimeout(() => {
                fetchLiveContractData();
            }, 1500);
        } catch (error: any) {
            console.error("Registration error:", error);

            let userMessage = "Failed to register node";
            const msg = String(error?.message ?? "");
            if (msg.includes("user rejected") || error?.code === 4001) {
                userMessage = "Transaction was rejected by user";
            } else if (msg.includes("insufficient funds")) {
                userMessage = "Insufficient funds for transaction";
            } else if (msg.includes("execution reverted")) {
                userMessage = "Transaction failed - check contract requirements";
            }
            showNotification("error", userMessage);
        }
    }

    async function stakeToPool(tier: number, lockPeriod: number, amountEth: string) {
        showNotification("success", `Pretend-staked ${amountEth || "0"} ETH to Tier ${tier}, Lock ${lockPeriod}`);
    }

    async function claimAllRewards() {
        showNotification("success", "Pretend-claimed rewards 🎁");
    }

    // Chart Data
    const chartData = useMemo(() => {
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: "#28a745", fontWeight: 600 }}>
                <span style={{ width: 8, height: 8, background: "#28a745", borderRadius: "50%" }} />
                🟢 Live
            </div>

            {/* Portfolio (when connected & has positions) */}
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
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

            {/* Actions */}
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

            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px", marginBottom: "30px" }}>
                <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "25px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>TOTAL NODES</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#007bff" }}>{liveData.totalNodes.toLocaleString()}</div>
                    <div style={{ fontSize: "0.8rem", color: "#28a745", marginTop: "5px" }}>Live from Registry/NFT</div>
                </div>

                <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "25px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>TOTAL STAKED (TVL)</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#28a745" }}>
                        {parseFloat(liveData.totalStaked).toFixed(2)} ETH
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6c757d", marginTop: "5px" }}>From StakingPool.getGlobalStats()</div>
                </div>

                <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "25px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>TOTAL REWARDS</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#6f42c1" }}>
                        {parseFloat(liveData.totalRewards).toFixed(2)} DPN
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6c757d", marginTop: "5px" }}>From StakingPool.getGlobalStats()</div>
                </div>

                <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "25px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                    <div style={{ color: "#666", fontSize: "0.9rem", fontWeight: "bold" }}>ACTIVE NETWORK UPTIME</div>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#17a2b8" }}>
                        {liveData.networkUptime.toLocaleString()} min
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6c757d", marginTop: "5px" }}>Placeholder (wire later)</div>
                </div>
            </div>

            {/* Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" }}>
                {/* Cumulative Rewards */}
                <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
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

                {/* Pool Distribution */}
                <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                    <h3 style={{ margin: "0 0 10px 0", color: "#333" }}>Pool Distribution</h3>
                    <div style={{ width: "100%", height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={chartData.poolDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
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
            <div style={{ backgroundColor: "white", borderRadius: "10px", padding: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)", marginBottom: "30px" }}>
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
                                    onChange={(e) => setPoolStakeModal({ ...poolStakeModal, lockPeriod: parseInt(e.target.value, 10) })}
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

// Simple display helper
function userTotalStakedDisplay(v: number) {
    try {
        if (!isFinite(v)) return "0.0000";
        return v.toFixed(4);
    } catch {
        return "0.0000";
    }
}

export default DePINDashboard;
