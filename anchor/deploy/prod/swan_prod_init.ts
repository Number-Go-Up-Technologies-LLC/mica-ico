import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";
import { getSwanProgram } from "../../src/swan-exports";

const IDL = require("../../target/idl/swan.json");

const beneficiary = new PublicKey(
  "2GkivdkdoxSuZHSHA91sfh4rnSAMWUKiJUYJSKFt3z8K"
);
const safeguard = new PublicKey("JR3EEeZJh5K8YLwBW8HeFBggoEZacAuLtuCcxtVwau8");

const tokenProviderPubKey = new PublicKey("HRfEvBeQ4VDh6Z3mjJTgrE14htcYcFDZXkyegsNJh4dw");

(async () => {
  let swanProgram: anchor.Program<Swan>;

  // Please add the token provider keypair here.
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

  swanProgram = getSwanProgram(provider);
  console.log("Program ID:", swanProgram.programId.toString());

  // Derive the state PDA
  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    swanProgram.programId
  );
  console.log("State PDA:", statePda.toString());

  try {
    await swanProgram.methods
      .init(
        tokenProviderPubKey, // Token Provider
        beneficiary, // Beneficiary
        safeguard // Safeguarding Account
      )
      .accounts({
        signer: programDeployer.publicKey,
      })
      .signers([programDeployer])
      .rpc();

    const stateAccount = await swanProgram.account.state.fetch(statePda);
    console.log("State Account ->", stateAccount);
  } catch (error) {
    console.log(error);
    return;
  }
})();
