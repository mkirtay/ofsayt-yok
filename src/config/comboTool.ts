/**
 * Kombine aracı (ADMIN + izin listesi) bayrağı — `COMBO_TOOL_ENABLED` (sunucu env; varsayılan KAPALI).
 * 1 / true / on → açık. Kapalıyken /api/combo/* 404 ve ana sayfa kartı hiç çıkmaz (oturumda `comboAccess` yok); API-Football'a istek / iş yok.
 * Hiçbir public sayfa, menü, sitemap ya da robots.txt bu araca değinmez.
 */
export function parseComboFlag(raw: string | undefined | null): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function comboToolEnabled(): boolean {
  return parseComboFlag(process.env.COMBO_TOOL_ENABLED);
}

/** `COMBO_TOOL_USER_IDS`: virgül / boşluk ayrımlı kullanıcı kimliği ya da e-posta (küçük harf). Yönetici (ADMIN) listeye gerek duymaz. */
export function parseComboAllowlist(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type ComboViewer = { id?: string | null; role?: string | null; email?: string | null } | null | undefined;

/** Saf karar: bayrak açık VE (ADMIN ya da izin listesinde). Ana sayfa kartı + `/api/combo/*` aynı kapıyı kullanır. */
export function canUseComboTool(viewer: ComboViewer, enabled: boolean, allowlist: ReadonlySet<string>): boolean {
  if (!enabled || !viewer) return false;
  if (viewer.role === 'ADMIN') return true;
  const id = viewer.id?.trim().toLowerCase();
  const email = viewer.email?.trim().toLowerCase();
  return Boolean((id && allowlist.has(id)) || (email && allowlist.has(email)));
}

export function viewerCanUseComboTool(viewer: ComboViewer): boolean {
  return canUseComboTool(viewer, comboToolEnabled(), parseComboAllowlist(process.env.COMBO_TOOL_USER_IDS));
}
