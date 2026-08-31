import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __powerchainPrisma?: PrismaClient };

export const prisma = globalForPrisma.__powerchainPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn','error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.__powerchainPrisma = prisma;
