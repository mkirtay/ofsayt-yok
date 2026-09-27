import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Avatar, { avatarInitial } from './index';

describe('avatarInitial', () => {
  it('ad-soyad baş harfleri (ilk + son kelime), büyük harf', () => {
    expect(avatarInitial('Mucahid Kirtay')).toBe('MK');
    expect(avatarInitial('mucahid ali kirtay')).toBe('MK');
    expect(avatarInitial('  ilker   şahin ')).toBe('İŞ');
    expect(avatarInitial('Ada')).toBe('A');
    expect(avatarInitial('')).toBe('?');
    expect(avatarInitial(null)).toBe('?');
  });
});

describe('<Avatar />', () => {
  it('görsel yoksa baş harfler', () => {
    expect(renderToStaticMarkup(<Avatar name="Mucahid Kirtay" />)).toContain('>MK<');
  });

  it("görsel Referer'sız istenir (Google profil fotoğrafı Referer'lı isteği reddediyor)", () => {
    const html = renderToStaticMarkup(<Avatar name="Mucahid Kirtay" image="https://lh3.googleusercontent.com/a/x=s96-c" size={40} />);
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });
});
