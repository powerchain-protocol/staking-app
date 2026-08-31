import 'server-only';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { db } from './db';
import { env, ConfigurationError, assertHttpsUrl, assertSuiCoinType } from './config';
import { solanaConnection } from './solana';
import { pwrcMint } from './anchor';

function normalize(amount: bigint, decimals: number, targetDecimals: number) {
  if (decimals === targetDecimals) return amount;
  if (decimals < targetDecimals) return amount * (10n ** BigInt(targetDecimals - decimals));
  return amount / (10n ** BigInt(decimals - targetDecimals));
}

export async function verifyBridgeReserves() {
  if (!env.bridgeReserveTokenAccount) throw new ConfigurationError('PWRC_BRIDGE_RESERVE_TOKEN_ACCOUNT is required');
  if (!env.bridgeReserveAuthority) throw new ConfigurationError('PWRC_BRIDGE_RESERVE_AUTHORITY is required');
  if (!env.bridgeProgramId) throw new ConfigurationError('SOLANA_BRIDGE_PROGRAM_ID is required');
  if (!env.wpwrcCoinType) throw new ConfigurationError('WPWRC_COIN_TYPE is required');
  if (!env.suiGrpcUrl) throw new ConfigurationError('SUI_GRPC_URL is required');
  assertHttpsUrl(env.suiGrpcUrl, 'SUI_GRPC_URL');
  assertSuiCoinType(env.wpwrcCoinType);

  const solana=solanaConnection();
  const reservePubkey=new PublicKey(env.bridgeReserveTokenAccount);
  const expectedAuthority=new PublicKey(env.bridgeReserveAuthority);
  const bridgeProgram=new PublicKey(env.bridgeProgramId);
  const [derivedBridgeConfig]=PublicKey.findProgramAddressSync([Buffer.from('bridge-config')],bridgeProgram);
  const derivedReserve=getAssociatedTokenAddressSync(pwrcMint(),derivedBridgeConfig,true,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);
  if(!expectedAuthority.equals(derivedBridgeConfig))throw new ConfigurationError(`PWRC_BRIDGE_RESERVE_AUTHORITY must be the bridge-config PDA ${derivedBridgeConfig.toBase58()}`);
  if(!reservePubkey.equals(derivedReserve))throw new ConfigurationError(`PWRC_BRIDGE_RESERVE_TOKEN_ACCOUNT must be the Token-2022 ATA derived for bridge-config: ${derivedReserve.toBase58()}`);
  const [reserve,slot,programInfo]=await Promise.all([
    getAccount(solana,reservePubkey,env.solanaCommitment,TOKEN_2022_PROGRAM_ID),
    solana.getSlot(env.solanaCommitment),
    solana.getAccountInfo(bridgeProgram,env.solanaCommitment),
  ]);
  if(!reserve.mint.equals(pwrcMint()))throw new ConfigurationError('Configured bridge reserve account does not hold PWRC');
  if(!reserve.owner.equals(expectedAuthority))throw new ConfigurationError(`Bridge reserve authority mismatch: expected ${expectedAuthority.toBase58()}, got ${reserve.owner.toBase58()}`);
  if(env.bridgeRequireNoDelegate&&reserve.delegate)throw new ConfigurationError('Bridge reserve token account must not have a delegate');
  if(env.bridgeRequireNoCloseAuthority&&reserve.closeAuthority)throw new ConfigurationError('Bridge reserve token account must not have a close authority');
  if(reserve.isFrozen)throw new ConfigurationError('Bridge reserve token account is frozen');
  if(!programInfo?.executable)throw new ConfigurationError('Configured Solana bridge program is not executable on the selected cluster');

  const sui=new SuiGrpcClient({network:env.suiNetwork as any,baseUrl:env.suiGrpcUrl});
  const {response}=await sui.stateService.getCoinInfo({coinType:env.wpwrcCoinType} as any);
  const metadata=(response as any).metadata??null;
  const treasury=(response as any).treasury??null;
  if(!treasury||treasury.totalSupply==null)throw new ConfigurationError('wPWRC coin treasury/supply could not be resolved on Sui');
  const suiDecimals=Number(metadata?.decimals??env.wpwrcDecimals);
  if(suiDecimals!==env.wpwrcDecimals)throw new ConfigurationError(`wPWRC decimals mismatch: expected ${env.wpwrcDecimals}, got ${suiDecimals}`);

  const targetDecimals=Math.max(env.pwrcDecimals,suiDecimals);
  const reserveNormalized=normalize(reserve.amount,env.pwrcDecimals,targetDecimals);
  const wrappedNormalized=normalize(BigInt(String(treasury.totalSupply)),suiDecimals,targetDecimals);
  const delta=reserveNormalized-wrappedNormalized;
  const tolerance=normalize(env.bridgeReserveToleranceAtomic,env.pwrcDecimals,targetDecimals);
  const covered=wrappedNormalized<=reserveNormalized+tolerance;
  const verificationStatus=covered?'VERIFIED':'UNDERCOLLATERALIZED';

  const [snapshot]=await db()`
    INSERT INTO bridge_reserve_snapshots(solana_reserve_atomic,sui_wpwrc_supply_atomic,delta_atomic,covered,solana_slot,sui_supply_state,details,verification_status,bridge_program_verified,reserve_authority_verified)
    VALUES(${reserve.amount.toString()},${String(treasury.totalSupply)},${delta.toString()},${covered},${slot},${String(treasury.supplyState??'UNKNOWN')},${db().json({
      reserveAccount:env.bridgeReserveTokenAccount,reserveAuthority:env.bridgeReserveAuthority,bridgeProgramId:env.bridgeProgramId,pwrcMint:env.pwrcMint,
      wpwrcCoinType:env.wpwrcCoinType,suiNetwork:env.suiNetwork,pwrcDecimals:env.pwrcDecimals,wpwrcDecimals:suiDecimals,toleranceAtomic:env.bridgeReserveToleranceAtomic.toString(),
    })},${verificationStatus},true,true) RETURNING *
  `;

  return {
    covered,verificationStatus,invariant:'wPWRC total supply <= verified PWRC bridge reserves',
    solana:{reserveAccount:reservePubkey.toBase58(),reserveAuthority:reserve.owner.toBase58(),reserveAtomic:reserve.amount.toString(),slot,mint:reserve.mint.toBase58(),bridgeProgram:bridgeProgram.toBase58(),bridgeProgramExecutable:true},
    sui:{coinType:env.wpwrcCoinType,totalSupplyAtomic:String(treasury.totalSupply),supplyState:String(treasury.supplyState??'UNKNOWN'),decimals:suiDecimals,transport:'gRPC'},
    deltaAtomicNormalized:delta.toString(),snapshotId:snapshot.id,
  };
}
