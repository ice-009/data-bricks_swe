"""Use-case layer: turns raw data + selection rules + metrics into API payloads.

Kept separate from the HTTP layer so it can be unit-tested with synthetic data
and reused (e.g. from a notebook) without FastAPI.
"""

from __future__ import annotations

from datetime import date, time, timedelta
from functools import cache

import numpy as np
import pandas as pd

from . import forecast_selection as fs
from . import metrics
from .config import GATE_CLOSURE_PRESETS, UK_TZ, settings
from .repository import WindData


def _iso(ts: pd.Timestamp) -> str:
    return ts.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


def _num(x: float | None) -> float | None:
    return None if x is None or pd.isna(x) else round(float(x), 1)


class WindAnalytics:
    """Stateless apart from memoisation; the underlying data never changes at runtime."""

    def __init__(self, data: WindData) -> None:
        self.data = data
        w = data.window
        self.delivery_dates = [
            w.delivery_start + timedelta(days=i) for i in range((w.delivery_end - w.delivery_start).days + 1)
        ]
        self.window_start, _ = fs.delivery_day_bounds(w.delivery_start)
        _, self.window_end = fs.delivery_day_bounds(w.delivery_end)

    # ---------- cached building blocks ----------

    @cache
    def day_ahead_errors(self, gate_time: time) -> pd.DataFrame:
        """Gate-closure forecast joined with actuals, for every delivery day."""
        fc = fs.day_ahead_forecasts(self.data.forecasts, self.delivery_dates, gate_time)
        return metrics.join_actuals(fc, self.data.actuals)

    @cache
    def trailing_bias(self, gate_time: time) -> dict[date, float]:
        """Mean gate-closure error over the previous N settled days, per delivery day.

        At gate closure on D-1 the latest fully settled day is D-2, so the window
        is D-1-N .. D-2: no look-ahead. Days without history get no adjustment.
        """
        daily = self.day_ahead_errors(gate_time).groupby("delivery_date")["error"].mean()
        daily = daily.reindex(pd.Index(self.delivery_dates))
        trailing = daily.shift(2).rolling(settings.bias_window_days, min_periods=1).mean()
        return {d: 0.0 if pd.isna(v) else float(v) for d, v in trailing.items()}

    @cache
    def adjusted_errors(self, gate_time: time) -> pd.DataFrame:
        df = self.day_ahead_errors(gate_time).copy()
        df["forecast"] = (df["forecast"] - df["delivery_date"].map(self.trailing_bias(gate_time))).clip(lower=0)
        df["error"] = df["forecast"] - df["actual"]
        return df

    @cache
    def horizon_errors(self) -> pd.DataFrame:
        """Every forecast vintage in the window with 0 <= horizon <= max, joined with actuals."""
        fc = fs.with_horizon(self.data.forecasts)
        fc = fc[
            (fc["horizon_h"] >= 0)
            & (fc["horizon_h"] <= settings.max_horizon_hours)
            & (fc["start_time"] >= self.window_start)
            & (fc["start_time"] < self.window_end)
        ]
        return metrics.join_actuals(fc, self.data.actuals)

    # ---------- use cases ----------

    def meta(self) -> dict:
        runs = self.data.forecasts["publish_time"]
        run_times = sorted(runs.dt.tz_convert(UK_TZ).dt.strftime("%H:%M").value_counts().loc[lambda s: s > 3].index)
        return {
            "decision_start": settings.decision_start.isoformat(),
            "decision_end": settings.decision_end.isoformat(),
            "delivery_start": self.data.window.delivery_start.isoformat(),
            "delivery_end": self.data.window.delivery_end.isoformat(),
            "gate_presets": [
                {"id": key, "label": label, "time": t.strftime("%H:%M")}
                for key, (label, t) in GATE_CLOSURE_PRESETS.items()
            ],
            "forecast_run_times_uk": run_times,
            "counts": {
                "actuals": len(self.data.actuals),
                "forecast_rows": len(self.data.forecasts),
                "forecast_runs": int(runs.nunique()),
            },
            "sources": {
                "actuals": "Elexon BMRS FUELHH (fuelType=WIND), half-hourly outturn",
                "forecasts": "Elexon BMRS WINDFOR, hourly national wind forecast",
            },
        }

    def day_ahead(self, delivery_date: date, gate_time: time) -> dict:
        start, end = fs.delivery_day_bounds(delivery_date)
        cutoff = fs.gate_closure_utc(delivery_date, gate_time)
        fc = fs.latest_forecast_before(self.data.forecasts, cutoff, start, end)
        bias = self.trailing_bias(gate_time).get(delivery_date, 0.0)

        # Uncertainty band from the other days' gate-closure errors (leave-one-out,
        # so the band for a day never "knows" that day's outcome).
        errs = self.day_ahead_errors(gate_time)
        others = errs.loc[errs["delivery_date"] != delivery_date, "error"]
        q_lo, q_hi = metrics.error_quantiles(others) if len(others) else (0.0, 0.0)

        actuals = self.data.actuals[
            (self.data.actuals["start_time"] >= start) & (self.data.actuals["start_time"] < end)
        ]
        actual_by_time = dict(zip(actuals["start_time"], actuals["generation"], strict=True))

        points = []
        for row in fc.itertuples():
            points.append(
                {
                    "start_time": _iso(row.start_time),
                    "forecast": _num(row.generation),
                    "adjusted": _num(max(row.generation - bias, 0.0)),
                    # error = forecast - actual, so actual ~ forecast - error.
                    "p10": _num(max(row.generation - q_hi, 0.0)),
                    "p90": _num(row.generation - q_lo),
                    "horizon_h": round(row.horizon_h, 1),
                }
            )

        joined = metrics.join_actuals(fc, actuals)
        summary = metrics.summarise(joined["error"], joined["actual"])
        shortfall = float(joined["error"].clip(lower=0).sum())  # hourly MW => MWh

        runs = fs.runs_for_window(self.data.forecasts, start, end, published_after=cutoff - pd.Timedelta(hours=24))
        publish_used = fc["publish_time"].max() if not fc.empty else None
        later = runs.loc[runs["publish_time"] > cutoff, "publish_time"]

        return {
            "delivery_date": delivery_date.isoformat(),
            "gate_closure": _iso(cutoff),
            "forecast_published": _iso(publish_used) if publish_used is not None else None,
            "next_run_after_gate": _iso(later.min()) if not later.empty else None,
            "bias_adjustment": round(bias, 1),
            "band": {
                "lower_error_q90": round(q_hi, 1),
                "upper_error_q10": round(q_lo, 1),
                "sample_days": len(self.delivery_dates) - 1,
            },
            "points": points,
            "actuals": [{"start_time": _iso(t), "generation": _num(g)} for t, g in actual_by_time.items()],
            "energy_mwh": {
                "forecast": _num(fc["generation"].sum()),
                "adjusted": _num(sum(p["adjusted"] for p in points)),
                "p10": _num(sum(p["p10"] for p in points)),
                "actual": _num(actuals["generation"].sum() * 0.5) if len(actuals) else None,
                "shortfall_vs_forecast": _num(shortfall),
            },
            "summary": summary.to_dict() if summary else None,
            "runs": [
                {
                    "publish_time": _iso(pt),
                    "after_gate": bool(pt > cutoff),
                    "used": bool(publish_used is not None and pt == publish_used),
                    "points": [
                        {"start_time": _iso(t), "generation": _num(g)}
                        for t, g in zip(grp["start_time"], grp["generation"], strict=True)
                    ],
                }
                for pt, grp in runs.groupby("publish_time")
            ],
        }

    def accuracy(self, gate_time: time | None = None, horizon_h: float | None = None) -> dict:
        adjusted = None
        if horizon_h is not None:
            fc = fs.forecasts_at_min_horizon(self.data.forecasts, horizon_h, self.window_start, self.window_end)
            joined = metrics.join_actuals(fc, self.data.actuals)
            selection = {"mode": "horizon", "horizon_h": horizon_h}
        else:
            gate_time = gate_time or GATE_CLOSURE_PRESETS["epex"][1]
            joined = self.day_ahead_errors(gate_time)
            adj = self.adjusted_errors(gate_time)
            adjusted = metrics.summarise(adj["error"], adj["actual"])
            selection = {"mode": "gate", "gate_time": gate_time.strftime("%H:%M")}

        local = joined["start_time"].dt.tz_convert(UK_TZ)
        summary = metrics.summarise(joined["error"], joined["actual"])
        return {
            "selection": selection,
            "summary": summary.to_dict() if summary else None,
            "adjusted_summary": adjusted.to_dict() if adjusted else None,
            "by_day": metrics.grouped_errors(joined, local.dt.strftime("%Y-%m-%d")),
            "by_hour": metrics.grouped_errors(joined, local.dt.hour),
            "histogram": metrics.error_histogram(joined["error"]),
            "scatter": joined[["forecast", "actual"]].round(0).to_dict(orient="records"),
        }

    @cache
    def horizon_curve(self) -> dict:
        """How accuracy degrades with lead time, across every vintage in the window."""
        df = self.horizon_errors()
        bucket = np.floor(df["horizon_h"]).astype(int)
        g = df.groupby(bucket)["error"]
        curve = pd.DataFrame(
            {
                "mae": g.apply(lambda s: s.abs().mean()),
                "p10": g.quantile(0.1),
                "p90": g.quantile(0.9),
                "n": g.size(),
            }
        ).round(1)
        curve.index.name = "horizon_h"

        gates = []
        for key, (label, t) in GATE_CLOSURE_PRESETS.items():
            raw, adj = self.day_ahead_errors(t), self.adjusted_errors(t)
            s = metrics.summarise(raw["error"], raw["actual"])
            a = metrics.summarise(adj["error"], adj["actual"])
            gates.append(
                {
                    "id": key,
                    "label": label,
                    "time": t.strftime("%H:%M"),
                    "mae": s.mae,
                    "rmse": s.rmse,
                    "bias": s.bias,
                    "adjusted_mae": a.mae,
                }
            )

        return {"curve": curve.reset_index().to_dict(orient="records"), "gates": gates}
