import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CHAR_IDS, type CharId } from '@/lib/miniSaha/characters';
import { applyMatch, emptyProgress, mergeProgress, sanitizeProgress, type MatchSummary, type Progress } from '@/lib/miniSaha/progress';

const LS_KEY = 'oy_minisaha_progress';

function readLocal(): Progress {
  try {
    return sanitizeProgress(JSON.parse(localStorage.getItem(LS_KEY) || 'null'));
  } catch {
    return emptyProgress();
  }
}

function writeLocal(p: Progress): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* gizli sekme / kapalı depolama: yalnız bu oturumda kalır */
  }
}

async function api(body?: unknown): Promise<{ progress: Progress; newlyUnlocked?: CharId[] } | null> {
  try {
    const res = await fetch('/api/mini-saha/progress', {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { progress?: unknown; newlyUnlocked?: CharId[] };
    return { progress: sanitizeProgress(data.progress), newlyUnlocked: data.newlyUnlocked ?? [] };
  } catch {
    return null;
  }
}

/**
 * İlerleme (açılan karakterler): misafirde tarayıcıda; giriş yapınca hesapta (DB). Girişte tarayıcıdaki ilerleme hesaba
 * bir kez taşınır (birleşim). Sunucuya ulaşılamazsa maç yerelde işlenir; bir sonraki girişte birleşir.
 */
export function useMiniSahaProgress() {
  const { status, data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';
  const [progress, setProgress] = useState<Progress>(emptyProgress);

  useEffect(() => {
    const local = readLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR ile aynı ilk değer; tarayıcı kaydı hydration sonrası okunur
    setProgress(local);
    if (status !== 'authenticated') return;
    let alive = true;
    void (async () => {
      const server = await api();
      if (!server || !alive) return;
      const merged = mergeProgress(server.progress, local);
      const needsMerge = merged.matches !== server.progress.matches || merged.unlocked.length !== server.progress.unlocked.length;
      const final = needsMerge ? ((await api({ merge: local }))?.progress ?? merged) : server.progress;
      if (!alive) return;
      setProgress(final);
      writeLocal(final);
    })();
    return () => {
      alive = false;
    };
  }, [status]);

  /** Biten maçı işler; yeni açılan karakterleri döner. */
  const record = useCallback(
    async (summary: MatchSummary): Promise<CharId[]> => {
      if (status === 'authenticated') {
        const r = await api({ summary });
        if (r) {
          setProgress(r.progress);
          writeLocal(r.progress);
          return r.newlyUnlocked ?? [];
        }
      }
      const r = applyMatch(readLocal(), summary);
      setProgress(r.progress);
      writeLocal(r.progress);
      return r.newlyUnlocked;
    },
    [status],
  );

  // yönetici: tüm karakterler açık (yalnız gösterim; kayıtlı ilerleme değişmez)
  const shown = isAdmin ? { ...progress, unlocked: [...CHAR_IDS] } : progress;
  return { progress: shown, record, signedIn: status === 'authenticated' };
}
