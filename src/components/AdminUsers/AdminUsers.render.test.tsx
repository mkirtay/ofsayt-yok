import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminUsers from './index';

describe('AdminUsers', () => {
  it('ilk görünüm: arama formu, açıklama; ayrıntı kartı yok', () => {
    const html = renderToStaticMarkup(<AdminUsers />);
    expect(html).toContain('Kullanıcılar');
    expect(html).toContain('aria-label="Kullanıcı ara"');
    expect(html).not.toContain('Kullanıcı ayrıntısı');
  });
});
