import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTH_HINT_ATTR, AUTH_HINT_KEY, AUTH_HINT_SCRIPT, writeAuthHint } from './authHint';

function fakes(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const attrs = new Map<string, string>();
  return {
    store,
    attrs,
    storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    root: { setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) },
  };
}

const runScript = (store: Record<string, string>) => {
  const f = fakes(store);
  new Function('localStorage', 'document', AUTH_HINT_SCRIPT)(f.storage, { documentElement: f.root });
  return f.attrs.get(AUTH_HINT_ATTR) ?? null;
};

describe('oturum düğmeleri yeri — ipucu', () => {
  it('betik: son oturum açıksa <html data-auth-hint="in">, değilse öznitelik yok', () => {
    expect(runScript({ [AUTH_HINT_KEY]: '1' })).toBe('in');
    expect(runScript({})).toBeNull();
  });

  it('oturum netleşince ipucu yazılır / silinir; yükleniyor iken dokunulmaz', () => {
    const f = fakes();
    writeAuthHint('loading', f.storage, f.root);
    expect(f.store.size + f.attrs.size).toBe(0);
    writeAuthHint('authenticated', f.storage, f.root);
    expect(f.store.get(AUTH_HINT_KEY)).toBe('1');
    expect(f.attrs.get(AUTH_HINT_ATTR)).toBe('in');
    writeAuthHint('unauthenticated', f.storage, f.root);
    expect(f.store.has(AUTH_HINT_KEY)).toBe(false);
    expect(f.attrs.has(AUTH_HINT_ATTR)).toBe(false);
  });

  it('depolama hata verirse (gizli mod) sessiz geçer', () => {
    const throwing = { setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => writeAuthHint('authenticated', throwing, fakes().root)).not.toThrow();
  });

  it('CSS: alan ziyaretçi genişliğinde (150 px), ipucuyla oturum açık genişliğinde (170 px: kredi çipi + zil + avatar)', () => {
    const scss = readFileSync(path.resolve(__dirname, '../components/Header/header.module.scss'), 'utf8');
    expect(scss).toMatch(/\.authSlot \{[^}]*justify-content: flex-end;[^}]*min-width: 150px;/);
    expect(scss).toMatch(/:global\(html\[data-auth-hint='in'\]\) \.authSlot \{\s*min-width: 170px;/);
    expect(scss).toMatch(/\.authPlaceholder \{\s*width: 100%;/);
    expect(scss).toMatch(/\.creditChip \{[^}]*height: 32px;/);
    const tsx = readFileSync(path.resolve(__dirname, '../components/Header/index.tsx'), 'utf8');
    expect(tsx).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: AUTH_HINT_SCRIPT \}\} \/>\s*<header/);
  });
});
