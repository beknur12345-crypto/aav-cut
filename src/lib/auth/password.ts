import bcrypt from 'bcryptjs';
import { z } from 'zod';

const COST = 12;

export const passwordSchema = z.string().min(8, 'passwordTooShort').max(200);
export const emailSchema = z.string().trim().toLowerCase().email('invalidEmail').max(254);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** A real hash to compare against when the user does not exist, so timing does not reveal accounts. */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= bcrypt.hash('dummy-password-for-timing', COST);
  await bcrypt.compare(password, await dummyHash);
  return false;
}
