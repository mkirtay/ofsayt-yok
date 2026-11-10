/**
 * Yönetici sayfaları — /admin ana sayfası (kart listesi) ve testin tek kaynağı: src/pages/admin altındaki her sayfa burada
 * olmalı (adminPages.test.ts). Kullanıcıya görünen sitede (footer, menü) bu sayfalara bağlantı YOK; robots.txt ve
 * sitemap'te de yer almazlar (robots'a yazmak adresi duyurur; sayfalar noindex + yetki kapısı).
 */
export type AdminCounterKey = 'openReports' | 'pendingDrafts';

export type AdminPageDef = { path: string; title: string; description: string; counter?: AdminCounterKey };

export const ADMIN_PAGES: readonly AdminPageDef[] = [
  {
    path: '/admin/sikayetler',
    title: 'Şikâyetler',
    description: 'Gündem şikâyet kuyruğu, kelime listesi, işlem kaydı ve reddedilen içerik sayaçları.',
    counter: 'openReports',
  },
  {
    path: '/admin/gundem-kuyruk',
    title: 'Gündem onay kuyruğu',
    description: 'Resmi hesap botunun taslakları: onayla, düzenle, reddet.',
    counter: 'pendingDrafts',
  },
  {
    path: '/admin/kullanicilar',
    title: 'Kullanıcılar',
    description: 'Kullanıcı arama, kredi ekle / çıkar (gerekçeli).',
  },
  {
    path: '/admin/odemeler',
    title: 'Ödemeler',
    description: 'Ödeme siparişleri ve durumları.',
  },
  {
    path: '/admin/kuponlar',
    title: 'Kuponlar',
    description: 'Kupon kodu oluştur (kredi, kullanım sınırı, bitiş), aç / kapat, kullanım sayıları.',
  },
  {
    path: '/admin/tahmin',
    title: 'Tahmin oyunu',
    description: 'Haftalık 10 maçı seç ve yayınla, sonuç düzelt / iptal et (GAME_ENABLED kapalıyken 404).',
  },
];
