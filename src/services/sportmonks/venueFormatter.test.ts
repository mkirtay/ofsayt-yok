import { describe, it, expect } from 'vitest';
import { formatVenueLocation, hasVenueCard, mapMatchVenue, mapVenueSurface, venueMapsUrl } from './venueFormatter';
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

// Gerçek venue (Rams Park, `venues/9667` 2026-10-21) — maç yanıtındaki `venue` include'u alan seçimsiz, nesnenin tamamı.
const RAMS_PARK = {
  id: 9667,
  country_id: 404,
  city_id: 40579,
  name: 'Rams Park',
  address: 'İstanbul Çevre Yolu, Aslantepe',
  latitude: '41.102778',
  longitude: '28.990556',
  capacity: 53978,
  image_path: 'https://cdn.sportmonks.com/images/soccer/venues/3/9667.png',
  city_name: 'İstanbul',
  surface: 'grass',
};

describe('mapVenueSurface', () => {
  it('serbest metni karta çevirir; tanınmayan / boş → yok', () => {
    expect(mapVenueSurface('grass')).toBe('grass');
    expect(mapVenueSurface('Natural Grass')).toBe('grass');
    expect(mapVenueSurface('artificial turf')).toBe('artificial');
    expect(mapVenueSurface('artificial')).toBe('artificial');
    expect(mapVenueSurface('hybrid grass')).toBe('hybrid');
    expect(mapVenueSurface('turf')).toBe('artificial');
    expect(mapVenueSurface('clay')).toBeUndefined();
    expect(mapVenueSurface(null)).toBeUndefined();
    expect(mapVenueSurface('  ')).toBeUndefined();
  });
});

describe('mapMatchVenue', () => {
  it('gerçek venue → tüm alanlar (sayısal koordinat, tam sayı kapasite)', () => {
    expect(mapMatchVenue(RAMS_PARK)).toEqual({
      name: 'Rams Park',
      city: 'İstanbul',
      capacity: 53978,
      surface: 'grass',
      address: 'İstanbul Çevre Yolu, Aslantepe',
      lat: 41.102778,
      lng: 28.990556,
      image: 'https://cdn.sportmonks.com/images/soccer/venues/3/9667.png',
    });
  });

  it('eksik alanlar yazılmaz (Amasya: adres / zemin / fotoğraf yok)', () => {
    expect(mapMatchVenue(venueTurkishCup)).toEqual({
      name: 'Amasya 12 Haziran Stadyumu',
      city: 'Amasya',
      capacity: 7810,
      lat: 40.652926,
      lng: 35.811621,
    });
  });

  it('geçersiz koordinat (tek taraf, aralık dışı, 0,0) / kapasite 0 / yabancı ya da yer tutucu görsel atılır', () => {
    expect(
      mapMatchVenue({
        id: 1,
        name: 'X',
        city_name: null,
        latitude: '41.1',
        longitude: null,
        capacity: 0,
        image_path: 'https://evil.com/soccer/venues/1.png',
      }),
    ).toEqual({ name: 'X' });
    expect(mapMatchVenue({ id: 1, name: null, city_name: null, latitude: '0', longitude: '0' })).toBeUndefined();
    expect(mapMatchVenue({ id: 1, name: null, city_name: null, latitude: '95', longitude: '10' })).toBeUndefined();
    expect(
      mapMatchVenue({ id: 1, name: null, city_name: null, image_path: 'https://cdn.sportmonks.com/images/soccer/placeholder.png' }),
    ).toBeUndefined();
  });

  it('venue yok → undefined', () => {
    expect(mapMatchVenue(null)).toBeUndefined();
    expect(mapMatchVenue(undefined)).toBeUndefined();
  });
});

describe('hasVenueCard (kart görünürlüğü)', () => {
  it('ad / şehirden öte bilgi yoksa kart yok (maç kartının bilgi satırında zaten var)', () => {
    expect(hasVenueCard(undefined)).toBe(false);
    expect(hasVenueCard({ name: 'X', city: 'Y' })).toBe(false);
  });

  it('fotoğraf, kapasite, zemin, adres ya da konumdan biri yeter', () => {
    expect(hasVenueCard({ name: 'X', capacity: 1000 })).toBe(true);
    expect(hasVenueCard({ surface: 'grass' })).toBe(true);
    expect(hasVenueCard({ address: 'A' })).toBe(true);
    expect(hasVenueCard({ image: 'https://cdn.sportmonks.com/images/soccer/venues/1/1.png' })).toBe(true);
    expect(hasVenueCard({ lat: 1, lng: 2 })).toBe(true);
  });
});

describe('venueMapsUrl', () => {
  it('Google Haritalar arama bağlantısı; konum yoksa null', () => {
    expect(venueMapsUrl({ lat: 41.102778, lng: 28.990556 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=41.102778,28.990556',
    );
    expect(venueMapsUrl({})).toBeNull();
  });
});
