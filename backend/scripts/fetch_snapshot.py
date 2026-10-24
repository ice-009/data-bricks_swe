"""Refresh the bundled data snapshot from Elexon.

Usage (from backend/):  python -m scripts.fetch_snapshot
"""

import logging

from app.config import settings
from app.repository import fetch_snapshot

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    fetch_snapshot(settings, settings.snapshot_dir)
