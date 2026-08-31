export type PowerChainActionId='stake.create'|'reward.claim'|'governance.vote'|'bond.create'|'transfer.send'|'bridge.cctp'|'swap.prepare';
export interface PowerChainAction{actionId:PowerChainActionId;title:string;description:string;method:'GET'|'POST';endpoint:string;requiresWallet:boolean;executionDomain:string}
