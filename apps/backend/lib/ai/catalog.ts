import type{AiDomain,ResponseStyle}from'./types';
export type SkillSpec={id:string;name:string;domain:AiDomain;description:string;tools:string[];evidenceRequired:boolean};
export type AssistantSpec={id:string;name:string;description:string;domains:AiDomain[];skills:string[];defaultStyle:ResponseStyle};
export const skills:SkillSpec[]=[
{id:'general.analysis',name:'General analysis',domain:'generic',description:'Structured explanation and synthesis without inventing facts.',tools:[],evidenceRequired:false},
{id:'solana.read',name:'Solana analyst',domain:'solana',description:'Read Solana network, token, account and transaction state.',tools:['solana.rpc.health','solana.token.validate','solana.transaction.read'],evidenceRequired:true},
{id:'sui.read',name:'Sui analyst',domain:'sui',description:'Read Sui coin, object, bridge and network state.',tools:['sui.network.read','sui.coin.read','bridge.reserve.read'],evidenceRequired:true},
{id:'powerchain.protocol',name:'PowerChain protocol',domain:'powerchain',description:'Explain staking, rewards, governance, bonds, bridge and protocol controls.',tools:['staking.read','rewards.read','governance.read','network.read','portfolio.read'],evidenceRequired:true},
{id:'renewables.analysis',name:'Renewables analyst',domain:'renewables',description:'Analyze renewable infrastructure evidence, economics and operational context.',tools:['renewables.data.read'],evidenceRequired:true},
{id:'charts.compose',name:'Chart composer',domain:'charts',description:'Create chart-ready specifications only from supplied or verified numeric data.',tools:['charts.compose'],evidenceRequired:true},
{id:'data.ground',name:'Grounded research',domain:'data',description:'Retrieve trusted PowerChain knowledge and attach citations to factual claims.',tools:['rag.search'],evidenceRequired:true},
{id:'support.help',name:'Support',domain:'support',description:'Help users operate the platform using product documentation and status evidence.',tools:['rag.search','network.read'],evidenceRequired:true}
];
export const assistants:AssistantSpec[]=[
{id:'powerchain',name:'PowerChain Copilot',description:'Grounded operating assistant for staking, governance, rewards, wallets and renewable infrastructure.',domains:['powerchain','solana','sui','renewables','data'],skills:['powerchain.protocol','solana.read','sui.read','data.ground'],defaultStyle:'professional'},
{id:'protocol',name:'Protocol Engineer',description:'Technical assistant for Solana/Sui programs, protocol invariants and integrations.',domains:['powerchain','solana','sui','data'],skills:['powerchain.protocol','solana.read','sui.read','data.ground'],defaultStyle:'technical'},
{id:'renewables',name:'Renewables Analyst',description:'Evidence-first renewable asset and project economics analyst.',domains:['renewables','powerchain','data','charts'],skills:['renewables.analysis','data.ground','charts.compose'],defaultStyle:'analyst'},
{id:'support',name:'Platform Support',description:'Product and operational support assistant with abstention when system state is unavailable.',domains:['support','data','powerchain'],skills:['support.help','data.ground'],defaultStyle:'concise'}
];
export function getAssistant(id:string){return assistants.find(x=>x.id===id)??assistants[0]}
export function getSkill(id:string){return skills.find(x=>x.id===id)}
