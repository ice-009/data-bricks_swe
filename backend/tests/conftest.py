"""Synthetic, fully deterministic data so tests never hit Elexon."""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd
import pytest

from app.repository import DataWindow, WindData

RUN_HOURS_UTC = (7.5, 9.5, 15.5)  # three runs a day, like a slimmed-down WINDFOR


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def make_wind_data(start: date = date(2026, 1, 2), days: int = 10, over_forecast: float = 1000.0) -> WindData:
    """Actuals are a constant 10 GW; every forecast is 10 GW + over_forecast.

    Later runs are slightly better (error shrinks by 100 MW per run of the day),
    which lets tests prove *which* run was selected.
    """
    window = DataWindow(start, start + timedelta(days=days - 1))
    t0 = pd.Timestamp(start - timedelta(days=1), tz="UTC")
    t1 = pd.Timestamp(window.delivery_end + timedelta(days=1), tz="UTC")

    actuals = pd.DataFrame({"start_time": pd.date_range(t0, t1, freq="30min", inclusive="left")})
    actuals["generation"] = 10_000.0

    rows = []
    for d in pd.date_range(t0 - pd.Timedelta(days=2), t1, freq="D", inclusive="left"):
        for i, h in enumerate(RUN_HOURS_UTC):
            publish = d + pd.Timedelta(hours=h)
            for target in pd.date_range(publish.ceil("h"), publish + pd.Timedelta(hours=48), freq="h"):
                rows.append((publish, target, 10_000.0 + over_forecast - 100 * i))
    forecasts = pd.DataFrame(rows, columns=["publish_time", "start_time", "generation"])
    return WindData(actuals=actuals, forecasts=forecasts, window=window)


@pytest.fixture
def wind_data() -> WindData:
    return make_wind_data()
