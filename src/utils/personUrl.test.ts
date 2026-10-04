import { describe, expect, it } from 'vitest';
import { coachHref, personIdFromSlug, personSlug, refereeHref } from './personUrl';

describe('hakem / teknik direktör adresleri', () => {
  it('slug = ad + id (Türkçe karakterler sadeleşir); ad yoksa yalnız id', () => {
    expect(personSlug('Batuhan Kolak', 62331)).toBe('batuhan-kolak-62331');
    expect(personSlug('Okan Buruk', 199988)).toBe('okan-buruk-199988');
    expect(personSlug('Ümit Öztürk', 5)).toBe('umit-ozturk-5');
    expect(personSlug('', 7)).toBe('7');
    expect(refereeHref(62331, 'Batuhan Kolak')).toBe('/hakem/batuhan-kolak-62331');
    expect(coachHref(199988, 'Okan Buruk')).toBe('/teknik-direktor/okan-buruk-199988');
  });

  it('çözümleme yalnız sondaki id ile (ad değişse de aynı kişi)', () => {
    expect(personIdFromSlug('batuhan-kolak-62331')).toBe(62331);
    expect(personIdFromSlug('eski-ad-62331')).toBe(62331);
    expect(personIdFromSlug('62331')).toBe(62331);
    expect(personIdFromSlug('batuhan-kolak')).toBeNull();
    expect(personIdFromSlug('abc')).toBeNull();
    expect(personIdFromSlug('x-0')).toBeNull();
  });
});
