# One image = React build served by the FastAPI process (single origin, no CORS).

# ---- 1. build the React app ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python runtime ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static \
    ALLOW_LIVE_FETCH=false
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/data ./data
COPY --from=web /web/dist ./static

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\",\"8000\")}/api/health')"
# Heroku injects $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
