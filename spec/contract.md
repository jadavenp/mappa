# Mappa Demo — Baked Data Contract (v0)

This file freezes the shape of the four static JSON files served from
`public/v0/` and consumed by the Babylon client (Task 3). It is the interface
between `bake/bake.py` and the client — the client builds against this
document verbatim, not against `bake.py`'s internals.

Scope: this is a **client-only static demo**. The four files below mirror the
*success* payload shapes of spec v0.5 §5.1's `GET /v0/regions`, `GET /v0/scene`
(window mode), and `GET /v0/timeline`, plus an `events` file the timeline
references by `event_id`. There is no server, no error envelope, no ETag, no
pagination cap, no `/v0/features/{id}` endpoint. Where the full spec assumes a
live API with more endpoints, this contract inlines what the client needs so
the four static files are self-contained (see "Deviations from spec v0.5"
below).

All field names are taken verbatim from spec v0.5 §3 (Feature, State,
Representation, Assertion, Event). Nothing is renamed or invented, except the
two explicitly-documented inlining deviations.

---

## 0. FuzzyDate and Interval (shared shape, spec §3.3)

```json
{
  "value": "1922-09",
  "earliest": "1922-01",
  "latest": "1923-06",
  "precision": "month",
  "qualifier": "circa"
}
```

- `precision`: `year | month | day | instant`.
- `qualifier`: `exact | circa | before | after | disputed`.
- `earliest` / `latest` are optional display/inspector brackets — **never**
  used for query resolution.
- Resolution is on `value` only:
  - `"1922"` (precision `year`) → resolves to the calendar expansion's
    **lower bound**: `1922-01-01T00:00:00Z`.
  - `"1922-09"` (precision `month`) → `1922-09-01T00:00:00Z`.
  - `"1964-03-27"` (precision `day`) → `1964-03-27T00:00:00Z`.
  - `precision: "instant"` values carry a full ISO 8601 datetime with a UTC
    offset, e.g. `"1964-03-27T17:36:00-09:00"`, and **resolve to that same
    instant normalized to UTC**: `"1964-03-28T02:36:00Z"`. Normalizing to a
    single, comparable UTC representation (rather than preserving the
    author's local offset) is what lets sort/compare/equality work
    uniformly across year/month/day/instant resolutions, all of which are
    UTC-suffixed strings.
  - This rule applies identically whether the value is used as an interval
    `start` or an interval `end` (spec §3.3 rule 2) — an interval ending
    `"1936"` is gone at `1936-01-01T00:00:00Z`, not `1936-12-31`.
- **1964 quake instant, documented choice:** the source authors the event
  time and the four quake-destroyed States' `interval.end` identically, as
  `{"value": "1964-03-27T17:36:00-09:00", "precision": "instant", "qualifier": "exact"}`
  (17:36 Alaska local time, historical offset), matching spec §3.6's own
  worked example verbatim. Authoring the State end at the *same* instant as
  the Event (not a day-precision approximation) is what makes the timeline's
  `disappear` entries for those four buildings land exactly on the quake's
  resolved time, `"1964-03-28T02:36:00Z"` — see §3 below.

```json
// Interval
{ "start": { /* FuzzyDate */ } | null,   // null = "since before our horizon" (-infinity)
  "end":   { /* FuzzyDate */ } | null }  // null = "still extant" (+infinity)
```

`bake.py` and the client's `src/fuzzydate.js` (Task 3) both implement exactly
this resolution algorithm — the client is a small, deliberate port of the
bake logic (not a re-derivation), so the two never disagree.

---

## 1. `public/v0/regions.json`

Bare JSON array (mirrors "available Regions" from spec §5.1). One Region
object, field names verbatim from spec §3.8.

```json
[
  {
    "id": "reg_port_alder",
    "name": "Port Alder",
    "bounds": {
      "type": "Polygon",
      "coordinates": [[
        [-149.902, 61.1985], [-149.896, 61.1985],
        [-149.896, 61.2035], [-149.902, 61.2035], [-149.902, 61.1985]
      ]]
    },
    "frame": {
      "kind": "local_enu",
      "origin": { "lon": -149.9, "lat": 61.2, "elev_m": 0 },
      "utm_zone": null,
      "vertical_datum": "NAVD88"
    },
    "time_horizon": {
      "start": { "value": "1920", "precision": "year", "qualifier": "exact" },
      "end":   { "value": "1975", "precision": "year", "qualifier": "exact" }
    },
    "default_camera": {
      "lon": -149.9, "lat": 61.2, "height_m": 650,
      "heading_deg": 25, "pitch_deg": -32
    },
    "status": "active"
  }
]
```

Notes:
- `bounds` stays WGS84 (per spec §3.8) — it is nominal/illustrative for this
  demo and is **not** used by the client for rendering (rendering uses the
  local-meter geometry in `scene.json`).
- `frame.origin` is likewise nominal (a real lon/lat for flavor); the client
  never projects — it trusts `scene.json`'s local-meter coordinates directly.
- `time_horizon` is bounded (`start` **and** `end` both set) rather than
  open-ended, unlike the spec's Anchorage example — this demo's Region has a
  fixed 1920–1975 horizon so the timeline scrubber has fixed, known bounds.

---

## 2. `public/v0/scene.json` — window mode

Mirrors spec §5.1's window-mode `/v0/scene?from=&to=&frame=local`: **all
States valid at any point in `[from, to)`, grouped by Feature.** This bake
always covers the Region's whole time horizon (`from` = resolved
`time_horizon.start`, `to` = resolved `time_horizon.end`).

