import pytest
from fastapi.testclient import TestClient

from app.analysis import WindAnalytics
from app.api import get_analytics
from app.main import app

from .conftest import make_wind_data


@pytest.fixture
def client():
    analytics = WindAnalytics(make_wind_data())
    app.dependency_overrides[get_analytics] = lambda: analytics
    # Not entering the context manager skips the lifespan warm-up (which would load real data).
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta(client):
    body = client.get("/api/meta").json()
    assert body["delivery_start"] == "2026-01-02"
    assert [g["time"] for g in body["gate_presets"]] == ["09:20", "09:50"]


@pytest.mark.parametrize("gate", ["epex", "09:20"])
def test_day_ahead(client, gate):
    r = client.get("/api/day-ahead", params={"delivery_date": "2026-01-05", "gate": gate})
    assert r.status_code == 200
    assert r.json()["forecast_published"] == "2026-01-04T07:30:00Z"


def test_day_ahead_rejects_dates_outside_window(client):
    r = client.get("/api/day-ahead", params={"delivery_date": "2025-12-01"})
    assert r.status_code == 422


def test_bad_gate(client):
    assert client.get("/api/accuracy", params={"gate": "9am"}).status_code == 422


def test_accuracy_and_histogram_alias(client):
    body = client.get("/api/accuracy", params={"horizon_h": 6}).json()
    assert body["selection"]["mode"] == "horizon"
    assert "from" in body["histogram"][0]


def test_horizon_out_of_range(client):
    assert client.get("/api/accuracy", params={"horizon_h": 100}).status_code == 422
