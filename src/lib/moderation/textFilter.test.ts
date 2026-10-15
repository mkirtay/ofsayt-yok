import { describe, expect, it } from 'vitest';
import base from '@/config/moderationTerms.json';
import {
  analyzeText,
  compileDictionary,
  countLinks,
  duplicateFingerprint,
  type FilterTerm,
} from './textFilter';

const dict = compileDictionary(base.terms as FilterTerm[], base.allow);
const level = (s: string) => analyzeText(s, dict).level;

describe('AĞIR (reddedilir)', () => {
  it.each([
    'amk',
    'AMK hakem',
    'amkkkkk',
    'a m k',
    'a.m.k',
    'a*m*k bu ne',
    '4mk',
    'amına koyayım',
    'AMINAKOYİM',
    'siktir git',
    'SİKTİR',
    'SIKTIR lan', // İngilizce klavye büyük harf
    's i k t i r',
    's.i.k.t.i.r',
    's1kt1r',
    'sikerim böyle işi',
    'orospu çocuğu',
    'o.r.o.s.p.u',
    'orrrospu',
    '0r0spu',
    'piç kurusu',
    'piçler',
    'götüne sokayım',
    'yarrak',
    'taşşak geçiyor',
    'pezevenk hakem',
    'ibne',
    'pis suriyeliler',
    'seni öldürürüm',
    'öldüreceğim seni',
    'gebertirim seni',
    'kafanı keserim',
    'fuck this',
    'f.u.c.k',
    'www.orospu.com',
    'siktir@gmail.com',
    'https://ornek.com/amk',
    'yavşak',
    'gotveren',
  ])('%s', (s) => {
    expect(level(s)).toBe('block');
  });
});

describe('ORTA (işaretlenir)', () => {
  it.each(['hakem salak', 'gerizekalı mısın', 'geri zekalı', 'şerefsiz', 's*kt*r', 'deneme bonusu veren site', 'mk ya', 'o*ospu'])(
    '%s',
    (s) => {
      expect(level(s)).toBe('flag');
    },
  );
});

describe('yanlış pozitif yok (masum kelimeler)', () => {
  it.each([
    'Bu maç çok sıktı',
    'MAÇ ÇOK SIKTI',
    'sıkıntılı bir maçtı',
    'SIKINTI YOK',
    'sıkıcı bir ilk yarı',
    'savunma sıkıştı',
    'sık sık gol atıyor',
    'SIK SIK GOL',
    'sıktım dişimi',
    'Amin',
    'âmin',
    'Ankara deplasmanı',
    'klasik bir derbi',
    'fizik gücü yüksek',
    'kasık sakatlığı',
    'Kasımpaşa',
    'şikâyet ettim',
    'şikayet',
    'topu götürdü',
    'götürdüğü top',
    'I got it',
    'pic of the day',
    'Göztepe',
    'aşk',
    'rakamlar',
    'amatör lig',
    'amca',
    'Gavurdağı', // flag listesinde 'gavur' prefix — aşağıda ayrı
    'analiz',
    'ananas',
    'tasarım',
    'cunta',
    'saksafon',
    'saksofon',
    'Mehmet Topal',
    'Hakem bugün çok kötüydü',
    'sikke koleksiyonu',
    'Galatasaray 3-1 Fenerbahçe',
    '10 numara pas',
    'skor 4-0',
    'Puşkin',
    'yarar',
    'yaralandı',
    'öldürücü pas',
    'maçı öldürdü',
    'Gebze',
    'tecrübe',
    'country',
    'scunthorpe', // kelime içi 'cunt' — exact kuralı
    'şampiyon',
    'Malatyaspor',
    'aptallar', // ORTA, red değil
  ])('%s', (s) => {
    expect(level(s)).not.toBe('block');
  });

  it.each([
    'Bu maç çok sıktı',
    'sıkıntılı bir maçtı',
    'sık sık gol atıyor',
    'Amin',
    'Ankara deplasmanı',
    'klasik bir derbi',
    'kasık sakatlığı',
    'şikâyet ettim',
    'topu götürdü',
    'I got it',
    'tasarım',
    'cunta',
    'saksofon',
    'öldürücü pas',
    'Galatasaray 3-1 Fenerbahçe',
    'scunthorpe',
  ])('işaret de yok: %s', (s) => {
    expect(level(s)).toBe('ok');
  });
});

describe('kategori ve gizlilik', () => {
  it('kelimeyi değil yalnız kategoriyi döndürür', () => {
    const v = analyzeText('seni öldürürüm orospu', dict);
    expect(v.level).toBe('block');
    expect(v.categories).toEqual(['profanity', 'threat']);
    expect(JSON.stringify(v)).not.toMatch(/orospu|oldur/);
  });

  it('istisna listesi (allow) kelimenin tamamını korur', () => {
    const d = compileDictionary([{ t: 'test', m: 'prefix', l: 'block', c: 'x' }], ['testere']);
    expect(analyzeText('testere', d).level).toBe('ok');
    expect(analyzeText('testi', d).level).toBe('block');
  });

  it('boş metin temiz', () => {
    expect(analyzeText('   ', dict)).toEqual({ level: 'ok', categories: [] });
  });
});

describe('bağlantı sayımı ve tekrar parmak izi', () => {
  it('şemalı, www ve çıplak alan adlarını sayar', () => {
    expect(countLinks('bak https://a.com/x ve www.b.net ayrıca c.xyz')).toBe(3);
    expect(countLinks('skor 2.1 değil 2-1, saat 21.30')).toBe(0);
  });

  it('büyük/küçük harf, noktalama ve harf tekrarı farkı aynı parmak izi', () => {
    expect(duplicateFingerprint('GOOOOL!!! Harika')).toBe(duplicateFingerprint('gol harika'));
    expect(duplicateFingerprint('Şampiyon')).toBe(duplicateFingerprint('sampiyon'));
  });
});
