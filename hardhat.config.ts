import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    localSubnet: {
      url: "http://127.0.0.1:56614/ext/bc/VJzNPCCvPagF82S7XzTUjjZDkJCPDXQ18XVAQt65TUtELEQNJ/rpc",
      chainId: 1974,
      accounts: [
        "0x9944ae85cd7356f6f7417bbd483cf4ac532203603097e7d03e12445e9953b679",
        "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"
      ]
    }
  }
};

export default config;
