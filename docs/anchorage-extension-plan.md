# Anchorage Real-Data Extension — Implementation Plan

## Context

Extends the shipped demo slice (see `docs/demo-slice-plan.md`; its Global Constraints G1–G9 remain binding). Adds a SECOND region traced from real, public-domain source imagery, a region picker, and a source-data inspector popup.

Source imagery (verified public domain, published pre-1931; LoC Sanborn collection via Wikimedia Commons mirrors, both 6510×7680 JPEG):
- 1916 sheet 1: Anchorage Sept 1916, LoC item sanborn00111_001 — downtown blocks 28/29/30, 38/39/40 (3rd–5th Ave, G–K streets)
- 1922 sheet 3: Anchorage Sept 1922, LoC item sanborn00111_002 sheet 3 — blocks 28/29, 39/40, 53/54 (3rd–6th Ave, G–I streets)
- Overlap traced for the demo: **blocks 28, 29, 40** (3rd–5th Ave between G and I streets)
- Full-res copies already downloaded to the session scratchpad as `anchorage_1916_s1.jpg` / `anchorage_1922_s3.jpg`

Story: boomtown densification 1916→1922 (real). Port Alder (fictional 1964 quake) stays as-is.

## Global Constraints (additional to G1–G9)

- **GA1 — Real provenance.** Every Anchorage assertion cites its actual source with DUAL citation — the LoC item of record AND the Commons file the bytes were actually retrieved from: `sources: [{kind: "sanborn_sheet", loc_item: "sanborn00111_001", sheet: 1, year: 1916, block: 29, loc_url: "<LoC item URL>", retrieved_from: "<Wikimedia Commons file URL>", archived_copy: "data/source_images/<file>.jpg"}]`, `method: "manual_trace"`. Heights derived from Sanborn story counts use `method: "inference"` with the rule stated in notes (3.5 m per story, 1½ story = 5 m). Do NOT invent addresses/names not legible on the sheets; a building with an illegible label gets `names: []` and tags only for what is legible.
- **GA2 — Multi-region layout.** `/v0/regions.json` becomes an array of both regions. Per-region files move to `/v0/{region_id}/scene.json|timeline.json|events.json`. `spec/contract.md` is updated accordingly (this matches spec §5's `?region=` param in static form). `api.js` functions take a `regionId` argument. Port Alder's baked data moves into the new layout — one scheme, no legacy special case. Region id convention: `reg_` prefix everywhere — new region is `reg_anchorage_downtown`.
- **GA3 — Region picker via full page reload.** Simple select control (top bar) listing regions from regions.json; choosing one navigates to `?region=<id>` (full page reload — NO in-place scene teardown/rebuild; the auditor confirmed the current code has unremovable pointer/resize subscriptions that leak on in-place rebuild, and a static demo has no cross-region state worth preserving). `main.js` reads `?region=` at boot (default: `reg_port_alder`, the shipped, proven region). No router, no framework.
- **GA4 — Source images ship with the app.** Full-res JPGs committed under `data/source_images/` (provenance archive). Web-sized derivatives (~2000px, ~<1.5MB) under `public/sources/` for the inspector. Attribution line (LoC Sanborn Maps collection, public domain) in README and inspector.
- **GA5 — Inspector popup.** A "Data" button opens an overlay with two tabs: (1) **Source** — the region's source sheet image(s), pan/zoomable (CSS transform, ~30 lines, no library), with caption + LoC link + attribution; Port Alder's source tab states plainly that its data is hand-invented (fail loud, never fake). (2) **JSON** — the region's baked scene/timeline JSON pretty-printed, with a pop-out button opening the raw JSON file in a new tab (BASE_URL-built per G8). The inspector receives its data BY PARAMETER from main.js's already-fetched objects — it must not fetch (G5); source-image URLs also BASE_URL-built. Deferred (not v1): live sync/highlighting of which states are visible at the current scrubber time.
- Time semantics: region time_horizon 1914–1925. Buildings on both sheets: one state `[1916-09 (or "circa 1915" if construction date unknown), null/…]`. Buildings only on 1922 sheet: `interval.start` FuzzyDate `{value:"1917", earliest:"1916-10", latest:"1922-09", qualifier:"circa"}` — honest uncertainty, not fake precision. Buildings only on 1916 sheet: `transition_out {kind:"demolished"}` with similar circa end. The two survey Events (Sept 1916, Sept 1922, kind: "survey") ship in events.json so the timeline shows tick marks at the observation dates.

## Task 6 — Multi-region bake + client plumbing (no new data yet)

- Restructure bake to emit `/v0/regions.json` (array) + `/v0/{region_id}/…` from a per-region source file (`data/source/port-alder.json` unchanged in content, plus loop over `data/source/*.json`).
- Update `spec/contract.md` (shapes + one worked multi-region example) and bake tests (expect ≥3 new: regions array, per-region paths, unknown-region fail-loud).
- Update `src/api.js` (regionId params), `main.js` (region resolution from `?region=`, picker wiring), `timeline.js` (rebind on region switch), `scene.js` (teardown/rebuild).
- Acceptance: all bake tests pass; build clean; preview serves Port Alder identically to today under the new layout; picker renders with one region.

## Task 7 — Trace Anchorage blocks 28/29/40 (roster of PHYSICAL buildings, not per-sheet lists)

Core principle (auditor-mandated): the output is ONE roster of physical buildings. A building on both sheets = ONE Feature whose state(s) span 1916→1922 with per-sheet citations — never two Features. Independent per-sheet traces are forbidden.

**7a — Shared block-grid template.** Derive once, deterministically: a small table in the source file (or a comment-documented constants block) fixing each block's rectangle in local meters — block 28 SW corner as origin anchor, 3rd/4th/5th Ave centerlines, G/H/I street x-lines, from the sheets' Scale of Feet (blocks ≈ 300×260 ft, streets 60–80 ft; feet→meters). Both years' footprints snap into this grid; lot numbers (legible on the sheets) index positions within a block.
**7b — 1916 baseline trace.** From the 1916 crops: every distinguishable building in blocks 28/29/40 → Features with footprints in the shared grid, height per story count (GA1), material from Sanborn color (yellow=wood_frame, pink/red=brick, blue=concrete), legible names/uses, block/lot tags, assertion citing the 1916 sheet (GA1 dual citation).
**7c — 1922 reconcile pass.** From the 1922 crops, against the 7b roster: classify each building as PERSISTED (reuse the 1916 footprint verbatim; extend/add state; add 1922 citation), ALTERED (new state, renovated transition), NEW (new Feature, circa start per GA-time rules), or GONE (transition_out demolished, circa end). Never re-derive coordinates for a persisted building.
- Input: high-res crops of blocks 28, 29, 40 from each sheet (controller supplies crop files; tracing agent Reads them). 7b and 7c run as SEPARATE agent passes to keep counts honest.
- Output: `data/source/anchorage-downtown.json` — region `reg_anchorage_downtown` ("Anchorage — 4th Ave & G–I St"), frame local_enu, origin at real Anchorage lon/lat (-149.89, 61.218 approx, elev 31 m).
- Acceptance: bake passes (non-overlap, winding); per-block building counts in the report spot-checked against the crops BY THE REVIEWER (not just "1916 < 1922"); persisted buildings byte-identical footprints across states; Empress Theatre (concrete, block 40) present both years; survey events at 1916-09/1922-09.

## Task 8 — Inspector popup + source images

- Implement GA4 + GA5: `src/inspector.js` (overlay, tabs, zoomable image, JSON view synced to current t), "Data" button in top bar, styles. Attribution in README.
- Acceptance: build clean; inspector opens/closes; Source tab shows the right sheet per region; JSON tab highlights currently-visible states; pop-out works with BASE_URL (G8).

## Task 9 — Verify + deploy

- Full loop: bake tests, bake, build, preview; Safari drive: region switch both ways, scrub Anchorage 1914→1925 (counts step up at circa starts, survey ticks visible), inspector screenshots for docs/verify/; per-era screenshots of Anchorage; then rebuild + push gh-pages, verify live URL serves both regions and source images.

## Out of scope

CV/automatic footprint extraction; georeferenced accuracy beyond block-level layout; the other blocks/sheets; Juneau/Ketchikan; terrain; the 1964 quake for Anchorage (our sheets end 1922).
