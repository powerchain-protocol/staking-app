import 'server-only';
import {db} from '@/lib/server/db';
import {buildPortfolio} from '@/lib/portfolio';
import {governanceWeight,listGovernanceProposals} from '@/lib/server/governance';
import {solanaHealth} from '@/lib/server/solana';
import {validatePwrcMint} from '@/lib/server/pwrc';
import {verifyBridgeReserves} from '@/lib/server/bridge';
import {claimableForPosition} from '@/lib/server/rewards';
import {systemHealth} from '@/lib/server/system-health';
import {retrieveEvidence} from './grounding';
import {callMcpGateway,toolSpec} from './mcp';
import {ApiError} from '@/lib/server/http';
import type{AiToolRequest,AiToolResult}from'./types';
import{validateToolRequest,assertToolResultSize}from'./tool-contracts';

const LOCAL_TOOLS=new Set(['portfolio.read','staking.read','rewards.read','governance.read','network.read','bridge.reserve.read','solana.rpc.health','solana.token.validate','rag.search','charts.compose']);

function safeChartSpec(input:Record<string,unknown>){
  const rows=Array.isArray(input.data)?input.data:[];
  const xKey=typeof input.xKey==='string'?input.xKey:'';
  const yKey=typeof input.yKey==='string'?input.yKey:'';
  if(!rows.length||!xKey||!yKey)throw new ApiError(400,'AI_CHART_DATA_REQUIRED','Chart composition requires verified data, xKey and yKey');
  if(rows.length>250)throw new ApiError(400,'AI_CHART_DATA_TOO_LARGE','Chart input exceeds policy');
  return{chartType:input.chartType==='bar'?'bar':'line',xKey,series:[{dataKey:yKey,label:typeof input.label==='string'?input.label:yKey}],data:rows};
}

async function localTool(subjectId:string,request:AiToolRequest):Promise<unknown>{
  switch(request.name){
    case'portfolio.read':return buildPortfolio(subjectId);
    case'staking.read':return db()`SELECT id,pool_id,status,principal_atomic::text,effective_weight_atomic::text,lock_end,unbonding_ends_at FROM staking_positions WHERE subject_id=${subjectId} ORDER BY created_at DESC LIMIT 100`;
    case'rewards.read':{const positions=await db()`SELECT id FROM staking_positions WHERE subject_id=${subjectId} AND status IN ('ACTIVE','LOCKED') LIMIT 100`;let total=0n;const details=[];for(const p of positions as Array<{id:string}>){const r=await claimableForPosition(String(p.id));total+=BigInt(r.claimableAtomic);details.push(r)}return{claimableAtomic:total.toString(),positions:details};}
    case'governance.read':return{weightAtomic:(await governanceWeight(subjectId)).toString(),proposals:(await listGovernanceProposals()).slice(0,50)};
    case'network.read':return systemHealth(false);
    case'bridge.reserve.read':return verifyBridgeReserves();
    case'solana.rpc.health':return solanaHealth();
    case'solana.token.validate':return validatePwrcMint();
    case'rag.search':{const query=typeof request.arguments.query==='string'?request.arguments.query:'';const domains=Array.isArray(request.arguments.domains)?request.arguments.domains.filter((x):x is string=>typeof x==='string'):[];return(await retrieveEvidence(query,domains,8)).map(x=>({citation:x.citation,domain:x.domain,score:x.score}));}
    case'charts.compose':return safeChartSpec(request.arguments);
    default:throw new ApiError(404,'AI_TOOL_NOT_FOUND','AI tool not found');
  }
}

export async function executeAiTool(subjectId:string,request:AiToolRequest,requestId:string):Promise<AiToolResult>{
  const validated=validateToolRequest(request);
  request=validated;
  const spec=toolSpec(request.name);if(!spec)throw new ApiError(403,'AI_TOOL_NOT_REGISTERED','AI tool is not registered');
  if(spec.mode==='STATE_CHANGE')throw new ApiError(403,'AI_STATE_CHANGE_BLOCKED','AI cannot execute state-changing tools');
  if(LOCAL_TOOLS.has(request.name)){const content=await localTool(subjectId,request);assertToolResultSize(request.name,content);const compact=JSON.stringify(content).slice(0,420);return{name:request.name,mode:spec.mode,ok:true,content,citation:{id:`tool_${request.name.replace(/[^a-z0-9]+/gi,'_')}`,title:`Live ${request.name}`,sourceType:'POWERCHAIN_TOOL',trustTier:'VERIFIED',excerpt:compact}};}
  return callMcpGateway(subjectId,request,requestId);
}
