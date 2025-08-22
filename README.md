# DePIN Simulator - Complete Setup Guide

## 🏗️ **Project Architecture**
```
DePINSimulator/
├── contracts/               # Smart contracts (Solidity)
├── scripts/                # Deployment & utility scripts
├── test/                   # Comprehensive test suite (70 tests)
├── subgraph/              # Graph Protocol indexing
├── depin-ui/              # React frontend dashboard
├── docker-compose.yml     # Graph Node infrastructure
├── rpc-relay.js           # Network relay service
└── hardhat.config.ts      # Hardhat configuration
```

## 🚀 **Quick Start (Copy & Paste)**

### **1. Start Core Services** (Terminal 1)
```bash
# Start Hardhat blockchain FIRST
npx hardhat node --hostname 0.0.0.0

# Keep this running - you'll see transactions here
```

### **2. Start Graph Infrastructure** (Terminal 2)
```bash
# Start Docker services
docker-compose up -d

# Wait for services to initialize
sleep 30

# Verify all services are running
docker-compose ps
```

### **3. Deploy Smart Contracts** (Terminal 3)
```bash
# Compile and deploy contracts
npx hardhat compile
npx hardhat run scripts/deploy.ts --network localhost

# Note the contract addresses - they're always the same:
# DPN Token:     0x5FbDB2315678afecb367f032d93F642f64180aa3
# StakingPool:   0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
# NodeRights:    0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
# Participation: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
```

### **4. Deploy Subgraph** (Terminal 3 continued)
```bash
cd subgraph

# Build subgraph
npx graph codegen && npx graph build

# Create subgraph (ONLY ONCE)
npx graph create --node http://localhost:8020/ participation-subgraph

# Deploy subgraph
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph
# When prompted for version, just press Enter
```

### **5. Generate Test Data** (Terminal 3 continued)
```bash
cd ..

# Run full test suite (generates subgraph events)
npx hardhat test --network localhost
# This runs 70 tests and creates sample data
```

### **6. Start RPC Relay** (Terminal 4)
```bash
# Start the RPC relay service
node rpc-relay.js

# Keep this running for frontend connectivity
```

### **7. Start Frontend** (Terminal 5)
```bash
cd depin-ui

# Install dependencies (first time only)
npm install

# Start React app
npm start
```

## ✅ **Verification Steps**

### **Check Blockchain is Running**
```bash
curl http://localhost:8545
# Should return RPC response
```

### **Check Graph Node is Ready**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ _meta { block { number } } }"}' \
  http://localhost:8000/subgraphs/name/participation-subgraph
# Should return: {"data":{"_meta":{"block":{"number":"X"}}}}
```

### **Check Docker Services**
```bash
docker-compose ps
# All services should show "Up"
```

## 🌐 **Service URLs**

| Service | URL | Status Check |
|---------|-----|--------------|
| **Hardhat RPC** | `http://localhost:8545` | `curl http://localhost:8545` |
| **Subgraph GraphQL** | `http://localhost:8000/subgraphs/name/participation-subgraph` | Click link to open GraphQL playground |
| **Graph Admin** | `http://localhost:8020/` | Subgraph management |
| **IPFS** | `http://localhost:5001` | Decentralized storage |
| **React Dashboard** | `http://localhost:3000` | Frontend (after `npm start`) |

## 🔄 **Daily Development Workflow**

### **Option A: Full Restart (Recommended)**
```bash
# Terminal 1: Stop everything
docker-compose down
# Kill hardhat node (Ctrl+C)

# Terminal 1: Restart blockchain
npx hardhat node --hostname 0.0.0.0

# Terminal 2: Restart infrastructure
docker-compose up -d
sleep 30

# Terminal 3: Quick redeploy
npx hardhat run scripts/deploy.ts --network localhost
cd subgraph
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph

# Terminal 4: Start relay
node rpc-relay.js
```

### **Option B: Keep Running (Faster)**
```bash
# If services are already running, just redeploy:
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat test --network localhost
```

## 🧪 **Testing & Data Generation**

