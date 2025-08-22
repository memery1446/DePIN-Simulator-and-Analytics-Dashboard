#!/usr/bin/env node

const { execSync } = require('child_process');

class SubgraphDebugger {
    constructor() {
        this.graphNodeUrl = 'http://localhost:8030';
        this.graphQueryUrl = 'http://localhost:8000';
        this.ipfsUrl = 'http://localhost:5001';
        this.subgraphName = 'participation-subgraph';
        this.subgraphId = 'QmZLzVNuyvwTNEJigmAKMw4YeepKRQzLqk9BizZyRgubV7';
    }

    async checkDockerServices() {
        console.log('🐳 CHECKING DOCKER SERVICES');
        console.log('=' .repeat(50));

        try {
            const result = execSync('docker-compose ps', { encoding: 'utf8' });
            console.log(result);

            // Check specific containers
            const containers = ['graph-node', 'postgres', 'ipfs'];
            for (const container of containers) {
                try {
                    const status = execSync(`docker-compose ps ${container}`, { encoding: 'utf8' });
                    console.log(`✅ ${container}: Running`);
                } catch (e) {
                    console.log(`❌ ${container}: Not running`);
                }
            }
        } catch (error) {
            console.log('❌ Docker compose not running or error:', error.message);
        }
    }

    async checkGraphNodeHealth() {
        console.log('\n🩺 CHECKING GRAPH NODE HEALTH');
        console.log('=' .repeat(50));

        try {
            // Check admin endpoint
            const adminResponse = await fetch(`${this.graphNodeUrl}/`);
            console.log(`✅ Graph Node Admin (${this.graphNodeUrl}): ${adminResponse.status}`);
        } catch (error) {
            console.log(`❌ Graph Node Admin: ${error.message}`);
        }

        try {
            // Check query endpoint
            const queryResponse = await fetch(`${this.graphQueryUrl}/`);
            console.log(`✅ Graph Node Query (${this.graphQueryUrl}): ${queryResponse.status}`);
        } catch (error) {
            console.log(`❌ Graph Node Query: ${error.message}`);
        }

        try {
            // Check IPFS
            const ipfsResponse = await fetch(`${this.ipfsUrl}/api/v0/version`, { method: 'POST' });
            console.log(`✅ IPFS (${this.ipfsUrl}): ${ipfsResponse.status}`);
        } catch (error) {
            console.log(`❌ IPFS: ${error.message}`);
        }
    }

