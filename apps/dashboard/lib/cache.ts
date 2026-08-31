const memory=new Map<string,{value:unknown;expires:number}>();
export async function clientCached<T>(key:string,ttlMs:number,loader:()=>Promise<T>):Promise<T>{const hit=memory.get(key);if(hit&&hit.expires>Date.now())return hit.value as T;const value=await loader();memory.set(key,{value,expires:Date.now()+ttlMs});return value;}
export function clearClientCache(prefix?:string){for(const key of memory.keys())if(!prefix||key.startsWith(prefix))memory.delete(key);}
