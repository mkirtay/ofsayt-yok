import { describe, expect, it } from 'vitest';
import {
  POSITION_KEY,
  bubblePosition,
  clampTop,
  isDragMovement,
  keyStep,
  offsetForTop,
  offsetFromRatio,
  readSavedPosition,
  readSavedRatio,
  savePosition,
  clampOffsetX,
  keySide,
  offsetXForSide,
  releaseVelocityX,
  sideMargin,
  snapSide,
  type LauncherBounds,
} from './launcherPosition';

/** 375×812 mobil: header 60 px, düğme alt menünün 16 px üstünde (812 − 58 − 16 − 56 = 682). */
const MOBILE: LauncherBounds = { defaultTop: 682, minTop: 68, viewportHeight: 812 };
/** 1440×900 masaüstü: header 64 px, düğme alttan 24 px (900 − 24 − 56 = 820). */
const DESKTOP: LauncherBounds = { defaultTop: 820, minTop: 72, viewportHeight: 900 };

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

describe('sürükleme mi dokunuş mu', () => {
  it('6 px altı dokunuş, 6 px ve üstü sürükleme (iki yön)', () => {
    expect(isDragMovement(0)).toBe(false);
    expect(isDragMovement(5)).toBe(false);
    expect(isDragMovement(-5.9)).toBe(false);
    expect(isDragMovement(6)).toBe(true);
    expect(isDragMovement(-40)).toBe(true);
  });
});

describe('sınırlar', () => {
  it('header altının üstüne ve varsayılan yerin altına çıkamaz', () => {
    for (const b of [MOBILE, DESKTOP]) {
      expect(clampTop(-500, b)).toBe(b.minTop);
      expect(clampTop(b.viewportHeight + 100, b)).toBe(b.defaultTop);
      expect(clampTop(300, b)).toBe(300);
      expect(offsetForTop(-500, b)).toBe(b.minTop - b.defaultTop);
      expect(offsetForTop(10_000, b)).toBe(0);
    }
  });

  it('çok kısa ekranda (yatay telefon, klavye açık) varsayılan yerde kalır', () => {
    const tiny: LauncherBounds = { defaultTop: 40, minTop: 68, viewportHeight: 180 };
    expect(clampTop(0, tiny)).toBe(40);
    expect(clampTop(100, tiny)).toBe(40);
  });
});

describe('kayıtlı konum (oran)', () => {
  it('kaydet → oku → aynı oran; ekran yüksekliği değişse de oran korunur', () => {
    const storage = memoryStorage();
    savePosition(storage, 'right', 406, 812); // ekranın tam ortası
    expect(JSON.parse(storage.getItem(POSITION_KEY)!)).toEqual({ side: 'right', y: 0.5 });
    const ratio = readSavedRatio(storage);
    expect(ratio).toBe(0.5);
    expect(offsetFromRatio(ratio, MOBILE)).toBe(406 - 682);
    expect(offsetFromRatio(ratio, DESKTOP)).toBe(450 - 820);
  });

  it('döndürme: dikeyde kaydedilen alt konum yatayda sınıra kenetlenir', () => {
    const storage = memoryStorage();
    savePosition(storage, 'right', 682, 812); // dikeyde varsayılan yer
    const landscape: LauncherBounds = { defaultTop: 227, minTop: 68, viewportHeight: 375 };
    const offset = offsetFromRatio(readSavedRatio(storage), landscape);
    expect(landscape.defaultTop + offset).toBeLessThanOrEqual(landscape.defaultTop);
    expect(landscape.defaultTop + offset).toBeGreaterThanOrEqual(landscape.minTop);
    // Üstte kaydedilen konum yatayda da sınır içinde
    savePosition(storage, 'right', 68, 812);
    const top = landscape.defaultTop + offsetFromRatio(readSavedRatio(storage), landscape);
    expect(top).toBeGreaterThanOrEqual(landscape.minTop);
  });

  it('depolama yok / bozuk / hata fırlatıyor → varsayılan yer', () => {
    expect(readSavedRatio(null)).toBeNull();
    expect(offsetFromRatio(null, MOBILE)).toBe(0);
    const broken = memoryStorage();
    broken.setItem(POSITION_KEY, 'abc');
    expect(readSavedRatio(broken)).toBeNull();
    broken.setItem(POSITION_KEY, '1.7');
    expect(readSavedRatio(broken)).toBeNull();
    const throwing = {
      ...memoryStorage(),
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    } as Storage;
    expect(readSavedRatio(throwing)).toBeNull();
    expect(() => savePosition(throwing, 'left', 100, 812)).not.toThrow();
    expect(() => savePosition(null, 'left', 100, 812)).not.toThrow();
  });
});

