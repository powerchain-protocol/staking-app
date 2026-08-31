export function storageGet<T>(key:string):T|null{if(typeof window==='undefined')return null;try{return JSON.parse(localStorage.getItem(key)??'null') as T}catch{return null}}
export function storageSet<T>(key:string,value:T){if(typeof window!=='undefined')localStorage.setItem(key,JSON.stringify(value))}
export function storageRemove(key:string){if(typeof window!=='undefined')localStorage.removeItem(key)}
