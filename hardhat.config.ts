import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";

const PRIVATE_KEY = "0x56289e99fa13bec58bae3e908c4cf5e7e5cf7d08cb7c90a77cfa0d0b9a68944be"; // ⚠️ Replace this with your local Avalanche key (e.g. cli-teleporter)

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    localSubnet: {
      url: "http://127.0.0.1:56614/ext/bc/VJzNPCCvPagF82S7XzTUjjZDkJCPDXQ18XVAQt65TUtELEQNJ/rpc",
      chainId: 1974, // Or your actual subnet chain ID
      accounts: [PRIVATE_KEY]
    }
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  }
};

export default config;
