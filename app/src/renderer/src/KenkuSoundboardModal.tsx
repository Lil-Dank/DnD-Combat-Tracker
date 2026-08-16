import { useEffect, useState } from 'react';
import { api } from './api';
import { useI18n } from './i18n';
import { useKenkuLibrary } from './useKenkuLibrary';

/**
 * Manual Kenku FM soundboard: every sound as a click-to-play button, grouped
 * by soundboard. Clicking a playing sound stops it; playing state comes from
 * a short poll of Kenku's playback endpoint while the panel is open. Audio
 * itself plays through Kenku FM.
 */
export function KenkuSoundboardModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { library, loading, refresh } = useKenkuLibrary(true);
  const [playing, setPlaying] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const pb = await api.kenkuSoundPlayback();
      if (mounted) setPlaying(new Set((pb?.sounds ?? []).map((s) => s.id)));
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const toggle = async (id: string) => {
    if (playing.has(id)) {
      await api.kenkuStopSound(id);
      setPlaying((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    } else {
      await api.kenkuPlaySound(id);
      setPlaying((p) => new Set(p).add(id));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal kenku-soundboard" onClick={(e) => e.stopPropagation()}>
        <h2>{t('kenku.soundboard')}</h2>

        {!library && !loading && <p className="muted">{t('kenku.offline')}</p>}

        {library?.soundboards.map((board) => (
          <section key={board.id} className="kenku-board">
            <h3>{board.title}</h3>
            <div className="kenku-board-sounds">
              {board.sounds
                .map((id) => library.sounds.find((s) => s.id === id))
                .filter((s): s is NonNullable<typeof s> => Boolean(s))
                .map((sound) => (
                  <button
                    key={sound.id}
                    className={`pick-btn ${playing.has(sound.id) ? 'picked' : ''}`}
                    onClick={() => void toggle(sound.id)}
                  >
                    {playing.has(sound.id) ? '■ ' : '▶ '}
                    {sound.title}
                  </button>
                ))}
            </div>
          </section>
        ))}

        <div className="modal-actions">
          <button className="btn" onClick={() => refresh()}>
            {t('kenku.refresh')}
          </button>
          <button className="btn" onClick={() => void api.kenkuStopAll()}>
            {t('kenku.stopAll')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
