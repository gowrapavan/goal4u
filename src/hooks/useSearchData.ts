// useSearchData.ts
import { useState, useEffect } from 'react';

export type SearchItem = {
  id: string;
  name: string;
  type: 'team' | 'player' | 'competition';
  subtitle: string;      // "Primera Division · UEFA Champions League"
  slug: string;
  logo?: string;
};

export function useSearchData(enabled: boolean = true): { items: SearchItem[]; loading: boolean; failed: boolean; retry: () => void } {
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);       // the index could not be loaded: an empty result is then NOT "nothing found"
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;                                    // not opened yet: do not download the whole index for nothing
    async function build() {
      try {
        setLoading(true); setFailed(false);
        const res = await fetch('/api/data/search-index');
        const data = await res.json();

        if (data && Array.isArray(data.items)) {
          setItems(data.items);
          console.log(`[SearchData] Indexed ${data.items.length} items from server.`);
        } else {
          console.error('[SearchData] Invalid response format', data);
          setFailed(true);
        }
      } catch (e) {
        console.error('Search data indexing failed', e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    }
    build();
  }, [attempt, enabled]);

  return { items, loading, failed, retry: () => setAttempt((n) => n + 1) };
}