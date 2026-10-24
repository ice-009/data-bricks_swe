// All display times are UK local (Europe/London), which is how the trading desk thinks.
const UK = "Europe/London";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK, weekday: "short", day: "numeric", month: "short" });
const dayTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const ukTime = (iso: string) => timeFmt.format(new Date(iso));
export const ukDay = (iso: string) => dayFmt.format(new Date(iso));
export const ukDayTime = (iso: string) => dayTimeFmt.format(new Date(iso));

/** "2026-01-15" -> "Thu 15 Jan" without timezone drift. */
export const isoDateLabel = (d: string) => dayFmt.format(new Date(`${d}T12:00:00Z`));

export function shiftDate(d: string, days: number): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const mw = (v: number | null | undefined) => (v == null ? "–" : `${nf0.format(v)} MW`);
export const gw = (v: number | null | undefined) => (v == null ? "–" : `${nf1.format(v / 1000)} GW`);
export const gwh = (mwh: number | null | undefined) => (mwh == null ? "–" : `${nf1.format(mwh / 1000)} GWh`);
export const pct = (v: number | null | undefined) => (v == null ? "–" : `${nf1.format(v)}%`);

/** Signed GW with an explicit + so the direction of a bias is never ambiguous. */
export const signedGw = (v: number | null | undefined) =>
  v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf1.format(Math.abs(v) / 1000)} GW`;

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}
