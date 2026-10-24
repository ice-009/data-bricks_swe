from datetime import date, time, timedelta

import pandas as pd
import pytest

from app.analysis import WindAnalytics

from .conftest import make_wind_data

GATE = time(9, 20)


@pytest.fixture
def analytics(wind_data):
    return WindAnalytics(wind_data)


def test_day_ahead_uses_last_run_before_gate(analytics):
    out = analytics.day_ahead(date(2026, 1, 5), GATE)
    assert out["gate_closure"] == "2026-01-04T09:20:00Z"
    assert out["forecast_published"] == "2026-01-04T07:30:00Z"
    assert out["next_run_after_gate"] == "2026-01-04T09:30:00Z"
    assert len(out["points"]) == 24
    assert out["summary"]["bias"] == 1000.0


def test_later_gate_picks_newer_run(analytics):
    out = analytics.day_ahead(date(2026, 1, 5), time(9, 50))
    assert out["forecast_published"] == "2026-01-04T09:30:00Z"
    assert out["summary"]["bias"] == 900.0


def test_energy_totals(analytics):
    e = analytics.day_ahead(date(2026, 1, 5), GATE)["energy_mwh"]
    assert e["forecast"] == 24 * 11_000
    assert e["actual"] == 24 * 10_000  # 48 half-hours x 0.5h
    assert e["shortfall_vs_forecast"] == 24 * 1_000


def test_trailing_bias_has_no_look_ahead():
    data = make_wind_data(days=10)
    # Corrupt the actuals of one delivery day; only days >= 2 days later may react.
    poisoned = date(2026, 1, 6)
    start = pd.Timestamp(poisoned, tz="UTC")
    mask = (data.actuals["start_time"] >= start) & (data.actuals["start_time"] < start + pd.Timedelta(days=1))
    data.actuals.loc[mask, "generation"] = 0.0
    bias = WindAnalytics(data).trailing_bias(GATE)

    assert bias[date(2026, 1, 2)] == 0.0  # no history yet
    assert bias[date(2026, 1, 7)] == 1000.0  # D-2 = 5th, poisoned day not yet settled at gate
    assert bias[poisoned + timedelta(days=2)] > 1000.0


def test_bias_adjustment_removes_constant_bias(analytics):
    out = analytics.accuracy(gate_time=GATE)
    assert out["summary"]["bias"] == 1000.0
    # First two days have no history, the rest are fully corrected.
    assert out["adjusted_summary"]["bias"] == pytest.approx(1000.0 * 2 / 10, abs=0.1)


def test_accuracy_horizon_mode(analytics):
    out = analytics.accuracy(horizon_h=12)
    assert out["selection"] == {"mode": "horizon", "horizon_h": 12}
    assert out["summary"]["n"] == 10 * 24
    assert out["adjusted_summary"] is None
    assert len(out["by_hour"]) == 24


def test_horizon_curve(analytics):
    out = analytics.horizon_curve()
    assert {g["id"] for g in out["gates"]} == {"epex", "n2ex"}
    assert out["curve"][0]["horizon_h"] == 0
