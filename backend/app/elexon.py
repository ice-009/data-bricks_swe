"""Thin client for the Elexon BMRS Insights API (FUELHH + WINDFOR streams)."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

# The stream endpoints are happy with large windows, but chunking keeps each
# response small and makes a transient failure cheap to retry.
CHUNK_DAYS = 7


class ElexonClient:
    def __init__(self, base_url: str, timeout: float = 30.0, retries: int = 3) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=timeout)
        self._retries = retries

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get(self, path: str, params: dict[str, str]) -> list[dict]:
        url = f"{self._base_url}{path}"
        last_error: Exception | None = None
        for attempt in range(1, self._retries + 1):
            try:
                resp = self._client.get(url, params=params)
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                logger.warning("Elexon request failed (attempt %d/%d): %s", attempt, self._retries, exc)
        raise RuntimeError(f"Elexon request to {path} failed") from last_error

    def fetch_wind_actuals(self, start: date, end: date) -> pd.DataFrame:
        """Half-hourly outturn wind generation (MW) for settlement dates [start, end]."""
        rows: list[dict] = []
        day = start
        while day <= end:
            chunk_end = min(day + timedelta(days=CHUNK_DAYS - 1), end)
            rows += self._get(
                "/datasets/FUELHH/stream",
                {"settlementDateFrom": day.isoformat(), "settlementDateTo": chunk_end.isoformat(), "fuelType": "WIND"},
            )
            day = chunk_end + timedelta(days=1)

        df = pd.DataFrame(rows)
        df = df[df["fuelType"] == "WIND"]
        df = pd.DataFrame(
            {"start_time": pd.to_datetime(df["startTime"], utc=True), "generation": df["generation"].astype(float)}
        )
        # Elexon can republish a period; keep one value per target time.
        return df.drop_duplicates("start_time", keep="last").sort_values("start_time").reset_index(drop=True)

    def fetch_wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> pd.DataFrame:
        """Every WINDFOR forecast run published in [publish_from, publish_to)."""
        rows: list[dict] = []
        cursor = publish_from
        while cursor < publish_to:
            chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), publish_to)
            rows += self._get(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso(cursor), "publishDateTimeTo": _iso(chunk_end)},
            )
            cursor = chunk_end

        df = pd.DataFrame(rows)
        df = pd.DataFrame(
            {
                "publish_time": pd.to_datetime(df["publishTime"], utc=True),
                "start_time": pd.to_datetime(df["startTime"], utc=True),
                "generation": df["generation"].astype(float),
            }
        )
        # Chunk boundaries are inclusive on both ends, so the same run can appear twice.
        df = df[df["publish_time"] < pd.Timestamp(publish_to)]
        return (
            df.drop_duplicates(["publish_time", "start_time"], keep="last")
            .sort_values(["publish_time", "start_time"])
            .reset_index(drop=True)
        )


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
