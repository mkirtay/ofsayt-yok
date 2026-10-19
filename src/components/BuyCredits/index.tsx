import { useCallback, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

/** Popup yalnız açılınca yüklenir: kredi CTA'sı olan sayfaların (maç, asistan, Gündem) ilk paketine eklenmez. */
const BuyCreditsDialog = dynamic(() => import('./BuyCreditsDialog'), { ssr: false });

/**
 * "Kredi al" düğmesi: /pricing'e gitmek yerine kredi popup'ını açar (paket seçilince doğrudan ödeme). Görünüm çağıranın
 * sınıfıyla (`className`).
 */
export default function BuyCreditsButton({ className, children }: { className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {children}
      </button>
      {open ? <BuyCreditsDialog onClose={close} /> : null}
    </>
  );
}
