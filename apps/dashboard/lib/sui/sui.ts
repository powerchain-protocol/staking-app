export type SuiEnvironment='mainnet'|'testnet'|'devnet';
export function validateSuiAddress(value:string){return /^0x[0-9a-fA-F]{1,64}$/.test(value);}
