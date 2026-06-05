"""Classical CVRP solver: Clarke-Wright savings heuristic + per-route 2-opt polish.

The two-opt pass is run on each individual truck route after savings has
produced a feasible assignment. This gives a strong, deterministic baseline
suitable for the < 5s/10-station target.
"""
from __future__ import annotations

from app.solver.distance import distance_matrix, route_length
from app.solver.types import CVRPInstance, CVRPSolution, RouteResult


def _two_opt(seq: list[int], dist: list[list[float]]) -> list[int]:
    if len(seq) <= 3:
        return seq
    best = seq[:]
    improved = True
    while improved:
        improved = False
        for i in range(1, len(best) - 2):
            for j in range(i + 1, len(best) - 1):
                a, b = best[i - 1], best[i]
                c, d = best[j], best[j + 1]
                delta = (dist[a][c] + dist[b][d]) - (dist[a][b] + dist[c][d])
                if delta < -1e-12:
                    best[i : j + 1] = list(reversed(best[i : j + 1]))
                    improved = True
        if improved:
            continue
    return best


def _clarke_wright(
    n_customers: int,
    demand: list[float],
    dist: list[list[float]],
    capacity: float,
) -> list[list[int]]:
    # Initial: one route per customer (1..n).
    routes: dict[int, list[int]] = {i: [0, i, 0] for i in range(1, n_customers + 1)}
    route_of = {i: i for i in range(1, n_customers + 1)}
    load = {i: demand[i] for i in range(1, n_customers + 1)}

    savings: list[tuple[float, int, int]] = []
    for i in range(1, n_customers + 1):
        for j in range(i + 1, n_customers + 1):
            s = dist[0][i] + dist[0][j] - dist[i][j]
            savings.append((s, i, j))
    savings.sort(reverse=True)

    for s, i, j in savings:
        if s <= 0:
            break
        ri, rj = route_of[i], route_of[j]
        if ri == rj:
            continue
        if load[ri] + load[rj] > capacity + 1e-9:
            continue
        route_i = routes[ri]
        route_j = routes[rj]
        # Merge only at endpoints (i adjacent to depot in its route, same for j).
        i_at_end = route_i[-2] == i
        i_at_start = route_i[1] == i
        j_at_end = route_j[-2] == j
        j_at_start = route_j[1] == j
        if not ((i_at_end or i_at_start) and (j_at_end or j_at_start)):
            continue
        if i_at_end and j_at_start:
            merged = route_i[:-1] + route_j[1:]
        elif j_at_end and i_at_start:
            merged = route_j[:-1] + route_i[1:]
        elif i_at_end and j_at_end:
            merged = route_i[:-1] + list(reversed(route_j[1:-1])) + [0]
        elif i_at_start and j_at_start:
            merged = [0] + list(reversed(route_i[1:-1])) + route_j[1:]
        else:
            continue
        routes[ri] = merged
        load[ri] = load[ri] + load[rj]
        for node in route_j[1:-1]:
            route_of[node] = ri
        del routes[rj]
        del load[rj]

    return list(routes.values())


def solve_cvrp_classical(instance: CVRPInstance) -> CVRPSolution:
    coords = instance.coords()
    demand = instance.demands()
    n_customers = len(instance.stations)
    dist = distance_matrix(coords)

    routes = _clarke_wright(n_customers, demand, dist, instance.truck_capacity)

    # If we have more routes than trucks, merge the cheapest pair until <=
    # num_trucks (best-effort; capacity may force infeasibility).
    while len(routes) > instance.num_trucks:
        best = None
        for i in range(len(routes)):
            for j in range(i + 1, len(routes)):
                li = sum(demand[c] for c in routes[i] if c != 0)
                lj = sum(demand[c] for c in routes[j] if c != 0)
                if li + lj > instance.truck_capacity + 1e-9:
                    continue
                merged = routes[i][:-1] + routes[j][1:]
                cost = route_length(merged, dist)
                if best is None or cost < best[0]:
                    best = (cost, i, j, merged)
        if best is None:
            break  # whole-route merging stalled; try customer-level redistribution
        _, i, j, merged = best
        new_routes = [r for k, r in enumerate(routes) if k not in (i, j)]
        new_routes.append(merged)
        routes = new_routes

    # Whole-route merging can stall when every pair-sum exceeds capacity even
    # though customer-level reassignment is still feasible (e.g., 4 routes of
    # ~2300L each into 3 trucks of 4000L). Try dispersing the smallest route's
    # customers into cheapest-insertion positions in the remaining routes.
    routes = _redistribute_excess(routes, instance.num_trucks, demand, dist,
                                  instance.truck_capacity)

    excess_routes = max(0, len(routes) - instance.num_trucks)
    polished = [_two_opt(r, dist) for r in routes[: instance.num_trucks]]
    while len(polished) < instance.num_trucks:
        polished.append([0, 0])

    results: list[RouteResult] = []
    total = 0.0
    feasible = excess_routes == 0
    for tid, seq in enumerate(polished):
        load = sum(demand[c] for c in seq if c != 0)
        if load > instance.truck_capacity + 1e-9:
            feasible = False
        d = route_length(seq, dist)
        total += d
        results.append(RouteResult(truck_id=tid, sequence=seq, load=load, distance=d))

    meta: dict = {"algo": "clarke-wright+2opt"}
    if excess_routes:
        meta["dropped_routes"] = excess_routes

    return CVRPSolution(
        routes=results, total_distance=total, feasible=feasible, meta=meta
    )


def _redistribute_excess(
    routes: list[list[int]],
    num_trucks: int,
    demand: list[float],
    dist: list[list[float]],
    capacity: float,
) -> list[list[int]]:
    """Disperse the smallest route's customers into cheapest-insertion slots.

    Repeats while ``len(routes) > num_trucks`` and a placement exists for
    every customer in the smallest route. Returns a list whose length is
    either ``<= num_trucks`` (success) or unchanged (stuck — caller marks
    infeasible).
    """
    while len(routes) > num_trucks:
        loads = [sum(demand[c] for c in r if c != 0) for r in routes]
        src = min(range(len(routes)), key=lambda k: (loads[k], k))
        src_customers = [c for c in routes[src] if c != 0]
        targets = [list(r) for k, r in enumerate(routes) if k != src]
        target_loads = [loads[k] for k in range(len(routes)) if k != src]

        success = True
        for c in src_customers:
            best = None  # (delta, target_idx, position)
            for ti, route in enumerate(targets):
                if target_loads[ti] + demand[c] > capacity + 1e-9:
                    continue
                for pos in range(1, len(route)):
                    a, b = route[pos - 1], route[pos]
                    delta = dist[a][c] + dist[c][b] - dist[a][b]
                    if best is None or delta < best[0]:
                        best = (delta, ti, pos)
            if best is None:
                success = False
                break
            _, ti, pos = best
            targets[ti] = targets[ti][:pos] + [c] + targets[ti][pos:]
            target_loads[ti] += demand[c]

        if not success:
            return routes
        routes = targets
    return routes


def nearest_neighbor_route(
    customers: list[int], dist: list[list[float]]
) -> list[int]:
    """Order a fixed set of customers starting/ending at depot via nearest neighbor."""
    if not customers:
        return [0, 0]
    remaining = set(customers)
    seq = [0]
    cur = 0
    while remaining:
        nxt = min(remaining, key=lambda c: dist[cur][c])
        seq.append(nxt)
        remaining.discard(nxt)
        cur = nxt
    seq.append(0)
    return seq
