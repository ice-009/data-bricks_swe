"""Vercel serverless entrypoint: exposes the same FastAPI app under /api/*.

The React build is served by Vercel's static hosting (see vercel.json).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
