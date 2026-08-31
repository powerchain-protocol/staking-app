import 'server-only';
import { requireSession } from '@/lib/server/session';
export async function requireAuthenticatedRequest(){return requireSession();}
