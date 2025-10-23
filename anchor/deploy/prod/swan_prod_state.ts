import * as anchor from "@coral-xyz/anchor";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

const IDL = require("../../target/idl/swan.json");
import { getSwanProgram } from "../../src";

(async () => {
  const programDeployerFile = path.resolve(
    __dirname,
    "./programDeployerKeyPair.json"
  );
  const programDeployer = await getKeypairFromFile(programDeployerFile);

  const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed"); // Devnet connection
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(programDeployer),
    {
      preflightCommitment: "confirmed",
    }
  );
  const program = getSwanProgram(provider);
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    program.programId
  );

  const stateAccount = await (program.account as any).state.fetch(statePda);

  console.log("State account being logged .........");
  console.log(stateAccount)
  console.log("Logging state account ended.........")
  console.log("Getting Specific State Account Data ......")
  console.log(" the program id is: ", program.programId);
  // Log the values with conversion where necessary
  console.log("participationEnd:", stateAccount.participationEnd.toString());
  console.log(
    "raiseCap (in SOL):",
    stateAccount.raiseCap.toNumber() / LAMPORTS_PER_SOL
  );

  // Convert totalContributed from lamports to SOL
  const totalContributedSol =
    stateAccount.totalContributed.toNumber() / LAMPORTS_PER_SOL;
  console.log("totalContributed (in SOL):", totalContributedSol);

  const totalTokensLamports = stateAccount.totalTokens.toString();
  const totalTokensSol = parseFloat(totalTokensLamports) / LAMPORTS_PER_SOL;
  console.log("totalTokens (in SWAN):", totalTokensSol);

  // Convert recipientLamports from lamports to SOL
  const recipientLamportsSol =
    stateAccount.recipientLamports.toNumber() / LAMPORTS_PER_SOL;
  console.log("recipientLamports (in SOL):", recipientLamportsSol);

  // total cancelled
  const totalCancelled =
    stateAccount.totalCancelled.toNumber() / LAMPORTS_PER_SOL;
  console.log("totalCancelled (in SOL):", totalCancelled);

})();
