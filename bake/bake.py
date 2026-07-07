#!/usr/bin/env python3
"""Bake data/source/port-alder.json into the four public/v0/*.json files that
the Babylon client consumes, per spec/contract.md.

stdlib-only Python 3. Run as:  python3 bake/bake.py

Steps (see spec/contract.md §5 for the exact validation contract):
  1. Load the source dataset.
  2. Resolve every FuzzyDate/Interval (G2).
  3. Validate per-Feature State non-overlap (G4) — fail loud, name the feature.
  4. Normalize footprint/extent ring winding (G9).
  5. Derive the timeline change list.
  6. Write public/v0/{regions,scene,timeline,events}.json.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fuzzydate as fd
import geometry as geom

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_PATH = os.path.join(REPO_ROOT, "data", "source", "port-alder.json")
OUT_DIR = os.path.join(REPO_ROOT, "public", "v0")

RENOVATION_KINDS = ("renovated", "moved")


class BakeError(ValueError):
    """Raised on any bake-time validation failure (overlap, unresolvable
    assertion reference, etc). Subclasses ValueError so `except ValueError`
    also catches it, per spec/contract.md §5."""
    pass


def load_source(path=SOURCE_PATH):
    with open(path) as f:
        return json.load(f)


def validate_no_overlap(feature):
    """G4: per-feature State intervals (resolved) must be pairwise
    non-overlapping, half-open [start, end). Raises BakeError naming the
    feature and offending states on violation."""
    feature_id = feature["id"]
    resolved = []
    for state in feature["states"]:
        start, end = fd.resolve_interval(state["interval"])
        resolved.append((start, end, state["id"]))

    resolved.sort(key=lambda t: fd.sort_key(t[0]))

    for i in range(len(resolved) - 1):
        _, end_i, id_i = resolved[i]
        start_j, _, id_j = resolved[i + 1]
        # half-open [start, end): overlap iff end_i > start_j (strict),
        # using POS_INF/NEG_INF sentinel-aware comparison via sort_key.
        if fd.sort_key(end_i) > fd.sort_key(start_j):
            raise BakeError(
                f"feature {feature_id!r}: State {id_i!r} (end={end_i}) overlaps "
                f"State {id_j!r} (start={start_j})"
            )
    return resolved


def normalize_representation_geometry(representation):
    payload = representation["payload"]
    footprint = payload["footprint"]
    footprint["coordinates"] = geom.normalize_polygon_coordinates(footprint["coordinates"])


def resolve_assertion(assertion_id, assertions_by_id):
    """Inline the full Assertion object in place of an id reference
    (spec/contract.md §2 "Deviations from spec v0.5"). Fails loud on an
    unresolvable id — never silently drops or fakes assertion data."""
    try:
        return dict(assertions_by_id[assertion_id])
    except KeyError:
        raise BakeError(f"unresolvable assertion id {assertion_id!r}")


def inline_representation_assertion(representation, assertions_by_id):
    representation["assertion"] = resolve_assertion(representation["assertion"], assertions_by_id)


def inline_name_assertions(names, assertions_by_id):
    for name_entry in names:
        name_entry["assertion"] = resolve_assertion(name_entry["assertion"], assertions_by_id)


def bake_scene(source):
    region = source["region"]
    horizon_start = fd.resolve_fuzzy_date(region["time_horizon"]["start"])
    horizon_end = fd.resolve_fuzzy_date(region["time_horizon"]["end"])
    assertions_by_id = source["assertions"]

    baked_features = []
    for feature in source["features"]:
        resolved_states = validate_no_overlap(feature)
        resolved_by_id = {sid: (s, e) for (s, e, sid) in resolved_states}

        states_out = []
        # emit in resolved-start order (already the sort order of resolved_states)
        for start, end, state_id in resolved_states:
            state = next(s for s in feature["states"] if s["id"] == state_id)
            for rep in state["representations"]:
                normalize_representation_geometry(rep)
                inline_representation_assertion(rep, assertions_by_id)
            states_out.append(state)

        names_out = [dict(n) for n in feature["names"]]
        inline_name_assertions(names_out, assertions_by_id)

        baked_features.append({
            "id": feature["id"],
            "type": feature["type"],
            "anchor": feature["anchor"],
            "names": names_out,
            "tags": feature["tags"],
            "states": states_out,
        })

    scene = {
        "region_id": region["id"],
        "frame": "local",
        "from": horizon_start,
        "to": horizon_end,
        "features": baked_features,
    }
    return scene, resolved_by_id


def derive_timeline(source):
    """Per spec/contract.md §3 derivation rule."""
    entries = []
    for feature in source["features"]:
        feature_id = feature["id"]
        resolved = []
        for state in feature["states"]:
            start, end = fd.resolve_interval(state["interval"])
            resolved.append((start, end, state))
        resolved.sort(key=lambda t: fd.sort_key(t[0]))

        n = len(resolved)
        for i, (start, end, state) in enumerate(resolved):
            prev = resolved[i - 1] if i > 0 else None
            transition_in = state.get("transition_in")
            is_contiguous_renovation = (
                prev is not None
                and fd.sort_key(prev[1]) == fd.sort_key(start)
                and transition_in is not None
                and transition_in.get("kind") in RENOVATION_KINDS
            )

            # A null (-infinity) start means "existed since before our horizon" —
            # there is no in-window appear/alter instant to emit for it.
            if start is not None:
                if is_contiguous_renovation:
                    entries.append({"t": start, "feature_id": feature_id, "change": "alter"})
                else:
                    entries.append({"t": start, "feature_id": feature_id, "change": "appear"})

            next_state = resolved[i + 1] if i + 1 < n else None
            next_is_contiguous_renovation = False
            if next_state is not None:
                next_start, _next_end, next_state_obj = next_state
                next_transition_in = next_state_obj.get("transition_in")
                next_is_contiguous_renovation = (
                    fd.sort_key(end) == fd.sort_key(next_start)
                    and next_transition_in is not None
                    and next_transition_in.get("kind") in RENOVATION_KINDS
                )

            if fd.sort_key(end) != fd.sort_key(fd.POS_INF) and not next_is_contiguous_renovation:
                entry = {"t": end, "feature_id": feature_id, "change": "disappear"}
                transition_out = state.get("transition_out")
                if transition_out and transition_out.get("event_id"):
                    entry["event_id"] = transition_out["event_id"]
                entries.append(entry)

    entries.sort(key=lambda e: fd.sort_key(e["t"]))
    return entries


def bake_regions(source):
    return [source["region"]]


def bake_events(source):
    events_out = []
    for event in source["events"]:
        event_copy = dict(event)
        events_out.append(event_copy)
    return events_out


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def bake(source_path=SOURCE_PATH, out_dir=OUT_DIR):
    source = load_source(source_path)

    scene, _resolved_by_id = bake_scene(source)
    timeline = derive_timeline(source)
    regions = bake_regions(source)
    events = bake_events(source)

    write_json(os.path.join(out_dir, "regions.json"), regions)
    write_json(os.path.join(out_dir, "scene.json"), scene)
    write_json(os.path.join(out_dir, "timeline.json"), timeline)
    write_json(os.path.join(out_dir, "events.json"), events)

    return {"regions": regions, "scene": scene, "timeline": timeline, "events": events}


if __name__ == "__main__":
    try:
        result = bake()
    except BakeError as e:
        print(f"BAKE FAILED: {e}", file=sys.stderr)
        sys.exit(1)

    feature_count = len(result["scene"]["features"])
    state_count = sum(len(f["states"]) for f in result["scene"]["features"])
    print(f"baked {feature_count} features, {state_count} states, "
          f"{len(result['timeline'])} timeline entries, "
          f"{len(result['events'])} events -> {OUT_DIR}")
