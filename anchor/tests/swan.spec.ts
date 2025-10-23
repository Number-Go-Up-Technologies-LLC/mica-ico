import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { Swan } from "../target/types/swan";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccount, createMint, getAccount, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
const IDL = require("../target/idl/swan.json");

const swanAddress = new PublicKey(
  "Dnu28pWdEj7C8NbZf8Yt9FuMSNG1c2djC5mDjqi6yMaV"
);

// This test currently runs directly with the local network cluster. 
// Please remember to deploy the program to the local network while running the test.
// To run the code please use anchor test --skip-local-validator  
describe("swan", () => {
  // Configure the client to use the local cluster.
  let swanProgram: Program<Swan>;
  let tokenMint: PublicKey;
  let tokenProdiverATA: any;
  const tokenProvider = anchor.web3.Keypair.generate();
  const Beneficiary  = anchor.web3.Keypair.generate();
  const safeGuard = anchor.web3.Keypair.generate();
  const stateWallet = anchor.web3.Keypair.generate();


  const participant = anchor.web3.Keypair.generate();
  const participant2 = anchor.web3.Keypair.generate();
  const participant3 = anchor.web3.Keypair.generate();
  
  let stateAta: any;
  let statePda: PublicKey;
  
  beforeAll(async () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    swanProgram = anchor.workspace.Swan as Program<Swan>;
    
    // Derive state PDA
    [statePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      swanProgram.programId
    );

    console.log("Program ID ->", swanProgram.programId.toString());
    console.log("State PDA ->", statePda.toString());
    console.log("Token Provider Public Key ->", tokenProvider.publicKey.toString());
    console.log("Beneficiary Public Key ->", Beneficiary.publicKey.toString());
    console.log("Safe Guard Public Key ->", safeGuard.publicKey.toString());
  },50000 * 60);

  it("Initialize Swan", async () => {

    const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
      tokenProvider.publicKey,
      LAMPORTS_PER_SOL // Adjust based on the expected fees
    );
    await anchor.getProvider().connection.confirmTransaction(airdropSignature);

    await swanProgram.methods
      .init(
        tokenProvider.publicKey,
        Beneficiary.publicKey,
        safeGuard.publicKey,
      )
      .accounts({
        signer: tokenProvider.publicKey,
      })
      .signers([tokenProvider])
      .rpc();  
      
    const stateAccount = await swanProgram.account.state.fetch(
      statePda
    );
    expect(stateAccount.initialized).toEqual(true);
  });

  it("token provider should Deposit 1 billion tokens ", async () => {
   
    const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
      tokenProvider.publicKey,
      LAMPORTS_PER_SOL // Adjust based on the expected fees
    );
    await anchor.getProvider().connection.confirmTransaction(airdropSignature);

    tokenMint = await createMint(
      anchor.getProvider().connection,
      tokenProvider,
      tokenProvider.publicKey,
      tokenProvider.publicKey,
      9 // Match CLI decimals
    );
    tokenProdiverATA = (await getOrCreateAssociatedTokenAccount(anchor.getProvider().connection, tokenProvider, tokenMint, tokenProvider.publicKey));
    stateAta = (await getOrCreateAssociatedTokenAccount(anchor.getProvider().connection, tokenProvider, tokenMint, statePda, true));
    await mintTo(
      anchor.getProvider().connection,
      tokenProvider,
      tokenMint,
      tokenProdiverATA.address,
      tokenProvider,
      1_000_000_000_000_000_000 // Amount to mint (e.g., 1 billion tokens)
    );

    await swanProgram.methods
      .deposit(
        new anchor.BN("1000000000000000000")
      )
      .accounts({
        state: statePda,
        tokenAuthority: tokenProvider.publicKey,
        fromTokenAccount: tokenProdiverATA.address,
        tokenMint: tokenMint,

      })
      .signers([tokenProvider])
      .rpc();
    // Verify the deposit
    const stateAccountInfo = await swanProgram.account.state.fetch(statePda);
    expect(stateAccountInfo.totalTokens.toString()).toEqual("1000000000000000000"); // 1 billion token.
    expect(stateAccountInfo.tokenMint.toBase58()).toEqual(tokenMint.toBase58());
  },50000 * 60);

  it("Should activate the ico", async () => {
    await swanProgram.methods.activate(
      new anchor.BN(10000000000)
    ).accounts({
       state: statePda,
       tokenProvider: tokenProvider.publicKey,
    }).signers([tokenProvider]).rpc();

    const stateAccount = await swanProgram.account.state.fetch(
      statePda
    );
    expect(stateAccount.participationActive).toEqual(true);
  });

  it("should initialize participant 1 with 1 SOL ", async () => {

    // lets airdrop participant 
    const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
      participant.publicKey,
      LAMPORTS_PER_SOL // Adjust based on the expected fees
    );
    await anchor.getProvider().connection.confirmTransaction(airdropSignature);

    await swanProgram.methods.initParticipant().accounts({
      participant: participant.publicKey,
    }).signers([participant]).rpc();

    const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant.publicKey.toBuffer()],
      swanProgram.programId
    );

    const participantAccount = await swanProgram.account.participantAccount.fetchNullable(
      participantAccountPublicKey
    )
    expect(participantAccount?.cancelled).toEqual(0);
    expect(participantAccount?.amount.toString()).toEqual("0");
  });

  it("Should initialize participant 2 with 1 SOL", async () => {

    // lets airdrop participant 
    const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
      participant2.publicKey,
      LAMPORTS_PER_SOL // Adjust based on the expected fees
    );
    await anchor.getProvider().connection.confirmTransaction(airdropSignature);

    await swanProgram.methods.initParticipant().accounts({
      participant: participant2.publicKey,
    }).signers([participant2]).rpc();

    const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant2.publicKey.toBuffer()],
      swanProgram.programId
    );

    const participantAccount = await swanProgram.account.participantAccount.fetchNullable(
      participantAccountPublicKey
    )
    expect(participantAccount?.cancelled).toEqual(0);
    expect(participantAccount?.amount.toString()).toEqual("0");

  });

  it("Should initialize participant 3 with 200 SOL", async () => {
      
      // lets airdrop participant 
      const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
        participant3.publicKey,
        200* LAMPORTS_PER_SOL // Adjust based on the expected fees
      );
      await anchor.getProvider().connection.confirmTransaction(airdropSignature);
  
      await swanProgram.methods.initParticipant().accounts({
        participant: participant3.publicKey,
      }).signers([participant3]).rpc();
  
      const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("participant"), participant3.publicKey.toBuffer()],
        swanProgram.programId
      );
  
      const participantAccount = await swanProgram.account.participantAccount.fetchNullable(
        participantAccountPublicKey
      )
      expect(participantAccount?.cancelled).toEqual(0);
      expect(participantAccount?.amount.toString()).toEqual("0");
  })

  it("should allow participant (1) to participate with 0.5 SOL", async () => {
    
    const [PPUBKEY, _] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant.publicKey.toBuffer()],
      swanProgram.programId
    );

    await swanProgram.methods.participate(
      new anchor.BN(500000000), // 0.5 sol
    ).accountsPartial({
      state: statePda,
      participant: participant.publicKey,
      participantAccount: PPUBKEY,
    }).signers([participant]).rpc();

    const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant.publicKey.toBuffer()],
      swanProgram.programId
    );

    const participantAccount = await swanProgram.account.participantAccount.fetch(
      participantAccountPublicKey
    )
    expect(participantAccount.amount.toString()).toEqual("500000000");
    // the participant should be an early investor too. 
    expect(participantAccount.isEarlyInvestor).toEqual(1);
  });

  it("should allow participant (2) to participate with 0.5 Sol", async () => {
      
      const [PPUBKEY, _] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("participant"), participant2.publicKey.toBuffer()],
        swanProgram.programId
      );
  
      await swanProgram.methods.participate(
        new anchor.BN(500000000), // 0.5 sol
      ).accountsPartial({
        state: statePda,
        participant: participant2.publicKey,
        participantAccount: PPUBKEY,
      }).signers([participant2]).rpc();
  
      const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("participant"), participant2.publicKey.toBuffer()],
        swanProgram.programId
      );
  
      const participantAccount = await swanProgram.account.participantAccount.fetch(
        participantAccountPublicKey
      )
      expect(participantAccount.amount.toString()).toEqual("500000000");
      // the participant should be an early investor too. 
      expect(participantAccount.isEarlyInvestor).toEqual(1);
    });

  it("should allow participant (3) to participate with 100 SOL as a large investor", async () => {
        const [PPUBKEY, _] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("participant"), participant3.publicKey.toBuffer()],
          swanProgram.programId
        );
        const OneHundreaDSol = 100 * LAMPORTS_PER_SOL
        await swanProgram.methods.participate(
          new anchor.BN(OneHundreaDSol), // 100 sol
        ).accountsPartial({
          state: statePda,
          participant: participant3.publicKey,
          participantAccount: PPUBKEY,
        }).signers([participant3]).rpc();
    
        const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from("participant"), participant3.publicKey.toBuffer()],
          swanProgram.programId
        );
    
        const participantAccount = await swanProgram.account.participantAccount.fetch(
          participantAccountPublicKey
        )
        expect(participantAccount.amount.toString()).toEqual("100000000000");
        // the participant should be an early investor too.
        expect(participantAccount.isEarlyInvestor).toEqual(1);
        // the participant is also a large investor, so we need to check the state account
        const stateAccount = await swanProgram.account.state.fetch(
          statePda
        );
        expect(stateAccount.largeInvestorCount.toNumber()).toEqual(1);
  });

  it("Should check that the state account is updated correctly with total contribution of 3 participants", async () => {
    const stateAccount = await swanProgram.account.state.fetch(
      statePda
    );
    const totalConribution = (0.5 * LAMPORTS_PER_SOL) + (0.5 * LAMPORTS_PER_SOL) + (100 * LAMPORTS_PER_SOL);
    expect(stateAccount.totalContributed.toString()).toEqual(totalConribution.toString());
    expect(stateAccount.activeEarlyInvestorCount.toNumber()).toEqual(3);
  });

  it("should allow participant (2) to cancel from the ico", async () => {
    const [PPUBKEY, _] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant2.publicKey.toBuffer()],
      swanProgram.programId
    );

    await swanProgram.methods.cancel().accountsPartial({
      state: statePda,
      participant: participant2.publicKey,
      participantAccount: PPUBKEY,
    }).signers([participant2]).rpc();

    const [participantAccountPublicKey, _bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant2.publicKey.toBuffer()],
      swanProgram.programId
    );

    const participantAccount = await swanProgram.account.participantAccount.fetch(
      participantAccountPublicKey
    )
    expect(participantAccount.cancelled).toEqual(1);
    expect(participantAccount.isEarlyInvestor).toEqual(0);

    const stateAccount = await swanProgram.account.state.fetch(
      statePda
    );
    
    expect(stateAccount.totalCancelled.toString()).toEqual("500000000");
    expect(stateAccount.totalContributed.toString()).toEqual("100500000000");
    expect(stateAccount.activeEarlyInvestorCount.toNumber()).toEqual(2);
  });

  it("Should move 100.5 sol to safe guard account." , async () => {
    // lets call the safeguard function
    await swanProgram.methods.safeguard().accountsPartial({
      state: statePda,
      tokenProvider: tokenProvider.publicKey,
      safeguardingAccount: safeGuard.publicKey,
    }).signers([tokenProvider]).rpc();

    // lets check the sol balance of the safe guard account
    const safeGuardAccount = await anchor.getProvider().connection.getBalance(safeGuard.publicKey);
    expect(safeGuardAccount).toEqual(100.5 * LAMPORTS_PER_SOL);

    // lets check that the state account has been updated correctly and has 0.5 sol left for refund
    const stateAccount = await swanProgram.account.state.fetch(
      statePda
    );
    expect(stateAccount.totalCancelled.toString()).toEqual("500000000");
  })

  it("should start destribution", async () => {

    // lets call end function now. 
    await swanProgram.methods.end().accounts({
      state: statePda,
      tokenProvider: tokenProvider.publicKey,
    }).signers([tokenProvider]).rpc();

    // lets airdrop participant 
    const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
      Beneficiary.publicKey,
      LAMPORTS_PER_SOL // Adjust based on the expected fees
    );
    await anchor.getProvider().connection.confirmTransaction(airdropSignature);
      const transaction =  await swanProgram.methods
  .distribute()
  .accounts({
    state: statePda, 
    beneficiary: Beneficiary.publicKey,
  })
  .signers([Beneficiary])
  .transaction();

  const signature = await anchor.getProvider().connection.sendTransaction(transaction, [Beneficiary]);
  // lets confirm the signature 
  await anchor.getProvider().connection.confirmTransaction(signature);

  // lets check the balance of the beneficiary account, it should be only 0.5 SOL
  const beneficiaryAccount = await anchor.getProvider().connection.getBalance(Beneficiary.publicKey);
  // lets log how much benificiary account has in sol
  expect((beneficiaryAccount/ LAMPORTS_PER_SOL).toFixed(2)).toEqual("1.50");
  // lets check the state account now,  0.5 SOL left from the distribution
  const stateAccount = await swanProgram.account.state.fetch(
    statePda
  );
  expect(stateAccount.totalCancelled.toString()).toEqual("500000000");
  },50000 * 60);

  it("should allow participant (1) to claim", async () => {
    // lets create an associated token account for participant
    const participantATA = (await getOrCreateAssociatedTokenAccount(anchor.getProvider().connection, participant, tokenMint, participant.publicKey));
    const [PPUBKEY, _] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant.publicKey.toBuffer()],
      swanProgram.programId
    );
    const [programTokenAccountPDA, programTokenAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [tokenMint.toBuffer()], // The seed matches token_mint.key().as_ref()
      swanProgram.programId
    );
    const transaction = 
    await swanProgram.methods.claim(
      programTokenAccountBump 
    ).accountsPartial({
      participantAccount: PPUBKEY,
      state: statePda,
      participant: participant.publicKey,
      participantTokenAccount: participantATA.address,
      tokenMint: tokenMint,
    }).signers([participant]).rpc();

    // lets get account with the token mint and see whats inside. 
    const tokenAccount = await getAccount(anchor.getProvider().connection, participantATA.address);
    expect(tokenAccount.amount.toString()).toEqual("4975124378110437");
    // Verify the participant account was closed
    const closedAccount = await swanProgram.account.participantAccount.fetchNullable(PPUBKEY);
    expect(closedAccount).toBeNull();
  });

  it("should refund participant (2) with 0.5 SOL", async () => {
    // lets send 1 extra sol to the contract to make sure the refund works
    const airdropSignature = await anchor.getProvider().connection.requestAirdrop(
      statePda,
      LAMPORTS_PER_SOL 
    );
    await anchor.getProvider().connection.confirmTransaction(airdropSignature);

    // get current wallet balance of participant 2
    const participant2BalanceBeforeClaim = await anchor.getProvider().connection.getBalance(participant2.publicKey);

    expect(participant2BalanceBeforeClaim).toBeLessThan(0.5 * LAMPORTS_PER_SOL);

    const [PPUBKEY, _] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("participant"), participant2.publicKey.toBuffer()],
      swanProgram.programId
    );
    const participant2ATA = (await getOrCreateAssociatedTokenAccount(anchor.getProvider().connection, participant2, tokenMint, participant2.publicKey));
    const [programTokenAccountPDA, programTokenAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [tokenMint.toBuffer()],
      swanProgram.programId
    );
    const transaction = 
    await swanProgram.methods.claim(
      programTokenAccountBump 
    ).accountsPartial({
      participantAccount: PPUBKEY,
      state: statePda,
      participant: participant2.publicKey,
      participantTokenAccount: participant2ATA.address,
      tokenMint: tokenMint,
    }).signers([participant2]).rpc();

    const participant2Balance = await anchor.getProvider().connection.getBalance(participant2.publicKey);
   // the expect should remove some fees so lets assume its about 0.1 SOL 
   expect(participant2Balance).toBeGreaterThan(participant2BalanceBeforeClaim + (0.5 * LAMPORTS_PER_SOL) - (0.1 * LAMPORTS_PER_SOL));
  });
});

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));