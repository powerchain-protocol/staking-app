import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env, ConfigurationError } from '@/lib/server/config';

function adminClient() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new ConfigurationError('Supabase storage is not configured');
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function putPrivateObject(path: string, data: Uint8Array, contentType = 'application/octet-stream') {
  const client = adminClient();
  const { data: result, error } = await client.storage.from(env.supabaseStorageBucket).upload(path, data, { contentType, upsert: false });
  if (error) throw error;
  return result;
}

export async function createPrivateDownloadUrl(path: string, expiresIn = 300) {
  const client = adminClient();
  const { data, error } = await client.storage.from(env.supabaseStorageBucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
