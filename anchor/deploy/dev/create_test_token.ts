import * as anchor from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

(async () => {
  // Load token provider keypair
  const tokenProviderFile = path.resolve(__dirname, './tokenProviderKeyPair.json');
  const tokenProvider = await getKeypairFromFile(tokenProviderFile);

  // Log the public key that needs funding
  console.log("Token Provider Public Key (needs funding):", tokenProvider.publicKey.toString());

  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // Check and log current balance
  const balance = await connection.getBalance(tokenProvider.publicKey);
  console.log("Current balance:", balance / LAMPORTS_PER_SOL, "SOL");

  // Create new token mint
  const tokenMint = await createMint(
    connection,
    tokenProvider,
    tokenProvider.publicKey,
    tokenProvider.publicKey,
    9 // 9 decimals
  );

  console.log("Token Mint created:", tokenMint.toBase58());

  // Create token provider's ATA
  const tokenProviderATA = await getOrCreateAssociatedTokenAccount(
    connection,
    tokenProvider,
    tokenMint,
    tokenProvider.publicKey
  );

  // Mint 1 billion tokens to token provider
  await mintTo(
    connection,
    tokenProvider,
    tokenMint,
    tokenProviderATA.address,
    tokenProvider,
    1_000_000_000_000_000_000 // 1 billion tokens with 9 decimals
  );

  console.log("Tokens minted to:", tokenProviderATA.address.toBase58());
})();
