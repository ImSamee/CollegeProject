import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const contractAddress = process.env.NEUROLEDGER_CONTRACT_ADDRESS?.replace(/["'“”]/g, "").trim();
  const patientWallet = process.env.PATIENT_WALLET_ADDRESS?.replace(/["'“”]/g, "").trim(); 

  if (!contractAddress) throw new Error("Missing NEUROLEDGER_CONTRACT_ADDRESS in .env");
  if (!patientWallet) throw new Error("Missing PATIENT_WALLET_ADDRESS in .env");

  console.log(`🔗 Connecting to NeuroLedger at: ${contractAddress}`);

  // 1. Get the deployer wallet and its current network Nonce
  const [deployer] = await hre.ethers.getSigners();
  let currentNonce = await deployer.getNonce();
  console.log(`🔑 Bypassing RPC limits. Starting with Nonce: ${currentNonce}`);
  
  const NeuroLedger = await hre.ethers.getContractFactory("NeuroLedger");
  const contract = NeuroLedger.attach(contractAddress);

  const doctors = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Dr. Sarah Lee
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Dr. Marcus Thorne
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // Dr. Elena Vance
    "0xc569398e26d53e1eA6F07f73cc8F786808814d16"  // Dr. Custom
  ];

  console.log("\n👨‍⚕️ Rapid-firing Doctor Registrations...");
  for (let doc of doctors) {
    try {
      // We manually increment the nonce and DO NOT wait for confirmation!
      const tx = await contract.addDoctor(doc, { 
        gasLimit: 150000,
        nonce: currentNonce++ 
      });
      console.log(`   ➡️  Tx sent for ${doc.slice(0,8)}... Hash: ${tx.hash}`);
    } catch (error) {
      console.error(`   ❌ Failed to send Tx for ${doc}. Error:`, error.message || error);
    }
  }

  const patientId = "0x" + "02".repeat(32);
  const consentHash = "0x" + "aa".repeat(32);

  console.log(`\n🏥 Rapid-firing Demo Patient Registration...`);
  try {
    const tx = await contract.registerPatient(patientId, patientWallet, consentHash, { 
      gasLimit: 250000,
      nonce: currentNonce++ 
    });
    console.log(`   ➡️  Tx sent! Hash: ${tx.hash}`);
  } catch (error) {
    if (error.message && error.message.includes("Already registered")) {
      console.log(`   ℹ️ Patient is already registered.`);
    } else {
      console.error("   ❌ Error sending patient Tx:", error.message || error);
    }
  }

  console.log("\n🎉 ALL TRANSACTIONS SENT TO MEMPOOL!");
  console.log("⏳ They will be confirmed by Sepolia automatically in about 15 seconds.");
  console.log("👉 You can now restart your Python backend and test the React frontend!");
}

main().catch((error) => {
  console.error("Fatal Error:", error);
  process.exitCode = 1;
});