import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fuzzydate as fd
import geometry as geom
import bake


class TestFuzzyDateResolution(unittest.TestCase):
    def test_year_precision_resolves_to_lower_bound(self):
        self.assertEqual(
            fd.resolve_fuzzy_date({"value": "1922", "precision": "year", "qualifier": "exact"}),
            "1922-01-01T00:00:00Z",
        )

    def test_month_precision_resolves_to_lower_bound(self):
        self.assertEqual(
            fd.resolve_fuzzy_date({"value": "1922-09", "precision": "month", "qualifier": "exact"}),
            "1922-09-01T00:00:00Z",
        )

    def test_day_precision_resolves_exactly(self):
        self.assertEqual(
            fd.resolve_fuzzy_date({"value": "1964-03-27", "precision": "day", "qualifier": "exact"}),
            "1964-03-27T00:00:00Z",
        )

    def test_instant_precision_preserves_utc_offset_semantics(self):
        # 1964-03-27T17:36:00-09:00 == 1964-03-28T02:36:00Z
        resolved = fd.resolve_fuzzy_date(
            {"value": "1964-03-27T17:36:00-09:00", "precision": "instant", "qualifier": "exact"}
        )
        self.assertEqual(resolved, "1964-03-28T02:36:00Z")

    def test_end_bound_also_resolves_to_lower_bound_of_expansion(self):
        # Rule 2: an interval END resolves to the expansion's LOWER bound too
        # (a State ending "1936" is gone at 1936-01-01, not 1936-12-31).
        interval = {"start": {"value": "1930", "precision": "year", "qualifier": "exact"},
                    "end": {"value": "1936", "precision": "year", "qualifier": "exact"}}
        start, end = fd.resolve_interval(interval)
        self.assertEqual(end, "1936-01-01T00:00:00Z")

    def test_null_start_bound_resolves_to_negative_infinity_sentinel(self):
        interval = {"start": None, "end": {"value": "1975", "precision": "year", "qualifier": "exact"}}
        start, end = fd.resolve_interval(interval)
        self.assertIsNone(start)
        self.assertEqual(fd.sort_key(start), "")  # sorts before everything

    def test_null_end_bound_resolves_to_positive_infinity_sentinel(self):
        interval = {"start": {"value": "1921", "precision": "year", "qualifier": "exact"}, "end": None}
        start, end = fd.resolve_interval(interval)
        self.assertEqual(end, fd.POS_INF)

    def test_unknown_precision_raises(self):
        with self.assertRaises(ValueError):
            fd.resolve_fuzzy_date({"value": "1922", "precision": "decade", "qualifier": "exact"})


class TestOverlapValidation(unittest.TestCase):
    def _feature_with_states(self, intervals):
        states = []
        for i, (start, end) in enumerate(intervals):
            states.append({
                "id": f"st_{i}",
                "feature_id": "ftr_test",
                "interval": {"start": start, "end": end},
                "transition_in": {"kind": "constructed", "duration_days": 30},
                "transition_out": None,
                "attributes": [],
                "representations": [],
            })
        return {"id": "ftr_test", "states": states}

    def test_non_overlapping_adjacent_states_pass(self):
        feature = self._feature_with_states([
            ({"value": "1920", "precision": "year", "qualifier": "exact"},
             {"value": "1940", "precision": "year", "qualifier": "exact"}),
            ({"value": "1940", "precision": "year", "qualifier": "exact"}, None),
        ])
        # half-open [start,end): adjacent boundary states must NOT raise
        resolved = bake.validate_no_overlap(feature)
        self.assertEqual(len(resolved), 2)

    def test_overlapping_states_raise_bake_error_naming_feature(self):
        feature = self._feature_with_states([
            ({"value": "1920", "precision": "year", "qualifier": "exact"},
             {"value": "1945", "precision": "year", "qualifier": "exact"}),
            ({"value": "1940", "precision": "year", "qualifier": "exact"}, None),
        ])
        with self.assertRaises(bake.BakeError) as ctx:
            bake.validate_no_overlap(feature)
        self.assertIn("ftr_test", str(ctx.exception))


class TestWindingNormalization(unittest.TestCase):
    def test_ccw_exterior_ring_is_detected_and_left_alone(self):
        ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]  # CCW rectangle
        self.assertTrue(geom.is_ccw(ring))
        normalized = geom.normalize_polygon_coordinates([ring])
        self.assertEqual(normalized[0], ring)

    def test_reversed_cw_exterior_ring_is_flipped_to_ccw(self):
        cw_ring = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]  # authored CW (the bug)
        self.assertFalse(geom.is_ccw(cw_ring))
        normalized = geom.normalize_polygon_coordinates([cw_ring])
        self.assertTrue(geom.is_ccw(normalized[0]))

    def test_hole_ring_is_forced_cw(self):
        exterior = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]  # CCW
        hole_authored_ccw = [[5, 5], [5, 15], [15, 15], [15, 5], [5, 5]]  # wrongly CCW
        normalized = geom.normalize_polygon_coordinates([exterior, hole_authored_ccw])
        self.assertTrue(geom.is_ccw(normalized[0]))
        self.assertFalse(geom.is_ccw(normalized[1]))


