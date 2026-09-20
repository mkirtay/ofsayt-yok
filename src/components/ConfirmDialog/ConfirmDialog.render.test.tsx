import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmDialogView } from './index';

const base = {
  title: 'Gönderiyi sil',
  message: 'Bu gönderiyi silmek istediğinize emin misiniz?',
  confirmLabel: 'Sil',
  cancelLabel: 'Vazgeç',
  onConfirm: () => {},
  onCancel: () => {},
};

describe('<ConfirmDialogView />', () => {
  it('alertdialog rolü, aria-modal, başlık/açıklama bağlantısı ve iki düğmeyi basar', () => {
    const html = renderToStaticMarkup(<ConfirmDialogView {...base} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('Gönderiyi sil');
    expect(html).toContain('Bu gönderiyi silmek istediğinize emin misiniz?');
    expect(html).toContain('>Vazgeç<');
    expect(html).toContain('>Sil<');
  });

  it('hata yokken uyarı alanı yok; hata varsa role=alert ile gösterilir', () => {
    expect(renderToStaticMarkup(<ConfirmDialogView {...base} />)).not.toContain('role="alert"');
    const html = renderToStaticMarkup(<ConfirmDialogView {...base} error="Gönderi silinemedi." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Gönderi silinemedi.');
  });

  it('işlem sürerken (busy) her iki düğme de pasif', () => {
    const html = renderToStaticMarkup(<ConfirmDialogView {...base} busy />);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('normalde düğmeler aktif', () => {
    expect(renderToStaticMarkup(<ConfirmDialogView {...base} />)).not.toContain('disabled=""');
  });
});
