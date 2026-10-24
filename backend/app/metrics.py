"""Forecast error metrics.

Sign convention: error = forecast - actual (MW).
  error > 0  -> over-forecast: less wind turned up than planned, so the buyer is
               SHORT and must buy the gap in intraday/balancing (usually costly).
  error < 0  -> under-forecast: more wind than planned, buyer is LONG.

We avoid MAPE: wind output can approach zero, which blows percentage errors up.
Normalised MAE (MAE / mean actual) is used for a scale-free view instead.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd


def join_actuals(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Pair each forecast with the actual for the same startTime.

    Forecasts are hourly and actuals half-hourly; we compare at the hourly
    startTimes that both datasets share (the brief treats the fields as like-for-like).
    """
    merged = forecasts.merge(actuals.rename(columns={"generation": "actual"}), on="start_time", how="inner").rename(
        columns={"generation": "forecast"}
    )
    merged["error"] = merged["forecast"] - merged["actual"]
    return merged


@dataclass(frozen=True)
class ErrorSummary:
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

    def to_dict(self) -> dict:
        return asdict(self)


def summarise(errors: pd.Series, actuals: pd.Series) -> ErrorSummary | None:
    if errors.empty:
        return None
    e = errors.to_numpy(dtype=float)
    mean_actual = float(np.mean(actuals))
    mae = float(np.mean(np.abs(e)))
    p10, p50, p90 = np.percentile(e, [10, 50, 90])
    return ErrorSummary(
        n=int(e.size),
        mae=round(mae, 1),
        rmse=round(float(np.sqrt(np.mean(e**2))), 1),
        bias=round(float(np.mean(e)), 1),
        nmae_pct=round(100 * mae / mean_actual, 2) if mean_actual else float("nan"),
        p10=round(float(p10), 1),
        p50=round(float(p50), 1),
        p90=round(float(p90), 1),
        max_over=round(float(e.max()), 1),
        max_under=round(float(e.min()), 1),
        mean_actual=round(mean_actual, 1),
    )


def grouped_errors(df: pd.DataFrame, key: str | pd.Series) -> list[dict]:
    """MAE / bias / count per group, sorted by group key."""
    g = df.groupby(key)["error"]
    out = pd.DataFrame({"mae": g.apply(lambda s: s.abs().mean()), "bias": g.mean(), "n": g.size()})
    out.index.name = "key"
    return out.round(1).reset_index().to_dict(orient="records")


def error_histogram(errors: pd.Series, bin_width: float = 500.0) -> list[dict]:
    if errors.empty:
        return []
    lo = np.floor(errors.min() / bin_width) * bin_width
    hi = np.ceil(errors.max() / bin_width) * bin_width + bin_width
    counts, edges = np.histogram(errors, bins=np.arange(lo, hi, bin_width))
    return [
        {"from": float(a), "to": float(b), "count": int(c)}
        for a, b, c in zip(edges[:-1], edges[1:], counts, strict=True)
    ]


def error_quantiles(errors: pd.Series, qs: tuple[float, float] = (0.1, 0.9)) -> tuple[float, float]:
    """Empirical error quantiles used to draw an uncertainty band around a forecast."""
    lo, hi = np.quantile(errors.to_numpy(dtype=float), qs)
    return float(lo), float(hi)
