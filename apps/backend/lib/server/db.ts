import 'server-only';
import postgres from 'postgres';
import { env, ConfigurationError } from './config';

let client: ReturnType<typeof postgres> | null = null;

export function db() {
  if (!env.databaseUrl) throw new ConfigurationError('DATABASE_URL is required for this operation');
  if (!client) {
    client = postgres(env.databaseUrl, {
      max: env.nodeEnv === 'production' ? 10 : 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: { undefined: null },
    });
  }
  return client;
}

export type Sql = ReturnType<typeof db>;
