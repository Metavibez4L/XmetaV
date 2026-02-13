import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n  Deploying $XMETAV ERC-20 token");
  console.log("  ──────────────────────────────");
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(`  Network:   ${(await ethers.provider.getNetwork()).name} (${(await ethers.provider.getNetwork()).chainId})`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance:   ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    throw new Error("Deployer has no ETH for gas");
  }

  // Deploy
  const XMETAV = await ethers.getContractFactory("XMETAV");
  const token = await XMETAV.deploy();
  await token.waitForDeployment();

  const address = await token.getAddress();
  const tx = token.deploymentTransaction();

  console.log(`  Contract:  ${address}`);
  console.log(`  TX Hash:   ${tx?.hash}`);
  console.log(`  Block:     ${tx?.blockNumber ?? "pending..."}`);

  // Read on-chain values
  const totalSupply = await token.totalSupply();
  const symbol = await token.symbol();
  const name = await token.name();
  const deployerBalance = await token.balanceOf(deployer.address);

  console.log(`\n  Token:     ${name} (${symbol})`);
  console.log(`  Supply:    ${ethers.formatUnits(totalSupply, 18)}`);
  console.log(`  Deployer:  ${ethers.formatUnits(deployerBalance, 18)} ${symbol}`);

  // Save config
  const config = {
    name,
    symbol,
    address,
    deployer: deployer.address,
    totalSupply: totalSupply.toString(),
    txHash: tx?.hash ?? null,
    blockNumber: tx?.blockNumber ?? null,
    network: "eip155:8453",
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
  };

  const configPath = join(__dirname, "..", "token-config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`\n  Config saved to token-config.json`);
  console.log(`  Add XMETAV_TOKEN_ADDRESS=${address} to your .env files\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