describe('klavye', () => {
  it('↑ / ↓ 24 px; diğer tuşlar yok', () => {
    expect(keyStep('ArrowUp')).toBe(-24);
    expect(keyStep('ArrowDown')).toBe(24);
    expect(keyStep('Enter')).toBeNull();
    expect(keyStep('ArrowLeft')).toBeNull();
  });

  it('adımlar sınırda durur', () => {
    let top = MOBILE.defaultTop;
    for (let i = 0; i < 100; i++) top = MOBILE.defaultTop + offsetForTop(top + (keyStep('ArrowUp') ?? 0), MOBILE);
    expect(top).toBe(MOBILE.minTop);
    top = MOBILE.defaultTop + offsetForTop(top + (keyStep('ArrowDown') ?? 0), MOBILE);
    expect(top).toBe(MOBILE.minTop + 24);
  });
});

describe('baloncuk', () => {
  it('düğme altta: alt kenar hizalı (yukarı açılır) — varsayılan yerde CSS ile aynı', () => {
    // CSS: bottom = alt menü + 22 px + safe → 812 − (682 + 56) + 6 = 80
    expect(bubblePosition(682, 56, 812)).toEqual({ bottom: 80 });
    expect(bubblePosition(820, 56, 900)).toEqual({ bottom: 30 });
  });

  it('düğme üstte: üst kenar hizalı (aşağı açılır), ekranın içinde', () => {
    expect(bubblePosition(68, 56, 812)).toEqual({ top: 74 });
    const pos = bubblePosition(0, 56, 812);
    expect(pos.top).toBeGreaterThanOrEqual(0);
  });
});

/** Yataylı sınırlar: 375 px mobil (sağ boşluk 16) ve 1440 px masaüstü (sağ boşluk 24). */
const MOBILE_2D: LauncherBounds = { ...MOBILE, defaultLeft: 375 - 16 - 56, viewportWidth: 375, size: 56 };
const DESKTOP_2D: LauncherBounds = { ...DESKTOP, defaultLeft: 1440 - 24 - 56, viewportWidth: 1440, size: 56 };

