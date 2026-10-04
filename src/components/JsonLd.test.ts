import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from './JsonLd';

describe('serializeJsonLd — </script> kaçışı (güvenlik denetimi 2026-10-04)', () => {
  it('dış kaynaklı başlık betiği kapatamaz; JSON anlamı aynı', () => {
    const schema = { '@type': 'NewsArticle', headline: 'Gol </script><script>alert(1)</script> \u2028 son' };
    const out = serializeJsonLd(schema);
    expect(out).not.toMatch(/<\/?script/i);
    expect(out).not.toContain('<');
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual(schema);
  });
});
