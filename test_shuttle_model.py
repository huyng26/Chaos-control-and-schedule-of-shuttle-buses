import unittest

import numpy as np

from shuttle_model import (
    find_regular_transition,
    simulate,
    summarize,
    theoretical_regular_transition,
    window_observables,
)


class ShuttleModelTests(unittest.TestCase):
    def test_arrivals_are_chronological_and_complete(self):
        result = simulate(gamma=0.3, speedups=(0.5, 0.2), num_trips=100)

        self.assertEqual(len(result.event_times), 202)
        self.assertTrue(np.all(np.diff(result.event_times) >= 0))
        self.assertFalse(np.isnan(result.arrival_times).any())

    def test_headway_uses_previous_global_arrival(self):
        result = simulate(gamma=0.5, speedups=(1.1, 1.1), num_trips=20)
        global_headways = np.diff(np.r_[0.0, result.event_times])
        recorded = result.headways[result.event_buses, result.event_trips]

        np.testing.assert_allclose(recorded, global_headways)

    def test_paper_regular_threshold_for_equal_speedup(self):
        self.assertAlmostEqual(theoretical_regular_transition(0.2), 1 / 6)
        transition = find_regular_transition(
            0.2,
            coarse_points=30,
            bisection_steps=12,
            num_trips=2_500,
            burn_in=2_000,
            tolerance=1e-4,
        )

        self.assertAlmostEqual(transition, 1 / 6, delta=0.003)

    def test_unequal_speedup_is_periodic_at_gamma_point_two(self):
        result = simulate(gamma=0.2, speedups=(0.5, 0.2), num_trips=2_000)
        stats = summarize(window_observables(result, 1_000))

        self.assertGreater(stats["H1"]["rms"], 1e-3)
        # Figure 6(a) reports an 11-cycle. Rounded late headways recover it.
        headways = result.headways_for(0, 1_000)
        self.assertEqual(len(np.unique(np.round(headways, 8))), 11)


if __name__ == "__main__":
    unittest.main()
