"""Adapter that drives the unmodified ``qaoa-repo`` package.

This module never imports from ``qaoa-repo`` at module load time — the
import is deferred until ``solve_cvrp_qaoa`` is called, so the backend
runs cleanly even when qaoa-repo isn't installed (e.g., CI without the
qiskit stack). When the import fails, we transparently fall back to the
classical solver and tag the response so the UI can show what happened.

The adapter exposes the QNN-VQC enhancements ported into ``nd_qaoa``:
data re-uploading, trainable per-term observable weights, weight
normalization, and the Adam + parameter-shift optimizer (Kingma & Ba,
2015 + Schuld et al., 2019). See ``Add-QNN-Enhancements-Prompt.md`` for
the full motivation.
"""
from __future__ import annotations

import logging
from typing import Literal

import numpy as np

from app.solver.classical import solve_cvrp_classical
from app.solver.distance import distance_matrix, route_length
from app.solver.types import CVRPInstance, CVRPSolution, RouteResult

log = logging.getLogger(__name__)


def _try_import_qaoa() -> bool:
    try:
        from nd_qaoa.problems.vrp import (  # noqa: F401
            extract_vrp_solution,
            vrp_hamiltonian,
        )
        from nd_qaoa.qaoa import (  # noqa: F401
            best_bitstring,
            optimize_qaoa,
            qaoa_circuit,
            bind_params,
        )
        from qaoa_common.vrp_problem import VRPInstance  # noqa: F401

        return True
    except Exception as exc:  # pragma: no cover - import-time failure
        log.info("qaoa-repo not importable, falling back to classical: %s", exc)
        return False


def solve_cvrp_qaoa(
    instance: CVRPInstance,
    p: int = 2,
    shots: int = 1024,
    optimizer: str = "COBYLA",
    *,
    reupload: bool = False,
    observable_mode: Literal["fixed", "trainable"] = "fixed",
    normalize_weights: bool = False,
    adam_lr: float = 0.1,
    adam_epochs: int = 100,
    adam_pshift_step: float = 0.1,
) -> CVRPSolution:
    """Solve CVRP via the QAOA library; on any failure, fall back to classical.

    The algorithm:
        1. Build a ``qaoa_common.VRPInstance`` from our CVRPInstance.
        2. Construct the cost Hamiltonian via ``nd_qaoa.problems.vrp.vrp_hamiltonian``,
           optionally with ``normalize_weights=True``.
        3. Optimize QAOA parameters with ``optimize_qaoa`` (with ``reupload``,
           ``observable_mode``, and either a scipy method or ``adam_pshift``).
        4. Sample with ``best_bitstring`` from a circuit re-bound to the
           optimized angles + re-uploading params.
        5. Decode + repair + NN-order the routes via ``extract_vrp_solution``.
    """
    if not _try_import_qaoa():
        sol = solve_cvrp_classical(instance)
        sol.meta = {**sol.meta, "qaoa_fallback": "library_unavailable"}
        return sol

    try:
        return _solve_with_qaoa(
            instance,
            p=p,
            shots=shots,
            optimizer=optimizer,
            reupload=reupload,
            observable_mode=observable_mode,
            normalize_weights=normalize_weights,
            adam_lr=adam_lr,
            adam_epochs=adam_epochs,
            adam_pshift_step=adam_pshift_step,
        )
    except Exception as exc:
        log.exception("QAOA solve failed; falling back to classical")
        sol = solve_cvrp_classical(instance)
        sol.meta = {**sol.meta, "qaoa_fallback": f"error: {exc!r}"}
        return sol


