from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class CVRPInstance:
    num_trucks: int
    truck_capacity: float
    depot: tuple[float, float]
    stations: list[dict]  # {id, x, y, demand}

    def coords(self) -> list[tuple[float, float]]:
        return [self.depot] + [(s["x"], s["y"]) for s in self.stations]

    def demands(self) -> list[float]:
        return [0.0] + [float(s["demand"]) for s in self.stations]


@dataclass
class RouteResult:
    truck_id: int
    sequence: list[int]  # node indices (0 = depot, 1..n = stations)
    load: float
    distance: float


@dataclass
class CVRPSolution:
    routes: list[RouteResult]
    total_distance: float
    feasible: bool = True
    meta: dict = field(default_factory=dict)
