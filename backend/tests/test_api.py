from __future__ import annotations

from unittest.mock import patch


def _instance_payload(solver: str = "classical") -> dict:
    return {
        "num_trucks": 2,
        "truck_capacity": 10.0,
        "depot": [0.0, 0.0],
        "stations": [
            {"id": 1, "x": 3.0, "y": 0.0, "demand": 4.0},
            {"id": 2, "x": -3.0, "y": 0.0, "demand": 4.0},
            {"id": 3, "x": 0.0, "y": 3.0, "demand": 2.0},
        ],
        "solver": solver,
    }


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_solve_classical_persists_and_lists(client):
    r = client.post("/api/solve", json=_instance_payload("classical"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["feasible"]
    assert body["total_distance"] > 0
    day_id = body["day_id"]

    ids = [d["id"] for d in client.get("/api/days").json()]
    assert day_id in ids

    detail = client.get(f"/api/days/{day_id}").json()
    assert detail["response"]["day_id"] == day_id


def test_validate_demand_too_large(client):
    payload = _instance_payload()
    payload["stations"][0]["demand"] = 999
    r = client.post("/api/solve", json=payload)
    assert r.status_code == 400


def test_solve_qaoa_with_mocked_adapter_returns_same_shape(client):
    from app.solver.classical import solve_cvrp_classical
    from app.solver.types import CVRPInstance

    def fake_qaoa(instance: CVRPInstance, **kwargs):
        sol = solve_cvrp_classical(instance)
        sol.meta["mocked"] = True
        return sol

    with patch("app.api.routes.solve_cvrp_qaoa", side_effect=fake_qaoa):
        r = client.post("/api/solve", json=_instance_payload("qaoa"))
    assert r.status_code == 200
    body = r.json()
    assert body["solver"] == "qaoa"
    assert body["feasible"]
    assert {"truck_id", "load", "distance", "sequence"} <= set(body["routes"][0])


def test_delete_day(client):
    r = client.post("/api/solve", json=_instance_payload("classical"))
    day_id = r.json()["day_id"]
    r2 = client.delete(f"/api/days/{day_id}")
    assert r2.status_code == 200
    r3 = client.get(f"/api/days/{day_id}")
    assert r3.status_code == 404
