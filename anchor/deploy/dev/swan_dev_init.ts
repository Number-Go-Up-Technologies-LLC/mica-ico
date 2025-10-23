import * as anchor from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import {getKeypairFromFile} from "@solana-developers/helpers"
import path from 'path';
import { getSwanProgram } from "../../src/swan-exports";

const IDL = require("../../target/idl/swan.json");

(async () => {
  
let swanProgram: anchor.Program<Swan>;
let tokenProvider: any;

const programDeployerFile = path.resolve(__dirname, './programDeployerKeyPair.json');
    const programDeployer = await getKeypairFromFile(programDeployerFile);
    console.log("Program Deployer Public Key:", programDeployer.publicKey.toString())

    const tokenProviderFile = path.resolve(__dirname, './tokenProviderKeyPair.json');
    tokenProvider = await getKeypairFromFile(tokenProviderFile);

    const beneficiaryFile = path.resolve(__dirname, './beneficiary.json');
    const beneficiary = await getKeypairFromFile(beneficiaryFile);

    const safeguardFile = path.resolve(__dirname, './safeguard.json');
    const safeguard = await getKeypairFromFile(safeguardFile);

    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');  // Devnet connection

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(tokenProvider), {
      preflightCommitment: "confirmed",
    });

    swanProgram = getSwanProgram(provider);
    console.log("Program ID:", swanProgram.programId.toString())

    // Derive the state PDA
    const [statePda, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      swanProgram.programId
    );
    console.log("State PDA:", statePda.toString());

    try {
      await swanProgram.methods
        .init(
          tokenProvider.publicKey,  // Token Provider
          beneficiary.publicKey, // Beneficiary
          safeguard.publicKey // Safeguarding Account
        )
        .accounts({
          signer: tokenProvider.publicKey
        })
        .signers([tokenProvider])
        .rpc();

      const stateAccount = await swanProgram.account.state.fetch(statePda);
      console.log("State Account ->", stateAccount);
    } catch(error) {
      console.log(error);
      return;
    }
})();