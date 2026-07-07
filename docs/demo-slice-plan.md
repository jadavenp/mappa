# Mappa Demo Slice — Implementation Plan

## Context

Canonical spec: `/Users/jamesdavenport/Downloads/mappa-reconciliation-output/mappa-consolidated-spec-v0.5.md` (spec v0.5) and `mappa-implementation-plan-v2.md`. This repo implements a **client-only static demo slice** — tickets A1/C1/C2-lite — with three approved deviations from the letter of those docs:

1. No FastAPI/PostGIS — data pre-baked to static JSON (the spec §11 swap path; baked vs live fulfillment is interchangeable by design).
2. Fictional demo region ("Port Alder") authored **directly in region-local meters** — no WGS84 source data, no projection module.
3. Vanilla JS client (no React/Zustand) — deliberate demo shortcut; the real client per spec §8 comes later.

The demo proves the render + temporal-scrub + swap-seam loop with hand-authored data. It does NOT de-risk the real C2 React-boundary work or real Sanborn data ingestion.

## Global Constraints (binding on every task)

- **G1 — API-shape fidelity (success payloads only).** Baked JSON mirrors the *success* response shapes of spec §5 `GET /v0/regions`, `GET /v0/scene` (window mode: all States valid in `[from,to)`, grouped by Feature, `frame=local`), and `GET /v0/timeline` (`[{t, feature_id, change: appear|alter|disappear, event_id?}]`). Do NOT implement the over-cap error envelope, ETag semantics, quadrant subdivision, or caps — false fidelity at demo scale.
- **G2 — FuzzyDate semantics per spec §3.3.** `{value, earliest, latest, precision, qualifier}`; query resolution uses `value` ONLY; truncated values expand to calendar intervals (`"1922"` → `[1922-01-01, 1923-01-01)`); intervals are half-open `[start,end)`; interval `end` resolves to its expansion's lower bound; null bounds → ∓infinity; `precision: instant` carries a UTC offset.
- **G3 — Data model field names per spec §3.** Feature: `id, type, anchor, names[], tags, states[]`. State: `id, feature_id, interval{start,end}, transition_in{kind,duration_days}, transition_out{kind,event_id}, attributes[], representations[]`. Representation: `id, state_id, lod, kind, payload{footprint, height_m, height_basis, material_class}, assertion`. Assertion: `id, subject, value, sources[], method, status, confidence, ...`. Event: `id, kind, name, time, extent, media[], description`. Transition kinds: `constructed|renovated|demolished|destroyed|moved|unknown`. Do not invent or rename fields.
- **G4 — States non-overlap invariant.** Per Feature, State intervals (resolved per G2) must not overlap. The bake step validates this and fails loud. Fail loud, never fake — no silent fallbacks anywhere.
- **G5 — Fetch isolation.** ALL data access in the client goes through `src/api.js`, whose exported functions are named after the API (`getRegions()`, `getSceneWindow(...)`, `getTimeline(...)`). No other module fetches. Every fetch URL is prefixed with `import.meta.env.BASE_URL`.
- **G6 — Scrub loop.** Prefetch scene window + timeline ONCE on load. Zero fetches and zero mesh re-creation churn during scrub — precompute meshes per State, toggle visibility by resolved interval. Buildings destroyed by the 1964 event snap at its instant.
- **G7 — Babylon rules.** Import from `@babylonjs/core` sub-paths (never the `babylonjs` UMD monolith). Pass `earcut` explicitly to polygon builders. `sideOrientation: DOUBLESIDE` on extruded meshes. Axis map: local east → Babylon +X, local north → Babylon +Z, up → +Y. WebGL2 target.
- **G8 — GitHub Pages base path.** Vite `base: '/mappa/'`. `public/.nojekyll` present. Nothing may fetch or reference an absolute `/...` path.
- **G9 — Coordinates.** All geometry is region-local meters, GeoJSON-style `[x_east, y_north]` rings, RFC 7946 winding (exterior CCW, holes CW). The bake normalizes winding; the client trusts it.
- Commit after each task with a descriptive message. No AI attribution beyond the standard trailer.

