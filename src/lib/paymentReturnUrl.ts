/**
 * Ödeme dönüş sayfaları (/odeme/tamamlandi, /odeme/tekrar-dene): Hikie dönüş adresine kendi sorgu parametrelerini ekler
 * (store, productType, customerEmail = kullanıcının e-postası, checkoutLinkToken). Bunlar adres çubuğunda, tarayıcı
 * geçmişinde, analitikte ve paylaşılan bağlantıda kalmasın diye sayfa yüklenir yüklenmez silinir; yalnız bizim
 * ürettiğimiz opak `merchantOrderId` (oy_ + 32 hex; callback yönlendirmesi ekler) bırakılır — kişisel veri değil.
 *
 * İki katman: (1) sayfanın <head>'indeki satır içi betik (`RETURN_URL_SCRUB_SCRIPT`) Next ve analitik betiklerinden
 * ÖNCE `history.replaceState` yapar; (2) bileşen efekti istemci içi gezinmede aynı temizliği yapar.
 */
export const MERCHANT_ORDER_ID_RE = /^oy_[0-9a-f]{32}$/;

/** Sorgudaki geçerli sipariş kimliği ya da null. */
export function readReturnOrderId(search: string): string | null {
  const v = new URLSearchParams(search).get('merchantOrderId');
  return v && MERCHANT_ORDER_ID_RE.test(v) ? v : null;
}

/** Temizlenmiş sorgu: "" ya da "?merchantOrderId=oy_…" (başka hiçbir parametre kalmaz). `keepOrderId` false → "". */
export function cleanReturnQuery(search: string, keepOrderId = true): string {
  const id = keepOrderId ? readReturnOrderId(search) : null;
  return id ? `?merchantOrderId=${id}` : '';
}

/** Adres değişmesi gerekiyorsa yeni "yol + sorgu" (hash atılır), gerekmiyorsa null. */
export function returnUrlToReplace(pathname: string, search: string, hash: string, keepOrderId = true): string | null {
  if (!search && !hash) return null;
  const cleaned = cleanReturnQuery(search, keepOrderId);
  return cleaned === search && !hash ? null : `${pathname}${cleaned}`;
}

/** Satır içi betiğin girdiği sayfalar (Next sayfa yolu → sipariş kimliği tutulsun mu). */
const PAYMENT_RETURN_PAGES: Readonly<Record<string, boolean>> = { '/odeme/tamamlandi': true, '/odeme/tekrar-dene': false };

/** _document için: bu sayfanın HTML'ine girecek temizlik betiği ya da null (diğer tüm sayfalar). */
export function returnUrlScriptForPage(page: string): string | null {
  const keep = PAYMENT_RETURN_PAGES[page];
  return keep === undefined ? null : returnUrlScrubScript(keep);
}

/**
 * <head>'de çalışan bağımsız betik (modül yok; ES5). `keepOrderId`: sonuç sayfası sipariş kimliğini tutar, tekrar-dene
 * sayfası tutmaz. Hata olursa sessiz (bileşen efekti yedek).
 */
export function returnUrlScrubScript(keepOrderId: boolean): string {
  return (
    '(function(){try{var l=window.location;if(!l.search&&!l.hash)return;' +
    (keepOrderId
      ? "var m=new URLSearchParams(l.search).get('merchantOrderId');var q=m&&/^oy_[0-9a-f]{32}$/.test(m)?'?merchantOrderId='+m:'';"
      : "var q='';") +
    'if(q===l.search&&!l.hash)return;history.replaceState(history.state,"",l.pathname+q);}catch(e){}})();'
  );
}
