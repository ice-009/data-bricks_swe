"""Application settings and domain constants.

Everything that a reviewer might want to tweak (data window, gate closure presets,
Elexon base URL) lives here so the rest of the code stays free of magic values.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SNAPSHOT_DIR = BACKEND_DIR / "data"

# GB day-ahead auction gate closures (UK local time, on the day before delivery).
# EPEX SPOT GB 60-min auction closes 09:20, Nord Pool N2EX closes 09:50.
GATE_CLOSURE_PRESETS: dict[str, tuple[str, time]] = {
    "epex": ("EPEX SPOT GB day-ahead auction", time(9, 20)),
    "n2ex": ("Nord Pool N2EX day-ahead auction", time(9, 50)),
}
DEFAULT_GATE = "epex"


@dataclass(frozen=True)
class Settings:
    # Purchase decisions made in January 2026 => deliveries 2 Jan .. 1 Feb.
    decision_start: date = date(2026, 1, 1)
    decision_end: date = date(2026, 1, 31)

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    snapshot_dir: Path = field(default_factory=lambda: Path(os.getenv("SNAPSHOT_DIR", DEFAULT_SNAPSHOT_DIR)))
    # When the snapshot is missing, fetch from Elexon on startup instead of failing.
    allow_live_fetch: bool = os.getenv("ALLOW_LIVE_FETCH", "true").lower() == "true"
    # Longest forecast lead time we analyse (WINDFOR runs extend roughly 2.5 days ahead).
    max_horizon_hours: int = 48
    # Trailing window (days) for the bias-adjusted forecast.
    bias_window_days: int = 7
    cors_origins: tuple[str, ...] = tuple(
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    )


settings = Settings()
