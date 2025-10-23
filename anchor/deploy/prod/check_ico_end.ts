import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";
import * as readline from 'readline';
import dotenv from 'dotenv';
const IDL = require("../../target/idl/swan.json");

// Load .env.local from the project root
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

// Get values from .env.local
const STATE_PUBKEY = new PublicKey(process.env.NEXT_PUBLIC_STATE_WALLET!);
const RPC_URL = process.env.NEXT_PUBLIC_RPC_MAINNET!;

(async () => {
  try {
    // Connect to mainnet using the RPC URL from .env
    const connection = new Connection(RPC_URL);
    
    // Create a read-only provider
    const provider = new anchor.AnchorProvider(
      connection,
      // Use a dummy wallet since we're only reading
      new anchor.Wallet(anchor.web3.Keypair.generate()),
      { commitment: "confirmed" }
    );

    // Initialize program directly instead of using getSwanProgram
    let swanProgram: anchor.Program<Swan>;
    swanProgram = new anchor.Program(IDL, provider);
    // Fetch the state account
    const stateAccount = await swanProgram.account.state.fetch(STATE_PUBKEY);
    
    const participationEnd = stateAccount.participationEnd.toNumber();
    const currentTime = Math.floor(Date.now() / 1000);
    
    console.log("\nICO Status:");
    console.log("--------------------");
    console.log(`End Time: ${new Date(participationEnd * 1000).toLocaleString()}`);
    
    if (currentTime < participationEnd) {
      const remaining = participationEnd - currentTime;
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      console.log("\nTime Remaining:");
      console.log(`${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`);
    } else {
      console.log("\nICO has ended");
      console.log(`Ended ${Math.floor((currentTime - participationEnd) / 86400)} days ago`);
    }

    // Show additional ICO stats
    const totalContributed = stateAccount.totalContributed.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    const raiseCap = stateAccount.raiseCap.toNumber() / anchor.web3.LAMPORTS_PER_SOL;
    
    console.log("\nICO Progress:");
    console.log("--------------------");
    console.log(`Total Contributed: ${totalContributed.toFixed(2)} SOL`);
    console.log(`Raise Cap: ${raiseCap.toFixed(2)} SOL`);
    console.log(`Progress: ${((totalContributed / raiseCap) * 100).toFixed(2)}%`);

  } catch (error) {
    console.error("Error fetching ICO end time:", error);
  }
})(); 