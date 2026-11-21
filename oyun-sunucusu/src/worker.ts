/**
 * Mini Saha online oyun sunucusu (Cloudflare Worker + Durable Object).
 *
 * - GET /saglik → "ok"
 * - GET /oda/<KOD> (WebSocket) → o kodun odası (Durable Object, idFromName(KOD)); ?anahtar= yeniden bağlanma için.
 *
 * Oyun mantığı sitedeki saf modüllerde (src/lib/miniSaha/room.ts + engine.ts); burası yalnız soketleri odaya bağlar ve
 * oda doluyken 60 Hz saat çalıştırır. Kalıcı depolama YOK (maç bellekte; oda boşalınca durur → ücret de durur).
 * Yalnız izinli kökenlerden (IZINLI_KOKENLER) gelen tarayıcı bağlantıları kabul edilir.
 */
import { CODE_RE } from '../../src/lib/miniSaha/protocol';
import { Room, type Conn } from '../../src/lib/miniSaha/room';

export interface Env {
  ODA: DurableObjectNamespace;
  /** Virgülle ayrılmış izinli Origin listesi (wrangler.toml [vars]; yerelde --var ile). */
  IZINLI_KOKENLER: string;
}

const TICK_MS = 1000 / 60;

/** Kriptografik rastgele [0, 1): yeniden bağlanma anahtarı tahmin edilemesin. */
function cryptoRnd(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

const worker = {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/saglik') return new Response('ok');
    const m = /^\/oda\/([A-Z0-9]+)$/.exec(url.pathname);
    if (!m || !CODE_RE.test(m[1])) return new Response('bulunamadi', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket bekleniyor', { status: 426 });
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.IZINLI_KOKENLER.split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response('izin yok', { status: 403 });
    const stub = env.ODA.get(env.ODA.idFromName(m[1]));
    return stub.fetch(req);
  },
};

export default worker;

/** Bir oda = bir Durable Object (koddan türetilen kimlik). */
export class Oda {
  private room = new Room(cryptoRnd);
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    // önceki maçı biten ve boşalan oda (zaman aşımıyla kapanmış) aynı kodla yeniden kullanılabilsin
    if (!this.room.hasConnections && this.room.currentPhase !== 'oyun') this.room = new Room(cryptoRnd);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    const conn: Conn = {
      send: (d) => server.send(d),
      close: (code, reason) => server.close(code, reason),
    };
    let gone = false;
    const bye = () => {
      if (gone) return;
      gone = true;
      this.room.leave(conn);
      this.loop();
    };
    server.addEventListener('message', (e) => this.room.message(conn, typeof e.data === 'string' ? e.data : null));
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    this.room.join(conn, new URL(req.url).searchParams.get('anahtar'));
    this.loop();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Bağlantı varken 60 Hz saat; zamanlayıcı gecikirse (Date.now ile) en fazla 6 tik telafi eder. */
  private loop(): void {
    if (this.room.hasConnections && !this.timer) {
      this.last = Date.now();
      this.acc = 0;
      this.timer = setInterval(() => {
        const now = Date.now();
        this.acc = Math.min(this.acc + (now - this.last), TICK_MS * 6);
        this.last = now;
        while (this.acc >= TICK_MS) {
          this.acc -= TICK_MS;
          this.room.tick();
        }
        if (!this.room.hasConnections) this.loop();
      }, TICK_MS);
    } else if (!this.room.hasConnections && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
