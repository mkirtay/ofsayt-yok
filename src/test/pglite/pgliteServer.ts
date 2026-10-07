/**
 * Testler için bellek içi Postgres (PGlite) + yerel TCP üzerinden Postgres tel protokolü — Prisma Client'ı ağdaki
 * hiçbir veritabanına gitmeden GERÇEK SQL motoruna bağlar. Şema `prisma/schema.prisma`'dan çevrimdışı üretilir
 * (`prisma migrate diff --from-empty`; DB bağlantısı yok). Tek PGlite tek bağlantı olduğu için Prisma URL'si
 * `connection_limit=1`; mesajlar sırayla işlenir.
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const TERMINATE = 0x58; // 'X'

export type PgliteServer = { url: string; db: PGlite; close: () => Promise<void> };

function schemaSql(): string {
  const bin = path.resolve('node_modules/.bin/prisma');
  return execFileSync(bin, ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
    encoding: 'utf8',
    env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export async function startPgliteServer(): Promise<PgliteServer> {
  const db = new PGlite();
  await db.exec(schemaSql());

  let queue: Promise<void> = Promise.resolve();
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('close', () => sockets.delete(sock));
    let buf = Buffer.alloc(0);
    let started = false;
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      queue = queue
        .then(async () => {
          for (;;) {
            if (!started) {
              if (buf.length < 8) return;
              const len = buf.readInt32BE(0);
              if (buf.length < len) return;
              const code = buf.readInt32BE(4);
              const msg = buf.subarray(0, len);
              buf = buf.subarray(len);
              if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
                sock.write('N');
                continue;
              }
              started = true;
              sock.write(Buffer.from(await db.execProtocolRaw(new Uint8Array(msg))));
              continue;
            }
            // Yalnız tam mesajları gönder (tip baytı + int32 uzunluk).
            let off = 0;
            while (buf.length - off >= 5) {
              const l = buf.readInt32BE(off + 1);
              if (buf.length - off < 1 + l) break;
              off += 1 + l;
            }
            if (off === 0) return;
            const msg = buf.subarray(0, off);
            buf = buf.subarray(off);
            if (msg[0] === TERMINATE) {
              sock.end();
              return;
            }
            sock.write(Buffer.from(await db.execProtocolRaw(new Uint8Array(msg))));
          }
        })
        .catch(() => {
          sock.destroy();
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1`,
    db,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
