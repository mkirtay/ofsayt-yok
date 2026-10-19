/**
 * Yasal sayfalar: her belge iki dilde, taslak notu / avukat rozeti / köşeli parantezli yer tutucu yok (satış açıldı,
 * 2026-10-19), kredi metni kodla uyumlu; footer hepsine bağlı.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trLegal from '../../public/locales/tr/legal.json';
import enLegal from '../../public/locales/en/legal.json';
import trCommon from '../../public/locales/tr/common.json';
import enCommon from '../../public/locales/en/common.json';
import { LEGAL_PAGES } from './legalPages';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { ANALYSIS_UNLOCK_COST } from '@/lib/analysisUnlock';
import { SIGNUP_BONUS_CREDITS } from '@/lib/credits';
import { LEGAL_EFFECTIVE_DATE, SELLER } from './seller';
import { CREDIT_PACKAGES, formatTry } from './creditPackages';
import { DATA_PROCESSOR_NAMES } from './dataProcessors';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: 'tr' }),
  useTranslation: () => ({
    t: (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], trCommon) as string,
  }),
}));

vi.mock('next/head', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import Footer from '@/components/Footer';

type Doc = { pageTitle: string; pageDesc: string; intro: string; sections: { heading: string; body: string }[] };
const docs = (legal: typeof trLegal) => LEGAL_PAGES.map((p) => [p.docKey, legal[p.docKey] as Doc] as const);
const allText = (d: Doc) => [d.pageTitle, d.pageDesc, d.intro, ...d.sections.flatMap((s) => [s.heading, s.body])].join('\n');

describe('yasal sayfalar', () => {
  it('her rota için sayfa dosyası var; yollar benzersiz', () => {
    for (const p of LEGAL_PAGES) expect(existsSync(path.join(process.cwd(), 'src/pages', `${p.path}.tsx`))).toBe(true);
    expect(new Set(LEGAL_PAGES.map((p) => p.path)).size).toBe(LEGAL_PAGES.length);
  });

  it('TR/EN: aynı sayıda bölüm; taslak notu ve avukat rozeti alanı yok', () => {
    for (const p of LEGAL_PAGES) {
      const tr = trLegal[p.docKey] as Doc;
      const en = enLegal[p.docKey] as Doc;
      expect(en.sections.length).toBe(tr.sections.length);
      for (const d of [tr, en]) {
        expect(d, p.docKey).not.toHaveProperty('draftNotice');
        expect(JSON.stringify(d), p.docKey).not.toContain('"review"');
      }
    }
  });

  it('yer tutucu yok: köşeli parantez, "HUKUKİ METİN EKLENECEK", "Buraya Eklenecek" ya da "çok yakında" kalmadı', () => {
    for (const legal of [trLegal, enLegal]) {
      for (const [k, d] of docs(legal)) {
        const text = allText(d);
        expect(text.match(/\[[^\]]*\]/g) ?? [], k).toEqual([]);
        expect(text, k).not.toMatch(/HUKUKİ METİN|Buraya Eklenecek|To Be Added|çok yakında|coming soon|TASLAK|DRAFT/);
      }
    }
  });

  it('bahis dili yok', () => {
    for (const legal of [trLegal, enLegal]) for (const [k, d] of docs(legal)) {
      // Kullanım Şartları §3 sorumluluk reddi "bahis tavsiyesi değildir" der — yalnız yeni belgeler denetlenir.
      if (k === 'terms') continue;
      expect(findGamblingTerms(allText(d)), k).toEqual([]);
    }
  });

  it('Kullanım Şartları §4 kodla uyumlu: açma 1 kredi, doğrulamada 2 kredi, haftalık ücretsiz, paketler satışta', () => {
    expect(ANALYSIS_UNLOCK_COST).toBe(1);
    expect(SIGNUP_BONUS_CREDITS).toBe(2);
    const tr = trLegal.terms.sections[3]!.body;
    const en = enLegal.terms.sections[3]!.body;
    expect(tr).toMatch(/1 kredidir/);
    expect(tr).toMatch(/doğrulayan .*2 kredi/);
    expect(tr).toMatch(/her hafta/);
    expect(tr).toMatch(/Fiyatlandırma sayfasından satın alınabilir/);
    expect(en).toMatch(/costs 1 credit/);
    expect(en).toMatch(/2-credit signup bonus when they verify/);
    expect(en).toMatch(/can be bought on the Pricing page/);
  });

  it('noindex yalnız config/legalPages.ts\'teki sayfalarda (canonical yok); gizlilik ve şartlar indekslenir', () => {
    for (const p of LEGAL_PAGES) {
      const html = renderToStaticMarkup(<LegalDocPage docKey={p.docKey} />);
      if (p.noindex) {
        expect(html, p.path).toContain('<meta name="robots" content="noindex, follow"/>');
        expect(html, p.path).not.toContain('rel="canonical"');
      } else {
        expect(html, p.path).not.toContain('noindex');
        expect(html, p.path).toContain(`rel="canonical" href="https://`);
        expect(html, p.path).toContain(`${p.path}"`);
      }
    }
    expect(LEGAL_PAGES.find((p) => p.docKey === 'privacy')?.noindex).toBeUndefined();
  });

  it('render: taslak notu ve "Avukat onayı bekler" rozeti yok', () => {
    for (const p of LEGAL_PAGES) {
      const html = renderToStaticMarkup(<LegalDocPage docKey={p.docKey} />);
      expect(html, p.path).not.toContain('role="note"');
      expect(html, p.path).not.toContain('Avukat onayı bekler');
    }
  });

  it('footer: tüm yasal sayfalar + iletişim; etiketler iki dilde', () => {
    const html = renderToStaticMarkup(<Footer />);
    for (const p of LEGAL_PAGES) {
      expect(html).toContain(`href="${p.path}"`);
      const key = p.footerKey.split('.')[1] as keyof typeof trCommon.footer;
      expect(trCommon.footer[key]).toBeTruthy();
      expect(enCommon.footer[key as keyof typeof enCommon.footer]).toBeTruthy();
    }
    expect(html).toContain('href="/iletisim"');
  });
});

describe('Topluluk Kuralları', () => {
  it('inceleme süresi metne config/moderation.ts\'ten girer (tek kaynak); şikâyet / engelleme / iletişim anlatılır', async () => {
    const { REPORT_REVIEW_HOURS } = await import('@/config/moderation');
    const html = renderToStaticMarkup(<LegalDocPage docKey="community" />);
    expect(html).toContain(`en geç ${REPORT_REVIEW_HOURS} saat`);
    expect(html).not.toContain('{{reviewHours}}');
    expect(html).toMatch(/Şikâyet et/);
    expect(html).toMatch(/Engelleme/);
    expect(trLegal.community.sections.map((s) => s.body).join(' ')).toContain('{{contactEmail}}');
    expect(enLegal.community.sections.map((s) => s.body).join(' ')).toContain('{{reviewHours}}');
  });

  it('Kullanım Şartları §5: uygunsuz içerik yasağı + hesap kapatma, itiraz ve kalan kredi (iki dil)', () => {
    expect(trLegal.terms.sections[4]!.body).toMatch(/hesabı kapatabilir\. Hesap kapatma kararına \{\{contactEmail\}\} adresinden itiraz/);
    expect(trLegal.terms.sections[4]!.body).toMatch(/kullanılmamış kredi .*iade edilir/);
    expect(enLegal.terms.sections[4]!.body).toMatch(/close the account .*appealed by writing to \{\{contactEmail\}\}/);
  });
});

describe('satış belgeleri ve satıcı tek kaynağı', () => {
  const html = (k: Parameters<typeof LegalDocPage>[0]['docKey']) => renderToStaticMarkup(<LegalDocPage docKey={k} />);

  it('satıcı bilgisi config/seller.ts\'ten (ad, web sitesi, e-posta); ham değişken ({{…}}) sayfaya sızmaz', () => {
    for (const k of ['privacy', 'kvkk', 'refund', 'distanceSales', 'preInfo'] as const) {
      const h = html(k);
      expect(h, k).toContain(SELLER.name);
      expect(h, k).toContain(SELLER.email);
      expect(h, k).not.toMatch(/\{\{/);
    }
    expect(html('distanceSales')).toContain(`Satıcı: ${SELLER.name} · Web sitesi: ${SELLER.website}`);
  });

  it('render: sayfada köşeli parantezli yer tutucu yok', () => {
    for (const p of LEGAL_PAGES) {
      const text = html(p.docKey).replace(/<[^>]+>/g, ' ');
      expect(text.match(/\[[^\]]*\]/g) ?? [], p.path).toEqual([]);
    }
  });

  it('Mesafeli Satış + Ön Bilgilendirme: fiyat tablosu creditPackages.ts\'ten (KDV dahil), Hikie, anında teslim, cayma, Hakem Heyeti sınırı, yürürlük tarihi', () => {
    for (const k of ['distanceSales', 'preInfo'] as const) {
      const h = html(k);
      for (const p of CREDIT_PACKAGES) expect(h, k).toContain(formatTry(p.priceKurus));
      expect(h, k).toContain('Fiyat (KDV dahil)');
      expect(h, k).toContain('Hikie');
      expect(h, k).toMatch(/süresizdir/);
      expect(h, k).toMatch(/anında/);
      expect(h, k).toMatch(/cayma hakkının sona ereceğini/);
      expect(h, k).toMatch(/her yıl ilan edilen parasal sınır dâhilinde/);
      expect(h, k).toContain(`Yürürlük tarihi: ${LEGAL_EFFECTIVE_DATE}`);
      expect(h, k).not.toMatch(/premium/i);
    }
  });

  it('iade: kullanılmamış kredi kural olarak iade edilmez; hatalı / mükerrer tahsilat 14 gün içinde karta iade (iki dil)', () => {
    const tr = trLegal.refund.sections.map((x) => x.body).join(' ');
    const en = enLegal.refund.sections.map((x) => x.body).join(' ');
    expect(tr).toMatch(/kullanılmamış krediler kural olarak iade edilmez/);
    expect(tr).toMatch(/en geç 14 gün içinde iade edilir/);
    expect(en).toMatch(/unused credits are, as a rule, not refunded/);
    expect(en).toMatch(/within 14 days at the latest/);
  });

  it('Gizlilik §5 ve KVKK §6: veri alıcıları tablosu koddaki sağlayıcılarla', () => {
    for (const k of ['privacy', 'kvkk'] as const) {
      const h = html(k);
      for (const name of DATA_PROCESSOR_NAMES) expect(h, `${k} ${name}`).toContain(name.replace('&', '&amp;'));
    }
    expect(DATA_PROCESSOR_NAMES).toEqual(
      expect.arrayContaining(['Hikie', 'Resend', 'OpenAI', 'Supabase', 'Vercel', 'Upstash', 'Cloudflare (Turnstile)', 'Sentry', 'Google']),
    );
  });
});
