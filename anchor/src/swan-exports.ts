// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import type { Swan } from '../target/types/swan'

// Import the IDL JSON directly
const IDL = require('../target/idl/swan.json')

export const SWAN_PROGRAM_ID = new PublicKey('BUYLB52z4smtpLUMosr45FckaC1DhhFL9HHiUMUBNM5m')

export function getSwanProgram(provider: AnchorProvider): Program<Swan> {
  return new Program(
    IDL,
    provider
  )
}

export function getSwanProgramId(cluster: Cluster): PublicKey {
  return SWAN_PROGRAM_ID
}

export type { Swan }
