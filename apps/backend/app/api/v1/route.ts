import { ok, route } from '@/lib/server/http';
import { SYSTEM_CONFIG } from '@/config/system';
import { protocols } from '@/protocols';

export const runtime = 'nodejs';
export const GET = route(async () => ok({
  name: SYSTEM_CONFIG.name,
  version: SYSTEM_CONFIG.version,
  apiVersion: 'v1',
  resources: {
    auth: '/api/v1/auth/identity',
    walletAuth: '/api/v1/auth/wallet/challenge',
    confirmations: '/api/v1/auth/confirmations/challenge',
    systemHealth: '/api/v1/system/health',
    systemReadiness: '/api/v1/system/readiness',
    capabilities: '/api/v1/system/capabilities',
    endpoints: '/api/v1/endpoints',
    actions: '/api/v1/actions',
    realtimeStatus: '/api/v1/realtime/status',
    realtimeToken: '/api/v1/realtime/token',
    realtimeEvents: '/api/v1/realtime/events',
    portfolio: '/api/v1/portfolio',
    staking: '/api/v1/staking/positions',
    rewards: '/api/v1/rewards/overview',
    governance: '/api/v1/governance/proposals',
    bridge: '/api/v1/bridge/reserves',
    trustedTokens: '/api/v1/tokens/trusted',
    ai: '/api/v1/ai/capabilities',
    aiChat: '/api/v1/ai/chat',
    aiProviders: '/api/v1/ai/providers',
    aiAssistants: '/api/v1/ai/assistants',
    aiSkills: '/api/v1/ai/skills',
    aiRagSearch: '/api/v1/ai/rag/search',
    aiConversations: '/api/v1/ai/conversations',
  },
  protocols,
}));
