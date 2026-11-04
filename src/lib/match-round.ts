/** The round / matchday wording of a fixture. Cup-style competitions (Champions League) say "Round 3", leagues say "Matchday 3". */
import { compByCode } from './competitions';

export interface RoundInput { stage?: string; matchday: number | null; group?: string | null }
const STAGE: Record<string, string> = {
  PLAYOFFS: 'Knockout play-offs', PLAY_OFFS: 'Knockout play-offs', LAST_32: 'Round of 32', LAST_16: 'Round of 16', ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals', SEMI_FINALS: 'Semi-finals', FINAL: 'Final', THIRD_PLACE: 'Third-place play-off',
};
const groupName = (g?: string | null) => (g ? g.replace(/^GROUP[_ ]?/i, 'Group ').replace(/_/g, ' ').trim() : null);

export function roundLabel(m: RoundInput, code?: string): string | null {
  if (m.stage && STAGE[m.stage]) return STAGE[m.stage];
  const cup = !!compByCode(code)?.cup;
  const g = groupName(m.group);
  if (m.stage === 'GROUP_STAGE' && m.matchday) return `${g ? `${g} · ` : ''}Matchday ${m.matchday}`;
  if (!m.matchday) return g;
  return cup ? `Round ${m.matchday}` : `Matchday ${m.matchday}`;
}
/** "Europe, UEFA Champions League, Round 3" */
export function competitionLine(m: RoundInput, code?: string, fallbackName?: string): string {
  const c = compByCode(code);
  return [c?.country, c?.name ?? fallbackName, roundLabel(m, code)].filter(Boolean).join(', ');
}
/** Compact form for small cards: "R3" for cup-style rounds, "MD3" for league matchdays. */
export function roundShort(m: RoundInput, code?: string): string | null {
  if (!m.matchday || (m.stage && STAGE[m.stage])) return null;
  return compByCode(code)?.cup ? `R${m.matchday}` : `MD${m.matchday}`;
}
