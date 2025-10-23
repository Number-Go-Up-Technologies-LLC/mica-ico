import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

// To run this file please use `npx tsx ./swan_prod_deposit.ts`

const IDL = require("../../target/idl/swan.json");
const tokenMintPublicKey = new PublicKey(
  "bMVandB3Xv8cY8x5p7j1QD18aorkxdSGdwgYdcqSWAN"
);

(async () => {
  let swanProgram: anchor.Program<Swan>;
  let tokenProvider: any;

  const tokenProviderFile = path.resolve(
    __dirname,
    "./tokenProviderKeyPair.json"
  );
  tokenProvider = await getKeypairFromFile(tokenProviderFile);

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
      skipPreflight: false, // Set to true if needed
    }
  );

  swanProgram = new anchor.Program(IDL, provider);

  const tokenProdiverATA = await getOrCreateAssociatedTokenAccount(
    connection,
    tokenProvider,
    tokenMintPublicKey,
    tokenProvider.publicKey
  );
  console.log("Token Provider ATA is: ", tokenProdiverATA.address);
  if (!tokenProdiverATA.address.equals(new PublicKey("F24uMJMs3iNQpdKgvd6LTKKpoi59QH9hTDkAXNt1tcsh"))) {
    throw new Error("Unexpected Token Provider ATA address");
  }

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
      .deposit(
        new anchor.BN("750000000000000000") // amount 750m SPL tokens with 9 decimals / Please remember to keep it as string.
      )
      .accounts({
        state: statePda,
        tokenAuthority: tokenProvider.publicKey,
        fromTokenAccount: tokenProdiverATA.address,
        tokenMint: tokenMintPublicKey,
      })
      .preInstructions([addPriorityFee])
      .signers([tokenProvider])
      .rpc({
        skipPreflight: false,
        maxRetries: 3,
        commitment: "confirmed"
      });

    console.log("Transaction signature:", tx);
    console.log("Token has been deposited to ICO");
  } catch (err) {
    console.log(err);
  }
})();
