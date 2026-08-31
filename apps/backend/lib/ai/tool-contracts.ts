import { ApiError } from '@/lib/server/http';
import type { AiToolRequest } from './types';

export type ToolDataClass = 'PUBLIC' | 'ACCOUNT' | 'PROTOCOL';
export type ToolContract = {
  name: string;
  dataClass: ToolDataClass;
  maxResultBytes: number;
  validate: (args: Record<string, unknown>) => Record<string, unknown>;
};

function noArgs(args: Record<string, unknown>) {
  if (Object.keys(args).length) throw new ApiError(400, 'AI_TOOL_ARGUMENTS_INVALID', 'This tool does not accept arguments');
  return {};
}

function ragArgs(args: Record<string, unknown>) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query || query.length > 4096) throw new ApiError(400, 'AI_TOOL_ARGUMENTS_INVALID', 'rag.search requires a query up to 4096 characters');
  const domains = Array.isArray(args.domains) ? args.domains.filter((x): x is string => typeof x === 'string').slice(0, 8) : [];
  return { query, domains };
}

function chartArgs(args: Record<string, unknown>) {
  const data = Array.isArray(args.data) ? args.data.slice(0, 250) : [];
  const xKey = typeof args.xKey === 'string' ? args.xKey.trim() : '';
  const yKey = typeof args.yKey === 'string' ? args.yKey.trim() : '';
  if (!data.length || !xKey || !yKey) throw new ApiError(400, 'AI_TOOL_ARGUMENTS_INVALID', 'charts.compose requires data, xKey and yKey');
  return { ...args, data, xKey, yKey };
}

const CONTRACTS: Record<string, ToolContract> = Object.fromEntries([
  ['portfolio.read', 'ACCOUNT', noArgs, 128_000],
  ['staking.read', 'ACCOUNT', noArgs, 128_000],
  ['rewards.read', 'ACCOUNT', noArgs, 128_000],
  ['governance.read', 'ACCOUNT', noArgs, 128_000],
  ['network.read', 'PROTOCOL', noArgs, 128_000],
  ['bridge.reserve.read', 'PROTOCOL', noArgs, 96_000],
  ['solana.rpc.health', 'PUBLIC', noArgs, 64_000],
  ['solana.token.validate', 'PROTOCOL', noArgs, 96_000],
  ['rag.search', 'PUBLIC', ragArgs, 128_000],
  ['charts.compose', 'PUBLIC', chartArgs, 256_000],
].map(([name, dataClass, validate, maxResultBytes]) => [name, { name, dataClass, validate, maxResultBytes }]));

export function toolContract(name: string) { return CONTRACTS[name]; }

export function validateToolRequest(request: AiToolRequest) {
  const contract = toolContract(request.name);
  if (!contract) throw new ApiError(403, 'AI_TOOL_CONTRACT_MISSING', 'AI tool has no approved contract');
  return { ...request, arguments: contract.validate(request.arguments ?? {}) };
}

export function assertToolResultSize(name: string, content: unknown) {
  const contract = toolContract(name);
  const bytes = Buffer.byteLength(JSON.stringify(content), 'utf8');
  if (contract && bytes > contract.maxResultBytes) throw new ApiError(502, 'AI_TOOL_RESULT_TOO_LARGE', `${name} returned more data than its approved contract allows`);
  return bytes;
}
