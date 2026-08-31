'use client';
import type { CopilotResponse } from '@/components/ai/types';

type StreamEvent={event:string;data:any};
function parseFrame(frame:string):StreamEvent|null{let event='message';const data:string[]=[];for(const line of frame.split(/\r?\n/)){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data.push(line.slice(5).trim())}if(!data.length)return null;try{return{event,data:JSON.parse(data.join('\n'))}}catch{return null}}

export async function streamCopilot(body:Record<string,unknown>,onStage:(stage:{stage:string;message:string;meta?:Record<string,unknown>})=>void):Promise<CopilotResponse>{
 const response=await fetch('/api/v1/ai/chat/stream',{method:'POST',credentials:'include',headers:{'content-type':'application/json','accept':'text/event-stream'},body:JSON.stringify(body),cache:'no-store'});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data?.error?.message??`Request failed (${response.status})`)}
 if(!response.body)throw new Error('Copilot stream is unavailable');
 const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let result:CopilotResponse|undefined;
 while(true){const{done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);const parsed=parseFrame(frame);if(!parsed)continue;if(parsed.event==='stage')onStage(parsed.data);else if(parsed.event==='result')result=parsed.data as CopilotResponse;else if(parsed.event==='error')throw new Error(parsed.data?.message??'Copilot request failed')}}
 if(!result)throw new Error('Copilot stream ended before a verified response was produced');return result;
}
