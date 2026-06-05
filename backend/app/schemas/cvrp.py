from __future__ import annotations

from datetime import datetime
from typing import Literal

from typing import Any

from pydantic import BaseModel, Field, field_validator


class StationIn(BaseModel):
    id: int
    x: float
    y: float
    demand: float = Field(gt=0)


class StationOut(BaseModel):
    x: float
    y: float
    demand: float | None = None
    id: int | None = None


class QAOAParams(BaseModel):
    """Tunable parameters for the QAOA solver path.

    The first three fields are the original (classical-style) levers; the
    rest expose the QNN-VQC enhancements:

    * ``reupload`` — multi-angle / data-re-uploading ansatz (per-term
      ``w_phase, b_phase`` and per-qubit ``w_mix, b_mix``).
    * ``observable_mode`` — ``"trainable"`` enables per-term ``α_t`` weights
      that are optimized jointly with the angles (the "trainable observable
      weights" future-work item from the QNN-VQC report).
    * ``normalize_weights`` — divides every cost-term coefficient by
      ``max_t |c_t|`` so per-term rotation magnitudes are comparable, the
      QAOA analogue of ``utils.scale_to_circuit_range`` from the QNN side.
    * ``adam_lr``, ``adam_epochs``, ``adam_pshift_step`` — only used when
      ``optimizer == "adam_pshift"``.
    """

    p: int = Field(default=2, ge=1, le=8)
    shots: int = Field(default=1024, ge=1)
    optimizer: Literal["COBYLA", "SPSA", "NELDER_MEAD", "L-BFGS-B",
                       "adam_pshift"] = "COBYLA"
    # New QNN-VQC enhancements (default-False so existing requests are unchanged)
    reupload: bool = False
    observable_mode: Literal["fixed", "trainable"] = "fixed"
    normalize_weights: bool = False
    adam_lr: float = Field(default=0.1, gt=0)
    adam_epochs: int = Field(default=100, ge=1, le=2000)
    adam_pshift_step: float = Field(default=0.1, gt=0)


class SolveRequest(BaseModel):
    num_trucks: int = Field(ge=1)
    truck_capacity: float = Field(gt=0)
    depot: tuple[float, float] = (0.0, 0.0)
    stations: list[StationIn]
    solver: Literal["qaoa", "classical"] = "classical"
    qaoa_params: QAOAParams = Field(default_factory=QAOAParams)

    @field_validator("stations")
    @classmethod
    def at_least_one_station(cls, v: list[StationIn]) -> list[StationIn]:
        if len(v) == 0:
            raise ValueError("at least one station is required")
        return v


class RouteOut(BaseModel):
    truck_id: int
    load: float
    distance: float
    sequence: list[StationOut]


class SolveResponse(BaseModel):
    day_id: str
    solver: str
    solve_time_ms: int
    total_distance: float
    routes: list[RouteOut]
    feasible: bool
    meta: dict[str, Any] = Field(default_factory=dict)


class DaySummary(BaseModel):
    id: str
    created_at: datetime
    num_trucks: int
    truck_capacity: float
    solver: str
    total_distance: float
    solve_time_ms: int


class DayDetail(DaySummary):
    request: SolveRequest
    response: SolveResponse
