/**
 * Elle hakem ataması: UEFA/TFF hakemi açıkladığı halde sağlayıcı (Sportmonks) `referees[]`'i henüz doldurmadıysa
 * maçın orta hakemini buradan veririz. Sağlayıcıda orta hakem varsa DAİMA o kazanır (bu tablo yok sayılır).
 * Geçici çözüm — admin ekranından giriş gelene kadar. Maç oynandıktan sonra satır silinebilir.
 */
import { REFEREE_TYPE_IDS } from './refereeFormatter';
import type { SportmonksFixture, SportmonksRefereePerson } from './types';

/** fixtureId → Sportmonks hakem kaydı (id = /hakem/<slug>-<id> sayfasındaki id). */
export const REFEREE_OVERRIDES: Readonly<Record<number, SportmonksRefereePerson>> = {
  // Galatasaray – Aston Villa, UCL, 24 Kas 2026 — UEFA 22 Kas'ta açıkladı (Sportmonks'ta henüz boş).
  19873236: { id: 80234, name: 'Daniel Siebert', display_name: 'Daniel Siebert' },
};

export function withRefereeOverride<T extends Pick<SportmonksFixture, 'id' | 'referees'>>(fixture: T): T {
  const person = REFEREE_OVERRIDES[fixture.id];
  if (!person) return fixture;
  if (fixture.referees?.some((r) => r.type_id === REFEREE_TYPE_IDS.MAIN)) return fixture;
  return {
    ...fixture,
    referees: [...(fixture.referees ?? []), { referee_id: person.id, type_id: REFEREE_TYPE_IDS.MAIN, referee: person }],
  };
}
