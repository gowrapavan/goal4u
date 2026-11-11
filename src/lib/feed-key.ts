/**
 * Identity of a /api/data/feed request: which competitions, which dates, which season. The server echoes it in its answer and the browser checks it,
 * so an answer that belongs to ANOTHER address (a shared cache handing out the wrong copy) is recognised and asked for again instead of being shown.
 * Pure: no environment, no network.
 */
export const feedKey = (codes: string[] | undefined, from?: string, to?: string, season?: string): string =>
  `${[...new Set((codes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))].sort().join(',')}|${from ?? ''}|${to ?? ''}|${season ?? ''}`;
