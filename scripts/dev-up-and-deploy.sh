#!/usr/bin/env bash
set -euo pipefail

die() { echo "❌ $*" >&2; exit 1; }

jsonrpc_ok () {
  curl -sS -H 'Content-Type: application/json' \
    --data "$1" "$2" >/dev/null
}

echo "▶️  Reset Docker stack (fresh volumes)…"
docker compose down -v

echo "▶️  Start core services (postgres, ipfs, graph-node)…"
docker compose up -d postgres ipfs graph-node

echo "⏳ Wait for Postgres TCP (5432)…"
until nc -z localhost 5432; do sleep 1; done
echo "✅ Postgres listening."

echo "⏳ Wait for IPFS HTTP (5001)…"
until nc -z localhost 5001; do sleep 1; done
echo "✅ IPFS listening."

echo "⏳ Check host Hardhat JSON-RPC (8545)…"
# Require a running host hardhat node; fail fast if missing:
for i in {1..30}; do
  if jsonrpc_ok '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' http://localhost:8545; then
    echo "✅ Hardhat JSON-RPC responding."
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    die "Hardhat JSON-RPC not reachable on http://localhost:8545. Start it in another terminal: npx hardhat node --hostname 0.0.0.0"
  fi
done

echo "⏳ Wait for graph-node Admin GraphQL (:8030)…"
# Use a resilient loop with backoff; graph-node can restart a couple times on first boot.
for i in {1..120}; do
  if curl -sS -H 'Content-Type: application/json' \
      -d '{"query":"{ indexingStatuses { subgraph } }"}' \
      http://localhost:8030/graphql >/dev/null; then
    echo "✅ graph-node admin ready."
    break
  fi
  sleep 1
  if (( i % 10 == 0 )); then
    echo "…still waiting for graph-node (attempt $i); recent logs:"
    docker logs --tail=30 depinsimulator-graph-node-1 || true
  fi
  if [ $i -eq 120 ]; then
    die "graph-node admin not responding on :8030"
  fi
done

echo "⏳ Wait for graph-node deploy endpoint (:8020)…"
for i in {1..60}; do
  if curl -sS http://localhost:8020/ >/dev/null; then
    echo "✅ graph-node deploy endpoint ready."
    break
  fi
  sleep 1
  if [ $i -eq 60 ]; then
    die "graph-node deploy endpoint not responding on :8020"
  fi
done

echo "▶️  (Re)build + deploy subgraph…"
pushd subgraph >/dev/null
npx graph codegen
npx graph build
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph
popd >/dev/null
echo "✅ Subgraph deployed."

echo "▶️  Emit events (registerNode + recordUptime)…"
npx hardhat run scripts/emit-participation.ts --network localhost

echo "⏳ Query subgraph (HTTP)…"
echo "— Variant A (no /graphql):"
curl -sS -X POST http://localhost:8000/subgraphs/name/participation-subgraph \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } nodes { id } uptimes { id } }"}' || true
echo
echo "— Variant B (/graphql):"
curl -sS -X POST http://localhost:8000/subgraphs/name/participation-subgraph/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } nodes { id } uptimes { id } }"}' || true
echo

echo "▶️  Indexing status:"
curl -sS -H 'Content-Type: application/json' \
  -d '{"query":"{ indexingStatuses { subgraph health fatalError { message handler } chains { network latestBlock { number } chainHeadBlock { number } } } }"}' \
  http://localhost:8030/graphql || true
echo
