import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying NeuroLedger...");
  console.log("Deployer account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Get the contract factory and deploy
  const NeuroLedger = await hre.ethers.getContractFactory("NeuroLedger");
  const contract = await NeuroLedger.deploy();

  console.log("🔗 Transaction Sent! Hash:", contract.deploymentTransaction().hash);
  console.log("⏳ Waiting for Sepolia to confirm (this takes 30-60 seconds)...");
  
  // Wait for the blockchain to mine the transaction
  const receipt = await contract.deploymentTransaction().wait(1); 

  const deployedAddress = await contract.getAddress();
  console.log("\n✅ SUCCESS! NeuroLedger officially deployed to:", deployedAddress);
  console.log("👉 Next Step: Copy this address into your .env files!");
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});