Top-level envelope:

```json
{
  "region_id": "reg_port_alder",
  "frame": "local",
  "from": "1920-01-01T00:00:00Z",
  "to": "1975-01-01T00:00:00Z",
  "features": [ /* Feature objects, see below */ ]
}
```

### Feature object (spec §3.2 field names, verbatim)

```json
{
  "id": "ftr_bld_04",
  "type": "building",
  "anchor": { "lon": -149.9, "lat": 61.2, "elev_m": 12.0 },
  "names": [
    {
      "value": "Alder Hotel",
      "interval": { "start": { "value": "1923", "precision": "year", "qualifier": "exact" }, "end": null },
      "assertion": {
        "id": "asr_ftr_bld_04_name",
        "subject": { "feature_id": "ftr_bld_04", "key": "name" },
        "value": "n/a",
        "sources": ["src_port_alder_directory"],
        "method": "manual_trace",
        "model_run": null,
        "derived_from": null,
        "status": "verified",
        "confidence": 0.92,
        "reviewed_by": "usr_jdavenport",
        "reviewed_at": "2026-06-01T00:00:00Z",
        "notes": "Name confirmed against townsite directory."
      }
    }
  ],
  "tags": { "address": "20 Main St", "block": "2", "lot": "5" },
  "states": [ /* State objects, see below — window-filtered, sorted by resolved start */ ]
}
```

### State object (spec §3.4 field names, verbatim)

```json
{
  "id": "st_bld_04_a",
  "feature_id": "ftr_bld_04",
  "interval": {
    "start": { "value": "1923", "precision": "year", "qualifier": "exact" },
    "end":   { "value": "1940", "precision": "year", "qualifier": "exact" }
  },
  "transition_in":  { "kind": "constructed", "duration_days": 100 },
  "transition_out": { "kind": "renovated" },
  "attributes": [
    { "key": "stories", "value": 2, "assertion": "asr_st_bld_04_a_rep" },
    { "key": "material", "value": "wood_frame", "assertion": "asr_st_bld_04_a_rep" },
    { "key": "use", "value": "hotel", "assertion": "asr_st_bld_04_a_rep" }
  ],
  "representations": [
    {
      "id": "rep_st_bld_04_a_lod1",
      "state_id": "st_bld_04_a",
      "lod": 1,
      "kind": "extrusion",
      "payload": {
        "footprint": {
          "type": "Polygon",
          "coordinates": [[[100, 100], [120, 100], [120, 115], [100, 115], [100, 100]]]
        },
        "height_m": 8.0,
        "height_basis": "stories*3.4",
        "material_class": "wood_frame"
      },
      "assertion": {
        "id": "asr_st_bld_04_a_rep",
        "subject": { "state_id": "st_bld_04_a", "key": "representation" },
        "value": "footprint+height+material",
        "sources": ["src_port_alder_1975_platbook"],
        "method": "manual_trace",
        "model_run": null,
        "derived_from": null,
        "status": "verified",
        "confidence": 0.9,
        "reviewed_by": "usr_jdavenport",
        "reviewed_at": "2026-06-01T00:00:00Z",
        "notes": "Traced directly from townsite plat / field notes."
      }
    }
  ]
}
```

