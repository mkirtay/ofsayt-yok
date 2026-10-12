import type { ReactElement, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime';

export type HeadTag = { type: string; props: Record<string, unknown> };

/**
 * `next/head` çıktısını sunucu render'ındaki gibi toplar: Next'in kendi tekilleştirmesi (`key`, meta `name`) uygulanmış
 * son `<head>` öğeleri. Sunucuda `Head` her render'da `updateHead` çağırır; son çağrı geçerli olandır. Varsayılan etiketler
 * için `AppDefaultHead`'i sayfadan ÖNCE ver (`_app` sırası).
 */
export function renderHeadTags(node: ReactNode): HeadTag[] {
  let tags: ReactElement[] = [];
  const mountedInstances = new Set<unknown>();
  const headManager = {
    mountedInstances,
    updateHead: (state: ReactElement[]) => {
      tags = state;
    },
  };
  renderToString(<HeadManagerContext.Provider value={headManager as never}>{node}</HeadManagerContext.Provider>);
  return tags.map((t) => ({ type: String(t.type), props: (t.props ?? {}) as Record<string, unknown> }));
}

/** `property="og:image"` ya da `name="twitter:image"` gibi meta etiketlerini süzer. */
export function metaTags(tags: HeadTag[], attr: 'property' | 'name', value: string): HeadTag[] {
  return tags.filter((t) => t.type === 'meta' && t.props[attr] === value);
}

/** `<link rel="...">` etiketleri. */
export function linkTags(tags: HeadTag[], rel: string): HeadTag[] {
  return tags.filter((t) => t.type === 'link' && t.props.rel === rel);
}