class TestTimelineDerivation(unittest.TestCase):
    def test_two_state_renovated_feature_emits_appear_then_alter_no_disappear(self):
        source = {
            "features": [
                {
                    "id": "ftr_reno",
                    "states": [
                        {
                            "id": "st_a",
                            "interval": {
                                "start": {"value": "1923", "precision": "year", "qualifier": "exact"},
                                "end": {"value": "1940", "precision": "year", "qualifier": "exact"},
                            },
                            "transition_in": {"kind": "constructed", "duration_days": 100},
                            "transition_out": {"kind": "renovated"},
                        },
                        {
                            "id": "st_b",
                            "interval": {
                                "start": {"value": "1940", "precision": "year", "qualifier": "exact"},
                                "end": None,
                            },
                            "transition_in": {"kind": "renovated", "duration_days": 60},
                            "transition_out": None,
                        },
                    ],
                }
            ]
        }
        entries = bake.derive_timeline(source)
        changes = [(e["t"], e["change"], e.get("event_id")) for e in entries]
        self.assertEqual(changes, [
            ("1923-01-01T00:00:00Z", "appear", None),
            ("1940-01-01T00:00:00Z", "alter", None),
        ])

    def test_destroyed_then_rebuilt_feature_emits_disappear_with_event_then_appear(self):
        source = {
            "features": [
                {
                    "id": "ftr_rebuild",
                    "states": [
                        {
                            "id": "st_a",
                            "interval": {
                                "start": {"value": "1926", "precision": "year", "qualifier": "exact"},
                                "end": {"value": "1964-03-27", "precision": "day", "qualifier": "exact"},
                            },
                            "transition_in": {"kind": "constructed", "duration_days": 70},
                            "transition_out": {"kind": "destroyed", "event_id": "evt_1964quake"},
                        },
                        {
                            "id": "st_b",
                            "interval": {
                                "start": {"value": "1965", "precision": "year", "qualifier": "exact"},
                                "end": None,
                            },
                            "transition_in": {"kind": "constructed", "duration_days": 50},
                            "transition_out": None,
                        },
                    ],
                }
            ]
        }
        entries = bake.derive_timeline(source)
        changes = [(e["t"], e["change"], e.get("event_id")) for e in entries]
        self.assertEqual(changes, [
            ("1926-01-01T00:00:00Z", "appear", None),
            ("1964-03-27T00:00:00Z", "disappear", "evt_1964quake"),
            ("1965-01-01T00:00:00Z", "appear", None),
        ])

    def test_timeline_is_sorted_by_t_across_features(self):
        source = {
            "features": [
                {
                    "id": "ftr_late",
                    "states": [{
                        "id": "st_late",
                        "interval": {"start": {"value": "1960", "precision": "year", "qualifier": "exact"}, "end": None},
                        "transition_in": {"kind": "constructed", "duration_days": 10},
                        "transition_out": None,
                    }],
                },
                {
                    "id": "ftr_early",
                    "states": [{
                        "id": "st_early",
                        "interval": {"start": {"value": "1921", "precision": "year", "qualifier": "exact"}, "end": None},
                        "transition_in": {"kind": "constructed", "duration_days": 10},
                        "transition_out": None,
                    }],
                },
            ]
        }
        entries = bake.derive_timeline(source)
        ts = [e["t"] for e in entries]
        self.assertEqual(ts, sorted(ts))
        self.assertEqual(entries[0]["feature_id"], "ftr_early")


