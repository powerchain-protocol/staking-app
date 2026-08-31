import 'server-only';import { systemHealth } from '@/lib/server/system-health';export const systemService={health:()=>systemHealth(false),readiness:()=>systemHealth(true)};
