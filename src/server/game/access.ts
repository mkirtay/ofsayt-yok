/**
 * Tahmin oyunu erişim kapısı (bkz. config/gameFlag.ts). Sayfa (getServerSideProps) ve API uçları buradan geçer.
 * Kapalıyken / önizlemede yetkisizken özellik YOK gibi davranır: 404 (varlığı sızmasın; 401/403 değil).
 * Önizlemede yanıtlar kişiye özel: `Cache-Control: private, no-store` (CDN'de başkasına sunulmasın) + `X-Robots-Tag: noindex`.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { canSeeGame, gameMode, gamePreviewEmails, type GameMode } from '@/config/gameFlag';
import { getRequestUserId } from '@/lib/mobileAuth';
import { prisma } from '@/lib/prisma';

export type GameAccess = { mode: GameMode; allowed: boolean; admin: boolean };

export const PRIVATE_CACHE = 'private, no-store';

async function viewerOf(req: IncomingMessage, res: ServerResponse) {
  const userId = await getRequestUserId(req as NextApiRequest, res as NextApiResponse);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
}

export async function resolveGameAccess(req: IncomingMessage, res: ServerResponse): Promise<GameAccess> {
  const mode = gameMode();
  if (mode === 'off') return { mode, allowed: false, admin: false };
  const viewer = mode === 'public' ? null : await viewerOf(req, res);
  return { mode, allowed: canSeeGame(mode, viewer, gamePreviewEmails()), admin: viewer?.role === 'ADMIN' };
}

/** Önizlemede herkese açık önbellek başlıklarını kişisel olana çevirir (handler sonradan `public` yazsa bile). */
function forcePrivate(res: NextApiResponse | ServerResponse) {
  const set = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) =>
    set(name, name.toLowerCase() === 'cache-control' ? PRIVATE_CACHE : value)) as typeof res.setHeader;
  set('Cache-Control', PRIVATE_CACHE);
  set('X-Robots-Tag', 'noindex, nofollow');
}

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

/**
 * API uçları için kapı. `cronBypass`: Bearer CRON_SECRET'li çağrı önizlemede de geçer (sonuç işi); kapalıyken geçmez.
 */
export function withGameGate(handler: Handler, opts: { cronBypass?: (req: NextApiRequest) => boolean } = {}): Handler {
  return async (req, res) => {
    const mode = gameMode();
    if (mode === 'off') return res.status(404).json({ error: 'Not found' });
    if (mode === 'preview') {
      forcePrivate(res);
      if (!opts.cronBypass?.(req)) {
        const access = await resolveGameAccess(req, res);
        if (!access.allowed) return res.status(404).json({ error: 'Not found' });
      }
    }
    return handler(req, res);
  };
}

/** Sayfalar için: null → 404 ver. Önizlemede önbellek kişisel ve noindex. */
export async function gamePageGate(req: IncomingMessage, res: ServerResponse): Promise<{ noindex: boolean; publicCache: boolean } | null> {
  const access = await resolveGameAccess(req, res);
  if (!access.allowed) return null;
  if (access.mode === 'preview') {
    forcePrivate(res);
    return { noindex: true, publicCache: false };
  }
  return { noindex: false, publicCache: true };
}
