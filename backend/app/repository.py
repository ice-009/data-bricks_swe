"""Loads wind actuals/forecasts once and keeps them in memory.

Data for January 2026 is historical and immutable, so we ship a gzipped CSV
snapshot with the app (fast cold starts, no runtime dependency on Elexon).
If the snapshot is missing we fall back to fetching it live and writing it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from pathlib import Path

import pandas as pd

from .config import Settings, settings
from .elexon import ElexonClient

logger = logging.getLogger(__name__)

ACTUALS_FILE = "wind_actuals.csv.gz"
FORECASTS_FILE = "wind_forecasts.csv.gz"


@dataclass(frozen=True)
class DataWindow:
    delivery_start: date
    delivery_end: date  # inclusive

    @classmethod
    def from_settings(cls, cfg: Settings) -> DataWindow:
        # A decision on day D buys power for delivery on D+1.
        return cls(cfg.decision_start + timedelta(days=1), cfg.decision_end + timedelta(days=1))

    @property
    def forecast_publish_from(self) -> datetime:
        # Early enough to cover a 48h horizon (plus older runs) for the first delivery day.
        return datetime.combine(self.delivery_start - timedelta(days=3), time(0), tzinfo=UTC)

    @property
    def forecast_publish_to(self) -> datetime:
        return datetime.combine(self.delivery_end + timedelta(days=1), time(0), tzinfo=UTC)


@dataclass(frozen=True)
class WindData:
    actuals: pd.DataFrame  # start_time (UTC), generation (MW), half-hourly
    forecasts: pd.DataFrame  # publish_time, start_time (UTC), generation (MW), hourly
    window: DataWindow


def fetch_snapshot(cfg: Settings, out_dir: Path) -> None:
    window = DataWindow.from_settings(cfg)
    out_dir.mkdir(parents=True, exist_ok=True)
    with ElexonClient(cfg.elexon_base_url) as client:
        actuals = client.fetch_wind_actuals(window.delivery_start - timedelta(days=1), window.delivery_end)
        forecasts = client.fetch_wind_forecasts(window.forecast_publish_from, window.forecast_publish_to)
    actuals.to_csv(out_dir / ACTUALS_FILE, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    forecasts.to_csv(out_dir / FORECASTS_FILE, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    logger.info("Snapshot written: %d actuals, %d forecast rows", len(actuals), len(forecasts))


def load_wind_data(cfg: Settings = settings) -> WindData:
    snapshot = cfg.snapshot_dir
    if not (snapshot / ACTUALS_FILE).exists() or not (snapshot / FORECASTS_FILE).exists():
        if not cfg.allow_live_fetch:
            raise FileNotFoundError(f"No snapshot in {snapshot} and live fetch is disabled")
        logger.info("Snapshot missing, fetching from Elexon")
        fetch_snapshot(cfg, snapshot)

    actuals = pd.read_csv(snapshot / ACTUALS_FILE, parse_dates=["start_time"])
    forecasts = pd.read_csv(snapshot / FORECASTS_FILE, parse_dates=["publish_time", "start_time"])
    return WindData(actuals=actuals, forecasts=forecasts, window=DataWindow.from_settings(cfg))


@lru_cache(maxsize=1)
def get_wind_data() -> WindData:
    """FastAPI dependency: load once per process."""
    return load_wind_data()
