import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { ExtensionType, getExtensionTypes, getMint, getTransferFeeConfig, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { env, ConfigurationError } from './config';
import { solanaConnection } from './solana';

export type PwrcValidation = {
  valid: boolean;
  mint: string;
  ownerProgram: string;
  decimals: number;
  supplyAtomic: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: string[];
  transferFeeBasisPoints: number | null;
  transferFeeMaximumAtomic: string | null;
  checks: Array<{ name: string; ok: boolean; expected?: unknown; actual?: unknown }>;
};

function extensionName(value: ExtensionType) {
  return String((ExtensionType as unknown as Record<number, string>)[Number(value)] ?? value);
}

export async function validatePwrcMint(): Promise<PwrcValidation> {
  if (!env.pwrcMint) throw new ConfigurationError('PWRC_MINT is required');
  const connection = solanaConnection();
  const mintKey = new PublicKey(env.pwrcMint);
  const info = await connection.getAccountInfo(mintKey, env.solanaCommitment);
  if (!info) throw new ConfigurationError('Configured PWRC mint does not exist on the selected cluster');

  const checks: PwrcValidation['checks'] = [];
  const ownerOk = info.owner.equals(TOKEN_2022_PROGRAM_ID);
  checks.push({ name: 'token_program', ok: ownerOk, expected: TOKEN_2022_PROGRAM_ID.toBase58(), actual: info.owner.toBase58() });
  if (!ownerOk) return { valid:false,mint:mintKey.toBase58(),ownerProgram:info.owner.toBase58(),decimals:-1,supplyAtomic:'0',mintAuthority:null,freezeAuthority:null,extensions:[],transferFeeBasisPoints:null,transferFeeMaximumAtomic:null,checks };

  const mint = await getMint(connection,mintKey,env.solanaCommitment,TOKEN_2022_PROGRAM_ID);
  checks.push({ name:'decimals',ok:mint.decimals===env.pwrcDecimals,expected:env.pwrcDecimals,actual:mint.decimals });
  if (env.requireRevokedMintAuthority) checks.push({ name:'mint_authority_revoked',ok:mint.mintAuthority===null,expected:null,actual:mint.mintAuthority?.toBase58()??null });
  if (env.requireRevokedFreezeAuthority) checks.push({ name:'freeze_authority_revoked',ok:mint.freezeAuthority===null,expected:null,actual:mint.freezeAuthority?.toBase58()??null });

  const extensionTypes=getExtensionTypes(mint.tlvData);
  const extensions=extensionTypes.map(extensionName);
  const hasTransferHook = extensionTypes.includes(ExtensionType.TransferHook);
  // v1.0.0 staking/bond/bridge CPIs do not forward arbitrary TransferHook extra-account metas.
  // Direct wallet transfers support hooks, but protocol execution must fail closed until the
  // on-chain programs are explicitly upgraded to support the configured hook.
  checks.push({ name:'protocol_transfer_hook_unsupported', ok:!hasTransferHook, expected:false, actual:hasTransferHook });
  if (env.allowedPwrcExtensions.length) {
    const unexpected=extensions.filter((name)=>!env.allowedPwrcExtensions.includes(name));
    checks.push({ name:'extension_allowlist',ok:unexpected.length===0,expected:env.allowedPwrcExtensions,actual:extensions });
  }

  const transferFee=getTransferFeeConfig(mint);
  const currentFeeBps=transferFee?Number(transferFee.newerTransferFee.transferFeeBasisPoints):null;
  const currentMaximum=transferFee?BigInt(transferFee.newerTransferFee.maximumFee).toString():null;
  if (env.expectedTransferFeeBps!=null) checks.push({ name:'transfer_fee_bps',ok:currentFeeBps===env.expectedTransferFeeBps,expected:env.expectedTransferFeeBps,actual:currentFeeBps });
  if (env.expectedTransferFeeMaxAtomic!=null) checks.push({ name:'transfer_fee_maximum',ok:currentMaximum===env.expectedTransferFeeMaxAtomic.toString(),expected:env.expectedTransferFeeMaxAtomic.toString(),actual:currentMaximum });
  if (env.requireRevokedTransferFeeConfigAuthority) checks.push({ name:'transfer_fee_config_authority_revoked',ok:transferFee?.transferFeeConfigAuthority==null,expected:null,actual:transferFee?.transferFeeConfigAuthority?.toBase58()??null });
  if (env.requireRevokedWithdrawWithheldAuthority) checks.push({ name:'withdraw_withheld_authority_revoked',ok:transferFee?.withdrawWithheldAuthority==null,expected:null,actual:transferFee?.withdrawWithheldAuthority?.toBase58()??null });

  return {
    valid:checks.every((x)=>x.ok),mint:mintKey.toBase58(),ownerProgram:info.owner.toBase58(),decimals:mint.decimals,supplyAtomic:mint.supply.toString(),
    mintAuthority:mint.mintAuthority?.toBase58()??null,freezeAuthority:mint.freezeAuthority?.toBase58()??null,extensions,
    transferFeeBasisPoints:currentFeeBps,transferFeeMaximumAtomic:currentMaximum,checks,
  };
}

export async function requireValidPwrcMint(){const validation=await validatePwrcMint();if(!validation.valid){const error=new ConfigurationError('PWRC Token-2022 mint validation failed') as ConfigurationError & {details?:unknown};error.details=validation;throw error;}return validation;}
