import 'server-only';
import type { EndpointDescriptor } from '@powerchain/contracts';

export const endpointCatalog = [
  ['GET','/api/v1/system/health','Public service health'],
  ['GET','/api/v1/system/readiness','Deep execution readiness'],
  ['GET','/api/v1/system/capabilities','Deployment and runtime capabilities'],
  ['GET','/api/v1/realtime/status','Realtime transport capabilities'],
  ['POST','/api/v1/realtime/token','One-use authenticated WebSocket token'],
  ['GET','/api/v1/realtime/events','Authenticated event catch-up'],
  ['GET','/api/v1/portfolio','Authenticated portfolio snapshot'],
  ['GET','/api/v1/staking/positions','Reconciled staking positions'],
  ['POST','/api/v1/staking/intents','Create staking intent'],
  ['GET','/api/v1/rewards/overview','Funded reward overview'],
  ['GET','/api/v1/governance/overview','Governance weight and participation'],
  ['GET','/api/v1/governance/proposals','Governance proposals'],
  ['GET','/api/v1/bonds','Service bonds'],
  ['GET','/api/v1/wallets/balances','Wallet balances'],
  ['POST','/api/v1/wallets/transfers','Create Token-2022 transfer intent'],
  ['POST','/api/v1/swaps/intents','Create DEX swap intent'],
  ['POST','/api/v1/cctp/intents','Create CCTP bridge intent'],
  ['GET','/api/v1/bridge/reserves','PWRC/wPWRC reserve coverage'],
  ['GET','/api/v1/ledger','Double-entry ledger'],
  ['GET','/api/v1/receipts','Immutable receipts'],
  ['GET','/api/v1/actions','State-changing action registry'],
  ['GET','/api/v1/endpoints','Discoverable v1 endpoint registry'],
  ['GET','/api/v1/ai/capabilities','AI capability policy'],
  ['POST','/api/v1/ai/chat','Grounded AI response'],
] as const;

export function listEndpoints(): EndpointDescriptor[] {
  return endpointCatalog.map(([method,path,description]) => ({ method, path, description, version:'v1' }));
}
