import type { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';
import { stripe, STRIPE_PLANS, type PlanKey } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    const raw = await buffer(req);
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    captureError('payment/webhook signature', err);
    return res.status(400).json({ error: 'Webhook signature invalid' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, durationDays } = session.metadata ?? {};

    if (!userId || !durationDays) {
      return res.status(400).json({ error: 'Missing metadata' });
    }

    const days = parseInt(durationDays, 10);
    const premiumUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { premiumUntil },
      });
    } catch (err) {
      captureError('payment/webhook db update', err);
      return res.status(500).end();
    }
  }

  return res.status(200).json({ received: true });
}
