"""Numerical model from Nagatani (2006), "Chaos control and schedule of shuttle buses".

The paper's dimensionless map is

    T_i(m + 1) = T_i(m) + Gamma * H_i(m) + 1 / (1 + S_i * H_i(m)),

where H_i(m) is the time since the most recent arrival of any bus at the
origin.  Buses may overtake, so that predecessor is determined by chronological
arrival order rather than by bus number.
"""

from __future__ import annotations

from dataclasses import dataclass
import heapq
import math
from typing import Iterable

import numpy as np


@dataclass(frozen=True)
class SimulationResult:
    """Arrival history and observables for one simulation."""

    event_times: np.ndarray
    event_buses: np.ndarray
    event_trips: np.ndarray
    arrival_times: np.ndarray
    headways: np.ndarray
    diverged: bool = False

    @property
    def n_buses(self) -> int:
        return self.arrival_times.shape[0]

    @property
    def num_trips(self) -> int:
        return self.arrival_times.shape[1] - 1

    def tour_times(self, bus: int) -> np.ndarray:
        """Return T_i(m + 1) - T_i(m) for a zero-based bus index."""

        return np.diff(self.arrival_times[bus])

    def headways_for(self, bus: int, start: int = 0, stop: int | None = None) -> np.ndarray:
        """Return headways for one bus over trip indices [start, stop)."""

        return self.headways[bus, start:stop]


def simulate(
    initial_times: Iterable[float] = (1.0, 2.5),
    gamma: float = 0.5,
    speedups: Iterable[float] = (0.5, 0.2),
    num_trips: int = 2_000,
    *,
    previous_arrival: float = 0.0,
    divergence_limit: float = 1e12,
) -> SimulationResult:
    """Simulate the event-driven nonlinear map.

    ``num_trips`` is the largest trip index, so each bus has ``num_trips + 1``
    arrivals including trip 0.  A priority queue directly supplies the most
    recent predecessor even when buses overtake.
    """

    initial = np.asarray(tuple(initial_times), dtype=float)
    speed = np.asarray(tuple(speedups), dtype=float)

    if initial.ndim != 1 or initial.size == 0:
        raise ValueError("initial_times must be a non-empty one-dimensional sequence")
    if speed.shape != initial.shape:
        raise ValueError("speedups must contain one value per bus")
    if np.any(initial < previous_arrival):
        raise ValueError("initial arrivals must not precede previous_arrival")
    if gamma < 0 or np.any(speed < 0):
        raise ValueError("gamma and speedups must be non-negative")
    if num_trips < 0:
        raise ValueError("num_trips must be non-negative")

    n_buses = initial.size
    max_events = n_buses * (num_trips + 1)

    if n_buses == 2:
        # Fast path for the paper's two-bus case. Python list appends followed
        # by one NumPy conversion are substantially faster than scalar NumPy
        # writes inside the event loop.
        pending_0, pending_1 = float(initial[0]), float(initial[1])
        speed_0, speed_1 = float(speed[0]), float(speed[1])
        trip_0 = trip_1 = 0
        last_arrival = float(previous_arrival)
        event_time_list: list[float] = []
        event_bus_list: list[int] = []
        event_trip_list: list[int] = []
        arrivals: list[list[float]] = [[], []]
        bus_headways: list[list[float]] = [[], []]
        diverged = False

        while trip_0 <= num_trips or trip_1 <= num_trips:
            if pending_0 <= pending_1:
                bus, time, trip, bus_speed = 0, pending_0, trip_0, speed_0
            else:
                bus, time, trip, bus_speed = 1, pending_1, trip_1, speed_1

            headway = time - last_arrival
            if headway < 0.0:
                headway = 0.0
            event_time_list.append(time)
            event_bus_list.append(bus)
            event_trip_list.append(trip)
            arrivals[bus].append(time)
            bus_headways[bus].append(headway)
            last_arrival = time

            if trip == num_trips:
                if bus == 0:
                    pending_0, trip_0 = np.inf, trip_0 + 1
                else:
                    pending_1, trip_1 = np.inf, trip_1 + 1
                continue

            next_time = time + gamma * headway + 1.0 / (1.0 + bus_speed * headway)
            if not math.isfinite(next_time) or next_time > divergence_limit:
                diverged = True
                break
            if bus == 0:
                pending_0, trip_0 = next_time, trip_0 + 1
            else:
                pending_1, trip_1 = next_time, trip_1 + 1

        for bus in range(2):
            missing = num_trips + 1 - len(arrivals[bus])
            if missing > 0:
                arrivals[bus].extend([np.nan] * missing)
                bus_headways[bus].extend([np.nan] * missing)

        return SimulationResult(
            event_times=np.asarray(event_time_list),
            event_buses=np.asarray(event_bus_list, dtype=np.int16),
            event_trips=np.asarray(event_trip_list, dtype=np.int32),
            arrival_times=np.asarray(arrivals),
            headways=np.asarray(bus_headways),
            diverged=diverged,
        )

    event_times = np.empty(max_events, dtype=float)
    event_buses = np.empty(max_events, dtype=np.int16)
    event_trips = np.empty(max_events, dtype=np.int32)
    arrival_times = np.full((n_buses, num_trips + 1), np.nan, dtype=float)
    headways = np.full_like(arrival_times, np.nan)

    last_arrival = float(previous_arrival)
    n_events = 0
    diverged = False

    def record_event(time: float, bus: int, trip: int) -> float:
        nonlocal last_arrival, n_events
        headway = time - last_arrival
        if headway < -1e-12:
            raise RuntimeError("arrival queue is not chronological")
        headway = max(headway, 0.0)  # suppress harmless round-off at a tie
        event_times[n_events] = time
        event_buses[n_events] = bus
        event_trips[n_events] = trip
        arrival_times[bus, trip] = time
        headways[bus, trip] = headway
        n_events += 1
        last_arrival = time
        return headway

    # General fallback: each bus has exactly one pending arrival. The heap
    # merges the streams and automatically handles overtaking.
    pending = [(time, bus, 0) for bus, time in enumerate(initial)]
    heapq.heapify(pending)
    while pending:
        time, bus, trip = heapq.heappop(pending)
        headway = record_event(time, bus, trip)
        if trip < num_trips:
            next_time = time + gamma * headway + 1.0 / (1.0 + speed[bus] * headway)
            if not np.isfinite(next_time) or next_time > divergence_limit:
                diverged = True
                break
            heapq.heappush(pending, (next_time, bus, trip + 1))

    return SimulationResult(
        event_times=event_times[:n_events],
        event_buses=event_buses[:n_events],
        event_trips=event_trips[:n_events],
        arrival_times=arrival_times,
        headways=headways,
        diverged=diverged,
    )


