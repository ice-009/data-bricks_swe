import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { api } from "../api";
import { C, axisProps, gridProps, kiloTick, niceTicks } from "../components/charts";
import { ChartCard, ErrorBanner, KpiTile, LegendItem, Segmented, Toggle, TooltipBox } from "../components/ui";
import { gw, gwh, isoDateLabel, minutesBetween, mw, shiftDate, signedGw, ukDayTime, ukTime } from "../format";
import { useApi } from "../hooks/useApi";
import type { DayAhead, Meta } from "../types";

interface Row {
  t: number;
  actual?: number | null;
  forecast?: number | null;
  adjusted?: number | null;
  band?: [number, number];
  [run: `run${number}`]: number | null | undefined;
}

function buildRows(d: DayAhead, showRuns: boolean): Row[] {
  const byTime = new Map<number, Row>();
  const row = (iso: string) => {
    const t = Date.parse(iso);
    let r = byTime.get(t);
    if (!r) byTime.set(t, (r = { t }));
    return r;
  };
  for (const a of d.actuals) row(a.start_time).actual = a.generation;
  for (const p of d.points) {
    const r = row(p.start_time);
    r.forecast = p.forecast;
    r.adjusted = p.adjusted;
    if (p.p10 != null && p.p90 != null) r.band = [p.p10, p.p90];
  }
  if (showRuns) {
    d.runs.forEach((run, i) => {
      if (!run.after_gate) return;
      for (const p of run.points) row(p.start_time)[`run${i}`] = p.generation;
    });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function DayAheadView({ meta }: { meta: Meta }) {
  const [date, setDate] = useState(meta.delivery_start === "2026-01-02" ? "2026-01-15" : meta.delivery_start);
  const [gate, setGate] = useState(meta.gate_presets[0]?.time ?? "09:20");
  const [showRuns, setShowRuns] = useState(false);
  const [showAdjusted, setShowAdjusted] = useState(true);
  const { data, error, loading } = useApi((s) => api.dayAhead(date, gate, s), [date, gate]);

  const presetTimes = meta.gate_presets.map((g) => g.time);
  const isCustom = !presetTimes.includes(gate);

  return (
    <>
      <div className="page-intro">
        <h2>Day-ahead decision view</h2>
        <p>
          What the desk would have seen at auction gate closure: the latest wind forecast actually published by then,
          an uncertainty band learned from January’s errors, and, after the fact, what the wind really did.
        </p>
      </div>

      <div className="filters">
        <label className="field">
          <span>Delivery day</span>
          <div className="date-stepper">
            <button aria-label="Previous day" disabled={date <= meta.delivery_start} onClick={() => setDate(shiftDate(date, -1))}>
              ‹
            </button>
            <input
              type="date"
              value={date}
              min={meta.delivery_start}
              max={meta.delivery_end}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button aria-label="Next day" disabled={date >= meta.delivery_end} onClick={() => setDate(shiftDate(date, 1))}>
              ›
            </button>
          </div>
        </label>
        <div className="field">
          <span>Gate closure (D-1, UK time)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Segmented
              label="Gate closure"
              value={isCustom ? "custom" : gate}
              onChange={(v) => setGate(v === "custom" ? "11:00" : v)}
              options={[
                ...meta.gate_presets.map((g) => ({ value: g.time, label: `${g.id.toUpperCase()} ${g.time}` })),
                { value: "custom", label: "Custom" },
              ]}
            />
            {isCustom && (
              <input type="time" aria-label="Custom gate time" value={gate} onChange={(e) => e.target.value && setGate(e.target.value)} />
            )}
          </div>
        </div>
        <Toggle checked={showAdjusted} onChange={setShowAdjusted} label="Bias-adjusted forecast" />
        <Toggle checked={showRuns} onChange={setShowRuns} label="Forecast runs after gate" />
      </div>

      {error && <ErrorBanner message={error} />}
      {!data && loading && <div className="loading">Loading…</div>}
      {data && <DayAheadContent d={data} dimmed={loading} showRuns={showRuns} showAdjusted={showAdjusted} />}
    </>
  );
}

function DayAheadContent({ d, dimmed, showRuns, showAdjusted }: { d: DayAhead; dimmed: boolean; showRuns: boolean; showAdjusted: boolean }) {
  const rows = useMemo(() => buildRows(d, showRuns), [d, showRuns]);
  const dayStart = Date.parse(`${d.delivery_date}T00:00:00Z`);
  const ticks = Array.from({ length: 9 }, (_, i) => dayStart + i * 3 * 3600_000);
  const horizons = d.points.map((p) => p.horizon_h);
  const yTicks = niceTicks(
    Math.max(...rows.flatMap((r) => [r.actual ?? 0, r.forecast ?? 0, r.band?.[1] ?? 0, ...Object.values(r).filter((v) => typeof v === "number" && v !== r.t)])),
  );
  const e = d.energy_mwh;
  const s = d.summary;
  const gapMin = d.next_run_after_gate ? minutesBetween(d.gate_closure, d.next_run_after_gate) : null;

  const tooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload as Row;
    const items = [
      { label: "Actual", value: mw(r.actual), color: C.actual },
      { label: "Forecast at gate", value: mw(r.forecast), color: C.forecast },
      ...(showAdjusted ? [{ label: "Bias-adjusted", value: mw(r.adjusted), color: C.adjusted, dash: true }] : []),
      { label: "P10 – P90 band", value: r.band ? `${gw(r.band[0])} – ${gw(r.band[1])}` : "–", color: C.forecast },
    ];
    return <TooltipBox title={ukTime(new Date(label as number).toISOString())} rows={items} />;
  };

  return (
    <>
      <div className="context-strip">
        <span>
          Decision: <b>{ukDayTime(d.gate_closure)}</b>
        </span>
        <span>
          Forecast used: <b>{d.forecast_published ? `published ${ukTime(d.forecast_published)}` : "none available"}</b>
          {horizons.length > 0 && ` · ${Math.min(...horizons)}–${Math.max(...horizons)} h ahead`}
        </span>
        {d.next_run_after_gate && (
          <span>
            Next run: <b>{ukTime(d.next_run_after_gate)}</b> ({gapMin} min after gate)
          </span>
        )}
      </div>

      <div className="kpis">
        <KpiTile label="Forecast wind at gate" value={gwh(e.forecast)} sub={`avg ${gw((e.forecast ?? 0) / 24)} across the day`} />
        <KpiTile
          label="Prudent wind (P10)"
          value={gwh(e.p10)}
          sub={`buy cover for ${gwh((e.forecast ?? 0) - (e.p10 ?? 0))} of wind risk`}
          hint="Hourly P10 summed: in ~9 of 10 hours wind delivered at least this, judging by the other January days"
        />
        <KpiTile
          label="Bias-adjusted forecast"
          value={gwh(e.adjusted)}
          sub={d.bias_adjustment ? `minus trailing bias ${signedGw(d.bias_adjustment)}` : "no history yet, unadjusted"}
        />
        <KpiTile
          label="Actual wind delivered"
          value={gwh(e.actual)}
          sub={s ? `avg error ${signedGw(s.bias)} · MAE ${gw(s.mae)}` : "actuals not available"}
        />
        <KpiTile
          label="Shortfall vs forecast"
          value={gwh(e.shortfall_vs_forecast)}
          sub="wind that didn’t arrive in over-forecast hours"
        />
      </div>

      <ChartCard
        title={`Wind generation · ${isoDateLabel(d.delivery_date)}`}
        subtitle="GW, UK local time. Forecast is hourly, actuals half-hourly."
        dimmed={dimmed}
        legend={
          <>
            <LegendItem label="Actual (FUELHH)" color={C.actual} />
            <LegendItem label="Forecast at gate (WINDFOR)" color={C.forecast} />
            {showAdjusted && <LegendItem label="Bias-adjusted" color={C.adjusted} kind="dash" />}
            <LegendItem label="P10 – P90 band" color={C.forecast} kind="area" />
            {showRuns && <LegendItem label="Runs published after gate" color={C.run} />}
          </>
        }
        table={{
          columns: ["Time", "Forecast", "Adjusted", "P10", "P90", "Actual", "Error"],
          rows: d.points.map((p) => {
            const actual = d.actuals.find((a) => a.start_time === p.start_time)?.generation ?? null;
            return [
              ukTime(p.start_time),
              mw(p.forecast),
              mw(p.adjusted),
              mw(p.p10),
              mw(p.p90),
              mw(actual),
              actual != null && p.forecast != null ? mw(p.forecast - actual) : "–",
            ];
          }),
        }}
      >
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[ticks[0], ticks[ticks.length - 1]]}
              ticks={ticks}
              tickFormatter={(t) => ukTime(new Date(t).toISOString())}
              {...axisProps}
            />
            <YAxis tickFormatter={kiloTick} {...axisProps} width={48} domain={[yTicks[0], yTicks[yTicks.length - 1]]} ticks={yTicks} />
            <Tooltip content={tooltip} cursor={{ stroke: C.axis }} />
            <Area dataKey="band" stroke="none" fill={C.forecast} fillOpacity={0.14} connectNulls isAnimationActive={false} />
            {showRuns &&
              d.runs.map((run, i) =>
                run.after_gate ? (
                  <Line key={run.publish_time} dataKey={`run${i}`} stroke={C.run} strokeWidth={1.25} dot={false} connectNulls isAnimationActive={false} />
                ) : null,
              )}
            <Line dataKey="forecast" stroke={C.forecast} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            {showAdjusted && (
              <Line dataKey="adjusted" stroke={C.adjusted} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            )}
            <Line dataKey="actual" stroke={C.actual} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <ReferenceLine y={0} stroke={C.axis} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}
