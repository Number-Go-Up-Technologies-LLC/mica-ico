import * as anchor from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

const IDL = require("../../target/idl/swan.json");

(async () => {
  let swanProgram: anchor.Program<Swan>;
  let tokenProvider: any;
  let bandsKeyPair: any;

  const programDeployerFile = path.resolve(
    __dirname,
    "./programDeployerKeyPair.json"
  );
  const programDeployer = await getKeypairFromFile(programDeployerFile);

  const tokenProviderFile = path.resolve(
    __dirname,
    "./tokenProviderKeyPair.json"
  );
  tokenProvider = await getKeypairFromFile(tokenProviderFile);

  const beneficiaryFile = path.resolve(__dirname, "./beneficiary.json");
  const beneficiary = await getKeypairFromFile(beneficiaryFile);

  const safeguardFile = path.resolve(__dirname, "./safeguard.json");
  const safeguard = await getKeypairFromFile(safeguardFile);

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // Devnet connection
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(programDeployer),
    {
      preflightCommitment: "confirmed",
    }
  );

  swanProgram = new anchor.Program(IDL, provider);

  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    swanProgram.programId
  );

  try {
    const transaction = await swanProgram.methods
      .distribute()
      .accounts({
        state: statePda,
        beneficiary: beneficiary.publicKey,
      })
      .signers([beneficiary])
      .transaction();

    const signature = await connection.sendTransaction(transaction, [
      beneficiary,
    ]);
    console.log("SIGNATURE", signature);

    const stateAccount = await swanProgram.account.state.fetch(statePda);
    console.log("State Account ->", stateAccount);
  } catch (e) {
    console.log(e);
    return;
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
