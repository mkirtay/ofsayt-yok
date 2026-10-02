import { describe, expect, it } from 'vitest';
import {
  POSITION_KEY,
  bubblePosition,
  clampTop,
  isDragMovement,
  keyStep,
  offsetForTop,
  offsetFromRatio,
  readSavedRatio,
  saveRatio,
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
    saveRatio(storage, 406, 812); // ekranın tam ortası
    expect(storage.getItem(POSITION_KEY)).toBe('0.5000');
    const ratio = readSavedRatio(storage);
    expect(ratio).toBe(0.5);
    expect(offsetFromRatio(ratio, MOBILE)).toBe(406 - 682);
    expect(offsetFromRatio(ratio, DESKTOP)).toBe(450 - 820);
  });

  it('döndürme: dikeyde kaydedilen alt konum yatayda sınıra kenetlenir', () => {
    const storage = memoryStorage();
    saveRatio(storage, 682, 812); // dikeyde varsayılan yer
    const landscape: LauncherBounds = { defaultTop: 227, minTop: 68, viewportHeight: 375 };
    const offset = offsetFromRatio(readSavedRatio(storage), landscape);
    expect(landscape.defaultTop + offset).toBeLessThanOrEqual(landscape.defaultTop);
    expect(landscape.defaultTop + offset).toBeGreaterThanOrEqual(landscape.minTop);
    // Üstte kaydedilen konum yatayda da sınır içinde
    saveRatio(storage, 68, 812);
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
    expect(() => saveRatio(throwing, 100, 812)).not.toThrow();
    expect(() => saveRatio(null, 100, 812)).not.toThrow();
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
