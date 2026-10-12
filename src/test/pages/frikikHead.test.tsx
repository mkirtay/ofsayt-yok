/** /frikik `<head>`: paylaşım görseli `_app` varsayılanının yerine geçer, tek og:image / tek twitter:image. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/Frikik', () => ({ default: () => null }));

import AppDefaultHead from '@/components/AppDefaultHead';
import FrikikPage from '@/pages/frikik';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';
import { siteBaseUrl } from '@/lib/siteUrl';
import { linkTags, metaTags, renderHeadTags } from '@/test/headTags.testutil';

const render = (shared: Parameters<typeof FrikikPage>[0]['shared']) =>
  renderHeadTags(
    <>
      <AppDefaultHead />
      <FrikikPage shared={shared} />
    </>,
  );

const one = (tags: ReturnType<typeof render>, attr: 'property' | 'name', value: string) => {
  const found = metaTags(tags, attr, value);
  expect(found, `${attr}=${value}`).toHaveLength(1);
  return found[0]!.props.content;
};

describe('/frikik head', () => {
  it.each([
    ['paylaşımsız', null],
    ['paylaşım bağlantısı (?l=&s=)', { level: 7, score: 2450 }],
  ] as const)('%s: tek og:image ve tek twitter:image, ikisi de sayfanın görseli (varsayılan değil)', (_name, shared) => {
    const tags = render(shared as never);
    const og = one(tags, 'property', 'og:image');
    const tw = one(tags, 'name', 'twitter:image');
    expect(og).toBe(tw);
    expect(String(og)).toContain(`${siteBaseUrl()}/api/og/frikik`);
    expect(og).not.toBe(`${siteBaseUrl()}${OG_DEFAULT_IMAGE.path}`);
    for (const [attr, v] of [
      ['property', 'og:image:width'],
      ['property', 'og:image:height'],
      ['property', 'og:image:alt'],
      ['name', 'twitter:card'],
      ['name', 'twitter:image:alt'],
    ] as const) {
      one(tags, attr, v);
    }
    expect(one(tags, 'property', 'og:image:alt')).not.toBe(OG_DEFAULT_IMAGE.alt);
  });

  it('canonical tek ve query\'siz', () => {
    const canon = linkTags(render({ level: 3, score: 900 } as never), 'canonical');
    expect(canon).toHaveLength(1);
    expect(canon[0]!.props.href).toBe(`${siteBaseUrl()}/frikik`);
  });

  it('kendi görseli olmayan sayfada varsayılan görsel tek kalır', () => {
    const tags = renderHeadTags(<AppDefaultHead />);
    expect(one(tags, 'property', 'og:image')).toBe(`${siteBaseUrl()}${OG_DEFAULT_IMAGE.path}`);
  });
});
