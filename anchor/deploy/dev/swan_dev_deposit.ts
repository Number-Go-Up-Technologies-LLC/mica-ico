import * as anchor from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import {getOrCreateAssociatedTokenAccount} from "@solana/spl-token"
import { Swan } from "../../target/types/swan";
import {getKeypairFromFile} from "@solana-developers/helpers"
import path from 'path';

const IDL = require("../../target/idl/swan.json");

(async () => {
  let swanProgram: anchor.Program<Swan>;
  let tokenProvider: any;

    const tokenProviderFile = path.resolve(__dirname, './tokenProviderKeyPair.json');
    tokenProvider = await getKeypairFromFile(tokenProviderFile);

    const beneficiaryFile = path.resolve(__dirname, './beneficiary.json');
    const beneficiary = await getKeypairFromFile(beneficiaryFile);

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');  // Devnet connection
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(tokenProvider), {
      preflightCommitment: "confirmed",
    });

    swanProgram = new anchor.Program(IDL, provider);

    // Replace the token mint publickey everytime you use create_test_token.ts
    const tokenMintPublicKey = new PublicKey("AvpAEHVrq48LMgyVKnhLc1yuMTyZm9kixkCPhp6odikW");
     const tokenProdiverATA = (await getOrCreateAssociatedTokenAccount(connection, tokenProvider, tokenMintPublicKey, tokenProvider.publicKey));
     console.log('Token Provider ATA ->', tokenProdiverATA.address);

     const [statePda, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      swanProgram.programId
    );

    await swanProgram.methods
      .deposit(
        new anchor.BN("1000000000000000000"), // amount of 1 bil SPL tokens with 9 decimals
      )
      .accounts({
        state: statePda,
        tokenAuthority: tokenProvider.publicKey,
        fromTokenAccount: tokenProdiverATA.address,
        tokenMint: tokenMintPublicKey,
      })
      .signers([tokenProvider])
      .rpc();

      console.log("Token has been deposited")
})();

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}