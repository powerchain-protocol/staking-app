import { Connection, PublicKey } from '@solana/web3.js';

export type SolanaEnvironment='mainnet-beta'|'devnet';
export function validateSolanaAddress(value:string){try{new PublicKey(value);return true}catch{return false}}
export function publicSolanaConnection(cluster:SolanaEnvironment,rpcUrl?:string){const endpoint=rpcUrl??(cluster==='mainnet-beta'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com');return new Connection(endpoint,'confirmed');}
