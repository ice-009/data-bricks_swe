import math

import pandas as pd
import pytest

from app import metrics

from .conftest import ts


def test_error_sign_is_forecast_minus_actual():
    fc = pd.DataFrame({"start_time": [ts("2026-01-15T00:00")], "generation": [12_000.0]})
    act = pd.DataFrame(
        {"start_time": [ts("2026-01-15T00:00"), ts("2026-01-15T00:30")], "generation": [10_000.0, 9_000.0]}
    )
    joined = metrics.join_actuals(fc, act)
    assert joined["error"].tolist() == [2_000.0]  # over-forecast => positive, buyer is short


def test_summary_values():
    errors = pd.Series([100.0, -100.0, 300.0, -300.0])
    s = metrics.summarise(errors, pd.Series([1000.0] * 4))
    assert s.mae == 200.0
    assert s.bias == 0.0
    assert s.rmse == pytest.approx(math.sqrt((100**2 + 300**2) / 2), abs=0.1)
    assert s.nmae_pct == 20.0
    assert (s.max_over, s.max_under) == (300.0, -300.0)


def test_summary_of_nothing_is_none():
    assert metrics.summarise(pd.Series(dtype=float), pd.Series(dtype=float)) is None


def test_histogram_counts_every_error():
    errors = pd.Series([-1200.0, -10.0, 0.0, 499.0, 501.0, 2600.0])
    bins = metrics.error_histogram(errors, bin_width=500)
    assert sum(b["count"] for b in bins) == len(errors)
    assert all(b["to"] - b["from"] == 500 for b in bins)


def test_grouped_errors():
    df = pd.DataFrame({"error": [100.0, -300.0, 50.0], "g": ["a", "a", "b"]})
    out = {r["key"]: r for r in metrics.grouped_errors(df, "g")}
    assert out["a"]["mae"] == 200.0 and out["a"]["bias"] == -100.0 and out["a"]["n"] == 2
