import { describe, expect, it } from 'vitest';
import { canonicalNumericId, canonicalQuery, isCanonicalRequest, rawPathAndQuery, rawPathSegment } from './ogGuard';

const META = Symbol.for('NextInternalRequestMeta');

describe('rawPathAndQuery', () => {
  it("Next'in yeniden yazdığı req.url yerine ham initURL'i kullanır", () => {
    const req = { url: '/api/og/match/1?v=F_2-1', [META]: { initURL: 'https://x.test/api/og/match/1?v=F_2%2D1&id=9' } };
    expect(rawPathAndQuery(req as never)).toBe('/api/og/match/1?v=F_2%2D1&id=9');
    expect(rawPathAndQuery({ url: '/a?b=1' })).toBe('/a?b=1');
    expect(rawPathAndQuery({ url: undefined })).toBe('');
    expect(rawPathSegment({ url: '/api/og/match/0123?v=S' }, '/api/og/match/')).toBe('0123');
  });
});

describe('canonicalNumericId / canonicalQuery', () => {
  it('baştaki sıfır, sıfır, harf, uzunluk', () => {
    expect(canonicalNumericId('19745050', 12)).toBe('19745050');
    expect(canonicalNumericId('019745050', 12)).toBe('19745050');
    expect(canonicalNumericId('0', 12)).toBeNull();
    expect(canonicalNumericId('12a', 12)).toBeNull();
    expect(canonicalNumericId('1234567890', 9)).toBeNull();
    expect(canonicalNumericId(['5', '6'], 9)).toBe('5');
  });
  it('sıra korunur, boş değer yazılmaz, değer kodlanır', () => {
    expect(canonicalQuery([['l', 3], ['s', 75]])).toBe('?l=3&s=75');
    expect(canonicalQuery([['v', null]])).toBe('');
    expect(canonicalQuery([['v', 'a b']])).toBe('?v=a%20b');
  });
});

describe('isCanonicalRequest', () => {
  const c = '/api/og/match/19745050?v=F_2-1';
  const rp = { name: 'id', rawValue: '19745050' };

  it('birebir aynı → kanonik', () => {
    expect(isCanonicalRequest(c, c, rp)).toBe(true);
    expect(isCanonicalRequest('/api/og/frikik', '/api/og/frikik')).toBe(true);
  });

  it("Vercel'in eklediği tek nxtPid (yol parçasıyla aynı değer) yok sayılır", () => {
    expect(isCanonicalRequest('/api/og/match/19745050?nxtPid=19745050&v=F_2-1', c, rp)).toBe(true);
    expect(isCanonicalRequest('/api/og/match/19745050?v=F_2-1&nxtPid=19745050', c, rp)).toBe(true);
    expect(isCanonicalRequest('/api/og/match/19745050?nxtPid=19745050', '/api/og/match/19745050', rp)).toBe(true);
  });

  it.each([
    '/api/og/match/19745050?v=F_2-1&r=1', // izin dışı anahtar
    '/api/og/match/19745050?v=F_2-1&v=F_2-1', // tekrarlanan anahtar
    '/api/og/match/19745050?v=F_2%2D1', // farklı kodlama
    '/api/og/match/019745050?v=F_2-1', // baştaki sıfır
    '/api/og/match/19745050?V=F_2-1', // büyük harf anahtar
    '/api/og/match/19745050?v=F_2-1&id=1', // Next'in req.url'den sildiği rota anahtarı
    '/api/og/match/19745050?v=F_2-1&nxtPid=1', // farklı değerli nxtPid
    '/api/og/match/19745050?v=F_2-1&nxtPx=19745050', // başka nxtP anahtarı
    '/api/og/match/19745050?nxtPid=19745050&nxtPid=19745050&v=F_2-1', // iki kez
    '/api/og/match/19745050?v=F_2-1&', // boş çift
    '/api/og/match/19745050?v=F_2-1#x',
  ])('kanonik değil: %s', (raw) => {
    expect(isCanonicalRequest(raw, c, rp)).toBe(false);
  });

  it('frikik (rota parametresi yok): fazladan her şey kanonik dışı', () => {
    expect(isCanonicalRequest('/api/og/frikik?', '/api/og/frikik')).toBe(false);
    expect(isCanonicalRequest('/api/og/frikik?s=850&id=850', '/api/og/frikik?s=850')).toBe(false);
  });
});