class TestFullBakeOnRealSource(unittest.TestCase):
    """Exercises the actual data/source/port-alder.json end to end."""

    @classmethod
    def setUpClass(cls):
        cls.result = bake.bake()

    def test_produces_expected_counts(self):
        scene = self.result["scene"]
        self.assertEqual(len(scene["features"]), 15)
        state_count = sum(len(f["states"]) for f in scene["features"])
        self.assertEqual(state_count, 20)
        self.assertEqual(len(self.result["events"]), 1)
        self.assertEqual(len(self.result["regions"]), 1)

    def test_timeline_is_sorted(self):
        ts = [e["t"] for e in self.result["timeline"]]
        self.assertEqual(ts, sorted(ts))

    def test_reversed_winding_source_feature_is_normalized_ccw(self):
        scene = self.result["scene"]
        feature = next(f for f in scene["features"] if f["id"] == "ftr_bld_12")
        ring = feature["states"][0]["representations"][0]["payload"]["footprint"]["coordinates"][0]
        self.assertTrue(geom.is_ccw(ring), "reversed-winding source ring must be normalized to CCW")

    def test_hole_feature_has_ccw_exterior_and_cw_hole(self):
        scene = self.result["scene"]
        feature = next(f for f in scene["features"] if f["id"] == "ftr_bld_11")
        coords = feature["states"][0]["representations"][0]["payload"]["footprint"]["coordinates"]
        self.assertEqual(len(coords), 2)
        self.assertTrue(geom.is_ccw(coords[0]))
        self.assertFalse(geom.is_ccw(coords[1]))

    def test_quake_destroyed_buildings_disappear_with_event_id(self):
        timeline = self.result["timeline"]
        quake_disappears = [e for e in timeline if e["change"] == "disappear" and e.get("event_id") == "evt_1964quake"]
        self.assertEqual(len(quake_disappears), 4)
        feature_ids = {e["feature_id"] for e in quake_disappears}
        self.assertEqual(feature_ids, {"ftr_bld_05", "ftr_bld_06", "ftr_bld_07", "ftr_bld_08"})

    def test_quake_disappears_land_exactly_on_the_event_instant(self):
        # IMPORTANT-2 fix: destroyed states' interval.end is authored as
        # precision:instant matching the quake Event's own resolved time,
        # not a day-precision midnight approximation.
        events_by_id = {e["id"]: e for e in self.result["events"]}
        quake_event = events_by_id["evt_1964quake"]
        expected_t = fd.resolve_fuzzy_date(quake_event["time"])
        self.assertEqual(expected_t, "1964-03-28T02:36:00Z")  # 17:36 AKST -09:00 -> UTC

        timeline = self.result["timeline"]
        quake_disappears = [e for e in timeline if e["change"] == "disappear" and e.get("event_id") == "evt_1964quake"]
        for entry in quake_disappears:
            self.assertEqual(entry["t"], expected_t)

    def test_representation_assertion_is_inlined_full_object(self):
        scene = self.result["scene"]
        feature = next(f for f in scene["features"] if f["id"] == "ftr_bld_04")
        state = next(s for s in feature["states"] if s["id"] == "st_bld_04_a")
        assertion = state["representations"][0]["assertion"]
        self.assertIsInstance(assertion, dict, "Representation.assertion must be inlined, not a bare id string")
        self.assertEqual(assertion["id"], "asr_st_bld_04_a_rep")
        self.assertEqual(assertion["method"], "manual_trace")
        self.assertEqual(assertion["status"], "verified")
        self.assertIn("confidence", assertion)
        self.assertIn("sources", assertion)
        self.assertIsInstance(assertion["sources"], list)

    def test_name_assertion_is_inlined_full_object(self):
        scene = self.result["scene"]
        feature = next(f for f in scene["features"] if f["id"] == "ftr_bld_04")
        name_entry = feature["names"][0]
        assertion = name_entry["assertion"]
        self.assertIsInstance(assertion, dict, "Feature.names[].assertion must be inlined, not a bare id string")
        self.assertEqual(assertion["method"], "manual_trace")
        self.assertEqual(assertion["status"], "verified")
        self.assertIn("confidence", assertion)
        self.assertIn("sources", assertion)


class TestAssertionResolution(unittest.TestCase):
    def test_unresolvable_assertion_id_raises_bake_error(self):
        with self.assertRaises(bake.BakeError):
            bake.resolve_assertion("asr_does_not_exist", {})

    def test_bake_error_is_a_value_error(self):
        # contract.md §5 says overlap violations raise ValueError; BakeError
        # subclasses ValueError so both are true (IMPORTANT-3 fix).
        self.assertTrue(issubclass(bake.BakeError, ValueError))

    def test_resolve_assertion_returns_full_object(self):
        assertions = {"asr_x": {"id": "asr_x", "method": "manual_trace", "status": "verified", "confidence": 0.9, "sources": ["src_a"]}}
        resolved = bake.resolve_assertion("asr_x", assertions)
        self.assertEqual(resolved, assertions["asr_x"])

    def test_output_files_written(self):
        out_dir = bake.OUT_DIR
        for name in ("regions.json", "scene.json", "timeline.json", "events.json"):
            self.assertTrue(os.path.exists(os.path.join(out_dir, name)))


if __name__ == "__main__":
    unittest.main()
