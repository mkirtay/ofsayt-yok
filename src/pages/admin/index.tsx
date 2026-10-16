import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import AdminHome, { type AdminCounters } from '@/components/AdminHome';
import { adminPageGuard } from '@/lib/adminPageGuard';
import { prisma } from '@/lib/prisma';
import { countOpenReportTargets } from '@/lib/moderation/adminAlert';

/**
 * Yönetici ana sayfası. Yalnızca ADMIN: geçerli oturum yok → giriş, ADMIN değil → 404 (lib/adminPageGuard.ts).
 * Sayaçlar ucuz: açık şikâyetli hedef sayısı ve bekleyen bot taslağı (status indeksli); hata olursa rozet gösterilmez.
 */
export const getServerSideProps: GetServerSideProps<{ counters: AdminCounters }> = async (ctx) => {
  const guard = await adminPageGuard(ctx);
  if (!('props' in guard)) return guard;
  const [openReports, pendingDrafts] = await Promise.all([
    countOpenReportTargets().catch(() => undefined),
    prisma.gundemBotDraft.count({ where: { status: 'PENDING' } }).catch(() => undefined),
  ]);
  const counters: AdminCounters = {};
  if (openReports !== undefined) counters.openReports = openReports;
  if (pendingDrafts !== undefined) counters.pendingDrafts = pendingDrafts;
  return { props: { counters } };
};

export default function AdminIndexPage({ counters }: { counters: AdminCounters }) {
  return (
    <>
      <Head>
        <title>Admin paneli</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AdminHome counters={counters} />
    </>
  );
}
