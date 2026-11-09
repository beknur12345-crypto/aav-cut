import { createHash, randomBytes } from 'node:crypto';

/** Random URL-safe token for cookies and email links. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only hashes are stored, so a database leak does not leak usable sessions or reset links. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
