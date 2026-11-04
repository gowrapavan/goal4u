/**
 * Geometry of the shot map: one half-pitch per team, the goal at the top, the team attacking upwards.
 * A shot's x is 0–100 from the team's own goal to the goal it attacks; y is 0–100 across the pitch.
 * The view is 68 m wide and shows the last 46 m before the goal line (the box and what is just outside it); a shot from
 * further out is drawn on the bottom edge and flagged `far`.
 */
export const VIEW_W = 68;
export const VIEW_H = 46;
const PITCH_LEN = 105;

export function shotXY(s: { x: number; y: number }): { x: number; y: number; far: boolean } {
  const depth = ((100 - s.x) / 100) * PITCH_LEN;                // metres from the goal line
  const far = depth > VIEW_H - 2;
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  return { x: clamp((s.y / 100) * VIEW_W, 2, VIEW_W - 2), y: clamp(depth, 1.5, VIEW_H - 2), far };
}

/** Marker size from expected goals: a 0.03 chance stays small, a penalty (≈0.78) is clearly the biggest. */
export const markerRadius = (xg: number) => 1.5 + Math.sqrt(Math.max(0, xg)) * 3.4;

/** 5-point star (goals), outer radius R, inner radius 0.42·R. */
export function starPoints(cx: number, cy: number, R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? R : R * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export type ShotFilter = 'all' | 'goals' | 'target' | 'missed';
export const onTarget = (o: string) => o === 'goal' || o === 'saved' || o === 'post';
export function filterShots<T extends { outcome: string }>(shots: T[], f: ShotFilter): T[] {
  if (f === 'goals') return shots.filter((s) => s.outcome === 'goal');
  if (f === 'target') return shots.filter((s) => onTarget(s.outcome));
  if (f === 'missed') return shots.filter((s) => !onTarget(s.outcome));
  return shots;
}