describe('kenar seçimi (sol / sağ)', () => {
  it('kenar boşlukları simetrik: sol kenar = CSS\'teki sağ boşluk kadar içeride', () => {
    expect(sideMargin(MOBILE_2D)).toBe(16);
    expect(sideMargin(DESKTOP_2D)).toBe(24);
    expect(offsetXForSide('right', MOBILE_2D)).toBe(0);
    expect(MOBILE_2D.defaultLeft! + offsetXForSide('left', MOBILE_2D)).toBe(16);
    expect(DESKTOP_2D.defaultLeft! + offsetXForSide('left', DESKTOP_2D)).toBe(24);
  });

  it('bırakınca en yakın kenar: ekranın sol yarısı → sol, sağ yarısı → sağ', () => {
    expect(snapSide(100, 375)).toBe('left');
    expect(snapSide(187, 375)).toBe('left');
    expect(snapSide(188, 375)).toBe('right');
    expect(snapSide(1000, 1440)).toBe('right');
  });

  it('hızlı yatay fırlatmada fırlatma yönü kazanır; yavaşta konum belirler', () => {
    expect(snapSide(300, 375, -0.8)).toBe('left'); // sağ yarıda bırakıldı ama sola fırlatıldı
    expect(snapSide(50, 375, 0.6)).toBe('right');
    expect(snapSide(300, 375, -0.2)).toBe('right'); // yavaş → konum
  });

  it('fırlatma hızı son ~80 ms\'lik hareketten', () => {
    expect(releaseVelocityX([])).toBe(0);
    expect(releaseVelocityX([{ t: 0, x: 300 }])).toBe(0);
    // 200 ms yavaş, son 80 ms'de 80 px sola → -1 px/ms
    const samples = [
      { t: 0, x: 300 },
      { t: 200, x: 290 },
      { t: 240, x: 250 },
      { t: 280, x: 210 },
    ];
    expect(releaseVelocityX(samples)).toBeCloseTo(-1, 5);
  });

  it('sürüklerken yatayda ekrandan taşmaz', () => {
    expect(clampOffsetX(-10_000, MOBILE_2D)).toBe(offsetXForSide('left', MOBILE_2D));
    expect(clampOffsetX(500, MOBILE_2D)).toBe(0);
    expect(clampOffsetX(-100, MOBILE_2D)).toBe(-100);
    // Yatay ölçü yoksa (eski çağıran) yatay kayma yok
    expect(clampOffsetX(-100, MOBILE)).toBe(0);
  });

  it('dokunuş eşiği iki eksende: 6 px altı dokunuş', () => {
    expect(isDragMovement(3, 4)).toBe(false); // hypot = 5
    expect(isDragMovement(0, 6)).toBe(true);
    expect(isDragMovement(4, 5)).toBe(true);
  });

  it('klavye: ← sol, → sağ', () => {
    expect(keySide('ArrowLeft')).toBe('left');
    expect(keySide('ArrowRight')).toBe('right');
    expect(keySide('ArrowUp')).toBeNull();
  });
});

describe('kayıtlı konum { side, y } ve geriye uyumluluk', () => {
  it('yeni biçim: taraf ve oran birlikte', () => {
    const storage = memoryStorage();
    savePosition(storage, 'left', 300, 812);
    expect(JSON.parse(storage.getItem(POSITION_KEY)!)).toEqual({ side: 'left', y: 0.3695 });
    expect(readSavedPosition(storage)).toEqual({ side: 'left', ratio: 0.3695 });
  });

  it('eski kayıt (düz oran) bozulmaz: y aynen, taraf "right"', () => {
    const storage = memoryStorage();
    storage.setItem(POSITION_KEY, '0.4581');
    expect(readSavedPosition(storage)).toEqual({ side: 'right', ratio: 0.4581 });
    expect(readSavedRatio(storage)).toBe(0.4581);
  });

  it('taraf alanı yok / tanımsızsa "right"; bozuk y → kayıt yok (varsayılan sağ alt)', () => {
    const storage = memoryStorage();
    storage.setItem(POSITION_KEY, JSON.stringify({ y: 0.2 }));
    expect(readSavedPosition(storage)).toEqual({ side: 'right', ratio: 0.2 });
    storage.setItem(POSITION_KEY, JSON.stringify({ side: 'up', y: 0.2 }));
    expect(readSavedPosition(storage)?.side).toBe('right');
    storage.setItem(POSITION_KEY, JSON.stringify({ side: 'left', y: 3 }));
    expect(readSavedPosition(storage)).toBeNull();
    storage.setItem(POSITION_KEY, '{bozuk');
    expect(readSavedPosition(storage)).toBeNull();
    expect(readSavedPosition(null)).toBeNull();
  });

  it('döndürme: taraf korunur, y yeni ekranda sınır içinde', () => {
    const storage = memoryStorage();
    savePosition(storage, 'left', 600, 812);
    const saved = readSavedPosition(storage)!;
    const landscape: LauncherBounds = { defaultTop: 227, minTop: 68, viewportHeight: 375, defaultLeft: 812 - 16 - 56, viewportWidth: 812, size: 56 };
    expect(saved.side).toBe('left');
    const top = landscape.defaultTop + offsetFromRatio(saved.ratio, landscape);
    expect(top).toBeGreaterThanOrEqual(landscape.minTop);
    expect(top).toBeLessThanOrEqual(landscape.defaultTop);
    expect(landscape.defaultLeft! + offsetXForSide(saved.side, landscape)).toBe(16);
  });
});
