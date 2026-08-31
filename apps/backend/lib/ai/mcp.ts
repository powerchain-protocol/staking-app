import 'server-only';
import { createHmac, createHash } from 'node:crypto';
import { env } from '@/lib/server/config';
import { ApiError } from '@/lib/server/http';
import type { AiToolRequest, AiToolResult, ToolMode } from './types';

export type McpToolSpec={name:string;mode:ToolMode;description:string};
export const MCP_TOOLS:McpToolSpec[]=[
  {name:'portfolio.read',mode:'READ',description:'Read authenticated portfolio state'},
  {name:'staking.read',mode:'READ',description:'Read staking positions and pools'},
  {name:'rewards.read',mode:'READ',description:'Read funded rewards and claimable state'},
  {name:'governance.read',mode:'READ',description:'Read governance proposals and voting state'},
  {name:'network.read',mode:'READ',description:'Read PowerChain network/readiness state'},
  {name:'bridge.reserve.read',mode:'READ',description:'Read PWRC/wPWRC reserve coverage'},
  {name:'solana.rpc.health',mode:'READ',description:'Read configured Solana RPC health'},
  {name:'solana.token.validate',mode:'READ',description:'Validate configured Token-2022 PWRC mint'},
  {name:'rag.search',mode:'READ',description:'Search trusted PowerChain knowledge'},
  {name:'charts.compose',mode:'PROPOSE',description:'Compose a chart specification from verified numeric data'}
];
export function toolSpec(name:string){return MCP_TOOLS.find((item)=>item.name===name)}
async function boundedJson(response:Response){
  const contentType=response.headers.get('content-type')??'';
  if(!contentType.toLowerCase().includes('application/json'))throw new ApiError(502,'AI_MCP_INVALID_RESPONSE','MCP gateway must return application/json');
  if(!response.body)return response.json();
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
  while(true){const{done,value}=await reader.read();if(done)break;if(value){total+=value.byteLength;if(total>env.aiMaxOutputBytes){try{await reader.cancel()}catch{}throw new ApiError(502,'AI_MCP_RESPONSE_TOO_LARGE','MCP gateway response exceeds policy')}chunks.push(value)}}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}try{return JSON.parse(new TextDecoder().decode(merged))}catch{throw new ApiError(502,'AI_MCP_INVALID_JSON','MCP gateway returned invalid JSON')}
}
export async function callMcpGateway(subjectId:string,request:AiToolRequest,requestId:string):Promise<AiToolResult>{
  const spec=toolSpec(request.name);if(!spec)throw new ApiError(403,'AI_TOOL_NOT_REGISTERED','Tool is not registered');
  if(spec.mode==='STATE_CHANGE')throw new ApiError(403,'AI_TOOL_STATE_CHANGE_BLOCKED','AI MCP state-changing tools are disabled');
  if(!env.aiMcpGatewayUrl)throw new ApiError(503,'AI_MCP_NOT_CONFIGURED','AI_MCP_GATEWAY_URL is not configured');
  const body=JSON.stringify({subjectId,requestId,tool:request.name,arguments:request.arguments});const ts=Date.now().toString();const sig=env.aiMcpSigningSecret?createHmac('sha256',env.aiMcpSigningSecret).update(`${ts}.${body}`).digest('hex'):'';
  const response=await fetch(env.aiMcpGatewayUrl,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-powerchain-request-id':requestId,'x-powerchain-timestamp':ts,'x-powerchain-signature':sig},body,signal:AbortSignal.timeout(env.aiToolTimeoutMs),cache:'no-store'});
  if(!response.ok)throw new ApiError(502,'AI_MCP_GATEWAY_ERROR',`MCP gateway returned ${response.status}`);
  const content=await boundedJson(response);return{name:request.name,mode:spec.mode,ok:true,content,citation:{id:`mcp_${request.name.replace(/[^a-z0-9]+/gi,'_')}`,title:`MCP ${request.name}`,sourceType:'MCP_TOOL',trustTier:'VERIFIED',excerpt:JSON.stringify(content).slice(0,420)}};
}
export function hashToolInput(input:unknown){return createHash('sha256').update(JSON.stringify(input)).digest('hex')}
