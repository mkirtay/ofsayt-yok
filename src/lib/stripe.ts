import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-04-22.dahlia',
});

export const STRIPE_PLANS = {
  monthly: {
    priceId: process.env.STRIPE_PRICE_ID_MONTHLY ?? '',
    label: 'Aylık',
    amount: 7900,
    currency: 'try',
    durationDays: 30,
  },
  yearly: {
    priceId: process.env.STRIPE_PRICE_ID_YEARLY ?? '',
    label: 'Yıllık',
    amount: 69900,
    currency: 'try',
    durationDays: 365,
  },
} as const;

export type PlanKey = keyof typeof STRIPE_PLANS;
