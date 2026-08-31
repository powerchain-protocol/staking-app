export interface LinkedWallet{id:string;wallet_address:string;network:'SOLANA'|'SUI';wallet_kind:'EXTERNAL'|'EMBEDDED';provider?:string|null;is_primary:boolean;verified_at:string;created_at:string}
export interface WalletBalance{symbol:string;amountAtomic:string;decimals:number;network:'SOLANA'|'SUI'}
