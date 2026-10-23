import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminCoupons from '@/components/AdminCoupons';
import AdminNav from '@/components/AdminNav';
import { adminPageGuard } from '@/lib/adminPageGuard';

/** Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API requireAdmin). */
export const getServerSideProps: GetServerSideProps = (ctx) => adminPageGuard(ctx);

export default function AdminCouponsPage() {
  return (
    <>
      <Head>
        <title>Kuponlar — yönetici</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminNav />
      <AdminCoupons />
    </>
  );
}