## Task 1 — Vite + Babylon scaffold

Create the project scaffold in `/Users/jamesdavenport/Projects/mappa` (repo already `git init`ed, plan + .gitignore present):

- `npm create vite@latest . -- --template vanilla` (adapt to non-empty dir; plain vanilla JS, no TS).
- `npm install @babylonjs/core earcut`.
- `vite.config.js` with `base: '/mappa/'`.
- `public/.nojekyll` (empty file).
- Strip Vite's counter demo; `index.html` with a `<canvas id="scene">`, a bottom bar placeholder for the timeline scrubber (`#timeline`), a side panel placeholder (`#panel`), minimal dark CSS (no framework).
- `src/main.js` that imports `Engine` and `Scene` from `@babylonjs/core` sub-paths, creates an engine on the canvas, renders an empty scene with a clear color, and logs `mappa demo boot ok` to console.
- `README.md`: two paragraphs — what this demo is, pointer to `docs/demo-slice-plan.md` and the canonical spec folder, `npm install && npm run dev` instructions.
- Acceptance: `npm run build` succeeds; `npm run preview` serves; page shows the empty scene canvas without console errors (verify with `curl` for 200s on `/mappa/` paths from the preview server and by checking the built `dist/index.html` references `/mappa/`-prefixed assets).
- Commit.

## Task 2 — Data contract, Port Alder dataset, bake script

All shapes per G1–G4, G9. Deliverables:

1. `spec/contract.md` — freeze the three baked-file shapes with one full worked example each: `public/v0/regions.json`, `public/v0/scene.json` (window mode covering the region's whole time horizon), `public/v0/timeline.json`. Also document `public/v0/events.json` (array of Event objects) since the timeline references `event_id`. This file is the contract between bake and client; Task 3 builds against it verbatim.
2. `data/source/port-alder.json` — hand-authored source dataset (plain JSON, no YAML dep):
   - Region: `id: "reg_port_alder"`, name "Port Alder", frame `{kind: "local_enu", origin: {lon: -149.9, lat: 61.2, elev_m: 0}}` (nominal, unused by client), `time_horizon: {start: "1920", end: "1975"}`, `default_camera` filled in plausibly, bounds a simple rectangle.
   - ~12 building Features + 2 road Features + 1 water Feature, footprints in local meters within roughly a 400×300m townsite. Buildings 6–20m tall, `material_class` varied (wood/brick/concrete).
   - Staggered history so the scrubber is alive across the whole range: several 1920s constructions, a couple of 1930s–40s additions, at least two `renovated` transitions (attribute/height change mid-life), the 1964-03-27 quake Event (`precision: instant`, with UTC offset) destroying 3–4 buildings (`transition_out {kind: "destroyed", event_id}`), 2–3 post-quake rebuild States (1965–1968), and 2–3 buildings persisting throughout.
   - At least one footprint with an interior hole and one authored with reversed winding (bake must normalize it).
   - Every State has ≥1 LOD1 `extrusion` Representation and ≥1 Assertion (`method: "manual_trace"`, `status: "verified"`, confidence ~0.9). FuzzyDates use varied precisions and `circa` qualifiers where flavorful.
3. `bake/bake.py` — stdlib-only Python 3. Reads the source file, then: resolves every FuzzyDate per G2; validates per-feature State non-overlap (G4, fail loud with feature id); normalizes ring winding per G9; derives the timeline change list (`appear` at state start, `alter` at a renovated transition between adjacent states, `disappear` at state end, `event_id` attached when the transition names one); writes the four `public/v0/*.json` files matching `spec/contract.md` exactly.
4. `bake/test_bake.py` — stdlib `unittest`: FuzzyDate expansion cases from G2 (year/month/day/instant, null bounds), overlap rejection (crafted overlapping input must raise), winding normalization, timeline derivation on a 2-state renovated feature. Runnable via `python3 -m unittest discover bake`.
- Acceptance: tests pass; `python3 bake/bake.py` produces the four files; committed output included (baked JSON is a build artifact but commit it — Pages serves it and the client dev loop needs it).
- Commit.

## Task 3 — Babylon client

Build the client against `spec/contract.md` and the baked files from Task 2 (already in `public/v0/`). Respect G5–G9. Files:

- `src/api.js` — `getRegions()`, `getSceneWindow()`, `getTimeline()`, `getEvents()`; static fetches of `${import.meta.env.BASE_URL}v0/*.json`; the ONLY module that fetches.
- `src/fuzzydate.js` — resolve FuzzyDate/interval to numeric time (ms or fractional year) per G2, shared by scene + timeline modules. Port the same semantics as bake (client-side mirror; keep it small).
- `src/scene.js` — engine + `ArcRotateCamera` (sensible limits), hemispheric + directional light, ground plane sized to region bounds, water/roads as flat tinted polygons slightly above ground, building extrusions via `ExtrudePolygon` (earcut explicit, DOUBLESIDE, holes supported), simple per-`material_class` colors. Build ALL state meshes once at load; store `{mesh, featureId, stateId, resolvedInterval}`.
- `src/timeline.js` — scrubber (range input styled into the bottom bar) spanning the region time horizon; year label; event tick marks (from events.json) on the track; on input, set current time `t` and toggle mesh visibility by `resolved_start <= t < resolved_end`. Zero fetches, zero mesh creation during scrub (G6). Buildings destroyed by the quake vanish exactly at the event instant.
- `src/panel.js` — pointer pick on meshes → side panel listing the Feature's name(s), type, and its States (interval, transition kinds, attributes, and each Assertion's method/status/confidence/sources). Highlight the picked building; click empty space to dismiss.
- `src/main.js` — orchestrate: api loads → scene builds → timeline binds → panel binds. Loading indicator until first frame; hard error banner on any load failure (fail loud).
- Acceptance: `npm run build` clean; `npm run preview` + `curl` confirms all `/mappa/v0/*.json` 200; no console errors on load (verify via a headless check if available, otherwise structural review + preview curls); scrubbing 1920→1975 shows town growth, quake destruction snap at 1964, rebuilds after.
- Commit.

