import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Liveness + database check for load balancers and uptime monitors. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
