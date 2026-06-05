# Gasoline Fleet Routing & Visualization App

A standalone web app that solves a daily **Capacitated Vehicle Routing Problem
(CVRP)** for a fleet of gasoline trucks and visualizes the resulting routes
interactively. The QAOA implementation in [`qaoa-repo`](https://github.com/bander-saeed94/distributed-QAOA.git) is
consumed as an installable library; **nothing in `qaoa-repo` is modified**.

## Architecture

```
frontend (React + Vite + Tailwind, :5173)
        │  REST  /api/*
        ▼
backend  (FastAPI, :8000)
        │  imports qaoa_common.* / nd_qaoa.*
        ▼
qaoa-repo (UNCHANGED, mounted read-only)
```

- `backend/app/solver/classical.py` — Clarke-Wright savings + 2-opt polish.
- `backend/app/solver/qubo.py` — CVRP → QUBO encoding (assignment-only).
- `backend/app/solver/qaoa_adapter.py` — wraps `qaoa-repo`; falls back
  classically if the QAOA stack is unavailable.
- `frontend/src/components/XYCanvas.tsx` — click-to-add stations, drag,
  zoom/pan, animated truck icons.

## Quick start (Docker)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:8000/api/health

`docker-compose.yml` mounts `../qaoa-repo` into the backend container at
`/opt/qaoa-repo` **read-only**. On startup the backend runs
`pip install --no-deps -e /opt/qaoa-repo`, which puts the unmodified package
on the import path without writing to it.

## Local dev

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
# To enable real QAOA solves, also install qaoa-repo:
pip install -e ../../qaoa-repo
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api/*` to `http://localhost:8000`.

## Tests

```bash
# backend
cd backend && PYTHONPATH=. pytest -q

# frontend
cd frontend && npm test
```

Backend covers: QUBO encoding, capacity validation, classical solver on a
fixed seed, and an end-to-end API test with a mocked QAOA backend.
Frontend covers: `XYCanvas` click-to-add behavior.

## How QAOA is used as a library

`backend/app/solver/qaoa_adapter.py` defers all `qaoa-repo` imports until a
QAOA solve is actually requested. The adapter:

1. Builds a QUBO matrix `Q` from the CVRP instance via the assignment-only
   encoding (one binary `x_{i,k}` per (customer, truck) pair).
2. Calls into `qaoa_common` / `nd_qaoa` to run QAOA on `Q`, getting a
   bitstring back.
3. Decodes the bitstring into per-truck customer sets, then orders each
   truck's customers via nearest-neighbor + 2-opt (the same classical
   post-processing `qaoa-repo` itself uses for VRP).

If the QAOA stack is not importable, or the solve raises, the adapter
silently falls back to the pure-classical solver and tags the response
with `meta.qaoa_fallback` so the UI can surface what happened.

## API

| Method | Path                     | Notes                                  |
| ------ | ------------------------ | -------------------------------------- |
| POST   | `/api/solve`             | Submit CVRP instance, get routes back. |
| GET    | `/api/days`              | List past day records.                 |
| GET    | `/api/days/{id}`         | Full day record incl. routes.          |
| DELETE | `/api/days/{id}`         | Remove a day.                          |
| GET    | `/api/health`            | Liveness probe.                        |

## Non-goals (v1)

- Heterogeneous truck capacities in the UI (data model already supports them).
- Real road networks / map tiles.
- Time windows, driver shifts.
- Authentication / multi-user.
