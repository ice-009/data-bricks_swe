.PHONY: install dev-api dev-web test lint format snapshot docker

install:            ## Install backend (venv) and frontend deps
	cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
	cd frontend && npm ci

dev-api:            ## FastAPI with reload on :8000
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-web:            ## Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

test:               ## All tests
	cd backend && .venv/bin/pytest -q
	cd frontend && npm test

lint:               ## Lint + type-check
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
	cd frontend && npm run typecheck

format:
	cd backend && .venv/bin/ruff format . && .venv/bin/ruff check --fix .

snapshot:           ## Re-download January 2026 data from Elexon
	cd backend && .venv/bin/python -m scripts.fetch_snapshot

docker:             ## Build and run the production image on :8000
	docker compose up --build
