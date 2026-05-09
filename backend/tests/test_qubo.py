from __future__ import annotations

import numpy as np

from app.solver.qubo import cvrp_to_qubo, decode_assignment
from app.solver.types import CVRPInstance


def _instance(stations, num_trucks=2, capacity=10.0):
    return CVRPInstance(
        num_trucks=num_trucks,
        truck_capacity=capacity,
        depot=(0.0, 0.0),
        stations=stations,
    )


def test_qubo_shape_matches_n_times_m():
    inst = _instance(
        [
            {"id": 1, "x": 1.0, "y": 0.0, "demand": 3.0},
            {"id": 2, "x": 0.0, "y": 1.0, "demand": 4.0},
            {"id": 3, "x": -1.0, "y": 0.0, "demand": 2.0},
        ],
        num_trucks=2,
    )
    Q, var = cvrp_to_qubo(inst)
    assert Q.shape == (6, 6)
    assert len(var) == 6
    assert np.allclose(Q, Q.T), "QUBO must be symmetric"


def test_qubo_assignment_penalty_minimum_at_one_truck_per_customer():
    """For a tiny instance with no capacity pressure, the lowest-energy bitstring
    among one-hot-per-customer assignments should match the cost-proxy ranking."""
    inst = _instance(
        [
            {"id": 1, "x": 5.0, "y": 0.0, "demand": 1.0},
            {"id": 2, "x": -5.0, "y": 0.0, "demand": 1.0},
        ],
        num_trucks=2,
        capacity=100.0,
    )
    Q, var = cvrp_to_qubo(inst, a_assign=100.0, b_capacity=0.0)
    n_vars = Q.shape[0]
    best_e = float("inf")
    best_x = None
    for mask in range(1 << n_vars):
        x = np.array([(mask >> b) & 1 for b in range(n_vars)], dtype=float)
        e = float(x @ Q @ x)
        if e < best_e:
            best_e, best_x = e, x
    # Each customer has exactly one truck assigned.
    for i in (1, 2):
        assigned = sum(int(best_x[var[(i, k)]]) for k in range(2))
        assert assigned == 1


def test_decode_assignment_handles_double_and_zero():
    var = {(1, 0): 0, (1, 1): 1, (2, 0): 2, (2, 1): 3}
    # customer 1 has zero assignments, customer 2 has both
    bits = [0, 0, 1, 1]
    out = decode_assignment(bits, var, n_customers=2, n_trucks=2)
    flat = [c for sub in out for c in sub]
    assert sorted(flat) == [1, 2]
