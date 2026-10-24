"""HTTP layer: parameter parsing/validation only; all logic lives in analysis.py."""

from __future__ import annotations

from datetime import date, datetime, time
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from . import schemas
from .analysis import WindAnalytics
from .config import DEFAULT_GATE, GATE_CLOSURE_PRESETS, settings
from .repository import get_wind_data

router = APIRouter(prefix="/api")


@lru_cache(maxsize=1)
def get_analytics() -> WindAnalytics:
    return WindAnalytics(get_wind_data())


Analytics = Annotated[WindAnalytics, Depends(get_analytics)]
GateParam = Annotated[
    str,
    Query(description="Gate closure, UK local time on D-1 (HH:MM) or a preset id", examples=["09:20", "n2ex"]),
]


def parse_gate(value: str) -> time:
    if value in GATE_CLOSURE_PRESETS:
        return GATE_CLOSURE_PRESETS[value][1]
    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError as exc:
        raise HTTPException(422, f"gate must be HH:MM or one of {list(GATE_CLOSURE_PRESETS)}") from exc


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta", response_model=schemas.Meta)
def meta(analytics: Analytics) -> dict:
    return analytics.meta()


@router.get("/day-ahead", response_model=schemas.DayAhead, response_model_by_alias=True)
def day_ahead(analytics: Analytics, delivery_date: date, gate: GateParam = DEFAULT_GATE) -> dict:
    window = analytics.data.window
    if not window.delivery_start <= delivery_date <= window.delivery_end:
        raise HTTPException(
            422,
            f"delivery_date must be between {window.delivery_start} and {window.delivery_end} "
            f"(decisions made {settings.decision_start} .. {settings.decision_end})",
        )
    return analytics.day_ahead(delivery_date, parse_gate(gate))


@router.get("/accuracy", response_model=schemas.Accuracy, response_model_by_alias=True)
def accuracy(
    analytics: Analytics,
    gate: GateParam = DEFAULT_GATE,
    horizon_h: Annotated[
        float | None,
        Query(
            ge=0,
            le=settings.max_horizon_hours,
            description="If set, use the latest forecast at least this many hours old instead of the gate rule",
        ),
    ] = None,
) -> dict:
    if horizon_h is not None:
        return analytics.accuracy(horizon_h=horizon_h)
    return analytics.accuracy(gate_time=parse_gate(gate))


@router.get("/horizon-curve", response_model=schemas.HorizonCurve)
def horizon_curve(analytics: Analytics) -> dict:
    return analytics.horizon_curve()
