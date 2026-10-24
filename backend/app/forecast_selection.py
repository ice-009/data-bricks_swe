"""Pure functions that answer "which forecast would the trader have seen?".

All inputs/outputs are pandas DataFrames with tz-aware UTC timestamps:
  forecasts: publish_time, start_time, generation
The key rule throughout: a forecast is only usable if publish_time <= the
moment the decision is made. Using anything later would be look-ahead bias.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pandas as pd

from .config import UK_TZ


def gate_closure_utc(delivery_date: date, gate_time: time) -> pd.Timestamp:
    """Decision moment for a delivery day: gate_time UK local on the day before."""
    local = datetime.combine(delivery_date - timedelta(days=1), gate_time, tzinfo=UK_TZ)
    return pd.Timestamp(local).tz_convert("UTC")


def delivery_day_bounds(delivery_date: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of a UK delivery day in UTC (handles 23/25h clock-change days)."""
    start = datetime.combine(delivery_date, time(0), tzinfo=UK_TZ)
    end = datetime.combine(delivery_date + timedelta(days=1), time(0), tzinfo=UK_TZ)
    return pd.Timestamp(start).tz_convert("UTC"), pd.Timestamp(end).tz_convert("UTC")


def with_horizon(forecasts: pd.DataFrame) -> pd.DataFrame:
    """Add horizon_h = hours between publication and target time."""
    out = forecasts.copy()
    out["horizon_h"] = (out["start_time"] - out["publish_time"]).dt.total_seconds() / 3600
    return out


def latest_forecast_before(
    forecasts: pd.DataFrame, cutoff: pd.Timestamp, start: pd.Timestamp, end: pd.Timestamp
) -> pd.DataFrame:
    """Latest forecast per target time in [start, end) published at or before cutoff.

    Chosen per target (not per run) so a run that doesn't cover every hour
    can't leave gaps when an older run does cover them.
    """
    mask = (forecasts["publish_time"] <= cutoff) & (forecasts["start_time"] >= start) & (forecasts["start_time"] < end)
    candidates = forecasts.loc[mask]
    if candidates.empty:
        return with_horizon(candidates)
    latest = candidates.loc[candidates.groupby("start_time")["publish_time"].idxmax()]
    return with_horizon(latest).sort_values("start_time").reset_index(drop=True)


def day_ahead_forecasts(forecasts: pd.DataFrame, delivery_dates: list[date], gate_time: time) -> pd.DataFrame:
    """The forecast available at gate closure, for every delivery day."""
    frames = []
    for d in delivery_dates:
        start, end = delivery_day_bounds(d)
        df = latest_forecast_before(forecasts, gate_closure_utc(d, gate_time), start, end)
        frames.append(df.assign(delivery_date=d))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def forecasts_at_min_horizon(
    forecasts: pd.DataFrame, horizon_h: float, start: pd.Timestamp, end: pd.Timestamp
) -> pd.DataFrame:
    """Latest forecast per target time published at least horizon_h hours before it."""
    df = with_horizon(forecasts)
    df = df[(df["horizon_h"] >= horizon_h) & (df["start_time"] >= start) & (df["start_time"] < end)]
    if df.empty:
        return df
    latest = df.loc[df.groupby("start_time")["publish_time"].idxmax()]
    return latest.sort_values("start_time").reset_index(drop=True)


def runs_for_window(
    forecasts: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp, published_after: pd.Timestamp
) -> pd.DataFrame:
    """Every forecast run (vintage) targeting [start, end) published after a given time."""
    mask = (
        (forecasts["start_time"] >= start)
        & (forecasts["start_time"] < end)
        & (forecasts["publish_time"] >= published_after)
        & (forecasts["publish_time"] < end)
    )
    return forecasts.loc[mask].sort_values(["publish_time", "start_time"]).reset_index(drop=True)
