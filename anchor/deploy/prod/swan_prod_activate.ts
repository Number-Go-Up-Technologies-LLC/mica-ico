import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";
import * as readline from 'readline';

const IDL = require("../../target/idl/swan.json");

// Add helper function to calculate time difference
function getTimeUntilTarget() {
  const targetDate = new Date('2025-01-13T20:00:00');
  const now = new Date();
  const diffSeconds = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
  
  const days = Math.floor(diffSeconds / (24 * 60 * 60));
  const hours = Math.floor((diffSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((diffSeconds % (60 * 60)) / 60);
  const seconds = diffSeconds % 60;
  
  return {
    totalSeconds: diffSeconds,
    formatted: `${days}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  };
}

// Add confirmation prompt
function askForConfirmation(timeStr: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`Time until activation: ${timeStr}\nProceed with activation? (y/n) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

(async () => {
  let swanProgram: anchor.Program<Swan>;

  const tokenProviderFile = path.resolve(
    __dirname,
    "./tokenProviderKeyPair.json"
  );
  const tokenProvider = await getKeypairFromFile(tokenProviderFile);

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed"); // Devnet connection
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(tokenProvider),
    {
      preflightCommitment: "confirmed",
    }
  );

  swanProgram = new anchor.Program(IDL, provider);

  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    swanProgram.programId
  );

  console.log("State PDA is: ", statePda);
  if (!statePda.equals(new PublicKey("8yNEGapcYsShRedngtaVHPAJy5ujhHeY2KuKrR1zzfRZ"))) {
    throw new Error("Unexpected State PDA address");
  }

  const timeUntil = getTimeUntilTarget();
  console.log("Time until activation: ", timeUntil.totalSeconds);
  const confirmed = await askForConfirmation(timeUntil.formatted);
  
  if (!confirmed) {
    console.log("Activation cancelled");
    return;
  }

  try {
    await swanProgram.methods
      .activate(
        new anchor.BN(timeUntil.totalSeconds)
      )
      .accounts({
        state: statePda,
        tokenProvider: tokenProvider.publicKey,
      })
      .signers([tokenProvider])
      .rpc();

    console.log("SWAN ICO ACTIVATED.....");
  } catch (err) {
    console.log(err);
  }
})();
