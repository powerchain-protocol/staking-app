'use client';
type Listener=()=>void;const listeners=new Set<Listener>();const state={sidebarOpen:false,lastRoute:'/'};
export const appStore={get:()=>state,set:(patch:Partial<typeof state>)=>{Object.assign(state,patch);listeners.forEach(x=>x())},subscribe:(fn:Listener)=>{listeners.add(fn);return()=>listeners.delete(fn)}};
