import 'server-only';
import nodemailer from 'nodemailer';

/** Sends mail through SMTP_URL; without it (development) the message is printed to the server log. */
export async function sendMail(to: string, subject: string, text: string) {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_URL is not configured');
    console.info(`[mail] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({ from: process.env.MAIL_FROM ?? 'no-reply@localhost', to, subject, text });
}

export function appUrl(path: string) {
  return new URL(path, process.env.APP_URL ?? 'http://localhost:3100').toString();
}
