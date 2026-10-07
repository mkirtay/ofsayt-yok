import { describe, expect, it } from 'vitest';
import { checkNickname, normalizeNickname } from './nickname';

describe('takma ad denetimi', () => {
  it('biçim: 3–30, harf/rakam/alt çizgi; kırpılır', () => {
    expect(checkNickname('  eren_34 ')).toEqual({ ok: true, value: 'eren_34' });
    for (const bad of ['ab', 'a'.repeat(31), 'ali veli', 'ali-veli', 'çağlar', '', null, 42]) {
      expect(checkNickname(bad), String(bad)).toEqual({ ok: false, reason: 'format' });
    }
  });

  it('uygunsuz içerik: TR / EN kalıpları, leet ve alt çizgi gizlemesi yakalanır', () => {
    for (const bad of ['amk_eren', 'S1kt1r_git', 'orospu1', 'Yarrak', 'f_u_c_k', 'bitch99', 'sh1t', 'n1gga', 'hitler88', 'ibne_', 'g0tveren', 'pezevenk']) {
      expect(checkNickname(bad), bad).toEqual({ ok: false, reason: 'blocked' });
    }
  });

  it('yanlış pozitif yok: masum adlar geçer', () => {
    for (const ok of ['klasik', 'fizikci', 'pusula', 'picasso', 'cockpit_x', 'mustafa', 'ayse_k', 'ankara_06', 'scunthorpe', 'tasarim', 'gotham', 'dickens', 'assistant']) {
      expect(checkNickname(ok), ok).toEqual({ ok: true, value: ok });
    }
  });

  it('ayrılmış adlar: marka ve yetkili izlenimi', () => {
    for (const r of ['admin', 'Admin_1', 'OfsaytYok', 'ofsayt_yok', 'moderator', 'official_x', 'destek', 'bot']) {
      expect(checkNickname(r), r).toEqual({ ok: false, reason: 'reserved' });
    }
  });

  it('normalize: TR harfleri, leet, tekrar', () => {
    expect(normalizeNickname('Şşş_İ4m')).toBe('ssiam');
    expect(normalizeNickname('a___b')).toBe('ab');
  });
});
