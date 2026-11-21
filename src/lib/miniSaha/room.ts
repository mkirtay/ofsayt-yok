/**
 * Online maç odası (saf mantık; Cloudflare'a bağımlı değil → Node'da test edilir). oyun-sunucusu/src/worker.ts'teki
 * Durable Object yalnız soketleri bu sınıfa bağlar ve oda doluyken saniyede 60 kez `tick()` çağırır.
 *
 * Akış: bekliyor (2. oyuncu) → sayim (3 sn) → oyun (sunucu dünyayı adımlar, 30 Hz anlık görüntü) → bitti
 * (rövanş: iki taraf da isterse yeniden sayim). Oyunda biri koparsa oyun durur, 20 sn içinde aynı anahtarla dönerse
 * devam eder; dönmezse hükmen biter. Yer 0 = odayı kuran (camgöbeği), yer 1 = davet edilen (pembe).
 */
import { DEFAULT_CHAR, type CharId } from './characters';
import { createOnlineWorld, stepWorld, type Input, type World } from './engine';
import {
  COUNTDOWN_TICKS,
  END_TIMEOUT_TICKS,
  MAX_MSGS_PER_SEC,
  ONLINE_DUR_SEC,
  RECONNECT_GRACE_TICKS,
  SNAPSHOT_EVERY,
  WAIT_TIMEOUT_TICKS,
  parseClientMsg,
  round2,
  type ErrorMsg,
  type RoomPhase,
  type RoomStateMsg,
  type ServerMsg,
  type SnapEvent,
  type SnapshotMsg,
} from './protocol';

export interface Conn {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type Slot = {
  conn: Conn | null;
  key: string;
  ch: CharId | null;
  input: Input;
  /** Kopma anı (tik); bağlıysa null. */
  goneAt: number | null;
  wantsRematch: boolean;
  /** Hız sınırı penceresi. */
  winStart: number;
  winCount: number;
};

const IDLE: Input = { x: 0, y: 0, kick: false };

export class Room {
  private slots: [Slot | null, Slot | null] = [null, null];
  private phase: RoomPhase = 'bekliyor';
  private world: World | null = null;
  /** Oda saati (tik). */
  private now = 0;
  private phaseAt = 0;
  private events: SnapEvent[] = [];
  private winner: 0 | 1 | null = null;
  private reason: 'sure' | 'hukmen' | null = null;
  private closed = false;

  constructor(private readonly rnd: () => number = Math.random) {}

  /** Bağlı oyuncu var mı (yoksa sunucu döngüyü durdurur). */
  get hasConnections(): boolean {
    return this.slots.some((s) => s?.conn);
  }

  get currentPhase(): RoomPhase {
    return this.phase;
  }

  /** Yeni bağlantı. `key`: daha önce verilmiş anahtar (yeniden bağlanma). Oda doluysa hata gönderip kapatır. */
  join(conn: Conn, key?: string | null): void {
    if (this.closed) return this.reject(conn, 'zaman');
    // yeniden bağlanma: anahtarı tutan, bağlantısı düşmüş yer
    const back = this.slots.findIndex((s) => s && key && s.key === key && !s.conn);
    if (back >= 0) {
      const s = this.slots[back]!;
      s.conn = conn;
      s.goneAt = null;
      s.input = IDLE;
      this.broadcastState();
      return;
    }
    const free = this.slots.findIndex((s) => s === null);
    if (free < 0) return this.reject(conn, 'dolu');
    this.slots[free] = {
      conn, key: this.newKey(), ch: null, input: IDLE, goneAt: null, wantsRematch: false, winStart: this.now, winCount: 0,
    };
    this.broadcastState();
  }

  leave(conn: Conn): void {
    const i = this.slotOf(conn);
    if (i < 0) return;
    const s = this.slots[i]!;
    if (this.phase === 'bekliyor') {
      // maç başlamadan çıkan yerini boşaltır
      this.slots[i] = null;
    } else {
      s.conn = null;
      s.goneAt = this.now;
      s.input = IDLE;
    }
    this.broadcastState();
  }

  message(conn: Conn, raw: unknown): void {
    const i = this.slotOf(conn);
    if (i < 0) return;
    const s = this.slots[i]!;
    // hız sınırı: saniyede en fazla MAX_MSGS_PER_SEC (fazlası sessizce yok sayılır)
    if (this.now - s.winStart >= 60) { s.winStart = this.now; s.winCount = 0; }
    if (++s.winCount > MAX_MSGS_PER_SEC) return;
    const m = parseClientMsg(raw);
    if (!m) return;
    if (m.t === 'g') {
      s.input = { x: m.x, y: m.y, kick: m.k === 1 };
    } else if (m.t === 'm') {
      if (this.phase === 'bekliyor' || this.phase === 'bitti') {
        s.ch = m.ch;
        this.maybeStart();
        this.broadcastState();
      }
    } else if (m.t === 'r' && this.phase === 'bitti') {
      s.wantsRematch = true;
      if (this.slots.every((x) => x?.conn && x.wantsRematch)) this.startCountdown();
      this.broadcastState();
    }
  }

