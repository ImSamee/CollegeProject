import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying NeuroLedger...");
  console.log("Deployer account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Get the contract factory and deploy
  const NeuroLedger = await hre.ethers.getContractFactory("NeuroLedger");
  const contract = await NeuroLedger.deploy();

  console.log("⏳ Waiting for block confirmation...");
  
  // Wait for the blockchain to mine the transaction
  await contract.waitForDeployment(); 

  const deployedAddress = await contract.getAddress();
  console.log("\n✅ SUCCESS! NeuroLedger officially deployed to:", deployedAddress);
  console.log("👉 Next Step: Copy this address into your .env files!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});