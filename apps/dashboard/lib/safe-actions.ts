import { apiPost } from '@powerchain/api-client';
export function idempotencyKey(prefix:string){return `${prefix}:${crypto.randomUUID()}`;}
export async function postSafe<T>(endpoint:string,body:unknown,prefix='action'){return apiPost<T>(endpoint,body,prefix,{retries:0});}
