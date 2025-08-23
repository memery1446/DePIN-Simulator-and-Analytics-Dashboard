#!/bin/bash
echo "🛑 Stopping DePIN Infrastructure..."

# Stop Docker services
docker-compose down

# Kill Hardhat processes
pkill -f "hardhat node" || true

echo "✅ All services stopped"