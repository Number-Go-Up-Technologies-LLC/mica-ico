import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

const IDL = require("../../target/idl/swan.json");
import { getSwanProgram } from "../../src";

const swanAddress = new PublicKey(
  "Dnu28pWdEj7C8NbZf8Yt9FuMSNG1c2djC5mDjqi6yMaV"
);

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

  const bandsKeyPairFile = path.resolve(__dirname, "./bandsKeyPair.json");
  bandsKeyPair = await getKeypairFromFile(bandsKeyPairFile);
  console.log("bandsKeyPair", bandsKeyPair.publicKey.toString());
  //2MQSNU1WQ9vhR9ov4f8sDQuCTC5n5fgFKnS1RJYDiBuL
  const programStateKeyPairFile = path.resolve(
    __dirname,
    "./programStateKeyPair.json"
  );
  const programStateKeyPair = await getKeypairFromFile(programStateKeyPairFile);
  console.log("programStateKeyPair", programStateKeyPair.publicKey.toString());
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // Devnet connection
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(programStateKeyPair),
    {
      preflightCommitment: "confirmed",
    }
  );
  const program = getSwanProgram(provider);
  //swanProgram = new anchor.Program(IDL, provider);

  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );

  const stateAccount = await (program.account as any).state.fetch(statePda);
  
  console.log("State Account ->", stateAccount);
  // Conversion factor from lamports to SOL

  // Log the values with conversion where necessary
  console.log("participationEnd:", stateAccount.participationEnd.toString());
  console.log(
    "raiseCap (in SOL):",
    stateAccount.raiseCap.toNumber() / LAMPORTS_PER_SOL
  );

  // Convert totalContributed from lamports to SOL
  const totalContributedSol = stateAccount.totalContributed.toNumber() / LAMPORTS_PER_SOL;
  console.log("totalContributed (in SOL):", totalContributedSol);

  // Log totalTokens converted from lamports to SOL
  const totalTokensSol = stateAccount.totalTokens.toNumber() / LAMPORTS_PER_SOL;
  console.log("totalTokens (in SOL):", totalTokensSol);

  // Convert recipientLamports from lamports to SOL
  const recipientLamportsSol =
    stateAccount.recipientLamports.toNumber() / LAMPORTS_PER_SOL;
  console.log("recipientLamports (in SOL):", recipientLamportsSol);

  // total cancelled
  const totalCancelled = stateAccount.totalCancelled.toNumber() / LAMPORTS_PER_SOL;
  console.log("totalCancelled (in SOL):", totalCancelled);

})();