Notes on geometry: `footprint.coordinates` are in **region-local meters**,
`[x_east, y_north]` per ring point, RFC 7946 winding — exterior ring CCW,
hole rings CW. `bake.py` normalizes winding on every ring (§9 requirement);
the client trusts the baked output and does not re-normalize (though Task 3's
`scene.js` may defensively re-normalize per spec §3.5 discussion — that's a
client-side call, not a contract requirement).

`transition_in` / `transition_out` may be `null` (e.g. the two road Features
and the water Feature, which are authored as pre-existing at the dawn of the
Region's horizon and never change) — client code must handle `null`, not
assume the object is always present.

### Deviations from spec v0.5 (documented, deliberate)

Spec §3.2/§3.4/§3.5 declare `Feature.states`, `State.representations`,
`Feature.names[].assertion` and `Representation.assertion` as **ID
references** (`"st_...", "rep_...", "asr_..."`), resolvable via
`GET /v0/features/{id}` or `GET /v0/assertions/{id}`. Neither endpoint exists
in this static demo (out of scope per the demo-slice plan). Since Task 3's
side panel must display full Assertion detail (method/status/confidence/
sources) without a second fetch, this bake **inlines full objects in place of
those two reference fields**:

1. `Feature.states` is an array of full **State objects** (not id strings).
2. `State.representations` is an array of full **Representation objects**
   (not id strings), and `Representation.assertion` is a full **Assertion
   object** (not an id string).
3. `Feature.names[].assertion` is likewise a full **Assertion object**.

The field *names* are unchanged from spec §3 (G3 compliance); only the
*value type* behind `states`, `representations`, and `assertion` changes,
and only because the reference targets they'd normally point at
(`/v0/features/{id}`, an assertions endpoint) are not part of this demo's
API surface. `State.attributes[].assertion` was already a bare id string in
spec §3.4's own example (`"assertion": "asr_..."` inside the attribute
entry) and stays a bare id string here too, pointing at the same
Representation Assertion's `id` (v0's "one assertion covers the whole
payload" rule, spec §3.5) — no separate attribute-level assertion objects
are baked.

No other field is renamed, dropped, or invented. `State.interval` stays raw
FuzzyDate objects (not pre-resolved) — resolution happens identically in
`bake.py` (for validation) and in the client's `src/fuzzydate.js` (for
rendering/scrubbing), per G2.

---

## 3. `public/v0/timeline.json`

Mirrors spec §5.1's `/v0/timeline`: a flat, **`t`-sorted** array of change
entries, Events already joined in via `event_id`.

```json
[
  { "t": "1920-05-01T00:00:00Z", "feature_id": "ftr_bld_03", "change": "appear" },
  { "t": "1921-01-01T00:00:00Z", "feature_id": "ftr_bld_01", "change": "appear" },
  { "t": "1940-01-01T00:00:00Z", "feature_id": "ftr_bld_04", "change": "alter" },
  { "t": "1964-03-28T02:36:00Z", "feature_id": "ftr_bld_05", "change": "disappear", "event_id": "evt_1964quake" },
  { "t": "1964-03-28T02:36:00Z", "feature_id": "ftr_bld_06", "change": "disappear", "event_id": "evt_1964quake" },
  { "t": "1964-03-28T02:36:00Z", "feature_id": "ftr_bld_07", "change": "disappear", "event_id": "evt_1964quake" },
  { "t": "1964-03-28T02:36:00Z", "feature_id": "ftr_bld_08", "change": "disappear", "event_id": "evt_1964quake" },
  { "t": "1965-01-01T00:00:00Z", "feature_id": "ftr_bld_08", "change": "appear" }
]
```

