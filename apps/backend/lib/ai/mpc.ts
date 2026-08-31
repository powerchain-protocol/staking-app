import 'server-only';
import {ApiError} from '@/lib/server/http';
/**
 * MPC / distributed signing is deliberately outside the LLM authority boundary.
 * AI may describe an unsigned proposal but can never request key shares, start a signing
 * round, approve a quorum, or submit a threshold signature.
 */
export const AI_MPC_POLICY={enabledForAi:false,canReadPublicPolicy:true,canRequestSignature:false,canAccessKeyShares:false,canApproveQuorum:false}as const;
export function assertAiMpcOperationAllowed(operation:string){
  if(/sign|share|quorum|approve|execute|submit/i.test(operation))throw new ApiError(403,'AI_MPC_SIGNING_BLOCKED','MPC signing operations are outside AI authority');
  return AI_MPC_POLICY;
}
