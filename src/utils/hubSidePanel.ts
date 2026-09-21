/**
 * Ana sayfa (`MatchHubPage`) split-view sağ panelinin durumu — saf, test edilebilir.
 *  - `detail`: maç/takım seçili (≥ BP_SPLIT) → MatchDetailPanel/TeamDetailPanel; layout `hubGridWithPanel` (mevcut model).
 *  - `gundem`: seçim yok ve genişlik ≥ BP_GUNDEM_PANEL → idle Gündem paneli (sticky, ayrı layout).
 *  - `none`: diğer her durum (mevcut davranış: panel yok).
 * `detail` ve `gundem` birbirini dışlar.
 */
export type HubSidePanel = 'detail' | 'gundem' | 'none';

export function resolveHubSidePanel(opts: {
  /** ≥ BP_SPLIT */
  isSplit: boolean;
  /** `?match=` veya `?team=` geçerli */
  hasSelection: boolean;
  /** ≥ BP_GUNDEM_PANEL */
  gundemPanelWide: boolean;
}): HubSidePanel {
  if (!opts.isSplit) return 'none';
  if (opts.hasSelection) return 'detail';
  return opts.gundemPanelWide ? 'gundem' : 'none';
}
