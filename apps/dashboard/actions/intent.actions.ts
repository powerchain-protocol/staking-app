'use client';
import { executionIntentCollection, type ExecutionKind } from '@powerchain/contracts';import { apiPost } from '@powerchain/api-client';import { apiService } from '@/services/api.service';import { waitForIntent } from '@/services/intent.service';
export async function createIntentAction<T=any>(kind:ExecutionKind,payload:unknown){return apiPost<T>(executionIntentCollection(kind),payload,`${kind}:create`,{retries:0});}
export async function prepareIntentAction(kind:ExecutionKind,intentId:string){return apiService.prepareIntent(kind,intentId);}
export async function submitIntentAction(kind:ExecutionKind,intentId:string,signedTransactionBase64:string){return apiService.submitIntent(kind,intentId,signedTransactionBase64);}
export async function confirmIntentAction(kind:ExecutionKind,intentId:string,timeoutMs?:number){return waitForIntent(kind,intentId,timeoutMs);}
