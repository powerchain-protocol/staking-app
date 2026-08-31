import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
await import('./check');
