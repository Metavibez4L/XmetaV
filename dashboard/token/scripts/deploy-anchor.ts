import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AgentMemoryAnchor with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const Factory = await ethers.getContractFactory("AgentMemoryAnchor");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AgentMemoryAnchor deployed to:", address);
  console.log("");
  console.log("Add to bridge/.env:");
  console.log(`ANCHOR_CONTRACT_ADDRESS=${address}`);
  console.log("");
  console.log("Verify on Basescan:");
  console.log(`npx hardhat verify --network base ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
