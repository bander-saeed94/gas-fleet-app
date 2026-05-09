from __future__ import annotations

import math
from collections.abc import Sequence


def euclidean(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def distance_matrix(coords: Sequence[tuple[float, float]]) -> list[list[float]]:
    n = len(coords)
    d = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            v = euclidean(coords[i], coords[j])
            d[i][j] = v
            d[j][i] = v
    return d


def route_length(seq: Sequence[int], dist: Sequence[Sequence[float]]) -> float:
    return sum(dist[seq[i]][seq[i + 1]] for i in range(len(seq) - 1))
