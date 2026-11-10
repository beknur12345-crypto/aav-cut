import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Hosted Postgres URLs say sslmode=require, which pg currently treats as verify-full but will
 * weaken to libpq semantics in pg 9. Pin the strict behaviour explicitly (and silence the warning).
 */
export function strictSsl(url: string) {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, '$1verify-full');
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: strictSsl(url) }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
