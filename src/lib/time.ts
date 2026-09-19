const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "4d 2h", "6h 20m", "18m", or "now" once the lease is up. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "now";
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  return `${minutes}m`;
}

/** Longer form for prose: "4 days", "6 hours", "18 minutes". */
export function formatDurationLong(ms: number): string {
  if (ms <= 0) return "any moment now";
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (ms >= DAY) return plural(Math.round(ms / DAY), "day");
  if (ms >= HOUR) return plural(Math.round(ms / HOUR), "hour");
  return plural(Math.max(1, Math.round(ms / MINUTE)), "minute");
}

/** "3 Sep 2026, 12:00" in the viewer's own locale and zone. */
export function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface Lease {
  /** Milliseconds until termination; negative once overdue. */
  remainingMs: number;
  /** How much of the stack's life is spent, clamped to 0..1. */
  spent: number;
  /** Under a day left, so the countdown deserves attention. */
  endingSoon: boolean;
}

export function readLease(createdAt: string, terminationDate: string, now: number): Lease {
  const start = new Date(createdAt).getTime();
  const end = new Date(terminationDate).getTime();
  const remainingMs = end - now;

  const total = end - start;
  const spent =
    Number.isFinite(total) && total > 0
      ? Math.min(1, Math.max(0, (now - start) / total))
      : Number.isNaN(remainingMs) || remainingMs > 0
        ? 0
        : 1;

  return { remainingMs, spent, endingSoon: remainingMs < DAY };
}
