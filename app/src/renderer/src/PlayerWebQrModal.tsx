import { useEffect, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

/**
 * Big QR codes for players to scan at the table — one per network interface,
 * pointing phones at the player web app. Opened from the sidebar while the
 * player web server is enabled.
 */
export function PlayerWebQrModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [qr, setQr] = useState<{
    urls: string[];
    dataUrls: string[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    void api.getPlayerWebQr().then(setQr);
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal pw-qr-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('pw.qrTitle')}</h2>
        {qr?.error && <p className="pw-error">{t('pw.error', { code: qr.error })}</p>}
        {qr && !qr.error && qr.urls.length === 0 && <p className="muted">{t('pw.noNetwork')}</p>}
        {qr && qr.urls.length > 0 && (
          <div className="pw-qr-row large">
            {qr.urls.map((url, i) => (
              <figure key={url} className="pw-qr">
                <img src={qr.dataUrls[i]} alt={url} width={280} height={280} />
                <figcaption>
                  <code>{url}</code>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="muted">{t('pw.urlNote')}</p>
        <footer className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
