import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/** Prisma 7 configuration: schema, migrations, seed and the database URL (from .env). */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Migrations need a direct connection; hosted Postgres (Neon) exposes it as DATABASE_URL_UNPOOLED.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED || env('DATABASE_URL') },
});
