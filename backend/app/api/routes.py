from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Day, Route, Station
from app.schemas import (
    DayDetail,
    DaySummary,
    RouteOut,
    SolveRequest,
    SolveResponse,
    StationOut,
)
from app.solver.classical import solve_cvrp_classical
from app.solver.qaoa_adapter import solve_cvrp_qaoa
from app.solver.types import CVRPInstance, CVRPSolution

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"ok": True}


def _validate(req: SolveRequest) -> None:
    if any(s.demand > req.truck_capacity for s in req.stations):
        raise HTTPException(400, "a station's demand exceeds truck_capacity")
    if sum(s.demand for s in req.stations) > req.num_trucks * req.truck_capacity:
        raise HTTPException(400, "total demand exceeds fleet capacity")


def _instance_from(req: SolveRequest) -> CVRPInstance:
    return CVRPInstance(
        num_trucks=req.num_trucks,
        truck_capacity=req.truck_capacity,
        depot=tuple(req.depot),
        stations=[
            {"id": s.id, "x": s.x, "y": s.y, "demand": s.demand} for s in req.stations
        ],
    )


def _solution_to_response(
    req: SolveRequest, solution: CVRPSolution, day_id: str, solve_time_ms: int
) -> SolveResponse:
    routes_out: list[RouteOut] = []
    coords = [tuple(req.depot)] + [(s.x, s.y) for s in req.stations]
    demands = [0.0] + [s.demand for s in req.stations]
    ids = [None] + [s.id for s in req.stations]
    for r in solution.routes:
        seq: list[StationOut] = []
        for node in r.sequence:
            seq.append(
                StationOut(
                    x=coords[node][0],
                    y=coords[node][1],
                    demand=demands[node] if node != 0 else None,
                    id=ids[node],
                )
            )
        routes_out.append(
            RouteOut(truck_id=r.truck_id, load=r.load, distance=r.distance, sequence=seq)
        )
    return SolveResponse(
        day_id=day_id,
        solver=req.solver,
        solve_time_ms=solve_time_ms,
        total_distance=solution.total_distance,
        routes=routes_out,
        feasible=solution.feasible,
        meta=dict(solution.meta),
    )


@router.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest, session: Session = Depends(get_session)) -> SolveResponse:
    _validate(req)
    instance = _instance_from(req)

    t0 = time.perf_counter()
    if req.solver == "qaoa":
        solution = solve_cvrp_qaoa(
            instance,
            p=req.qaoa_params.p,
            shots=req.qaoa_params.shots,
            optimizer=req.qaoa_params.optimizer,
            reupload=req.qaoa_params.reupload,
            observable_mode=req.qaoa_params.observable_mode,
            normalize_weights=req.qaoa_params.normalize_weights,
            adam_lr=req.qaoa_params.adam_lr,
            adam_epochs=req.qaoa_params.adam_epochs,
            adam_pshift_step=req.qaoa_params.adam_pshift_step,
        )
    else:
        solution = solve_cvrp_classical(instance)
    solve_time_ms = int((time.perf_counter() - t0) * 1000)

    day_id = f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}-{uuid.uuid4().hex[:6]}"
    response = _solution_to_response(req, solution, day_id, solve_time_ms)
    _persist(session, day_id, req, response)
    return response


def _persist(session: Session, day_id: str, req: SolveRequest, resp: SolveResponse) -> None:
    day = Day(
        id=day_id,
        num_trucks=req.num_trucks,
        truck_capacity=req.truck_capacity,
        solver=req.solver,
        total_distance=resp.total_distance,
        solve_time_ms=resp.solve_time_ms,
        raw_request_json=req.model_dump_json(),
        raw_response_json=resp.model_dump_json(),
    )
    session.add(day)
    for s in req.stations:
        session.add(Station(day_id=day_id, x=s.x, y=s.y, demand=s.demand))
    for r in resp.routes:
        session.add(
            Route(
                day_id=day_id,
                truck_id=r.truck_id,
                load=r.load,
                distance=r.distance,
                sequence_json=json.dumps([s.model_dump() for s in r.sequence]),
            )
        )
    session.commit()


@router.get("/days", response_model=list[DaySummary])
def list_days(session: Session = Depends(get_session)) -> list[DaySummary]:
    rows = session.execute(select(Day).order_by(Day.created_at.desc())).scalars().all()
    return [
        DaySummary(
            id=d.id,
            created_at=d.created_at,
            num_trucks=d.num_trucks,
            truck_capacity=d.truck_capacity,
            solver=d.solver,
            total_distance=d.total_distance,
            solve_time_ms=d.solve_time_ms,
        )
        for d in rows
    ]


@router.get("/days/{day_id}", response_model=DayDetail)
def get_day(day_id: str, session: Session = Depends(get_session)) -> DayDetail:
    day = session.get(Day, day_id)
    if day is None:
        raise HTTPException(404, "day not found")
    return DayDetail(
        id=day.id,
        created_at=day.created_at,
        num_trucks=day.num_trucks,
        truck_capacity=day.truck_capacity,
        solver=day.solver,
        total_distance=day.total_distance,
        solve_time_ms=day.solve_time_ms,
        request=SolveRequest.model_validate_json(day.raw_request_json),
        response=SolveResponse.model_validate_json(day.raw_response_json),
    )


@router.delete("/days/{day_id}")
def delete_day(day_id: str, session: Session = Depends(get_session)) -> dict:
    day = session.get(Day, day_id)
    if day is None:
        raise HTTPException(404, "day not found")
    session.delete(day)
    session.commit()
    return {"deleted": day_id}
