/**
 * Online maç istemcisi: oyun sunucusuna (oyun-sunucusu/, Cloudflare) WebSocket ile bağlanır, girdiyi kaba adımlarla ve
 * yalnız değişince gönderir (sunucuya giden mesajlar ücretsiz kotadan sayılır), gelen 30 Hz anlık görüntülerden
 * çizilecek dünyayı kurar: son görüntü hızlarıyla kısa süre ileri tahmin edilir ve ekrandaki konum yumuşakça
 * hedefe çekilir (sıçrama olmasın).
 *
 * Aynalama: davet edilen oyuncu (yer 1) sahayı aynalanmış görür — kendini camgöbeği, solda, sağa hücum ederken.
 * Bunun için x / hız / bakış / takım çizimde ters çevrilir, girdinin x'i de sunucuya ters gönderilir.
 */
import { CHARACTERS, isCharId, type CharId } from '@/lib/miniSaha/characters';
import { TICK_HZ, createWorld, makePlayer, type GameEvent, type Input, type Team, type World } from '@/lib/miniSaha/engine';
import { quantizeInput, type RoomStateMsg, type ServerMsg, type SnapEvent, type SnapshotMsg } from '@/lib/miniSaha/protocol';

export type OnlineStatus =
  | { kind: 'baglaniyor'; tekrar: boolean }
  | { kind: 'oda'; state: RoomStateMsg }
  | { kind: 'hata'; kod: 'dolu' | 'gecersiz' | 'zaman' | 'baglanti' };

/** Oyun sunucusu adresi (ör. wss://oyun.getscor3.com); tanımsızsa online mod gizlenir. */
export function onlineServer(): string | null {
  return process.env.NEXT_PUBLIC_MINI_SAHA_SUNUCU?.trim() || null;
}

const KEY_PREFIX = 'oy_minisaha_anahtar_';
const TICK_MS = 1000 / TICK_HZ;
const MAX_RETRIES = 6;

