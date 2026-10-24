import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { api } from "../api";
import { C, axisProps, gridProps, kiloTick, niceTicks } from "../components/charts";
import { Callout, ChartCard, ErrorBanner, KpiTile, LegendItem, Segmented, TooltipBox } from "../components/ui";
import { gw, isoDateLabel, mw, pct, signedGw } from "../format";
import { useApi } from "../hooks/useApi";
import type { Accuracy, HorizonCurve, Meta } from "../types";

type Mode = "gate" | "horizon";

export function AccuracyView({ meta }: { meta: Meta }) {
  const [mode, setMode] = useState<Mode>("gate");
  const [gate, setGate] = useState(meta.gate_presets[0]?.time ?? "09:20");
  const [horizon, setHorizon] = useState(24);
  const acc = useApi((s) => api.accuracy(mode === "gate" ? { gate } : { horizonH: horizon }, s), [mode, gate, horizon]);
  const curve = useApi((s) => api.horizonCurve(s), []);

  return (
    <>
      <div className="page-intro">
        <h2>Forecast accuracy</h2>
        <p>
          How far to trust the forecast, measured on every hour delivered in the pilot period ({isoDateLabel(meta.delivery_start)}{" "}
          – {isoDateLabel(meta.delivery_end)}). Error = forecast − actual: positive means less wind arrived than forecast, so the
          desk was <b>short</b>.
        </p>
      </div>

      <div className="filters">
        <div className="field">
          <span>Which forecast to score</span>
          <Segmented
            label="Forecast selection"
            value={mode}
            onChange={setMode}
            options={[
              { value: "gate", label: "Available at gate closure" },
              { value: "horizon", label: "Fixed lead time" },
            ]}
          />
        </div>
        {mode === "gate" ? (
          <div className="field">
            <span>Gate closure (D-1)</span>
            <Segmented
              label="Gate"
              value={gate}
              onChange={setGate}
              options={meta.gate_presets.map((g) => ({ value: g.time, label: `${g.id.toUpperCase()} ${g.time}` }))}
            />
          </div>
        ) : (
          <label className="field">
            <span>Minimum lead time: {horizon} h</span>
            <input type="range" min={0} max={48} step={1} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
          </label>
        )}
      </div>

      {(acc.error || curve.error) && <ErrorBanner message={acc.error ?? curve.error ?? ""} />}
      {!acc.data && acc.loading && <div className="loading">Loading…</div>}
      {acc.data && <AccuracyContent a={acc.data} curve={curve.data} dimmed={acc.loading} />}
    </>
  );
}

function AccuracyContent({ a, curve, dimmed }: { a: Accuracy; curve: HorizonCurve | null; dimmed: boolean }) {
  const s = a.summary;
  if (!s) return <Callout tone="warn">No forecast/actual pairs for this selection.</Callout>;
  const adj = a.adjusted_summary;
  const overHours = a.histogram.filter((b) => b.from >= 0).reduce((n, b) => n + b.count, 0);
  const improvement = adj ? (100 * (s.mae - adj.mae)) / s.mae : null;

  return (
    <>
      <div className="kpis">
        <KpiTile label="Mean absolute error" value={gw(s.mae)} sub={`${pct(s.nmae_pct)} of mean wind output (${gw(s.mean_actual)})`} />
        <KpiTile label="Bias (mean error)" value={signedGw(s.bias)} sub={s.bias > 0 ? "systematic over-forecast → desk runs short" : "systematic under-forecast"} />
        <KpiTile label="RMSE" value={gw(s.rmse)} sub="penalises the big misses" />
        <KpiTile label="80% of errors within" value={`${signedGw(s.p10)} … ${signedGw(s.p90)}`} sub={`worst: ${signedGw(s.max_over)} / ${signedGw(s.max_under)}`} />
        {adj && improvement != null && (
          <KpiTile label="Bias-adjusted MAE" value={gw(adj.mae)} sub={`${pct(improvement)} lower using trailing 7-day bias`} />
        )}
      </div>

      <Callout>
        <b>What this means for procurement</b>
        <ul>
          <li>
            The forecast was too high in <b>{pct((100 * overHours) / s.n)}</b> of hours, on average by {signedGw(s.bias)}. Buying
            against the raw forecast leaves the book short far more often than long.
          </li>
          <li>
            For an hour forecast at X GW, plan around <b>X {signedGw(-s.p90)}</b> to cover 9 in 10 hours (P10 wind), not X itself.
          </li>
          {adj && improvement != null && (
            <li>
              Subtracting the bias from the last 7 settled days (known at gate closure, no look-ahead) cuts MAE by{" "}
              <b>{pct(improvement)}</b>, a cheap first win before any new data.
            </li>
          )}
        </ul>
      </Callout>

      {curve && <HorizonChart curve={curve} />}

      <div className="grid-2">
        <DailyChart a={a} dimmed={dimmed} />
        <HistogramChart a={a} dimmed={dimmed} />
        <HourChart a={a} dimmed={dimmed} />
        <ScatterCard a={a} dimmed={dimmed} />
      </div>
    </>
  );
}