def window_observables(
    result: SimulationResult,
    start: int,
    stop: int | None = None,
) -> dict[str, np.ndarray]:
    """Collect headways and tour times for every bus in one trip window."""

    if stop is None:
        stop = result.num_trips
    if not 0 <= start < stop <= result.num_trips:
        raise ValueError("window must satisfy 0 <= start < stop <= num_trips")

    values: dict[str, np.ndarray] = {}
    for bus in range(result.n_buses):
        label = bus + 1
        values[f"H{label}"] = result.headways[bus, start:stop]
        # Tour time at trip m is T_i(m + 1) - T_i(m).
        values[f"DT{label}"] = np.diff(result.arrival_times[bus, start : stop + 1])
    return values


def summarize(values: dict[str, np.ndarray]) -> dict[str, dict[str, float]]:
    """Return finite-sample mean and RMS fluctuation for each observable."""

    summary: dict[str, dict[str, float]] = {}
    for name, raw in values.items():
        finite = np.asarray(raw)[np.isfinite(raw)]
        summary[name] = {
            "mean": float(np.mean(finite)) if finite.size else np.nan,
            "rms": float(np.std(finite)) if finite.size else np.nan,
        }
    return summary


def is_regular(
    gamma: float,
    speedups: Iterable[float],
    *,
    initial_times: Iterable[float] = (1.0, 2.5),
    num_trips: int = 1_200,
    burn_in: int = 900,
    tolerance: float = 1e-8,
) -> bool:
    """Classify motion as regular when all late-time RMS values are negligible."""

    result = simulate(initial_times, gamma, speedups, num_trips)
    if result.diverged:
        return False
    stats = summarize(window_observables(result, burn_in))
    rms_values = np.array([item["rms"] for item in stats.values()])
    return bool(np.all(np.isfinite(rms_values)) and np.max(rms_values) <= tolerance)


def find_regular_transition(
    speedup: float,
    *,
    gamma_max: float = 2.0,
    coarse_points: int = 80,
    bisection_steps: int = 18,
    **regularity_options: object,
) -> float:
    """Locate the first regular-to-nonregular transition for S1 = S2.

    A coarse scan brackets the transition, then bisection refines it. This is
    faster and less grid-sensitive than differentiating noisy RMS samples.
    """

    gammas = np.linspace(0.0, gamma_max, coarse_points)
    previous = gammas[0]
    if not is_regular(previous, (speedup, speedup), **regularity_options):
        return 0.0

    for current in gammas[1:]:
        if not is_regular(current, (speedup, speedup), **regularity_options):
            low, high = previous, current
            for _ in range(bisection_steps):
                middle = (low + high) / 2.0
                if is_regular(middle, (speedup, speedup), **regularity_options):
                    low = middle
                else:
                    high = middle
            return high
        previous = current

    return np.nan


def theoretical_regular_transition(speedup: float | np.ndarray) -> float | np.ndarray:
    """Regular-branch boundary Gamma_c = S / (1 + S) for equal speedups.

    On the unequal-headway regular branch, equality of the two tour times gives
    ``Gamma = S / ((1 + S H1)(1 + S H2))``. At bunching, ``H1 -> 0`` and
    ``H2 -> 1``, yielding this boundary.
    """

    speedup = np.asarray(speedup)
    transition = speedup / (1.0 + speedup)
    return float(transition) if transition.ndim == 0 else transition
