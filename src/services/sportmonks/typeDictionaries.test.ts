import { describe, it, expect } from 'vitest';
import {
  EVENT_TYPES,
  STATISTIC_TYPES,
  LINEUP_STATUS_TYPES,
  POSITION_TYPES,
  UNRESOLVED_STATISTIC_FIELDS,
  resolvePositionShortCode,
  resolveEventLabel,
} from './typeDictionaries';

describe('EVENT_TYPES — Pass 5 "getMatchWithEvents — event type_id sözlüğü" + Faz 3 eki', () => {
  it('Pass 5 (11) + Faz 3 (VAR, VAR_CARD) = 13 satırın tamamını içerir', () => {
    expect(Object.keys(EVENT_TYPES)).toHaveLength(13);
  });

  it('Faz 3: fixture 19732740 (Celta de Vigo vs Osasuna) ile gözlemlenen VAR/VAR_CARD', () => {
    expect(EVENT_TYPES[10]).toMatchObject({ name: 'VAR', observed: true });
    expect(EVENT_TYPES[1697]).toMatchObject({ name: 'VAR_CARD', observed: true });
  });

  it('Faz 3: aynı fixture ile Redcard artık gerçekten gözlemlendi (Marcos Alonso)', () => {
    expect(EVENT_TYPES[20]).toMatchObject({ name: 'Redcard', observed: true });
  });

  it('gözlemlenen 7 kodu doğru işaretler (CL finali + Türkiye Kupası)', () => {
    expect(EVENT_TYPES[14]).toMatchObject({ name: 'Goal', observed: true });
    expect(EVENT_TYPES[16]).toMatchObject({ name: 'Penalty', observed: true });
    expect(EVENT_TYPES[18]).toMatchObject({ name: 'Substitution', observed: true });
    expect(EVENT_TYPES[19]).toMatchObject({ name: 'Yellowcard', observed: true });
    expect(EVENT_TYPES[22]).toMatchObject({ name: 'Penalty Shootout Miss', observed: true });
    expect(EVENT_TYPES[23]).toMatchObject({ name: 'Penalty Shootout Goal', observed: true });
  });

  it('sözlükte var ama hiç gözlemlenmeyen 3 kodu observed:false olarak korur (atlanmadı)', () => {
    expect(EVENT_TYPES[15]).toMatchObject({ name: 'Own Goal', observed: false });
    expect(EVENT_TYPES[17]).toMatchObject({ name: 'Missed Penalty', observed: false });
    expect(EVENT_TYPES[21]).toMatchObject({ name: 'Yellow/Red card', observed: false });
  });

  it('id 13 (Sidelined) bağlamsal notuyla birlikte dahil', () => {
    expect(EVENT_TYPES[13]).toMatchObject({ name: 'Sidelined', observed: false });
  });
});

describe('resolveEventLabel — EventTimeline (EVENT_ICONS) ile uyumlu kanonik etiketler', () => {
  it('EVENT_ICONS\'un bildiği 4 anahtarla birebir eşleşir', () => {
    expect(resolveEventLabel(14)).toBe('GOAL');
    expect(resolveEventLabel(19)).toBe('YELLOW_CARD');
    expect(resolveEventLabel(20)).toBe('RED_CARD');
    expect(resolveEventLabel(18)).toBe('SUBSTITUTION');
  });

  it('Faz 3 ekindeki VAR/VAR_CARD için de bir etiket üretir', () => {
    expect(resolveEventLabel(10)).toBe('VAR');
    expect(resolveEventLabel(1697)).toBe('VAR_CARD');
  });

  it('bilinmeyen bir type_id için güvenli varsayılana düşer', () => {
    expect(resolveEventLabel(999999)).toBe('EVENT_999999');
  });
});

describe('STATISTIC_TYPES — Pass 5 "43/43 çözüldü" + Faz 3 eki (Redcards, Tackles Won)', () => {
  it('Pass 5 (43) + Faz 3 (2) = 45 satırın tamamını içerir', () => {
    expect(Object.keys(STATISTIC_TYPES)).toHaveLength(45);
  });

  it('Faz 3: kırmızı kart doğrulama turunda (fixture 19732740) bulunan 2 yeni type_id', () => {
    expect(STATISTIC_TYPES[83]).toMatchObject({ name: 'Redcards', statGroup: 'overall', observed: true });
    expect(STATISTIC_TYPES[27267]).toMatchObject({ name: 'Tackles Won', statGroup: 'defensive', observed: true });
  });

  it('Pass 5\'in "hâlâ açık" bıraktığı red_cards artık çözüldü — liste boş', () => {
    expect(UNRESOLVED_STATISTIC_FIELDS).toHaveLength(0);
  });

  it('düşük id\'li örnekleri doğru isimlendirir', () => {
    expect(STATISTIC_TYPES[34]).toMatchObject({ name: 'Corners', statGroup: 'offensive' });
    expect(STATISTIC_TYPES[45]).toMatchObject({ name: 'Ball Possession %', statGroup: 'overall' });
    expect(STATISTIC_TYPES[84]).toMatchObject({ name: 'Yellowcards', statGroup: 'overall' });
  });

  it('uzak/tekil sorgulanan id\'leri (580/581/1605/27264/27265) doğru isimlendirir', () => {
    expect(STATISTIC_TYPES[580]).toMatchObject({ name: 'Big Chances Created' });
    expect(STATISTIC_TYPES[581]).toMatchObject({ name: 'Big Chances Missed' });
    expect(STATISTIC_TYPES[1605]).toMatchObject({ name: 'Successful Dribbles Percentage' });
    expect(STATISTIC_TYPES[27264]).toMatchObject({ name: 'Successful Long Passes' });
    expect(STATISTIC_TYPES[27265]).toMatchObject({ name: 'Successful Long Passes Percentage' });
  });

  it('tüm 45 kayıt observed:true (Pass 4 fixture 19683241 + Faz 3 fixture 19732740\'ta fiilen görüldü)', () => {
    expect(Object.values(STATISTIC_TYPES).every((e) => e.observed)).toBe(true);
  });
});

describe('LINEUP_STATUS_TYPES ve POSITION_TYPES — Pass 5 "getMatchLineups"', () => {
  it('lineup durumu 11=Lineup, 12=Bench', () => {
    expect(LINEUP_STATUS_TYPES[11]).toMatchObject({ name: 'Lineup', observed: true });
    expect(LINEUP_STATUS_TYPES[12]).toMatchObject({ name: 'Bench', observed: true });
  });

  it('4 pozisyon kodu mevcut GK/DF/MF/FW kısaltmalarına birebir eşlenir', () => {
    expect(resolvePositionShortCode(24)).toBe('GK');
    expect(resolvePositionShortCode(25)).toBe('DF');
    expect(resolvePositionShortCode(26)).toBe('MF');
    expect(resolvePositionShortCode(27)).toBe('FW');
    expect(resolvePositionShortCode(999)).toBeNull();
  });

  it('POSITION_TYPES tam 4 kayıt içerir', () => {
    expect(Object.keys(POSITION_TYPES)).toHaveLength(4);
  });
});
