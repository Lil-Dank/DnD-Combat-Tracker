import { useEffect, useState } from 'react';
import type { KenkuLibrary } from '../../main/kenku';
import { api, isDemo } from './api';

/**
 * The Kenku FM library (playlists + sounds), fetched once per mount.
 * `null` while loading or when Kenku is unreachable — callers show the
 * cached title / an offline note in that case. Inert in the browser demo.
 */
export function useKenkuLibrary(enabled: boolean): {
  library: KenkuLibrary | null;
  loading: boolean;
  refresh: () => void;
} {
  const [library, setLibrary] = useState<KenkuLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || isDemo) return;
    let mounted = true;
    setLoading(true);
    void api.kenkuGetLibrary().then((lib) => {
      if (!mounted) return;
      setLibrary(lib);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [enabled, tick]);

  return { library, loading, refresh: () => setTick((n) => n + 1) };
}
