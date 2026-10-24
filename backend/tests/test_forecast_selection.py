from datetime import date, time

import pandas as pd

from app import forecast_selection as fs

from .conftest import ts


def test_gate_closure_is_uk_local_on_previous_day():
    # January: GMT == UTC
    assert fs.gate_closure_utc(date(2026, 1, 15), time(9, 20)) == ts("2026-01-14T09:20")
    # July: BST == UTC+1, so 09:20 local is 08:20 UTC
    assert fs.gate_closure_utc(date(2026, 7, 1), time(9, 20)) == ts("2026-06-30T08:20")


def test_delivery_day_handles_clock_change():
    start, end = fs.delivery_day_bounds(date(2026, 3, 29))  # clocks go forward
    assert end - start == pd.Timedelta(hours=23)


def _forecasts(rows):
    return pd.DataFrame([(ts(p), ts(s), g) for p, s, g in rows], columns=["publish_time", "start_time", "generation"])


def test_latest_forecast_ignores_runs_published_after_cutoff():
    fc = _forecasts(
        [
            ("2026-01-14T07:30", "2026-01-15T00:00", 100),
            ("2026-01-14T09:30", "2026-01-15T00:00", 200),  # after 09:20 gate
        ]
    )
    start, end = fs.delivery_day_bounds(date(2026, 1, 15))
    got = fs.latest_forecast_before(fc, ts("2026-01-14T09:20"), start, end)
    assert got["generation"].tolist() == [100]
    assert got["horizon_h"].tolist() == [16.5]


def test_latest_forecast_is_chosen_per_target_time():
    # The newer run does not cover 01:00, so the older run must fill that hour.
    fc = _forecasts(
        [
            ("2026-01-14T02:30", "2026-01-15T00:00", 1),
            ("2026-01-14T02:30", "2026-01-15T01:00", 2),
            ("2026-01-14T07:30", "2026-01-15T00:00", 3),
        ]
    )
    start, end = fs.delivery_day_bounds(date(2026, 1, 15))
    got = fs.latest_forecast_before(fc, ts("2026-01-14T09:20"), start, end)
    assert got["generation"].tolist() == [3, 2]


def test_cutoff_is_inclusive():
    fc = _forecasts([("2026-01-14T09:20", "2026-01-15T00:00", 5)])
    start, end = fs.delivery_day_bounds(date(2026, 1, 15))
    assert len(fs.latest_forecast_before(fc, ts("2026-01-14T09:20"), start, end)) == 1


def test_min_horizon_selects_latest_old_enough_forecast():
    fc = _forecasts(
        [
            ("2026-01-14T00:00", "2026-01-15T00:00", 1),  # 24h ahead
            ("2026-01-14T12:00", "2026-01-15T00:00", 2),  # 12h ahead
            ("2026-01-14T22:00", "2026-01-15T00:00", 3),  # 2h ahead
        ]
    )
    start, end = ts("2026-01-15"), ts("2026-01-16")
    assert fs.forecasts_at_min_horizon(fc, 4, start, end)["generation"].tolist() == [2]
    assert fs.forecasts_at_min_horizon(fc, 0, start, end)["generation"].tolist() == [3]
    assert fs.forecasts_at_min_horizon(fc, 30, start, end).empty


def test_day_ahead_forecasts_covers_every_hour(wind_data):
    days = [date(2026, 1, 3), date(2026, 1, 4)]
    got = fs.day_ahead_forecasts(wind_data.forecasts, days, time(9, 20))
    assert len(got) == 48
    # 07:30 run is the latest before 09:20 (index 0 => 1000 MW over-forecast)
    assert set(got["generation"]) == {11_000.0}
