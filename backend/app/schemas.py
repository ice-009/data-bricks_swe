"""Response models: the API contract the React app is typed against (see frontend/src/types.ts)."""

from __future__ import annotations

from pydantic import BaseModel


class GatePreset(BaseModel):
    id: str
    label: str
    time: str


class Meta(BaseModel):
    decision_start: str
    decision_end: str
    delivery_start: str
    delivery_end: str
    gate_presets: list[GatePreset]
    forecast_run_times_uk: list[str]
    counts: dict[str, int]
    sources: dict[str, str]


class ErrorSummary(BaseModel):
    n: int
    mae: float
    rmse: float
    bias: float
    nmae_pct: float
    p10: float
    p50: float
    p90: float
    max_over: float
    max_under: float
    mean_actual: float


class ForecastPoint(BaseModel):
    start_time: str
    forecast: float | None
    adjusted: float | None
    p10: float | None
    p90: float | None
    horizon_h: float


class SeriesPoint(BaseModel):
    start_time: str
    generation: float | None


class ForecastRun(BaseModel):
    publish_time: str
    after_gate: bool
    used: bool
    points: list[SeriesPoint]


class Band(BaseModel):
    lower_error_q90: float
    upper_error_q10: float
    sample_days: int


class EnergyTotals(BaseModel):
    forecast: float | None
    adjusted: float | None
    p10: float | None
    actual: float | None
    shortfall_vs_forecast: float | None


class DayAhead(BaseModel):
    delivery_date: str
    gate_closure: str
    forecast_published: str | None
    next_run_after_gate: str | None
    bias_adjustment: float
    band: Band
    points: list[ForecastPoint]
    actuals: list[SeriesPoint]
    energy_mwh: EnergyTotals
    summary: ErrorSummary | None
    runs: list[ForecastRun]


class GroupError(BaseModel):
    key: str | int
    mae: float
    bias: float
    n: int


class HistogramBin(BaseModel):
    # "from" is a Python keyword, hence the alias.
    from_: float
    to: float
    count: int

    model_config = {"populate_by_name": True, "alias_generator": lambda f: "from" if f == "from_" else f}


class ScatterPoint(BaseModel):
    forecast: float
    actual: float


class Accuracy(BaseModel):
    selection: dict[str, str | float]
    summary: ErrorSummary | None
    adjusted_summary: ErrorSummary | None
    by_day: list[GroupError]
    by_hour: list[GroupError]
    histogram: list[HistogramBin]
    scatter: list[ScatterPoint]


class HorizonPoint(BaseModel):
    horizon_h: int
    mae: float
    p10: float
    p90: float
    n: int


class GateComparison(BaseModel):
    id: str
    label: str
    time: str
    mae: float
    rmse: float
    bias: float
    adjusted_mae: float


class HorizonCurve(BaseModel):
    curve: list[HorizonPoint]
    gates: list[GateComparison]
