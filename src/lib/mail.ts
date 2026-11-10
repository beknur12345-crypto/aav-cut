import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Mail goes out through Resend (RESEND_API_KEY, set by the Vercel integration) or any SMTP_URL.
 * Without either (development) the message is printed to the server log.
 */
function transport() {
  if (process.env.RESEND_API_KEY) {
    return nodemailer.createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: process.env.RESEND_API_KEY } });
  }
  if (process.env.SMTP_URL) return nodemailer.createTransport(process.env.SMTP_URL);
  return null;
}

export async function sendMail(to: string, subject: string, text: string) {
  const t = transport();
  if (!t) {
    if (process.env.NODE_ENV === 'production') throw new Error('No mail provider configured (RESEND_API_KEY or SMTP_URL)');
    console.info(`[mail] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM ?? 'no-reply@localhost', to, subject, text });
}

/** Absolute link for emails: APP_URL, else the Vercel production domain, else localhost. */
export function appUrl(path: string) {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.APP_URL || (vercel ? `https://${vercel}` : 'http://localhost:3100');
  return new URL(path, base).toString();
}
