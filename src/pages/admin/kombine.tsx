import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminCombo from '@/components/AdminCombo';
import AdminNav from '@/components/AdminNav';
import { adminPageGuard } from '@/lib/adminPageGuard';
import { comboToolEnabled } from '@/config/comboTool';

/**
 * Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts; API requireAdmin).
 * COMBO_TOOL_ENABLED kapalıyken sayfa da yok (404). noindex; hiçbir public sayfa bağlantı vermez.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  if (!comboToolEnabled()) return { notFound: true };
  return adminPageGuard(ctx);
};

export default function AdminComboPage() {
  return (
    <>
      <Head>
        <title>Kombine aracı</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminNav />
      <AdminCombo />
    </>
  );
}
