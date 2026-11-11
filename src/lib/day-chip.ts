/**
 * The small day label beside a kick-off time in lists ("Coming up" on the match page).
 * A bare weekday is only unambiguous within the next week: on Wednesday 11 Nov a match on Saturday 21 Nov must not read "Sat", because
 * "Sat" means THIS Saturday (14 Nov). Within 6 days → the weekday; further away (or in the past) → the date.
 * Pure: `now` is a parameter.
 */
export function dayChip(iso: string, now: number = Date.now(), locale?: string): string {
  const d = new Date(iso), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(n)) / 86_400_000);
  return diff >= 0 && diff <= 6
    ? d.toLocaleDateString(locale, { weekday: 'short' })
    : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