    async checkSubgraphStatus() {
        console.log('\n📊 CHECKING SUBGRAPH STATUS');
        console.log('=' .repeat(50));

        try {
            // Check subgraph deployment status
            const statusQuery = `
                query {
                    indexingStatusForCurrentVersion(subgraphName: "${this.subgraphName}") {
                        synced
                        health
                        fatalError {
                            message
                            block {
                                number
                                hash
                            }
                        }
                        chains {
                            chainHeadBlock {
                                number
                            }
                            latestBlock {
                                number
                            }
                        }
                    }
                }
            `;

            const response = await fetch(`${this.graphNodeAdminUrl}/graphql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: statusQuery })
            });

            const result = await response.json();
            console.log('📈 Subgraph indexing status:');
            console.log(JSON.stringify(result, null, 2));

        } catch (error) {
            console.log(`❌ Failed to get subgraph status: ${error.message}`);
        }
    }

    async checkSubgraphList() {
        console.log('\n📋 CHECKING DEPLOYED SUBGRAPHS');
        console.log('=' .repeat(50));

        try {
            const listQuery = `
                query {
                    subgraphDeployments {
                        id
                        manifest {
                            dataSources {
                                name
                                network
                                source {
                                    address
                                    startBlock
                                }
                            }
                        }
                    }
                }
            `;

            const response = await fetch(`${this.graphNodeAdminUrl}/graphql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: listQuery })
            });

            const result = await response.json();
            console.log('📋 Deployed subgraphs:');
            console.log(JSON.stringify(result, null, 2));

        } catch (error) {
            console.log(`❌ Failed to list subgraphs: ${error.message}`);
        }
    }

    async checkBlockchain() {
        console.log('\n⛓️  CHECKING BLOCKCHAIN STATUS');
        console.log('=' .repeat(50));

        try {
            // Check if hardhat node is running
            const rpcResponse = await fetch('http://localhost:8545', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_blockNumber',
                    params: [],
                    id: 1
                })
            });

            const rpcResult = await rpcResponse.json();
            const blockNumber = parseInt(rpcResult.result, 16);
            console.log(`✅ Hardhat node running, current block: ${blockNumber}`);

            // Check if contracts are deployed at expected addresses
            const contractAddresses = [
                { name: 'DPNToken', address: '0x5FbDB2315678afecb367f032d93F642f64180aa3' },
                { name: 'Participation', address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' },
                { name: 'StakingPool', address: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' },
                { name: 'NodeRights', address: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' },
                { name: 'NodeRegistry', address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' }
            ];

            for (const contract of contractAddresses) {
                try {
                    const codeResponse = await fetch('http://localhost:8545', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_getCode',
                            params: [contract.address, 'latest'],
                            id: 1
                        })
                    });

                    const codeResult = await codeResponse.json();
                    const hasCode = codeResult.result && codeResult.result !== '0x';
                    console.log(`${hasCode ? '✅' : '❌'} ${contract.name} at ${contract.address}: ${hasCode ? 'Deployed' : 'No code'}`);
                } catch (error) {
                    console.log(`❌ Error checking ${contract.name}: ${error.message}`);
                }
            }

        } catch (error) {
            console.log(`❌ Hardhat node not running: ${error.message}`);
        }
    }

    async checkGraphNodeLogs() {
        console.log('\n📄 CHECKING GRAPH NODE LOGS');
        console.log('=' .repeat(50));

        try {
            const logs = execSync('docker-compose logs --tail=20 graph-node', { encoding: 'utf8' });
            console.log('Recent Graph Node logs:');
            console.log(logs);
        } catch (error) {
            console.log(`❌ Failed to get logs: ${error.message}`);
        }
    }

    async testSimpleQuery() {
        console.log('\n🔍 TESTING SIMPLE SUBGRAPH QUERY');
        console.log('=' .repeat(50));

        try {
            const query = `
                query {
                    _meta {
                        block {
                            number
                        }
                    }
                }
            `;

            const response = await fetch(`${this.graphQueryUrl}/subgraphs/name/${this.subgraphName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const result = await response.json();
            console.log('Meta query result:');
            console.log(JSON.stringify(result, null, 2));

        } catch (error) {
            console.log(`❌ Failed to query subgraph: ${error.message}`);
        }
    }

    async runFullDiagnosis() {
        console.log('🔧 SUBGRAPH FULL DIAGNOSIS');
        console.log('=' .repeat(70));

        await this.checkDockerServices();
        await this.checkGraphNodeHealth();
        await this.checkBlockchain();
        await this.checkSubgraphStatus();
        await this.checkSubgraphList();
        await this.checkGraphNodeLogs();
        await this.testSimpleQuery();

        console.log('\n💡 COMMON SOLUTIONS:');
        console.log('=' .repeat(50));
        console.log('1. Wait 30-60 seconds for subgraph to start syncing');
        console.log('2. Check that all ABI files exist in ./abis/ directory');
        console.log('3. Restart graph node: docker-compose restart graph-node');
        console.log('4. Redeploy subgraph: npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 participation-subgraph');
        console.log('5. Check if startBlock in subgraph.yaml is correct (should be 0 for localhost)');
    }
}

// Run the diagnosis
const diagnostic = new SubgraphDebugger();
diagnostic.runFullDiagnosis().catch(console.error);