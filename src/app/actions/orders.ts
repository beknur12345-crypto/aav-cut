'use server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/auth/rate-limit';
import { appUrl, sendMail } from '@/lib/mail';
import { parsePrefs } from '@/domain/prefs';
import { emptyDoc, newOperation, newPart, isSheetOp, type ElOperation, type ProjectDoc } from '@/domain/project';
import { projectCost } from '@/domain/calc';
import { fail, ok, type ActionResult } from './types';

const orderSchema = z.object({
  userNumber: z.number().int().min(1).max(1e9),
  customer: z.object({
    name: z.string().trim().min(1, 'required').max(120),
    phone: z.string().trim().min(3, 'required').max(40),
    email: z.union([z.literal(''), z.string().trim().email('invalidEmail').max(254)]),
    comment: z.string().max(2000),
  }),
  /** Honeypot: real people never fill this hidden field. */
  website: z.string().max(0).optional().or(z.literal('')),
  parts: z
    .array(z.object({
      materialId: z.string().min(1).max(40),
      length: z.number().finite().min(1).max(10000),
      width: z.number().finite().min(1).max(10000),
      qty: z.number().int().min(1).max(10000),
      name: z.string().trim().max(200),
      grain: z.boolean(),
      edges: z.object({ t: z.number().min(0).max(5), b: z.number().min(0).max(5), l: z.number().min(0).max(5), r: z.number().min(0).max(5) }),
    }))
    .min(1, 'orderNoParts')
    .max(500),
});
export type OrderInput = z.infer<typeof orderSchema>;

/** Public: what a customer needs to fill in the order form. Returns null when the module is off. */
export async function getOrderForm(userNumber: number) {
  if (!Number.isInteger(userNumber) || userNumber < 1) return null;
  const user = await db.user.findUnique({ where: { number: userNumber }, select: { id: true, prefs: true, currency: true } });
  if (!user) return null;
  const prefs = parsePrefs(user.prefs).orders;
  if (!prefs.enabled) return null;
  const materials = await db.material.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }], length: { gt: 0 }, width: { gt: 0 } },
    select: { id: true, name: true, thickness: true, length: true, width: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return { manufacturer: prefs.manufacturer, welcome: prefs.welcome, allowEdges: prefs.allowEdges, materials };
}

/** Public: creates an order project in the manufacturer's account (state Ordered, folder "Orders"). */
export async function submitOrder(input: OrderInput): Promise<ActionResult<{ orderNumber: number }>> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return fail(msg === 'required' || msg === 'invalidEmail' || msg === 'orderNoParts' ? msg : 'invalidInput');
  }
  const { userNumber, customer, parts, website } = parsed.data;
  if (website) return fail('invalidInput');
  if (!(await rateLimit(`order:${await clientIp()}`, 5, 60 * 60_000))) return fail('tooManyAttempts');

  const user = await db.user.findUnique({ where: { number: userNumber }, select: { id: true, email: true, prefs: true, currency: true, inputMode: true } });
  const prefs = user ? parsePrefs(user.prefs).orders : null;
  if (!user || !prefs?.enabled) return fail('notFound');

  const materialIds = [...new Set(parts.map((p) => p.materialId))];
  const materials = await db.material.findMany({ where: { id: { in: materialIds }, OR: [{ userId: null }, { userId: user.id }] } });
  if (materials.length !== materialIds.length) return fail('invalidInput');

  // One sheet-cutting operation per material, edgebands per thickness, all parts on one product.
  const doc: ProjectDoc = emptyDoc('detail');
  doc.products[0]!.name = customer.name.slice(0, 200);
  const els = new Map<number, ElOperation>();
  const elFor = (thickness: number) => {
    if (!thickness || !prefs.allowEdges) return null;
    let el = els.get(thickness);
    if (!el) {
      el = newOperation('EL', doc) as ElOperation;
      el.name = `Edgeband ${thickness} mm`;
      el.params.thickness = thickness;
      doc.operations.push(el);
      els.set(thickness, el);
    }
    return el.id;
  };
  for (const m of materials) {
    const op = newOperation('CS', doc, { id: m.id, name: m.name, code: m.code, thickness: m.thickness, price: Number(m.price), length: m.length, width: m.width });
    if (!isSheetOp(op)) continue;
    for (const p of parts.filter((x) => x.materialId === m.id)) {
      op.parts.push({
        ...newPart(doc.products[0]!.id), length: p.length, width: p.width, qty: p.qty, name: p.name, grain: p.grain,
        edges: { t: elFor(p.edges.t), b: elFor(p.edges.b), l: elFor(p.edges.l), r: elFor(p.edges.r) },
      });
    }
    doc.operations.unshift(op);
  }

  const folder = (await db.folder.findFirst({ where: { userId: user.id, parentId: null, name: 'Orders' } })) ?? (await db.folder.create({ data: { userId: user.id, name: 'Orders' } }));
  const project = await db.project.create({
    data: {
      userId: user.id, folderId: folder.id, name: `Order — ${customer.name}`.slice(0, 200), state: 'ORDERED', currency: user.currency,
      orderDate: new Date().toISOString().slice(0, 10), notes: customer.comment, doc: doc as unknown as Prisma.InputJsonValue,
      cost: projectCost(doc).cost, source: 'order', customer: customer as unknown as Prisma.InputJsonValue,
    },
  });
  if (prefs.notify) {
    const lines = [`New online order №${project.number}`, `${customer.name} · ${customer.phone}${customer.email ? ` · ${customer.email}` : ''}`, `${parts.length} part line(s)`, '', customer.comment, '', appUrl(`/projects/${project.id}`)];
    await sendMail(user.email, `New order №${project.number}: ${customer.name}`, lines.join('\n')).catch((e) => console.error('order mail failed', e));
  }
  return ok({ orderNumber: project.number });
}
