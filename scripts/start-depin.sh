#!/bin/bash
set -e

echo "🚀 Starting DePIN Infrastructure..."

# Step 1: Start Hardhat node in background
echo "1️⃣ Starting Hardhat node..."
npx hardhat node --hostname 0.0.0.0 &
HARDHAT_PID=$!
sleep 10  # Wait for Hardhat to fully start

# Step 2: Start Docker services
echo "2️⃣ Starting Docker services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
while ! curl -s http://localhost:8000 > /dev/null; do
  echo "Waiting for Graph Node..."
  sleep 5
done

# Step 3: Deploy contracts FIRST
echo "3️⃣ Deploying contracts..."
npx hardhat run scripts/deploy.ts --network localhost

# Get current block number AFTER deployment
CURRENT_BLOCK=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://localhost:8545 | jq -r '.result' | xargs printf "%d\n")

echo "📦 Contracts deployed at block: $CURRENT_BLOCK"

# Step 4: Update subgraph config with CORRECT start block
echo "4️⃣ Updating subgraph configuration..."
cd subgraph

# Update subgraph.yaml with current block (NOT block 1)
sed -i.bak "s/startBlock: [0-9]*/startBlock: $CURRENT_BLOCK/g" subgraph.yaml

# Step 5: Deploy subgraph AFTER contracts
echo "5️⃣ Deploying subgraph..."
npm run codegen
npm run remove-local 2>/dev/null || true  # Remove if exists
npm run create-local
npm run deploy-local

echo "✅ DePIN infrastructure started successfully!"
echo "🌐 Frontend: http://localhost:3000"
echo "📊 GraphQL: http://localhost:8000/subgraphs/name/participation-subgraph"
echo "🔗 Hardhat: http://localhost:8545"

# Keep Hardhat running
wait $HARDHAT_PID