def _solve_with_qaoa(
    instance: CVRPInstance,
    *,
    p: int,
    shots: int,
    optimizer: str,
    reupload: bool,
    observable_mode: str,
    normalize_weights: bool,
    adam_lr: float,
    adam_epochs: int,
    adam_pshift_step: float,
) -> CVRPSolution:
    from nd_qaoa.problems.vrp import extract_vrp_solution, vrp_hamiltonian
    from nd_qaoa.qaoa import (
        bind_params,
        best_bitstring,
        optimize_qaoa,
        qaoa_circuit,
    )
    from qaoa_common.vrp_problem import VRPInstance as RepoVRPInstance

    n = len(instance.stations)
    m = instance.num_trucks
    coords = instance.coords()
    demand = instance.demands()
    dist = distance_matrix(coords)

    vrp = RepoVRPInstance(
        n_customers=n,
        n_vehicles=m,
        distance_matrix=np.asarray(dist, dtype=float),
        coords=np.asarray(coords, dtype=float),
        demand=np.asarray(demand, dtype=float),
        capacity=float(instance.truck_capacity),
    )

    # Build the cost. ``normalize_weights=True`` divides every term's
    # coefficient by ``max_t |c_t|``; the original scale is kept on
    # ``cost.weight_scale`` so we can rescale energies after optimization.
    cost = vrp_hamiltonian(vrp, normalize_weights=normalize_weights)
    weight_scale = float(getattr(cost, "weight_scale", 1.0))
    # The statevector evaluator is exact but builds a 2^N-amplitude state on
    # every parameter-update step; past ~16 qubits that's intractable inside
    # an HTTP request. Switch to the sampling evaluator (qiskit-aer C++) for
    # larger problems — noisier per-step estimates, but seconds per call
    # instead of minutes.
    evaluator = "statevector" if cost.num_qubits <= 16 else "sampler"

    # Map UI optimizer names. Anything other than the special
    # ``adam_pshift`` is forwarded to scipy.optimize.minimize.
    method = optimizer
    opt_kwargs: dict = {}
    if optimizer == "adam_pshift":
        opt_kwargs.update(
            n_epochs=adam_epochs, lr=adam_lr, pshift_step=adam_pshift_step,
        )

    result = optimize_qaoa(
        cost,
        p=p,
        method=method,
        evaluator=evaluator,
        shots=shots,
        reupload=reupload,
        observable_mode=observable_mode,
        **opt_kwargs,
    )

    # Re-bind the optimized state for sampling. When ``reupload=True`` the
    # ``best_bitstring`` helper alone isn't enough — it builds a standard
    # QAOA circuit from γ, β only — so for re-uploading we sample directly
    # from the bound circuit instead.
    if reupload:
        from app.solver.distance import distance_matrix  # noqa: F401  (used above)
        # ``cost`` here is the *base* (un-α'd) cost; the QAOA circuit
        # depends only on its diagonal-Pauli structure, not on α.
        qc, gp, bp, wp_p, bp_p, wm_p, bm_p = qaoa_circuit(
            cost, p, measure=True, reupload=True,
        )
        bound = bind_params(
            qc, gp, bp, result.gammas, result.betas,
            w_phase=wp_p, b_phase=bp_p, w_mix=wm_p, b_mix=bm_p,
            w_phase_vals=result.w_phase, b_phase_vals=result.b_phase,
            w_mix_vals=result.w_mix, b_mix_vals=result.b_mix,
        )
        from nd_qaoa.qaoa.expectation import sample_bitstrings
        from nd_qaoa.qaoa.expectation import _diag_eigs  # noqa: F401

        counts = sample_bitstrings(bound, shots=shots)
        diag = _diag_eigs(cost)
        bits = min(counts, key=lambda b: diag[int(b.replace(' ', ''), 2)])
    else:
        bits, _ = best_bitstring(cost, result.gammas, result.betas, shots=shots)
    routes = extract_vrp_solution(vrp, bits, repair=True)

    sol = _routes_to_solution(instance, routes, dist, demand)
    # Surface the new knobs and the rescaled energy so the UI / tests can
    # confirm the path that was taken. ``cost_energy`` is in the *native*
    # (un-rescaled) units.
    sol.meta.update({
        "qaoa_method": method,
        "reupload": bool(reupload),
        "observable_mode": observable_mode,
        "normalize_weights": bool(normalize_weights),
        "weight_scale": weight_scale,
        "cost_energy_native": float(result.energy) * weight_scale,
    })
    return sol


def _routes_to_solution(
    instance: CVRPInstance,
    routes: list[list[int]],
    dist: list[list[float]],
    demand: list[float],
) -> CVRPSolution:
    """Wrap qaoa-repo's per-vehicle node sequences as a CVRPSolution.

    ``extract_vrp_solution`` returns one list per vehicle in instance order,
    each beginning and ending at the depot (node 0). Empty vehicles are
    ``[0, 0]``.
    """
    results: list[RouteResult] = []
    total = 0.0
    feasible = True
    for tid, seq in enumerate(routes):
        load = sum(demand[c] for c in seq if c != 0)
        if load > instance.truck_capacity + 1e-9:
            feasible = False
        d = route_length(seq, dist)
        total += d
        results.append(RouteResult(truck_id=tid, sequence=seq, load=load, distance=d))

    return CVRPSolution(
        routes=results,
        total_distance=total,
        feasible=feasible,
        meta={"algo": "qaoa-assignment+nn"},
    )
