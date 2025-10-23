import * as anchor from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";
import { getSwanProgram } from "../../src/swan-exports";

(async () => {
  // Load keypairs
  const tokenProviderFile = path.resolve(__dirname, './tokenProviderKeyPair.json');
  const tokenProvider = await getKeypairFromFile(tokenProviderFile);
  
  const bandsKeyPairFile = path.resolve(__dirname, './bandsKeyPair.json');
  const bandsKeyPair = await getKeypairFromFile(bandsKeyPairFile);

  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  // Request airdrop if needed
  const balance = await connection.getBalance(tokenProvider.publicKey);
  if (balance < LAMPORTS_PER_SOL) {
    const signature = await connection.requestAirdrop(
      tokenProvider.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature);
  }

  // Setup provider and program
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(tokenProvider),
    { preflightCommitment: "confirmed" }
  );
  
  const program = getSwanProgram(provider);

  // Derive state PDA
  const [statePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );

  try {
    // Initialize the program with explicit type casting
    await (program.methods as any)
      .init(
        tokenProvider.publicKey,
        bandsKeyPair.publicKey,
        bandsKeyPair.publicKey
      )
      .accounts({
        signer: tokenProvider.publicKey,
      })
      .signers([tokenProvider])
      .rpc();

    console.log("Program initialized successfully");
    console.log("State PDA:", statePda.toString());
    console.log("Token Provider:", tokenProvider.publicKey.toString());
    console.log("Beneficiary:", bandsKeyPair.publicKey.toString());
  } catch (error) {
    console.error("Error initializing program:", error);
  }
})();
