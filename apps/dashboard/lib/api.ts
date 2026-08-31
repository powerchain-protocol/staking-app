'use client';
export async function api<T=any>(path:string,init:RequestInit={}):Promise<T>{const response=await fetch(path,{...init,credentials:init.credentials??'include',headers:{...(init.body?{'content-type':'application/json'}:{}),...(init.headers??{})},cache:init.cache??'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message??`Request failed (${response.status})`);return data as T;}
export function idempotencyHeaders(){return{'x-idempotency-key':crypto.randomUUID()};}
