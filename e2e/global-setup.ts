import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * The suite registers several accounts from one IP, which the production rate limiter
 * (10 registrations / hour / IP) would block on repeated local runs. Reset the counters
 * first — only ever against a local database.
 */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    try {
      const m = readFileSync('.env', 'utf8').match(/^DATABASE_URL="?([^"\n]+)"?/m);
      if (m) process.env.DATABASE_URL = m[1];
    } catch {
      /* no .env */
    }
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await db.rateLimit.deleteMany({});
  } finally {
    await db.$disconnect();
  }
}
