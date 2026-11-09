import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/** Prisma 7 configuration: schema, migrations, seed and the database URL (from .env). */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
