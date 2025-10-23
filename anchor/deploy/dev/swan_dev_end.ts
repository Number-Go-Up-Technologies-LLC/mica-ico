import * as anchor from "@coral-xyz/anchor";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { Swan } from "../../target/types/swan";
import { getKeypairFromFile } from "@solana-developers/helpers";
import path from "path";

const IDL = require("../../target/idl/swan.json");

(async () => {
  let swanProgram: anchor.Program<Swan>;
  let tokenProvider: any;

  const tokenProviderFile = path.resolve(
    __dirname,
    "./tokenProviderKeyPair.json"
  );
  tokenProvider = await getKeypairFromFile(tokenProviderFile);

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // Devnet connection
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(tokenProvider),
    {
      preflightCommitment: "confirmed",
    }
  );

  swanProgram = new anchor.Program(IDL, provider);

  const [statePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    swanProgram.programId
  );

  await swanProgram.methods
    .end()
    .accounts({
      state: statePda,
      tokenProvider: tokenProvider.publicKey,
    })
    .signers([tokenProvider])
    .rpc();

  const stateAccount = await swanProgram.account.state.fetch(statePda);

  console.log("State Account ->", stateAccount);

  console.log("SWAN ICO ENDED");
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