function HorizonChart({ curve }: { curve: HorizonCurve }) {
  const data = curve.curve.map((p) => ({ ...p, band: [p.p10, p.p90] as [number, number] }));
  const yTicks = niceTicks(Math.max(...data.map((p) => p.p90)), Math.min(...data.map((p) => p.p10)));
  const tooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as (typeof data)[number];
    return (
      <TooltipBox
        title={`${p.horizon_h} h ahead · ${p.n} hours`}
        rows={[
          { label: "MAE", value: mw(p.mae), color: C.forecast },
          { label: "Error P10 – P90", value: `${signedGw(p.p10)} … ${signedGw(p.p90)}`, color: C.forecast },
        ]}
      />
    );
  };
  return (
    <ChartCard
      title="Accuracy vs forecast lead time"
      subtitle="Every forecast run in the period, scored at each lead time. Shaded: lead times the desk sees for a day-ahead buy (≈16–40 h)."
      legend={
        <>
          <LegendItem label="Mean absolute error" color={C.forecast} />
          <LegendItem label="Error P10 – P90" color={C.forecast} kind="area" />
        </>
      }
      table={{
        columns: ["Lead time (h)", "MAE", "Error P10", "Error P90", "Hours"],
        rows: curve.curve.map((p) => [p.horizon_h, mw(p.mae), mw(p.p10), mw(p.p90), p.n]),
      }}
    >
      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", alignItems: "center" }}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: -8 }}>
            <CartesianGrid {...gridProps} />
            <ReferenceArea x1={16} x2={40} fill="var(--surface-2)" fillOpacity={1} />
            <XAxis dataKey="horizon_h" type="number" domain={[0, 48]} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]} {...axisProps} label={{ value: "hours ahead", position: "insideBottom", dy: 14, fill: "var(--muted)", fontSize: 12 }} />
            <YAxis tickFormatter={kiloTick} {...axisProps} width={48} domain={[yTicks[0], yTicks[yTicks.length - 1]]} ticks={yTicks} />
            <Tooltip content={tooltip} cursor={{ stroke: C.axis }} />
            <ReferenceLine y={0} stroke={C.axis} />
            <Area dataKey="band" stroke="none" fill={C.forecast} fillOpacity={0.14} isAnimationActive={false} />
            <Line dataKey="mae" stroke={C.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div>
          <table className="gate-table">
            <thead>
              <tr>
                <th>Gate</th>
                <th>MAE</th>
                <th>Adjusted</th>
              </tr>
            </thead>
            <tbody>
              {curve.gates.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.id.toUpperCase()} {g.time}
                  </td>
                  <td>{mw(g.mae)}</td>
                  <td>{mw(g.adjusted_mae)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="card-sub" style={{ marginTop: 8 }}>
            The 09:30 forecast run lands after EPEX closes but before N2EX, so N2EX bids see a fresher forecast.
          </p>
        </div>
      </div>
    </ChartCard>
  );
}

