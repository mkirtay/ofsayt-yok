import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminReports from '@/components/AdminReports';
import { adminPageGuard } from '@/lib/adminPageGuard';

/** Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API'ler requireAdmin). */
export const getServerSideProps: GetServerSideProps = (ctx) => adminPageGuard(ctx);

export default function AdminReportsPage() {
  return (
    <>
      <Head>
        <title>Şikâyetler — yönetici</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminReports />
    </>
  );
}
