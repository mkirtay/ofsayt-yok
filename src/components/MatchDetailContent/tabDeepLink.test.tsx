import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyTabDeepLink, tabFromSearch } from './tabDeepLink';
import MatchTabs, { markVisited } from '@/components/MatchTabs';
import type { MatchAnalysisState } from '@/hooks/useMatchAnalysis';

vi.mock('@/components/KuralKosesi/DailyFactCard', () => ({ default: () => null }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: 'u' } } }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }), useI18n: () => ({ locale: 'tr' }) }));

const src = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('maç sayfası sekme derin bağlantısı (?sekme=ai-analiz)', () => {
  it('adres → sekme: sorgu, tam yol ve parça ile; bilinmeyen değer yok sayılır', () => {
    expect(tabFromSearch('?sekme=ai-analiz')).toBe('analysis');
    expect(tabFromSearch('/matches/19746594-galatasaray-kasimpasa?sekme=ai-analiz#x')).toBe('analysis');
    expect(tabFromSearch('?a=1&sekme=ai-analiz')).toBe('analysis');
    for (const none of ['', '?sekme=forum', '?sekme=__proto__', '?sekme=constructor', '/matches/1-a-b', '?tab=ai-analiz']) expect(tabFromSearch(none), none).toBeNull();
  });

  it('yalnız sekmeyi seçer ve kaydırır; sekme yoksa hiçbir şey yapmaz', () => {
    const selectTab = vi.fn();
    const scrollToTabs = vi.fn();
    expect(applyTabDeepLink('/matches/1-a-b?sekme=ai-analiz', { selectTab, scrollToTabs })).toBe(true);
    expect(selectTab.mock.calls).toEqual([['analysis']]);
    expect(scrollToTabs).toHaveBeenCalledTimes(1);
    expect(applyTabDeepLink('/matches/1-a-b', { selectTab, scrollToTabs })).toBe(false);
    expect(selectTab).toHaveBeenCalledTimes(1);
  });

  it('GÜVENCE: bağlantı analiz üretimini / kredi harcamayı başlatamaz', async () => {
    // 1) Derin bağlantı modülünün hiçbir bağımlılığı yok: yalnız kendisine verilen iki işlemi (seç, kaydır) çağırabilir.
    expect(src('./tabDeepLink.ts')).not.toMatch(/^\s*import\s|fetch\(|\bgenerate\w*\(|\bunlock\w*\(/m);
    // 2) Maç detayı derin bağlantıya yalnız `setActive` ve kaydırmayı verir; üretim işlevini hiç çağırmaz.
    const detail = src('./index.tsx');
    expect(detail).toContain('applyTabDeepLink(url, { selectTab: setActive, scrollToTabs })');
    expect(detail).not.toMatch(/\.generate\b|generateAnalysis|method:\s*'POST'/);
    // 3) AI Analiz sekmesi üretimi yalnız tıklamayla başlatır: `generate` yalnız olay işleyicilerinde, effect yok.
    const analysis = src('../MatchAnalysis/index.tsx');
    expect(analysis).not.toMatch(/useEffect|useLayoutEffect/);
    const uses = [...analysis.matchAll(/^.*generateAnalysis.*$/gm)].map((m) => m[0].trim());
    expect(uses.filter((l) => !/generate: generateAnalysis|on(Click|Unlock)=\{/.test(l))).toEqual([]);
    // 4) Sekme açılıp çizildiğinde (analiz yok, kullanıcı girişli, kredisi var) üretim çağrılmaz.
    const generate = vi.fn(async () => {});
    const { default: MatchAnalysis } = await import('@/components/MatchAnalysis');
    const state = { analysis: null, preview: null, offer: null, predictionRecord: null, serverPhase: 'PRE', loading: false, generating: false, inProgress: false, error: null, credits: 5, unlimited: false, isAuthenticated: true, generate } as unknown as MatchAnalysisState;
    const html = renderToStaticMarkup(<MatchAnalysis match={null} state={state} />);
    expect(html.length).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
    // 5) Analiz hook'unda POST yalnız `generate` içinde; açılışta yalnız okuma (GET) var.
    const hook = src('../../hooks/useMatchAnalysis.ts');
    expect([...hook.matchAll(/method: 'POST'/g)]).toHaveLength(1);
    expect(hook.indexOf("method: 'POST'")).toBeGreaterThan(hook.indexOf('const generate = useCallback'));
  });

  it('dışarıdan seçilen (hiç açılmamış) sekmenin paneli de çizilir', () => {
    expect(markVisited(['overview'], 'analysis')).toEqual(['overview', 'analysis']);
    const same = ['overview', 'analysis'] as const;
    expect(markVisited(same, 'analysis')).toBe(same);
    const tabs = [
      { key: 'overview', label: 'Genel', render: () => <p>GENEL</p> },
      { key: 'analysis', label: 'AI', render: () => <p>ANALIZ</p> },
    ];
    const html = renderToStaticMarkup(<MatchTabs tabs={tabs} active="analysis" onChange={() => {}} ariaLabel="x" />);
    expect(html).toContain('ANALIZ');
    expect(html).not.toContain('GENEL');
    expect(html).toMatch(/aria-selected="true"[^>]*>AI/);
  });
});
