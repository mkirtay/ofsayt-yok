import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { stripe, STRIPE_PLANS, type PlanKey } from '@/lib/stripe';
import { captureError } from '@/lib/logger';

function appBaseUrl(req: NextApiRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  }

  const { plan } = req.body as { plan?: string };
  if (!plan || !(plan in STRIPE_PLANS)) {
    return res.status(400).json({ error: 'Geçersiz plan. "monthly" veya "yearly" olmalı.' });
  }

  const planConfig = STRIPE_PLANS[plan as PlanKey];
  const base = appBaseUrl(req);

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: planConfig.currency,
            unit_amount: planConfig.amount,
            product_data: {
              name: `Ofsayt Yok Premium — ${planConfig.label}`,
              description: `${planConfig.durationDays} günlük premium üyelik`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: session.user.id,
        plan,
        durationDays: String(planConfig.durationDays),
      },
      customer_email: session.user.email ?? undefined,
      success_url: `${base}/premium?payment=success`,
      cancel_url: `${base}/premium?payment=cancelled`,
    });

    return res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    captureError('payment/create-checkout', err);
    return res.status(500).json({ error: 'Ödeme başlatılamadı. Lütfen tekrar deneyin.' });
  }
}
