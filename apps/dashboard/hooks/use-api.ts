'use client';
import{useCallback,useEffect,useState}from'react';import{api}from'@/lib/api';
export function useApi<T>(path:string){const[data,setData]=useState<T|null>(null);const[loading,setLoading]=useState(true);const[error,setError]=useState<string|null>(null);const refresh=useCallback(async()=>{setLoading(true);setError(null);try{setData(await api<T>(path))}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setLoading(false)}},[path]);useEffect(()=>{void refresh()},[refresh]);return{data,loading,error,refresh,setData};}
