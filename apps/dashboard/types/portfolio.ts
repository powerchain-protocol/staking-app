export interface PortfolioAsset{chain:'SOLANA'|'SUI';symbol:string;address:string;amountAtomic:string;decimals:number;amountUi:string;priceUsd?:number;valueUsd?:number;source:string}
export interface PortfolioSnapshot{subjectId:string;walletAddress:string;generatedAt:string;totalValueUsd:number;assets:PortfolioAsset[]}