export class OnlineClient {
  status: OnlineStatus = { kind: 'baglaniyor', tekrar: false };
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private snap: SnapshotMsg | null = null;
  private snapAt = 0;
  private pending: SnapEvent[] = [];
  private view: World | null = null;
  private viewChars = '';
  private sent = { x: 0, y: 0, k: 0 as 0 | 1, at: 0 };
  private disposed = false;
  private opened = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly base: string, readonly code: string, private myChar: CharId) {
    this.connect();
  }

  /** Bu tarayıcıdaki yer (0 kuran, 1 davetli); oda durumu gelmeden 0. */
  get slot(): 0 | 1 {
    return this.status.kind === 'oda' ? this.status.state.slot : 0;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setChar(ch: CharId): void {
    this.myChar = ch;
    this.send({ t: 'm', ch });
  }

  rematch(): void {
    this.send({ t: 'r' });
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.retryTimer);
    this.ws?.close(1000, 'cikis');
    this.ws = null;
    this.listeners.clear();
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private setStatus(s: OnlineStatus): void {
    this.status = s;
    this.emit();
  }

  private send(m: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private connect(): void {
    let key: string | null = null;
    try {
      key = sessionStorage.getItem(KEY_PREFIX + this.code);
    } catch {
      /* depolama kapalı: yeniden bağlanma yine yer bulur (bekliyorsa) */
    }
    const url = `${this.base.replace(/\/$/, '')}/oda/${this.code}${key ? `?anahtar=${encodeURIComponent(key)}` : ''}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.setStatus({ kind: 'hata', kod: 'baglanti' });
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.opened = true;
      this.retries = 0;
      this.send({ t: 'm', ch: this.myChar });
    };
    ws.onmessage = (e) => this.onMessage(e.data);
    ws.onclose = () => {
      if (this.disposed || this.status.kind === 'hata') return;
      // hiç açılamadıysa (sunucu yok / günlük kota dolu) hata; açılıp koptuysa kısa aralıklarla yeniden dene
      if (!this.opened && this.retries === 0) {
        this.setStatus({ kind: 'hata', kod: 'baglanti' });
        return;
      }
      if (this.retries >= MAX_RETRIES) {
        this.setStatus({ kind: 'hata', kod: 'baglanti' });
        return;
      }
      this.retries++;
      this.setStatus({ kind: 'baglaniyor', tekrar: true });
      this.retryTimer = setTimeout(() => this.connect(), 1000 * this.retries);
    };
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let m: ServerMsg;
    try {
      m = JSON.parse(data) as ServerMsg;
    } catch {
      return;
    }
    if (m.t === 'o') {
      try {
        sessionStorage.setItem(KEY_PREFIX + this.code, m.anahtar);
      } catch {
        /* yok */
      }
      this.setStatus({ kind: 'oda', state: m });
    } else if (m.t === 'h') {
      this.setStatus({ kind: 'hata', kod: m.kod });
    } else if (m.t === 's') {
      this.snap = m;
      this.snapAt = performance.now();
      if (m.ev.length) this.pending.push(...m.ev);
    }
  }

  /** Her karede: girdiyi (gerekirse) gönderir, çizilecek dünyayı ve olayları döner. */
  frame(input: Input): { world: World | null; events: GameEvent[] } {
    const st = this.status.kind === 'oda' ? this.status.state : null;
    const flip = this.slot === 1;
    if (st?.faz === 'oyun') {
      const q = quantizeInput({ x: flip ? -input.x : input.x, y: input.y, kick: input.kick });
      const now = performance.now();
      const changed = q.x !== this.sent.x || q.y !== this.sent.y || q.k !== this.sent.k;
      // değişince hemen; değişmese de 1 sn'de bir (kopma sonrası sunucudaki girdi tazelensin)
      if (changed || now - this.sent.at > 1000) {
        this.send({ t: 'g', ...q });
        this.sent = { ...q, at: now };
      }
    }
    const snap = this.snap;
    if (!snap || !st) return { world: this.view, events: [] };
    const w = this.ensureView(st);
    if (!w) return { world: null, events: [] };

    // son görüntüden bu yana geçen süre kadar (en fazla 6 tik) hızlarla ileri tahmin
    const dt = snap.f === 'play' ? Math.min(6, (performance.now() - this.snapAt) / TICK_MS) : 0;
    const sx = flip ? -1 : 1;
    const ease = (cur: number, target: number) => (Math.abs(target - cur) > 60 ? target : cur + (target - cur) * 0.5);
    snap.p.forEach((pp, i) => {
      const p = w.players[i];
      if (!p) return;
      const [x, y, vx, vy, face, kick, flash] = pp;
      p.x = ease(p.x, sx * (x + vx * dt));
      p.y = ease(p.y, y + vy * dt);
      p.vx = sx * vx;
      p.vy = vy;
      p.face = flip ? Math.PI - face / 100 : face / 100;
      p.kick = kick === 1;
      p.flash = flash;
    });
    const [bx, by, bvx, bvy] = snap.b;
    w.ball.x = ease(w.ball.x, sx * (bx + bvx * dt));
    w.ball.y = ease(w.ball.y, by + bvy * dt);
    w.ball.vx = sx * bvx;
    w.ball.vy = bvy;
    w.score = flip ? [snap.sc[1], snap.sc[0]] : [snap.sc[0], snap.sc[1]];
    w.ticks = snap.tk;
    w.durTicks = snap.d;
    w.golden = snap.al === 1;
    w.phase = snap.f;
    w.lock = snap.k < 0 ? null : { team: (flip ? 1 - snap.k : snap.k) as Team };

    const events: GameEvent[] = [];
    for (const e of this.pending) {
      if (e[0] === 'k') {
        const p = w.players[e[1]];
        if (p) events.push({ type: 'kick', human: p.human, player: p });
      } else if (e[0] === 'g') {
        const team = (flip ? 1 - e[1] : e[1]) as Team;
        events.push({ type: 'goal', team, scorer: e[2] >= 0 ? (w.players[e[2]] ?? null) : null });
      } else if (e[0] === 'a') events.push({ type: 'golden' });
      else events.push({ type: 'end' });
    }
    this.pending = [];
    return { world: w, events };
  }

  /** Çizim dünyası (karakterler belli olunca kurulur / değişince yenilenir). Yerel oyuncu `human` (halka + "SEN"). */
  private ensureView(st: RoomStateMsg): World | null {
    const [a, b] = st.ch;
    if (!isCharId(a) || !isCharId(b)) return null;
    const key = `${a}-${b}-${st.slot}`;
    if (this.view && this.viewChars === key) return this.view;
    const flip = st.slot === 1;
    // direkler simetrik: renkleri çizimde tarafa göre (sol = camgöbeği) — aynalamada ayrıca çevirmeye gerek yok
    const w = createWorld({ mode: '1v1', diff: 'orta', durSec: 180, myChar: a });
    w.players = [a, b].map((ch, i) => {
      const team = (flip ? 1 - i : i) as Team;
      return makePlayer(team, i === st.slot, CHARACTERS[ch]);
    });
    this.view = w;
    this.viewChars = key;
    return w;
  }
}
