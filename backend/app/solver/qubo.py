"""CVRP -> QUBO encoding (assignment-only).

Variables:
    x[i,k] = 1 iff customer i (1..n) is assigned to truck k (0..m-1).

Hamiltonian:
    H = A * sum_i (sum_k x[i,k] - 1)^2                  # one-truck-per-customer
      + B * sum_k (sum_i d_i x[i,k] - Q)^2_+ (slack)    # capacity
      + sum_k sum_{i<j} x[i,k] x[j,k] * (d(0,i)+d(0,j)+d(i,j))/2  # cost proxy

For the in-route ordering we rely on a classical post-processing step
(nearest-neighbor / 2-opt). This mirrors the assignment-only formulation
used by the qaoa-repo VRP module.
"""
from __future__ import annotations

import numpy as np

from app.solver.distance import distance_matrix
from app.solver.types import CVRPInstance


def cvrp_to_qubo(
    instance: CVRPInstance,
    a_assign: float = 10.0,
    b_capacity: float = 1.0,
) -> tuple[np.ndarray, dict[tuple[int, int], int]]:
    """Return ``(Q, var_index)`` for the CVRP instance.

    ``Q`` is a symmetric numpy matrix where ``x^T Q x`` (with x in {0,1}^N)
    equals the assignment-only Hamiltonian's energy on x. ``var_index`` maps
    ``(customer_index_1based, truck_id)`` -> position in x.
    """
    n = len(instance.stations)
    m = instance.num_trucks
    if n == 0 or m == 0:
        return np.zeros((0, 0)), {}

    var: dict[tuple[int, int], int] = {}
    idx = 0
    for i in range(1, n + 1):
        for k in range(m):
            var[(i, k)] = idx
            idx += 1
    N = idx
    Q = np.zeros((N, N))

    coords = instance.coords()
    dist = distance_matrix(coords)
    demand = instance.demands()

    # 1) Assignment penalty: A * (sum_k x_ik - 1)^2 per customer i.
    for i in range(1, n + 1):
        for k1 in range(m):
            v1 = var[(i, k1)]
            Q[v1, v1] += a_assign * (1 - 2)  # x^2 - 2x  -> diag -1*A
            for k2 in range(k1 + 1, m):
                v2 = var[(i, k2)]
                Q[v1, v2] += 2 * a_assign  # cross terms
                Q[v2, v1] += 0  # keep upper-triangular convention; symmetrize below

    # 2) Cost proxy: bring two customers in same truck closer to depot loop.
    for k in range(m):
        for i in range(1, n + 1):
            for j in range(i + 1, n + 1):
                vi, vj = var[(i, k)], var[(j, k)]
                cost_pair = 0.5 * (dist[0][i] + dist[0][j] + dist[i][j])
                Q[vi, vj] += cost_pair

    # 3) Capacity penalty: B * (sum_i d_i x_ik - C)^2 per truck k.
    C = instance.truck_capacity
    for k in range(m):
        for i in range(1, n + 1):
            vi = var[(i, k)]
            Q[vi, vi] += b_capacity * (demand[i] ** 2 - 2 * demand[i] * C)
            for j in range(i + 1, n + 1):
                vj = var[(j, k)]
                Q[vi, vj] += 2 * b_capacity * demand[i] * demand[j]

    # Symmetrize.
    Q = 0.5 * (Q + Q.T)
    return Q, var


def decode_assignment(
    bitstring: list[int],
    var_index: dict[tuple[int, int], int],
    n_customers: int,
    n_trucks: int,
) -> list[list[int]]:
    """Decode a flat bitstring into a list of per-truck customer lists.

    Customers without exactly one assignment are sent to the truck with the
    minimum current load count (deterministic tiebreak by truck id).
    """
    assigned: list[list[int]] = [[] for _ in range(n_trucks)]
    for i in range(1, n_customers + 1):
        chosen: list[int] = []
        for k in range(n_trucks):
            if bitstring[var_index[(i, k)]] == 1:
                chosen.append(k)
        if len(chosen) == 1:
            assigned[chosen[0]].append(i)
        else:
            target = min(range(n_trucks), key=lambda kk: (len(assigned[kk]), kk))
            assigned[target].append(i)
    return assigned
