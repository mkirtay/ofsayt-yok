import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminUsers from '@/components/AdminUsers';
import AdminNav from '@/components/AdminNav';
import { adminPageGuard } from '@/lib/adminPageGuard';

/** Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API'ler requireAdmin). */
export const getServerSideProps: GetServerSideProps = (ctx) => adminPageGuard(ctx);

export default function AdminUsersPage() {
  return (
    <>
      <Head>
        <title>Kullanıcılar — yönetici</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminNav />
      <AdminUsers />
    </>
  );
}
