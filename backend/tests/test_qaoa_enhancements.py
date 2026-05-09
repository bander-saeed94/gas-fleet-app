"""Tests for the QNN-VQC enhancements wired into the gas-fleet API.

We avoid running the actual qaoa-repo solve (its end-to-end runtime is too
slow for CI) and instead monkeypatch ``solve_cvrp_qaoa`` to capture the
kwargs the route layer passes through. This proves the schema → adapter
plumbing without depending on the qaoa-repo + qiskit stack.

A second test exercises the schema directly so default-value drift is
caught early.
"""
from __future__ import annotations

from typing import Any

import pytest


def _payload_classical() -> dict:
    """A solvable 4-station classical request used as the request envelope."""
    return {
        "num_trucks": 2,
        "truck_capacity": 12.0,
        "depot": [0.0, 0.0],
        "stations": [
            {"id": 1, "x": 1.0, "y": 0.0, "demand": 3.0},
            {"id": 2, "x": 0.0, "y": 1.0, "demand": 4.0},
            {"id": 3, "x": -1.0, "y": 0.0, "demand": 2.0},
            {"id": 4, "x": 0.0, "y": -1.0, "demand": 1.0},
        ],
    }


def test_qaoa_params_schema_defaults_unchanged():
    """The default request still produces the legacy QAOA configuration —
    every QNN-VQC flag defaults off so existing callers see no behavior change."""
    from app.schemas.cvrp import QAOAParams

    p = QAOAParams()
    assert p.p == 2
    assert p.shots == 1024
    assert p.optimizer == "COBYLA"
    assert p.reupload is False
    assert p.observable_mode == "fixed"
    assert p.normalize_weights is False
    assert p.adam_lr == 0.1
    assert p.adam_epochs == 100
    assert p.adam_pshift_step == 0.1


def test_qaoa_params_schema_validates_optimizer_allow_list():
    """Bad optimizer names are rejected at the schema layer."""
    from app.schemas.cvrp import QAOAParams

    QAOAParams(optimizer="adam_pshift")  # ok
    QAOAParams(optimizer="L-BFGS-B")     # ok
    with pytest.raises(Exception):  # noqa: BLE001
        QAOAParams(optimizer="not-a-real-method")


def test_solve_endpoint_threads_qnn_kwargs_to_adapter(monkeypatch, client):
    """Posting QAOA enhancements through /solve must reach the adapter."""
    captured: dict[str, Any] = {}

    def _fake_qaoa(instance, *, p, shots, optimizer, **kwargs):
        captured["p"] = p
        captured["shots"] = shots
        captured["optimizer"] = optimizer
        captured.update(kwargs)
        # Return a no-op solution shaped like what the real adapter returns.
        from app.solver.types import CVRPSolution, RouteResult
        return CVRPSolution(
            routes=[RouteResult(truck_id=0, sequence=[0, 1, 0], load=3.0, distance=2.0),
                    RouteResult(truck_id=1, sequence=[0, 0], load=0.0, distance=0.0)],
            total_distance=2.0,
            feasible=True,
            meta={"algo": "fake-qaoa", "qaoa_method": optimizer,
                  "reupload": kwargs.get("reupload", False)},
        )

    # Patch the symbol the routes module imported (already-bound reference).
    monkeypatch.setattr("app.api.routes.solve_cvrp_qaoa", _fake_qaoa)

    payload = _payload_classical() | {
        "solver": "qaoa",
        "qaoa_params": {
            "p": 3,
            "shots": 512,
            "optimizer": "adam_pshift",
            "reupload": True,
            "observable_mode": "trainable",
            "normalize_weights": True,
            "adam_lr": 0.05,
            "adam_epochs": 50,
            "adam_pshift_step": 0.2,
        },
    }
    r = client.post("/api/solve", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["solver"] == "qaoa"
    # Confirm the kwargs the route layer forwarded.
    assert captured == {
        "p": 3,
        "shots": 512,
        "optimizer": "adam_pshift",
        "reupload": True,
        "observable_mode": "trainable",
        "normalize_weights": True,
        "adam_lr": 0.05,
        "adam_epochs": 50,
        "adam_pshift_step": 0.2,
    }
    assert body["meta"]["qaoa_method"] == "adam_pshift"
    assert body["meta"]["reupload"] is True


def test_solve_endpoint_legacy_qaoa_request_still_works(monkeypatch, client):
    """A request that doesn't mention any QNN flag falls through to defaults."""
    captured: dict[str, Any] = {}

    def _fake_qaoa(instance, *, p, shots, optimizer, **kwargs):
        captured["p"] = p
        captured["shots"] = shots
        captured["optimizer"] = optimizer
        captured.update(kwargs)
        from app.solver.types import CVRPSolution, RouteResult
        return CVRPSolution(
            routes=[RouteResult(truck_id=0, sequence=[0, 0], load=0.0, distance=0.0),
                    RouteResult(truck_id=1, sequence=[0, 0], load=0.0, distance=0.0)],
            total_distance=0.0, feasible=True, meta={},
        )

    monkeypatch.setattr("app.api.routes.solve_cvrp_qaoa", _fake_qaoa)

    payload = _payload_classical() | {"solver": "qaoa"}
    r = client.post("/api/solve", json=payload)
    assert r.status_code == 200, r.text
    # All QNN flags default off
    assert captured["reupload"] is False
    assert captured["observable_mode"] == "fixed"
    assert captured["normalize_weights"] is False


def test_adapter_signature_accepts_all_new_kwargs():
    """Pure import / signature check — no qaoa-repo needed."""
    import inspect
    from app.solver.qaoa_adapter import solve_cvrp_qaoa

    sig = inspect.signature(solve_cvrp_qaoa)
    expected = {
        "p", "shots", "optimizer", "reupload", "observable_mode",
        "normalize_weights", "adam_lr", "adam_epochs", "adam_pshift_step",
    }
    assert expected.issubset(set(sig.parameters))
