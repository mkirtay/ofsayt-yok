/**
 * Yasal sayfalar: her belge iki dilde, en üstte taslak notu, yer tutucular yalnız izinli listeden (raporda kullanıcıya
 * verilen liste), kredi metni kodla uyumlu ve satın almayı bugün mümkünmüş gibi anlatmıyor; footer hepsine bağlı.
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
import { LEGAL_EFFECTIVE_DATE, SELLER, SELLER_PLACEHOLDERS, sellerHasPlaceholders } from './seller';
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

/** Kullanıcının dolduracağı alanlar (Aşama 1 raporundaki liste). `[HUKUKİ METİN EKLENECEK: …]` avukat metni içindir. */
const ALLOWED_PLACEHOLDERS = new Set<string>([...SELLER_PLACEHOLDERS, '[GÜNCEL PARASAL SINIR]']);

type Doc = { pageTitle: string; pageDesc: string; intro: string; draftNotice: string; sections: { heading: string; body: string }[] };
const docs = (legal: typeof trLegal) => LEGAL_PAGES.map((p) => [p.docKey, legal[p.docKey] as Doc] as const);
const allText = (d: Doc) => [d.pageTitle, d.pageDesc, d.intro, ...d.sections.flatMap((s) => [s.heading, s.body])].join('\n');

