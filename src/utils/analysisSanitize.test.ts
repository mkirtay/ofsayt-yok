import { describe, expect, it } from 'vitest';
import {
  MIN_KEPT_LENGTH,
  isPreCleanModelVersion,
  sanitizeDeep,
  sanitizeLegacyAnalysis,
  sanitizeText,
  splitSentences,
  stripGamblingSentences,
} from './analysisSanitize';
import { findGamblingTerms } from './gamblingTerms';

describe('splitSentences — Türkçe cümle bölme', () => {
  it('nokta / ünlem / soru + boşluk + büyük harf ya da rakam cümle sonu', () => {
    expect(splitSentences('Ev sahibi formda. Deplasman yorgun! Sonuç ne olur? 2 gol beklenir.')).toEqual([
      'Ev sahibi formda.',
      'Deplasman yorgun!',
      'Sonuç ne olur?',
      '2 gol beklenir.',
    ]);
  });

  it('"2.5" gibi ondalıklar, kısaltmalar, sıra sayıları ve baş harfler cümle sonu sayılmaz', () => {
    expect(splitSentences('Maç başına 2.5 gol ortalaması var. İkinci cümle.')).toEqual(['Maç başına 2.5 gol ortalaması var.', 'İkinci cümle.']);
    expect(splitSentences('Kanat oyunu, örn. Barış Alper, belirleyici. Son cümle.')).toEqual(['Kanat oyunu, örn. Barış Alper, belirleyici.', 'Son cümle.']);
    expect(splitSentences('Pres, kontra vb. Unsurlar öne çıkıyor.')).toHaveLength(1);
    expect(splitSentences('Takım 3. Lig\'den yükseldi. Savunma sağlam.')).toEqual(["Takım 3. Lig'den yükseldi.", 'Savunma sağlam.']);
    expect(splitSentences('85. Dakikada gol geldi.')).toHaveLength(1);
    expect(splitSentences('Hücumda M. Icardi kilit isim. Savunma sağlam.')).toEqual(['Hücumda M. Icardi kilit isim.', 'Savunma sağlam.']);
  });

  it('küçük harfle devam eden nokta cümle sonu değil; satır sonu her zaman sınır', () => {
    expect(splitSentences('Skor 2-1. ve devamı')).toHaveLength(1);
    expect(splitSentences('Birinci satır.\nikinci satır')).toEqual(['Birinci satır.', 'ikinci satır']);
  });
});

describe('stripGamblingSentences / sanitizeText', () => {
  it('bahis dili geçen cümle çıkarılır, diğerleri aynen kalır', () => {
    const r = stripGamblingSentences('Ev sahibi formda ve evinde güçlü görünüyor. Bahislerde ev sahibi galibiyeti makul. Deplasman yorgun.');
    expect(r).toEqual({ text: 'Ev sahibi formda ve evinde güçlü görünüyor. Deplasman yorgun.', removed: true });
  });

  it(`temizlik alanı boşaltır ya da ${MIN_KEPT_LENGTH} karakterin altına indirirse alan gizlenir ('')`, () => {
    expect(sanitizeText('İddia pazarında value var, oranlar düşüyor.')).toBe('');
    expect(sanitizeText('Kupon için banko maç. Kısa not.')).toBe('');
  });

  it('hiç cümle çıkmayan alana dokunulmaz (kısa olsa da)', () => {
    expect(sanitizeText('3G-1B-1M')).toBe('3G-1B-1M');
    expect(sanitizeText('Ev galibiyet oranı %60.')).toBe('Ev galibiyet oranı %60.');
  });

  it('dizilerde gizlenen maddeler atılır; sayı ve skor metinleri aynen', () => {
    expect(sanitizeDeep({ keyFactors: ['Hücum güçlü', 'Banko kupon maçı.'], home: 45, mostLikely: '2-1' })).toEqual({
      keyFactors: ['Hücum güçlü'],
      home: 45,
      mostLikely: '2-1',
    });
  });
});

describe('sanitizeLegacyAnalysis — yalnız v3-2026-10 öncesi', () => {
  const row = (modelVersion: string | null) => ({
    id: 'a',
    modelVersion,
    riskReasoning: 'Derbi atmosferi belirsizliği artırıyor. Oranlar düşüyor, para akışı ev sahibinden yana.',
    fullReport: { analystComment: 'Bahislerde ev sahibi galibiyeti makul görünüyor.', riskFactors: ['Erken gol senaryosu'] },
    teamAnalyses: { home: { narrative: 'Ev sahibi formda ve evinde güçlü görünüyor.', keyFactors: [] } },
  });

  it('sürüm ayrımı', () => {
    expect(isPreCleanModelVersion('v2-2026-07-anthropic:claude')).toBe(true);
    expect(isPreCleanModelVersion('v3-2026-10-openai:gpt')).toBe(false);
    expect(isPreCleanModelVersion('v10-2027-01')).toBe(false);
    expect(isPreCleanModelVersion(null)).toBe(true);
    expect(isPreCleanModelVersion('test')).toBe(true);
  });

  it('eski analiz: bahis cümleleri çıkar, boş kalan alan gizlenir, temiz alan aynen', () => {
    const out = sanitizeLegacyAnalysis(row('v2-2026-07-anthropic:claude'));
    expect(out.riskReasoning).toBe('');
    expect(out.fullReport.analystComment).toBe('');
    expect(out.fullReport.riskFactors).toEqual(['Erken gol senaryosu']);
    expect(out.teamAnalyses.home.narrative).toBe('Ev sahibi formda ve evinde güçlü görünüyor.');
  });

  it('v3 analizine dokunulmaz (aynı nesne)', () => {
    const r = row('v3-2026-10-anthropic:claude');
    expect(sanitizeLegacyAnalysis(r)).toBe(r);
  });
});

/** Rapor için: tarama SQL'inin 3. sorgusundaki metin türlerine benzer 5 sabit örnek. */
const SAMPLE_TEXTS = [
  "Galatasaray'ın deplasmandaki istikrarı ve hücum gücü maçın belirleyici faktörü olacak. Trabzonspor evinde direnç gösterebilir ancak savunma zaafları dezavantaj yaratıyor. Bahislerde Galatasaray galibiyeti ve üst gol seçenekleri makul görünüyor.",
  'İddia pazarında value var, oranlar düşüyor.',
  "Ev sahibi son 5 maçta ortalama 2.5 gol attı, örn. Konyaspor'a 3 gol buldu. 2.5 üst bahsi bu yüzden mantıklı görünüyor. İlk yarıda tempo yüksek olabilir.",
  'Piyasa hareketi ev sahibi lehine, banko kupon maçı. Kısa not.',
  "Takım 3. Lig'den yükseldi ve ev galibiyet oranı %60. Savunma istikrarlı, M. Icardi hücumda kilit isim.",
] as const;

describe('5 örnek metin — önce / sonra', () => {
  it('beklenen çıktılar', () => {
    expect(SAMPLE_TEXTS.map(sanitizeText)).toEqual([
      "Galatasaray'ın deplasmandaki istikrarı ve hücum gücü maçın belirleyici faktörü olacak. Trabzonspor evinde direnç gösterebilir ancak savunma zaafları dezavantaj yaratıyor.",
      '',
      "Ev sahibi son 5 maçta ortalama 2.5 gol attı, örn. Konyaspor'a 3 gol buldu. İlk yarıda tempo yüksek olabilir.",
      '',
      SAMPLE_TEXTS[4],
    ]);
    for (const out of SAMPLE_TEXTS.map(sanitizeText)) expect(findGamblingTerms(out)).toEqual([]);
  });
});
