"""FastAPI entrypoint.

In production (Docker / Heroku) the same process also serves the built React
app from STATIC_DIR, so the whole product ships as one container on one origin.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import get_analytics, router
from .config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the data + caches at startup so the first user request is fast.
    get_analytics().horizon_curve()
    yield


app = FastAPI(title="Wind Forecast Desk API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET"], allow_headers=["*"]
)
app.include_router(router)

static_dir = Path(os.getenv("STATIC_DIR", ""))
if os.getenv("STATIC_DIR") and static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = static_dir / path
        return FileResponse(file if path and file.is_file() else static_dir / "index.html")
