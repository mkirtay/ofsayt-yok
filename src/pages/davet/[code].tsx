import type { GetServerSideProps } from 'next';
import { normalizeReferralCode } from '@/lib/referral';
import { REFERRAL_COOKIE } from '@/lib/referralClient';

/**
 * Davet linki (büyüme raporu 2.3): /davet/{kod} → `scor3_ref` çerezi (30 gün) + kayıt sayfasına yönlendirme. Kod
 * geçersizse çerez yazılmaz, yine kayıt sayfasına gider. Sayfa içeriği yok (yalnız yönlendirme).
 */
export const getServerSideProps: GetServerSideProps = async ({ params, res }) => {
  const code = normalizeReferralCode(params?.code);
  if (code) res.setHeader('Set-Cookie', `${REFERRAL_COOKIE}=${code}; Max-Age=${30 * 86_400}; Path=/; SameSite=Lax; Secure`);
  res.setHeader('Cache-Control', 'private, no-store');
  return { redirect: { destination: '/auth/signup?src=davet', permanent: false } };
};

export default function InviteRedirect() {
  return null;
}
