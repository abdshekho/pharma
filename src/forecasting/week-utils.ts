// Single source of truth for turning timestamped order events into a dense,
// zero-filled weekly time series. Used by both the offline training script
// and DemandHistoryService at inference time — they MUST bucket weeks the
// same way, or the model sees a different input shape than it was trained on.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Monday 00:00:00 UTC of the ISO week containing `date`. */
export function getISOWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

/** ISO 8601 week-of-year number (1-53), used for the sin/cos seasonality features. */
export function getISOWeekOfYear(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function weekOfYearFeatures(date: Date): [sin: number, cos: number] {
  const week = getISOWeekOfYear(date);
  const angle = (2 * Math.PI * week) / 52;
  return [Math.sin(angle), Math.cos(angle)];
}

export interface WeeklyPoint {
  weekStart: Date;
  quantity: number;
}

/**
 * Groups timestamped quantities into weekly totals, then fills every week
 * from the first to the last observed week with 0 where there was no order —
 * a gap must never be silently skipped (see plan §1.4 step 2).
 */
export function buildDenseWeeklySeries(events: { date: Date; quantity: number }[]): WeeklyPoint[] {
  if (events.length === 0) return [];

  const weekTotals = new Map<number, number>();
  let minWeek = Infinity;
  let maxWeek = -Infinity;

  for (const e of events) {
    const weekStart = getISOWeekStart(e.date).getTime();
    weekTotals.set(weekStart, (weekTotals.get(weekStart) ?? 0) + e.quantity);
    if (weekStart < minWeek) minWeek = weekStart;
    if (weekStart > maxWeek) maxWeek = weekStart;
  }

  const result: WeeklyPoint[] = [];
  for (let t = minWeek; t <= maxWeek; t += WEEK_MS) {
    result.push({ weekStart: new Date(t), quantity: weekTotals.get(t) ?? 0 });
  }
  return result;
}
