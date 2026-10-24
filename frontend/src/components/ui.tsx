import { useState, type ReactNode } from "react";

export function KpiTile({ label, value, sub, hint }: { label: string; value: string; sub?: ReactNode; hint?: string }) {
  return (
    <div className="kpi" title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

/** Card with a Chart/Table switch: every chart has an accessible tabular view. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  dimmed,
  className,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table?: TableData;
  dimmed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card ${className ?? ""}`}>
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {table && (
          <Segmented
            size="sm"
            value={showTable ? "table" : "chart"}
            onChange={(v) => setShowTable(v === "table")}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        )}
      </header>
      {legend && !showTable && <div className="legend">{legend}</div>}
      <div className={`card-body ${dimmed ? "dimmed" : ""}`}>
        {showTable && table ? <DataTable {...table} /> : children}
      </div>
    </section>
  );
}

function DataTable({ columns, rows }: TableData) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegendItem({ label, color, kind = "line" }: { label: string; color: string; kind?: "line" | "dash" | "area" | "bar" }) {
  return (
    <span className="legend-item">
      <svg width="18" height="10" aria-hidden>
        {kind === "area" || kind === "bar" ? (
          <rect x="1" y="1" width="16" height="8" rx="2" fill={color} opacity={kind === "area" ? 0.25 : 1} />
        ) : (
          <line x1="1" y1="5" x2="17" y2="5" stroke={color} strokeWidth="2" strokeDasharray={kind === "dash" ? "4 3" : undefined} />
        )}
      </svg>
      {label}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm";
  label?: string;
}) {
  return (
    <div className={`segmented ${size ?? ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      {label}
    </label>
  );
}

export function Callout({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return <div className={`callout ${tone}`}>{children}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="callout warn" role="alert">
      Couldn’t load data: {message}
    </div>
  );
}

interface TooltipRow {
  label: string;
  value: string;
  color: string;
  dash?: boolean;
}

/** Shared tooltip body: value first, series name second, keyed by a short line. */
export function TooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="tooltip">
      <div className="tooltip-title">{title}</div>
      {rows.map((r) => (
        <div className="tooltip-row" key={r.label}>
          <svg width="14" height="8" aria-hidden>
            <line x1="1" y1="4" x2="13" y2="4" stroke={r.color} strokeWidth="2" strokeDasharray={r.dash ? "3 2" : undefined} />
          </svg>
          <strong>{r.value}</strong>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}
