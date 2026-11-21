import { describe, expect, it } from 'vitest';
import { lcg } from './engine';
import { COUNTDOWN_TICKS, MAX_MSGS_PER_SEC, RECONNECT_GRACE_TICKS, newRoomCode, parseClientMsg, quantizeInput, CODE_RE, type RoomStateMsg, type ServerMsg, type SnapshotMsg } from './protocol';
import { Room, type Conn } from './room';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: string | null = null;
  send(data: string) { this.msgs.push(JSON.parse(data) as ServerMsg); }
  close(_c?: number, reason?: string) { this.closed = reason ?? 'closed'; }
  lastState(): RoomStateMsg | undefined { return [...this.msgs].reverse().find((m): m is RoomStateMsg => m.t === 'o'); }
  lastSnap(): SnapshotMsg | undefined { return [...this.msgs].reverse().find((m): m is SnapshotMsg => m.t === 's'); }
}

const run = (room: Room, ticks: number) => { for (let i = 0; i < ticks; i++) room.tick(); };

function startedRoom() {
  const room = new Room(lcg(42));
  const a = new FakeConn();
  const b = new FakeConn();
  room.join(a);
  room.join(b);
  room.message(a, JSON.stringify({ t: 'm', ch: 'bomba', ad: 'Kanat Ustası' }));
  room.message(b, JSON.stringify({ t: 'm', ch: 'duvar', ad: '<b>kötü</b>' }));
  return { room, a, b };
}

describe('mini saha online odası', () => {
  it('iki oyuncu yerleşir, karakter seçince geri sayım ve oyun başlar', () => {
    const { room, a, b } = startedRoom();
    expect(a.lastState()).toMatchObject({ slot: 0, faz: 'sayim', ch: ['bomba', 'duvar'], bagli: [true, true] });
    // takma adlar iki tarafa da gider; biçimi bozuk ad sunucuda düşer (istemci karakter adını gösterir)
    expect(b.lastState()?.ad).toEqual(['Kanat Ustası', null]);
    expect(b.lastState()?.slot).toBe(1);
    run(room, COUNTDOWN_TICKS + 1);
    expect(room.currentPhase).toBe('oyun');
    expect(a.lastState()?.faz).toBe('oyun');
  });

  it('üçüncü bağlantı "dolu" alır ve kapanır', () => {
    const { room } = startedRoom();
    const c = new FakeConn();
    room.join(c);
    expect(c.msgs[0]).toEqual({ t: 'h', kod: 'dolu' });
    expect(c.closed).toBe('dolu');
  });

  it('girdiler oyuncuyu hareket ettirir; anlık görüntüler 30 Hz gelir', () => {
    const { room, a, b } = startedRoom();
    run(room, COUNTDOWN_TICKS + 1);
    const x0 = a.lastSnap()!.p[0][0];
    // kuran (yer 0) yukarı, davetli (yer 1) aşağı koşar (başlama kilidi yatay hareketi kısıtlar)
    room.message(a, JSON.stringify({ t: 'g', x: 0, y: -1, k: 0 }));
    room.message(b, JSON.stringify({ t: 'g', x: 0, y: 1, k: 0 }));
    const before = a.msgs.length;
    run(room, 60);
    const snaps = a.msgs.slice(before).filter((m) => m.t === 's') as SnapshotMsg[];
    expect(snaps.length).toBeGreaterThanOrEqual(29);
    const last = snaps[snaps.length - 1];
    expect(last.p[0][1]).toBeLessThan(-30); // yer 0 yukarı gitti
    expect(last.p[1][1]).toBeGreaterThan(30); // yer 1 aşağı gitti
    expect(Math.abs(last.p[0][0] - x0)).toBeLessThan(40);
  });

  it('kopan oyuncu anahtarla geri döner; dönmezse rakip hükmen kazanır', () => {
    const { room, a, b } = startedRoom();
    run(room, COUNTDOWN_TICKS + 1);
    const keyB = b.lastState()!.anahtar;
    room.leave(b);
    expect(a.lastState()?.bagli).toEqual([true, false]);
    run(room, 120);
    const b2 = new FakeConn();
    room.join(b2, keyB);
    expect(b2.lastState()).toMatchObject({ slot: 1, faz: 'oyun' });
    // ikinci kopuş: süre aşılır
    room.leave(b2);
    run(room, RECONNECT_GRACE_TICKS + 2);
    expect(a.lastState()).toMatchObject({ faz: 'bitti', kazanan: 0, neden: 'hukmen' });
  });

  it('yanlış anahtarla dolu odaya girilemez', () => {
    const { room, b } = startedRoom();
    run(room, COUNTDOWN_TICKS + 1);
    room.leave(b);
    const c = new FakeConn();
    room.join(c, 'baska-anahtar');
    expect(c.closed).toBe('dolu');
  });

  it('maç süresi dolunca biter; iki taraf rövanş isterse yeniden sayım başlar', () => {
    const { room, a, b } = startedRoom();
    run(room, COUNTDOWN_TICKS + 1);
    // süreyi hızlandır: dünyanın kalan süresini kısalt (testte 3 dk koşmamak için)
    const w = (room as unknown as { world: { durTicks: number; ticks: number; score: number[] } }).world;
    w.score[0] = 1;
    w.durTicks = w.ticks + 5;
    run(room, 10);
    expect(a.lastState()).toMatchObject({ faz: 'bitti', kazanan: 0, neden: 'sure' });
    room.message(a, JSON.stringify({ t: 'r' }));
    expect(room.currentPhase).toBe('bitti');
    expect(b.lastState()?.rovans).toEqual([true, false]);
    room.message(b, JSON.stringify({ t: 'r' }));
    expect(room.currentPhase).toBe('sayim');
  });

  it('hız sınırı: saniyede fazla mesaj yok sayılır', () => {
    const { room, a } = startedRoom();
    run(room, COUNTDOWN_TICKS + 1);
    for (let i = 0; i < MAX_MSGS_PER_SEC; i++) room.message(a, JSON.stringify({ t: 'g', x: 0, y: 0, k: 0 }));
    room.message(a, JSON.stringify({ t: 'g', x: 1, y: 0, k: 0 }));
    run(room, 30);
    const s = a.lastSnap()!;
    expect(Math.abs(s.p[0][2])).toBeLessThan(0.01); // son (sınır aşan) "sağa koş" uygulanmadı
  });

  it('protokol yardımcıları', () => {
    expect(CODE_RE.test(newRoomCode(lcg(1)))).toBe(true);
    expect(quantizeInput({ x: 0.37, y: -0.9, kick: true })).toEqual({ x: 0.25, y: -1, k: 1 });
    expect(parseClientMsg('{"t":"g","x":5,"y":-0.5,"k":1}')).toEqual({ t: 'g', x: 1, y: -0.5, k: 1 });
    expect(parseClientMsg('{"t":"m","ch":"yok"}')).toBeNull();
    expect(parseClientMsg('x'.repeat(500))).toBeNull();
  });
});