(`1964-03-28T02:36:00Z` is `1964-03-27T17:36:00-09:00` normalized to UTC —
all four quake-destroyed buildings' `disappear` entries share this exact
`t`, since their States' `interval.end` is authored at the same instant as
`evt_1964quake.time`, per §0 above.)

- `t` is the **resolved** instant (ISO 8601 string, per §0 above) — unlike
  `scene.json`'s `State.interval`, which stays raw/unresolved, `timeline.json`
  entries are pre-resolved so the client can sort/seek without re-running
  FuzzyDate math. (`src/fuzzydate.js` is still needed client-side, for
  `scene.json`'s intervals.)
- `change` is one of `appear | alter | disappear`.
- `event_id` is present **only** when the underlying transition names an
  Event (in this dataset: every quake-caused `disappear`). Absent (key
  omitted), never `null`, when there is no Event.
- Derivation rule (implemented identically in `bake.py`), per Feature,
  states sorted by resolved start:
  1. The **first** State in the feature always emits `appear` at its
     resolved `interval.start`.
  2. For each subsequent State `S` immediately following state `P`: if
     `resolved(P.interval.end) == resolved(S.interval.start)` **and**
     `S.transition_in.kind` is `renovated` or `moved`, emit a single
     `alter` at that shared instant (not a disappear/appear pair — the
     building never stops existing, only its geometry/attributes change).
  3. Otherwise (a genuine gap, or `S.transition_in.kind == "constructed"`
     after a prior state ended — e.g. post-quake rebuilds), `S` emits its
     own `appear` at its start, in addition to (4) firing for `P`.
  4. Every State whose `interval.end` is non-null emits a `disappear` at
     its resolved end, **unless** the immediately-following State makes it
     a rule-2 `alter` instead (to avoid double-counting a renovation as
     both a disappear and an appear). `event_id` is taken from
     `transition_out.event_id` when present.
  5. A State with `interval.end == null` ("still extant") never emits a
     `disappear`.
  6. A State with `interval.start == null` ("existed since before our
     horizon") never emits an `appear`/`alter` either — there is no in-window
     instant to attach it to (this dataset's two roads and the water Feature
     use this: they predate 1920 and never emit a construction event).

---

## 4. `public/v0/events.json`

Bare JSON array of Event objects, spec §3.6 field names verbatim.

```json
[
  {
    "id": "evt_1964quake",
    "kind": "earthquake",
    "name": "Good Friday Earthquake (Port Alder)",
    "time": { "value": "1964-03-27T17:36:00-09:00", "precision": "instant", "qualifier": "exact" },
    "extent": {
      "type": "Polygon",
      "coordinates": [[[0, 0], [400, 0], [400, 300], [0, 300], [0, 0]]]
    },
    "media": [],
    "description": "M9.2 Good Friday Earthquake; harbor-front block liquefaction destroyed several Port Alder waterfront buildings."
  }
]
```

`extent` is in the same region-local meter frame as `scene.json` footprints
(a demo simplification — spec's canonical Event.extent is WGS84, but since
there is exactly one Region and no cross-region Event in this demo, baking
it directly in local meters avoids a pointless projection round-trip; this
is called out here so Task 3 doesn't need to guess).

---

## 5. Validation performed by `bake/bake.py` before writing output

- **G2** — every FuzzyDate/Interval resolved per §0 above; used both to sort
  and to validate G4.
- **G4** — per Feature, resolved State intervals must be pairwise
  non-overlapping (half-open `[start, end)`, per spec §3.4). Violation
  raises `bake.BakeError` (a `ValueError` subclass, so `except ValueError`
  also catches it) naming the offending `feature_id` and both State ids —
  bake aborts, no partial output is written (fail loud, never fake).
- **G9** — every footprint/extent ring is inspected via the shoelace
  formula; exterior rings are forced CCW and hole rings CW regardless of how
  they were authored in the source (the source dataset deliberately
  contains one reversed-winding exterior ring, `ftr_bld_12`, to exercise
  this).
- **Assertion inlining** — every `Representation.assertion` and
  `Feature.names[].assertion` id is resolved against the source's
  `assertions` map and replaced with the full Assertion object (see
  "Deviations from spec v0.5" above). An unresolvable assertion id also
  raises `bake.BakeError` — bake never silently emits a dangling reference
  or drops assertion data.