### **Run Specific Test Suites**
```bash
# Run only integration tests
npx hardhat test test/integration.test.ts --network localhost

# Run only subgraph tests  
npx hardhat test test/subgraph-integration.test.ts --network localhost

# Run all tests (generates lots of sample data)
npx hardhat test --network localhost
```

### **Sample GraphQL Queries**
```graphql
# Basic query to verify subgraph is working
{
  _meta {
    block {
      number
    }
  }
}

# Get all nodes and their uptime
{
  nodes(orderBy: timestamp) {
    id
    nodeId
    owner
    timestamp
  }
  uptimes(orderBy: timestamp) {
    id
    nodeId
    minutesUp
    timestamp
  }
}

# Get staking pool data
{
  poolStakes(orderBy: timestamp) {
    id
    user
    tier
    lockPeriod
    amount
    timestamp
  }
}
```

## 🛠️ **Common Issues & Solutions**

| Problem | Symptoms | Solution |
|---------|----------|----------|
| **Services not connecting** | `ECONNREFUSED` errors | Start Hardhat BEFORE Docker |
| **Subgraph not syncing** | Old block numbers | Run `npx hardhat test` to generate events |
| **"Network not supported"** | Deployment fails | Use `mainnet` in subgraph.yaml (not `localhost`) |
| **Docker services failing** | `docker-compose ps` shows "Exit" | `docker-compose down -v && docker-compose up -d` |
| **Frontend can't connect** | Network errors in browser | Make sure `rpc-relay.js` is running |
| **Tests failing** | Contract errors | Restart Hardhat node (clean state) |

## 🔧 **Advanced Operations**

### **Reset Everything (Nuclear Option)**
```bash
# Stop all processes (Ctrl+C in all terminals)
docker-compose down -v
rm -rf data/

# Start fresh
npx hardhat node --hostname 0.0.0.0
docker-compose up -d
sleep 30
# Then redeploy everything
```

### **View Logs**
```bash
# Graph Node logs
docker-compose logs graph-node

# All service logs
docker-compose logs -f
```

### **Interactive Development**
```bash
# Hardhat console
npx hardhat console --network localhost

# Example console commands:
# const contract = await ethers.getContractAt("DPNToken", "0x5FbDB...");
# await contract.totalSupply();
```

## 📊 **System Status Dashboard**

### **Quick Health Check Script**
```bash
# Check all services
echo "🔍 Checking DePIN Simulator Status..."
echo "📡 Hardhat RPC:" && curl -s http://localhost:8545 > /dev/null && echo "✅ Running" || echo "❌ Down"
echo "🐳 Docker Services:" && docker-compose ps --format "table {{.Name}}\t{{.Status}}"
echo "📊 Subgraph:" && curl -s -X POST -H "Content-Type: application/json" -d '{"query": "{ _meta { block { number } } }"}' http://localhost:8000/subgraphs/name/participation-subgraph | grep -q "number" && echo "✅ Synced" || echo "❌ Not synced"
echo "🎯 Frontend:" && curl -s http://localhost:3000 > /dev/null && echo "✅ Running" || echo "❌ Down"
```

## 🎯 **Key Files to Know**

| File | Purpose | When to Edit |
|------|---------|-------------|
| `hardhat.config.ts` | Network configuration | Almost never |
| `subgraph/subgraph.yaml` | Contract addresses | Only if addresses change |
| `subgraph/schema.graphql` | Data structure | When adding new features |
| `docker-compose.yml` | Infrastructure setup | When changing ports |
| `rpc-relay.js` | Network bridge | For frontend connectivity |

## 🏆 **Success Indicators**

You know everything is working when:
- ✅ All 70 tests pass
- ✅ Subgraph returns current block numbers
- ✅ Docker shows all services "Up"
- ✅ Frontend loads without network errors
- ✅ GraphQL playground shows live data

**🎉 Your DePIN Simulator is now running a complete decentralized infrastructure platform!**

---

### **Pro Tips:**
- **Keep Terminal 1 (Hardhat)** visible to see live transactions
- **Use `sleep 30`** after `docker-compose up -d` to avoid timing issues
- **Run tests regularly** to generate fresh subgraph data
- **Bookmark the GraphQL playground** for easy data exploration
- **The contract addresses are deterministic** - they're always the same on localhost