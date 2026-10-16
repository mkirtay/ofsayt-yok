import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminPayments from '@/components/AdminPayments';
import AdminNav from '@/components/AdminNav';
import { adminPageGuard } from '@/lib/adminPageGuard';

/** Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API'ler requireAdmin). */
export const getServerSideProps: GetServerSideProps = (ctx) => adminPageGuard(ctx);

export default function AdminPaymentsPage() {
  return (
    <>
      <Head>
        <title>Ödemeler — yönetici</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminNav />
      <AdminPayments />
    </>
  );
}
