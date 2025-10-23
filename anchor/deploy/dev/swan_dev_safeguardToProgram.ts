import { getKeypairFromFile } from '@solana-developers/helpers';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram, clusterApiUrl } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

// Constants
const TARGET_ADDRESS = '8apswKiMCUXnhj2vR4rktzoZX5biupNbzuwkauwNbHpz'; // statepda
const SOL_TO_SEND = 4.49758488; // Amount of SOL to send

(async () => {
  try {
    // Load the private key
    const privateKeyData = path.resolve(__dirname, "./safeguard.json");
  const senderKeypair = await getKeypairFromFile(privateKeyData);

    // Establish a connection to the Solana cluster
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed"); // Devnet connection

    // Get the sender's balance
    const senderPublicKey = senderKeypair.publicKey;
    const senderBalance = await connection.getBalance(senderPublicKey);
    const senderBalanceInSOL = senderBalance / 1_000_000_000;

    console.log(`Sender's current balance: ${senderBalance} lamports (${senderBalanceInSOL} SOL)`);

    // Check if there is sufficient balance (including a buffer for transaction fees)
    const lamportsToSend = Math.floor(SOL_TO_SEND * 1_000_000_000); // Convert SOL to lamports
    const transactionFeeBuffer = 5000; // Small buffer for transaction fees

    if (senderBalance < lamportsToSend + transactionFeeBuffer) {
      console.error('Insufficient balance to send the specified amount and cover fees.');
      return;
    }

    console.log(`Amount to send: ${lamportsToSend} lamports (${SOL_TO_SEND} SOL)`);

    // Create the transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: new PublicKey(TARGET_ADDRESS),
        lamports: lamportsToSend,
      })
    );

    // Sign and send the transaction
    const signature = await connection.sendTransaction(transaction, [senderKeypair]);
    console.log(`Transaction sent with signature: ${signature}`);

    // Confirm the transaction
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    console.log('Transaction confirmed:', confirmation);

    console.log(`Successfully transferred ${SOL_TO_SEND} SOL (${lamportsToSend} lamports) to ${TARGET_ADDRESS}`);
  } catch (error) {
    console.error('Error:', error);
  }
})();