function DailyChart({ a, dimmed }: { a: Accuracy; dimmed: boolean }) {
  const yTicks = niceTicks(Math.max(...a.by_day.map((d) => d.bias), 0), Math.min(...a.by_day.map((d) => d.bias), 0));
  const tooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Accuracy["by_day"][number];
    return (
      <TooltipBox
        title={isoDateLabel(String(p.key))}
        rows={[
          { label: "Bias", value: signedGw(p.bias), color: p.bias >= 0 ? C.over : C.under },
          { label: "MAE", value: gw(p.mae), color: C.axis },
        ]}
      />
    );
  };
  return (
    <ChartCard
      title="Daily bias"
      subtitle="Mean error per delivery day (GW). Red: over-forecast (short)."
      dimmed={dimmed}
      legend={
        <>
          <LegendItem label="Over-forecast (short)" color={C.over} kind="bar" />
          <LegendItem label="Under-forecast (long)" color={C.under} kind="bar" />
        </>
      }
      table={{ columns: ["Day", "Bias", "MAE", "Hours"], rows: a.by_day.map((d) => [isoDateLabel(String(d.key)), mw(d.bias), mw(d.mae), d.n]) }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={a.by_day} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="key" tickFormatter={(k) => String(k).slice(8)} interval={2} {...axisProps} />
          <YAxis tickFormatter={kiloTick} {...axisProps} width={48} domain={[yTicks[0], yTicks[yTicks.length - 1]]} ticks={yTicks} />
          <Tooltip content={tooltip} cursor={{ fill: "var(--surface-2)" }} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Bar dataKey="bias" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {a.by_day.map((d) => (
              <Cell key={d.key} fill={d.bias >= 0 ? C.over : C.under} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function HistogramChart({ a, dimmed }: { a: Accuracy; dimmed: boolean }) {
  const data = a.histogram.map((b) => ({ ...b, mid: (b.from + b.to) / 2 }));
  const lo = data[0]?.from ?? 0;
  const hi = data[data.length - 1]?.to ?? 0;
  const xTicks = niceTicks(hi, lo).filter((t) => t >= lo && t <= hi);
  const tooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const b = payload[0].payload as (typeof data)[number];
    return (
      <TooltipBox
        title={`${signedGw(b.from)} to ${signedGw(b.to)}`}
        rows={[{ label: "hours", value: String(b.count), color: b.from >= 0 ? C.over : C.under }]}
      />
    );
  };
  return (
    <ChartCard
      title="Error distribution"
      subtitle="Hours by forecast error (GW, 0.5 GW bins)."
      dimmed={dimmed}
      legend={
        <>
          <LegendItem label="Over-forecast (short)" color={C.over} kind="bar" />
          <LegendItem label="Under-forecast (long)" color={C.under} kind="bar" />
        </>
      }
      table={{ columns: ["From", "To", "Hours"], rows: a.histogram.map((b) => [mw(b.from), mw(b.to), b.count]) }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barCategoryGap={1} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="mid" type="number" domain={[lo, hi]} ticks={xTicks} tickFormatter={kiloTick} {...axisProps} />
          <YAxis {...axisProps} width={48} />
          <Tooltip content={tooltip} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((b) => (
              <Cell key={b.from} fill={b.from >= 0 ? C.over : C.under} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function HourChart({ a, dimmed }: { a: Accuracy; dimmed: boolean }) {
  const yTicks = niceTicks(Math.max(...a.by_hour.map((h) => h.mae)));
  const tooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Accuracy["by_hour"][number];
    return (
      <TooltipBox
        title={`${String(p.key).padStart(2, "0")}:00 UK`}
        rows={[
          { label: "MAE", value: gw(p.mae), color: C.forecast },
          { label: "Bias", value: signedGw(p.bias), color: C.axis },
        ]}
      />
    );
  };
  return (
    <ChartCard
      title="Error by hour of day"
      subtitle="MAE by delivery hour (GW, UK time): where to hold the most cover."
      dimmed={dimmed}
      table={{ columns: ["Hour", "MAE", "Bias", "Hours"], rows: a.by_hour.map((h) => [`${String(h.key).padStart(2, "0")}:00`, mw(h.mae), mw(h.bias), h.n]) }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={a.by_hour} barCategoryGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="key" tickFormatter={(h) => String(h).padStart(2, "0")} interval={2} {...axisProps} />
          <YAxis tickFormatter={kiloTick} {...axisProps} width={48} domain={[0, yTicks[yTicks.length - 1]]} ticks={yTicks} />
          <Tooltip content={tooltip} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="mae" fill={C.forecast} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ScatterCard({ a, dimmed }: { a: Accuracy; dimmed: boolean }) {
  const ticks = niceTicks(Math.max(...a.scatter.map((p) => Math.max(p.forecast, p.actual)), 1));
  const max = ticks[ticks.length - 1];
  const tooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Accuracy["scatter"][number];
    return (
      <TooltipBox
        title="One delivery hour"
        rows={[
          { label: "Forecast", value: gw(p.forecast), color: C.forecast },
          { label: "Actual", value: gw(p.actual), color: C.actual },
        ]}
      />
    );
  };
  return (
    <ChartCard
      title="Forecast vs actual"
      subtitle="Each dot is one hour (GW). Dots below the diagonal: forecast too high."
      dimmed={dimmed}
    >
      <ResponsiveContainer width="100%" height={240}>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 16, left: -8 }}>
          <CartesianGrid {...gridProps} vertical />
          <XAxis dataKey="forecast" type="number" domain={[0, max]} ticks={ticks} tickFormatter={kiloTick} {...axisProps} label={{ value: "forecast", position: "insideBottom", dy: 14, fill: "var(--muted)", fontSize: 12 }} />
          <YAxis dataKey="actual" type="number" domain={[0, max]} ticks={ticks} tickFormatter={kiloTick} {...axisProps} width={48} label={{ value: "actual", angle: -90, position: "insideLeft", dx: 16, fill: "var(--muted)", fontSize: 12 }} />
          <Tooltip content={tooltip} cursor={false} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke="var(--ink-2)" strokeDasharray="4 4" />
          <Scatter data={a.scatter} fill={C.forecast} fillOpacity={0.35} isAnimationActive={false} shape="circle" />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
