import { describe, it, expect } from 'vitest';
import { formatVenueLocation } from './venueFormatter';
import venueTurkishCup from './__fixtures__/venueTurkishCup.json';

describe('formatVenueLocation', () => {
  it('gerçek venue verisinden (Pass 2, fixture 19874792) "isim, şehir" üretir', () => {
    expect(formatVenueLocation(venueTurkishCup)).toBe('Amasya 12 Haziran Stadyumu, Amasya');
  });

  it('city_name eksikse sadece venue adını döner', () => {
    expect(formatVenueLocation({ name: 'Stadyum X', city_name: null })).toBe('Stadyum X');
  });

  it('venue adı eksikse sadece şehri döner', () => {
    expect(formatVenueLocation({ name: null, city_name: 'İstanbul' })).toBe('İstanbul');
  });

  it('venue null/undefined ise null döner', () => {
    expect(formatVenueLocation(null)).toBeNull();
    expect(formatVenueLocation(undefined)).toBeNull();
  });

  it('her iki alan da boşsa null döner', () => {
    expect(formatVenueLocation({ name: null, city_name: null })).toBeNull();
    expect(formatVenueLocation({ name: '  ', city_name: '' })).toBeNull();
  });
});
