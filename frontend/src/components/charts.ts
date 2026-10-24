// Shared chart styling: colours come from CSS custom properties so light/dark
// themes switch without re-rendering logic.
export const C = {
  forecast: "var(--series-forecast)",
  actual: "var(--series-actual)",
  adjusted: "var(--series-adjusted)",
  run: "var(--series-run)",
  over: "var(--div-over)",
  under: "var(--div-under)",
  grid: "var(--grid)",
  axis: "var(--axis)",
};

export const axisProps = {
  stroke: C.axis,
  tickLine: false,
  tick: { fontSize: 12 },
} as const;

export const gridProps = { stroke: C.grid, vertical: false } as const;

export const kiloTick = (v: number) => `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}`;

/** Round GW-friendly ticks (MW values) covering [min, max] in at most ~7 steps. */
export function niceTicks(max: number, min = 0): number[] {
  const span = Math.max(max - min, 1);
  const step = [500, 1000, 2000, 2500, 5000, 10000].find((s) => span / s <= 6) ?? 10000;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
}
