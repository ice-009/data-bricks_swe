// Mirrors backend/app/schemas.py. Timestamps are ISO-8601 UTC strings; MW unless noted.

export interface GatePreset {
  id: string;
  label: string;
  time: string;
}

export interface Meta {
  decision_start: string;
  decision_end: string;
  delivery_start: string;
  delivery_end: string;
  gate_presets: GatePreset[];
  forecast_run_times_uk: string[];
  counts: Record<string, number>;
  sources: Record<string, string>;
}

export interface ErrorSummary {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  nmae_pct: number;
  p10: number;
  p50: number;
  p90: number;
  max_over: number;
  max_under: number;
  mean_actual: number;
}

export interface ForecastPoint {
  start_time: string;
  forecast: number | null;
  adjusted: number | null;
  p10: number | null;
  p90: number | null;
  horizon_h: number;
}

export interface SeriesPoint {
  start_time: string;
  generation: number | null;
}

export interface ForecastRun {
  publish_time: string;
  after_gate: boolean;
  used: boolean;
  points: SeriesPoint[];
}

export interface DayAhead {
  delivery_date: string;
  gate_closure: string;
  forecast_published: string | null;
  next_run_after_gate: string | null;
  bias_adjustment: number;
  band: { lower_error_q90: number; upper_error_q10: number; sample_days: number };
  points: ForecastPoint[];
  actuals: SeriesPoint[];
  energy_mwh: {
    forecast: number | null;
    adjusted: number | null;
    p10: number | null;
    actual: number | null;
    shortfall_vs_forecast: number | null;
  };
  summary: ErrorSummary | null;
  runs: ForecastRun[];
}

export interface GroupError {
  key: string | number;
  mae: number;
  bias: number;
  n: number;
}

export interface Accuracy {
  selection: { mode: "gate"; gate_time: string } | { mode: "horizon"; horizon_h: number };
  summary: ErrorSummary | null;
  adjusted_summary: ErrorSummary | null;
  by_day: GroupError[];
  by_hour: GroupError[];
  histogram: { from: number; to: number; count: number }[];
  scatter: { forecast: number; actual: number }[];
}

export interface HorizonCurve {
  curve: { horizon_h: number; mae: number; p10: number; p90: number; n: number }[];
  gates: { id: string; label: string; time: string; mae: number; rmse: number; bias: number; adjusted_mae: number }[];
}
