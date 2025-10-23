import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

const IDL = require("../../target/idl/swan.json");

(async () => {
  let swanProgram: anchor.Program<Swan>;

  const tokenProviderFile = path.resolve(
    __dirname,
    "./tokenProviderKeyPair.json"
  );
  const tokenProvider = await getKeypairFromFile(tokenProviderFile);

  const connection = new Connection(
    clusterApiUrl("mainnet-beta"),
    {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30000, // 30 seconds
    }
  );

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(tokenProvider),
    {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
      skipPreflight: false,
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

  try {
    const addPriorityFee = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 5_000_000
    });

    const tx = await swanProgram.methods
      .safeguard()
      .accounts({
        state: statePda,
        tokenProvider: tokenProvider.publicKey,
        safeguardingAccount: new PublicKey("JR3EEeZJh5K8YLwBW8HeFBggoEZacAuLtuCcxtVwau8"),
      })
      .preInstructions([addPriorityFee])
      .signers([tokenProvider])
      .rpc({
        skipPreflight: false,
        maxRetries: 3,
        commitment: "confirmed"
      });

    console.log("Transaction signature:", tx);
    console.log("Safeguard has been activated");

    const stateAccount = await swanProgram.account.state.fetch(statePda);
    console.log("State Account ->", stateAccount);
  } catch (error) {
    console.error("Error activating safeguard:", error);
    throw error;
  }
})();