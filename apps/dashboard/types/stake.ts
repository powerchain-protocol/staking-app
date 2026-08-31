export type StakeAction='STAKE'|'INCREASE'|'REQUEST_UNSTAKE'|'CANCEL_UNSTAKE'|'WITHDRAW'|'CLAIM'|'COMPOUND';
export type StakeStatus='ACTIVE'|'LOCKED'|'UNBONDING'|'WITHDRAWABLE'|'WITHDRAWN'|'SLASHED'|'CLOSED';
export interface StakePosition{ id:string;pool_id:string;principal_atomic:string;effective_weight_atomic:string;status:StakeStatus;unlock_at?:string|null;unbonding_ends_at?:string|null;created_at:string;updated_at:string; }
