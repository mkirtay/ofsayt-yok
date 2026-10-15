import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminBotQueue from '@/components/AdminBotQueue';
import { adminPageGuard } from '@/lib/adminPageGuard';

/**
 * Yalnızca ADMIN: oturum yok/ADMIN değil → 404. Asıl koruma burada ve API uçlarındaki `requireAdmin`;
 * `src/middleware.ts`'teki `/admin/*` kontrolü ek bir katman.
 */
/** Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API'ler requireAdmin). */
export const getServerSideProps: GetServerSideProps = (ctx) => adminPageGuard(ctx);

export default function GundemQueuePage() {
  return (
    <>
      <Head>
        <title>Gündem onay kuyruğu</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminBotQueue />
    </>
  );
}
