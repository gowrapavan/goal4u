/** Shapes shared by the stream API (server) and the stream page (browser). No imports: safe on both sides. */
export interface StreamServer { label: string; url: string; type?: string }
export interface StreamMatch {
  id: string; home: string; away: string; homeLogo: string; awayLogo: string;
  league: string; time: string; servers: StreamServer[];
  /** Fields of the source row that the page does not know, for the "details" drawer. */
  extra: Record<string, string>;
}
export interface StreamSourceResult {
  file: string; ok: boolean;
  /** 'mirror' = the data service, 'backup' = GitHub (the data service did not answer in time) */
  via: 'mirror' | 'backup' | null;
  status: number; rows: number; matches: StreamMatch[]; fetchedAt: string; error?: string;
}
export interface StreamsPayload { generatedAt: string; sources: StreamSourceResult[] }
export interface StreamsGate { required: boolean }
