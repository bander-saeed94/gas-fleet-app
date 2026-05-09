from __future__ import annotations

import random

from app.solver.classical import solve_cvrp_classical
from app.solver.types import CVRPInstance


def test_classical_on_fixed_seed_is_feasible_and_uses_each_customer_once():
    rng = random.Random(42)
    stations = [
        {"id": i, "x": rng.uniform(-10, 10), "y": rng.uniform(-10, 10), "demand": rng.uniform(1, 4)}
        for i in range(1, 9)
    ]
    inst = CVRPInstance(num_trucks=3, truck_capacity=12.0, depot=(0.0, 0.0), stations=stations)
    sol = solve_cvrp_classical(inst)

    visited = []
    for r in sol.routes:
        # routes start and end at depot
        assert r.sequence[0] == 0 and r.sequence[-1] == 0
        assert r.load <= inst.truck_capacity + 1e-9
        visited.extend(c for c in r.sequence if c != 0)
    assert sorted(visited) == list(range(1, 9))
    assert sol.feasible
    assert sol.total_distance > 0


def test_classical_refuses_overload_when_demand_exceeds_fleet():
    """Sanity: build an instance the solver cannot satisfy and confirm
    feasibility flag flips. (Backend API rejects this earlier; here we
    verify the solver's own check, not the API.)"""
    inst = CVRPInstance(
        num_trucks=1,
        truck_capacity=5.0,
        depot=(0.0, 0.0),
        stations=[
            {"id": 1, "x": 1.0, "y": 0.0, "demand": 4.0},
            {"id": 2, "x": 0.0, "y": 1.0, "demand": 4.0},
        ],
    )
    sol = solve_cvrp_classical(inst)
    assert not sol.feasible