describe('yasal sayfalar', () => {
  it('her rota için sayfa dosyası var; yollar benzersiz', () => {
    for (const p of LEGAL_PAGES) expect(existsSync(path.join(process.cwd(), 'src/pages', `${p.path}.tsx`))).toBe(true);
    expect(new Set(LEGAL_PAGES.map((p) => p.path)).size).toBe(LEGAL_PAGES.length);
  });

  it('TR/EN: her belgede taslak notu ve aynı sayıda bölüm', () => {
    for (const p of LEGAL_PAGES) {
      const tr = trLegal[p.docKey] as Doc;
      const en = enLegal[p.docKey] as Doc;
      expect(tr.draftNotice).toMatch(/^TASLAK — avukat onayı bekliyor\. .*hukuki inceleme/);
      expect(en.draftNotice).toMatch(/^DRAFT — awaiting lawyer approval\. .*legal review/);
      expect(en.sections.length).toBe(tr.sections.length);
    }
  });

  it('yer tutucular yalnız izinli listeden; eski "Buraya Eklenecek" kalıbı yok', () => {
    for (const legal of [trLegal, enLegal]) {
      for (const [, d] of docs(legal)) {
        const text = allText(d);
        for (const m of text.match(/\[[^\]]*\]/g) ?? []) {
          expect(ALLOWED_PLACEHOLDERS.has(m) || m.startsWith('[HUKUKİ METİN EKLENECEK: '), m).toBe(true);
        }
        expect(text).not.toMatch(/Buraya Eklenecek|To Be Added/);
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

  it('Kullanım Şartları §4 kodla uyumlu: açma 1 kredi, doğrulamada 2 kredi, haftalık ücretsiz, satın alma çok yakında', () => {
    expect(ANALYSIS_UNLOCK_COST).toBe(1);
    expect(SIGNUP_BONUS_CREDITS).toBe(2);
    const tr = trLegal.terms.sections[3]!.body;
    const en = enLegal.terms.sections[3]!.body;
    expect(tr).toMatch(/1 kredidir/);
    expect(tr).toMatch(/doğrulayan .*2 kredi/);
    expect(tr).toMatch(/her hafta/);
    expect(tr).toMatch(/çok yakında/);
    expect(tr).toMatch(/satılmamakta/);
    expect(en).toMatch(/costs 1 credit/);
    expect(en).toMatch(/2-credit signup bonus when they verify/);
    expect(en).toMatch(/coming soon/);
  });

  it('satış belgeleri satışın henüz olmadığını en başta söyler', () => {
    for (const k of ['refund', 'distanceSales', 'preInfo'] as const) {
      expect(trLegal[k].intro).toMatch(/çok yakında/);
      expect(enLegal[k].intro).toMatch(/coming soon/);
    }
  });

  it('noindex: taslak sayfalar + satıcı yer tutucusu taşıyan gizlilik noindex (canonical yok); şartlar indekslenir', () => {
    expect(sellerHasPlaceholders()).toBe(true);
    const draft = ['kvkk', 'cookies', 'distanceSales', 'preInfo', 'refund', 'community', 'privacy'];
    for (const p of LEGAL_PAGES) {
      const html = renderToStaticMarkup(<LegalDocPage docKey={p.docKey} />);
      if (draft.includes(p.docKey)) {
        expect(html, p.path).toContain('<meta name="robots" content="noindex, follow"/>');
        expect(html, p.path).not.toContain('rel="canonical"');
      } else {
        expect(html, p.path).not.toContain('noindex');
        expect(html, p.path).toContain(`rel="canonical" href="https://`);
        expect(html, p.path).toContain(`${p.path}"`);
      }
    }
  });

  it('render: taslak notu başlıktan önce (role=note)', () => {
    const html = renderToStaticMarkup(<LegalDocPage docKey="kvkk" />);
    const note = html.indexOf('role="note"');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(html.indexOf('<h1'));
    expect(html).toContain(trLegal.kvkk.draftNotice);
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

  it('Kullanım Şartları §5: uygunsuz içerik yasağı + hesap kapatma maddesi avukat işaretiyle (iki dil)', () => {
    expect(trLegal.terms.sections[4]!.body).toMatch(/hesabı kapatabilir\. \[HUKUKİ METİN EKLENECEK: /);
    expect(enLegal.terms.sections[4]!.body).toMatch(/close the account .*\[HUKUKİ METİN EKLENECEK: /);
  });
});

describe('satış belgeleri ve satıcı tek kaynağı', () => {
  const html = (k: Parameters<typeof LegalDocPage>[0]['docKey']) => renderToStaticMarkup(<LegalDocPage docKey={k} />);

  it('satıcı bilgisi config/seller.ts\'ten; ham değişken ({{…}}) sayfaya sızmaz; JSON\'da satıcı yer tutucusu elle yazılmaz', () => {
    for (const k of ['privacy', 'kvkk', 'refund', 'distanceSales', 'preInfo'] as const) {
      const h = html(k);
      expect(h, k).toContain(SELLER.legalName);
      expect(h, k).not.toMatch(/\{\{/);
      expect(JSON.stringify(trLegal[k]), k).not.toContain('[ŞİRKET/KİŞİ ÜNVANI]');
    }
    expect(html('distanceSales')).toContain(SELLER.kep);
  });

  it('render: yalnız izinli yer tutucular (satıcı + Hakem Heyeti sınırı + avukat metni)', () => {
    for (const p of LEGAL_PAGES) {
      const text = html(p.docKey).replace(/<[^>]+>/g, ' ');
      for (const m of text.match(/\[[^\]]*\]/g) ?? []) {
        expect(ALLOWED_PLACEHOLDERS.has(m) || m.startsWith('[HUKUKİ METİN EKLENECEK: ') || m === '[…]', `${p.path} ${m}`).toBe(true);
      }
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
      expect(h, k).toContain('[GÜNCEL PARASAL SINIR]');
      expect(h, k).toContain(`Yürürlük tarihi: ${LEGAL_EFFECTIVE_DATE}`);
      expect(h, k).toContain('Avukat onayı bekler');
      expect(h, k).not.toMatch(/premium/i);
    }
  });

  it('hukuki iddia içeren bölümler işaretli; satıcı / iletişim satırları işaretsiz', () => {
    const ds = trLegal.distanceSales.sections as { heading: string; review?: boolean }[];
    expect(ds.filter((s) => s.review).map((s) => s.heading)).toEqual(
      expect.arrayContaining(['7. Cayma Hakkı', '9. Şikâyet ve Uyuşmazlıkların Çözümü', '4. Fiyat']),
    );
    expect(ds.find((s) => s.heading === '1. Satıcı')?.review).toBeUndefined();
    for (const k of ['distanceSales', 'preInfo'] as const) {
      expect((enLegal[k].sections as { review?: boolean }[]).map((s) => !!s.review)).toEqual(
        (trLegal[k].sections as { review?: boolean }[]).map((s) => !!s.review),
      );
    }
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
