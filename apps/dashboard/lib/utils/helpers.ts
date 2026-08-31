export function cx(...parts:Array<string|false|null|undefined>){return parts.filter(Boolean).join(' ')}
export const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
