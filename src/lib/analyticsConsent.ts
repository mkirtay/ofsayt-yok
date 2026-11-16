/**
 * Analitik çerez onayı (Google Analytics 4; KVKK: zorunlu olmayan çerez için açık rıza). Vercel Web Analytics çerezsizdir,
 * onaydan bağımsız çalışır. Tercih yalnız bu tarayıcıda (localStorage); okunamazsa "sorulmadı" sayılır → GA yüklenmez.
 */
export type AnalyticsConsent = 'granted' | 'denied';

export const CONSENT_STORAGE_KEY = 'scor3:analyticsConsent';
export const CONSENT_EVENT = 'scor3:consent-change';

/** GA ölçüm kimliği (Vercel env `NEXT_PUBLIC_GA_ID`, ör. G-XXXXXXXXXX); yoksa GA ve onay bandı hiç çalışmaz. */
export function gaMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_ID?.trim();
  return id && /^G-[A-Z0-9]{4,20}$/.test(id) ? id : null;
}

export function readConsent(): AnalyticsConsent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(v: AnalyticsConsent | null): void {
  try {
    if (v) window.localStorage.setItem(CONSENT_STORAGE_KEY, v);
    else window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // depolama kapalı: bu oturumda yine de olay yayılır
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: v }));
  } catch {
    // yok say
  }
}

/** Onay geri çekilince GA çerezlerini (_ga, _ga_*) siler (hem tam alan adı hem üst alan adı). */
export function clearGaCookies(): void {
  try {
    const host = window.location.hostname;
    const domains = ['', host, `.${host.replace(/^www\./, '')}`];
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0]?.trim();
      if (!name || !/^_ga(_|$)/.test(name)) continue;
      for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
    }
  } catch {
    // yok say
  }
}
