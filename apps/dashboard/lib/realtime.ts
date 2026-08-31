'use client';
import { PowerChainRealtimeClient } from '@powerchain/api-client';
import type { RealtimeConnectionState,RealtimeEventEnvelope,RealtimeTopic } from '@powerchain/contracts';

type Listener=(event:RealtimeEventEnvelope)=>void;type StateListener=()=>void;
class RealtimeManager{
  private client:PowerChainRealtimeClient|null=null;private refs=new Map<RealtimeTopic,number>();private listeners=new Map<RealtimeTopic,Set<Listener>>();private state:RealtimeConnectionState='idle';private stateListeners=new Set<StateListener>();
  private ensure(){if(this.client)return this.client;const client=new PowerChainRealtimeClient();client.onState((state)=>{this.state=state;this.stateListeners.forEach(fn=>fn())});client.onEvent((event)=>this.listeners.get(event.topic)?.forEach(fn=>fn(event)));this.client=client;return client;}
  subscribe(topics:RealtimeTopic[],listener:Listener){if(process.env.NEXT_PUBLIC_REALTIME_ENABLED==='false')return()=>{};const client=this.ensure();const newlyAdded:RealtimeTopic[]=[];for(const topic of topics){const count=this.refs.get(topic)??0;this.refs.set(topic,count+1);if(count===0)newlyAdded.push(topic);let set=this.listeners.get(topic);if(!set){set=new Set();this.listeners.set(topic,set)}set.add(listener);}if(newlyAdded.length)client.subscribe(newlyAdded);void client.connect();return()=>{const remove:RealtimeTopic[]=[];for(const topic of topics){this.listeners.get(topic)?.delete(listener);const next=Math.max(0,(this.refs.get(topic)??1)-1);if(next===0){this.refs.delete(topic);this.listeners.delete(topic);remove.push(topic)}else this.refs.set(topic,next)}if(remove.length)client.unsubscribe(remove);if(this.refs.size===0)client.close();};}
  subscribeState(fn:StateListener){this.stateListeners.add(fn);return()=>this.stateListeners.delete(fn)}
  getState=()=>this.state;getServerState=():RealtimeConnectionState=>'idle';
}
export const realtime=new RealtimeManager();