  /** 60 Hz. */
  tick(): void {
    if (this.closed) return;
    this.now++;
    switch (this.phase) {
      case 'bekliyor':
        if (this.now - this.phaseAt > WAIT_TIMEOUT_TICKS) this.shutdown();
        break;
      case 'sayim': {
        const left = COUNTDOWN_TICKS - (this.now - this.phaseAt);
        if (left <= 0) {
          this.phase = 'oyun';
          this.phaseAt = this.now;
          this.broadcastState();
        } else if (left % 60 === 0) this.broadcastState();
        break;
      }
      case 'oyun':
        this.tickGame();
        break;
      case 'bitti':
        if (this.now - this.phaseAt > END_TIMEOUT_TICKS) this.shutdown();
        break;
    }
  }

  private tickGame(): void {
    const w = this.world!;
    // biri koptuysa oyun durur; süre dolarsa öbürü hükmen kazanır
    const gone = this.slots.findIndex((s) => s && !s.conn);
    if (gone >= 0) {
      const s = this.slots[gone]!;
      if (s.goneAt !== null && this.now - s.goneAt > RECONNECT_GRACE_TICKS) {
        this.finish(gone === 0 ? 1 : 0, 'hukmen');
      }
      return;
    }
    stepWorld(w, IDLE, [this.slots[0]!.input, this.slots[1]!.input]);
    for (const e of w.events) {
      if (e.type === 'kick') this.events.push(['k', w.players.indexOf(e.player)]);
      else if (e.type === 'goal') this.events.push(['g', e.team, e.scorer ? w.players.indexOf(e.scorer) : -1]);
      else if (e.type === 'golden') this.events.push(['a']);
      else if (e.type === 'end') this.events.push(['e']);
    }
    w.events.length = 0;
    if (w.phase === 'end') {
      this.sendSnapshot();
      const [a, b] = w.score;
      this.finish(a > b ? 0 : b > a ? 1 : null, 'sure');
      return;
    }
    if (w.ticks % SNAPSHOT_EVERY === 0 || this.events.length) this.sendSnapshot();
  }

  private maybeStart(): void {
    if (this.phase !== 'bekliyor') return;
    if (this.slots.every((s) => s?.conn && s.ch)) this.startCountdown();
  }

  private startCountdown(): void {
    const chars: [CharId, CharId] = [this.slots[0]?.ch ?? DEFAULT_CHAR, this.slots[1]?.ch ?? DEFAULT_CHAR];
    this.world = createOnlineWorld({ chars, durSec: ONLINE_DUR_SEC, rng: this.rnd });
    for (const s of this.slots) if (s) { s.wantsRematch = false; s.input = IDLE; }
    this.winner = null;
    this.reason = null;
    this.phase = 'sayim';
    this.phaseAt = this.now;
    this.sendSnapshot();
  }

  private finish(winner: 0 | 1 | null, reason: 'sure' | 'hukmen'): void {
    this.phase = 'bitti';
    this.phaseAt = this.now;
    this.winner = winner;
    this.reason = reason;
    this.broadcastState();
  }

  private shutdown(): void {
    this.closed = true;
    for (const s of this.slots) {
      if (s?.conn) {
        this.sendTo(s.conn, { t: 'h', kod: 'zaman' });
        s.conn.close(1000, 'zaman');
      }
    }
    this.slots = [null, null];
  }

  private sendSnapshot(): void {
    const w = this.world;
    if (!w) return;
    const msg: SnapshotMsg = {
      t: 's',
      tk: w.ticks,
      d: w.durTicks,
      b: [round2(w.ball.x), round2(w.ball.y), round2(w.ball.vx), round2(w.ball.vy)],
      p: w.players.map((p) => [round2(p.x), round2(p.y), round2(p.vx), round2(p.vy), Math.round(p.face * 100), p.kick ? 1 : 0, p.flash]),
      sc: [w.score[0], w.score[1]],
      al: w.golden ? 1 : 0,
      f: w.phase,
      k: w.lock ? w.lock.team : -1,
      ev: this.events,
    };
    this.events = [];
    this.broadcast(msg);
  }

  private broadcastState(): void {
    this.slots.forEach((s, i) => {
      if (!s?.conn) return;
      const msg: RoomStateMsg = {
        t: 'o',
        slot: i as 0 | 1,
        anahtar: s.key,
        faz: this.phase,
        ch: [this.slots[0]?.ch ?? null, this.slots[1]?.ch ?? null],
        bagli: [Boolean(this.slots[0]?.conn), Boolean(this.slots[1]?.conn)],
        sayim: this.phase === 'sayim' ? Math.ceil((COUNTDOWN_TICKS - (this.now - this.phaseAt)) / 60) : 0,
        rovans: [Boolean(this.slots[0]?.wantsRematch), Boolean(this.slots[1]?.wantsRematch)],
        kazanan: this.winner,
        neden: this.reason,
      };
      this.sendTo(s.conn, msg);
    });
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const s of this.slots) if (s?.conn) this.safeSend(s.conn, data);
  }

  private sendTo(conn: Conn, msg: ServerMsg): void {
    this.safeSend(conn, JSON.stringify(msg));
  }

  private safeSend(conn: Conn, data: string): void {
    try {
      conn.send(data);
    } catch {
      /* kapanmış soket: leave() ayrıca gelir */
    }
  }

  private reject(conn: Conn, kod: ErrorMsg['kod']): void {
    this.sendTo(conn, { t: 'h', kod });
    try {
      conn.close(1008, kod);
    } catch {
      /* zaten kapalı */
    }
  }

  private slotOf(conn: Conn): number {
    return this.slots.findIndex((s) => s?.conn === conn);
  }

  private newKey(): string {
    let k = '';
    for (let i = 0; i < 16; i++) k += Math.floor(this.rnd() * 36).toString(36);
    return k;
  }
}
