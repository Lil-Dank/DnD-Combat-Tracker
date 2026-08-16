import { useEffect, useState } from 'react';
import type { KenkuLibrary } from '../../main/kenku';
import { api } from './api';

/**
 * The Kenku FM library (playlists + sounds), fetched once per mount.
 * `null` while loading or when Kenku is unreachable — callers show the
 * cached title / an offline note in that case. In the browser demo the shim
 * answers with real Kenku when reachable, else the built-in sample board.
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
    if (!enabled) return;
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
