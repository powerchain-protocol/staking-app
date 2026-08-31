import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env, ConfigurationError } from '@/lib/server/config';

export function supabaseAdmin() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new ConfigurationError('Supabase admin client is not configured');
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function supabasePublicServer() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new ConfigurationError('Supabase public client is not configured');
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
