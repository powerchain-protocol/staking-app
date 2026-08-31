import type{AiAssistantResponse}from'./types';
const RULES:Array<[RegExp,string[]]>=[
[/\b(portfolio|balance|holdings|wallet assets?)\b/i,['portfolio.read']],
[/\b(stake|staking|position|lock|unlock|unbond)\b/i,['staking.read']],
[/\b(reward|claim|epoch|apr|yield)\b/i,['rewards.read']],
[/\b(governance|proposal|vote|quorum|delegat)\b/i,['governance.read']],
[/\b(network|health|status|readiness|outage)\b/i,['network.read']],
[/\b(bridge|wpwrc|reserve coverage|sui bridge)\b/i,['bridge.reserve.read']],
[/\b(solana rpc|rpc latency|solana health)\b/i,['solana.rpc.health']],
[/\b(pwrc mint|token-2022|token2022|mint authority|transfer fee)\b/i,['solana.token.validate']]
];
export function planReadTools(message:string,explicit:string[],allowed:string[]){const out=new Set(explicit);for(const[re,tools]of RULES)if(re.test(message))for(const tool of tools)out.add(tool);return[...out].filter(x=>allowed.includes(x)).slice(0,12)}
