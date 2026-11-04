// useFuzzySearch.ts
import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { SearchItem } from './useSearchData';

const FUSE_OPTIONS = {
  keys: [
    { name: 'name',     weight: 0.75 },  // team name is the primary signal
    { name: 'subtitle', weight: 0.25 },  // "Premier League · Champions League"
  ],
  threshold: 0.4,        // forgives typos like "Reall Madrid"
  ignoreLocation: true,  // crucial — matches anywhere in the string, not just start
  useExtendedSearch: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  findAllMatches: true,
};

export function useFuzzySearch(items: SearchItem[], query: string) {
  const fuse = useMemo(() => new Fuse(items, FUSE_OPTIONS), [items]);

  return useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 8);
  }, [fuse, query]);
}