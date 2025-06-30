# DePIN Simulator - Command Reference

## 📁 **Project Structure**
```
DePINSimulator/
├── contracts/               # Smart contracts
├── scripts/                # Deployment scripts
├── test/                   # Contract tests
├── subgraph/              # Graph Protocol subgraph
├── depin-ui/              # React frontend
├── docker-compose.yml     # Graph Node infrastructure
└── hardhat.config.ts      # Hardhat configuration
```

## 🔧 **Essential Commands by Directory**

### **Root Directory (`/DePINSimulator/`)**

#### Start Services
```bash
# Start Graph Node infrastructure (first time)
docker-compose up -d

# Start Hardhat blockchain node
npx hardhat node

# Check Docker services status
docker-compose ps
```

#### Smart Contract Operations
```bash
# Compile contracts
npx hardhat compile

# Run tests (generates events for subgraph)
npx hardhat test --network localhost

# Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# Interactive console
npx hardhat console --network localhost
```

### **Subgraph Directory (`/subgraph/`)**
```bash
cd subgraph

# Generate types and build
npx graph codegen && npx graph build

# Create subgraph (first time only)
npx graph create --node http://localhost:8020/ participation-subgraph

# Deploy/update subgraph
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph
```

### **Frontend Directory (`/depin-ui/`)**
```bash
cd depin-ui

# Install dependencies
npm install

# Start React development server
npm start
```

## 🌐 **Important URLs**

| Service | URL | Purpose |
|---------|-----|---------|
| **Hardhat Node** | `http://localhost:8545` | Blockchain RPC endpoint |
| **GraphQL Playground** | `http://localhost:8000/subgraphs/name/participation-subgraph` | Query subgraph data |
| **Graph Node Admin** | `http://localhost:8020/` | Subgraph management |
| **IPFS** | `http://localhost:5001` | Decentralized storage |
| **React App** | `http://localhost:3000` | Frontend dashboard |

## 📋 **Common Workflows**

### **Daily Development**
1. **Start infrastructure** (in root directory):
   ```bash
   docker-compose up -d
   npx hardhat node
   ```

2. **Deploy contracts** (in root directory):
   ```bash
   npx hardhat run scripts/deploy.ts --network localhost
   ```

3. **Update subgraph** (in subgraph directory):
   ```bash
   cd subgraph
   # Update contract address in subgraph.yaml if needed
   npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph
   ```

4. **Generate test data** (in root directory):
   ```bash
   npx hardhat test --network localhost
   ```

### **Troubleshooting**

#### Reset Everything
```bash
# Stop all Docker containers
docker-compose down

# Remove data volumes (fresh start)
docker-compose down -v

# Restart infrastructure
docker-compose up -d
```

#### Check Logs
```bash
# View Graph Node logs
docker-compose logs graph-node

# View all service logs
docker-compose logs
```

## 🎯 **Key Configuration Files**

### **Contract Address** (update after deployment)
- File: `subgraph/subgraph.yaml`
- Current: `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`

### **Network Configuration**
- File: `hardhat.config.ts`
- Network: `localhost` (127.0.0.1:8545, chainId 31337)

## 📊 **Sample GraphQL Query**
```graphql
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
  stakes(orderBy: timestamp) {
    id
    nodeId
    staker
    amount
    timestamp
  }
  rewards(orderBy: timestamp) {
    id
    nodeId
    owner
    amount
    timestamp 
  }
}
```

## 🆘 **Quick Fixes**

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` on Graph commands | Start Docker: `docker-compose up -d` |
| Contract not found | Check address in `subgraph.yaml` matches deployment |
| No data in subgraph | Run tests to generate events: `npx hardhat test --network localhost` |
| Docker permission issues | Restart Docker Desktop |
| Port conflicts | Stop other services or change ports in docker-compose.yml |

## 🔄 **Typical Session Commands**

node rpc-relay.js
```bash
# Terminal 1: Infrastructure
docker-compose up -d
npx hardhat node

# Terminal 2: Development
npx hardhat test --network localhost
cd subgraph
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph

# Terminal 3: Frontend (optional)
cd depin-ui
npm start
```

**🎉 Your DePIN Simulator is ready for dashboard development!**