## Task 4 — End-to-end verification + polish

- Run the full loop: `python3 -m unittest discover bake`, re-bake, `npm run build`, `npm run preview`.
- Drive the real page in Safari via `osascript` (load `http://localhost:4173/mappa/`, wait, execute JS in the tab to assert: no console errors captured via an injected error hook is not possible post-hoc — instead assert `document.querySelectorAll('canvas').length === 1`, that the app exposed `window.__mappa` state (add a small debug handle in main.js: current t, mesh count, visible count), and step `window.__mappa.setTime()` across 1920/1950/1963.9/1964.5/1970 asserting visible-mesh counts change in the expected direction). Take a screenshot per time step (`screencapture` of the Safari window) into `docs/verify/` and confirm buildings are visible right-side-up (not empty/black).
- Fix anything found (missing DOUBLESIDE symptoms, axis flips, base-path 404s).
- Tidy README with a screenshot.
- Commit.

## Task 5 — Deploy to GitHub Pages

- `gh repo create jadavenp/mappa --public --source . --push` (confirm remote name/URL; repo MUST be named `mappa` to match the `/mappa/` base).
- Add `.github/workflows/pages.yml`: official static-Pages flow — on push to main: setup node, `npm ci`, `python3 bake/bake.py`, `npm run build`, `actions/upload-pages-artifact` on `dist/`, `actions/deploy-pages`. Enable Pages via `gh api repos/jadavenp/mappa/pages -X POST -f build_type=workflow` (or `-X PUT` if it 409s).
- Push, watch the run with `gh run watch`, then verify `https://jadavenp.github.io/mappa/` returns 200 and the JSON files load (curl the page and `/mappa/v0/scene.json`).
- Commit anything added.

## Out of scope

FastAPI, PostGIS, React/Zustand, Atlas globe, terrain DEM, real Sanborn data (Gate E0), LOD2+ glTF, search, auth, ETag/caps/error envelopes.
