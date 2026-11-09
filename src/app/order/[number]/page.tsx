import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getOrderForm } from '@/app/actions/orders';
import { OrderForm } from './OrderForm';

export const metadata: Metadata = { title: 'Order', robots: { index: false } };

/** Public order page of a manufacturer (enabled in Settings → Module orders). */
export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  const form = /^\d{1,9}$/.test(number) ? await getOrderForm(n) : null;
  if (!form) notFound();
  return <OrderForm userNumber={n} form={form} />;
}
