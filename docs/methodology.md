# Methodology: From Historical Map Sheet to 4D Scene

This documents the full, replicable pipeline used to turn a scanned historical fire-insurance map into a time-scrubbable 3D region in this app. It was first executed for `reg_anchorage_downtown` (Sanborn Anchorage 1916 + 1922); follow it verbatim to add another region or another survey year. Nothing in this pipeline requires any specific tool to execute — steps are described so a human with an image viewer or an AI agent with vision can perform them identically.

## 0. Principles

- **One Feature per physical building.** A building appearing on multiple survey years is ONE Feature whose States span the years. Independent per-year traces are forbidden — they produce duplicate Features and phantom appear/disappear glitches when scrubbing.
- **Fail loud, never fake.** Illegible label → `names: []`, not a guess. Unknown construction date → a `circa` FuzzyDate spanning the honest uncertainty window, not fake precision.
- **Every fact carries provenance.** Each assertion cites the sheet it was read from (see §3 citation format).
- **The bake validates.** Per-feature state-interval non-overlap and ring-winding normalization are enforced by `bake/bake.py`; trust it to catch interval math errors.

## 1. Source acquisition & license verification

1. Candidate sources: Library of Congress Sanborn Maps collection (`loc.gov/collections/sanborn-maps/`), mirrored at full resolution on Wikimedia Commons (search `Sanborn <town>` in the File namespace via the Commons API when loc.gov blocks bots). Alternatives evaluated and documented: NLS OS Town Plans (CC-BY, no direct download), NYPL insurance atlases (PD, download friction), David Rumsey (CC-BY-NC-SA — the NC clause is a landmine for any future commercial use; avoid).
2. License gate (spec Gate E0): verify the sheet's publication year makes it unambiguously US public domain (our sheets: 1916, 1922 — pre-1930, no doubt). Record the rights statement.
3. Prefer a town with sheets from **two or more survey years covering the same blocks** — that is what makes the time dimension real. Verify overlap visually before committing (survey sets grow: Anchorage 1916 = 3 sheets, 1922 = 6 sheets; the same downtown blocks moved from sheet 1 to sheet 3).
4. Download the full-resolution JPG (typically 6510×7680 for LoC Sanborn scans). Commit it to `data/source_images/` — the repo archives its own evidence; never depend on a live URL not rotting.

## 2. Crop preparation

Tracing works on per-block crops, not the full sheet (labels are legible at full resolution; whole-sheet reading invites miscounts).

```bash
# identify block positions on a ~1500px preview first
sips -Z 1500 sheet.jpg --out preview.jpg
# then cut generous full-resolution crops per block (offsets scale by fullwidth/previewwidth)
sips -c <height> <width> --cropOffset <y> <x> sheet.jpg --out crops/<year>_block<N>.jpg
```

Cut generously — include the block number labels and street names at the edges. A crop may show two rows of the SAME block split by a mid-block alley; confirm block identity from the printed block numbers, not from visual grouping.

## 3. Reading a Sanborn sheet (key)

- **Number inside a footprint** = stories (`1`, `1½`, `2`). Height rule for LOD1: `height_m = stories × 3.5` (1½ → 5 m), asserted with `method: "inference"` and the rule stated in `notes`.
- **Color** = construction: yellow = `wood_frame`, pink/red = `brick`, blue = `concrete`.
- **Labels**: business names run vertically inside footprints; `D` = dwelling; sheds/stables/garages labeled; tents drawn hatched (skip tents unless substantial). Lot numbers run along block edges; street names along avenues; small footnote numerals near lot lines are dimensions in feet.
- **Scale of Feet** bar (bottom margin) calibrates the grid.

Trace every distinguishable building including labeled outbuildings. Do not invent names: a name goes into `names[]` only if actually legible on the crop.

## 4. Shared block grid (the alignment guarantee)

Before any tracing, fix a deterministic block grid in region-local meters — see `data/source/anchorage-downtown.grid.md` for the executed example (block dims from the Scale of Feet: blocks ≈ 300×260 ft, avenues ≈ 80 ft, streets ≈ 60 ft; block 28 SW corner anchors the origin). **Both survey years snap to this same grid**, which guarantees a persisted building occupies identical coordinates in every year. Footprints are placed lot-index-proportionally within their block (block-level fidelity, not pixel georeferencing — a documented, accepted approximation).

## 5. Baseline trace (earliest year)

One pass, blocks in scope only. Per building: Feature (`ftr_axx_<block>_<seq>`), grid-snapped footprint, height per §3, material per color, legible names, `tags {block, lot, use}`, one State with a `circa` start covering the honest window (Anchorage: `{value:"1915", earliest:"1915-01", latest:"1916-09", qualifier:"circa"}` — townsite platted 1915, sheet proves existence by 1916-09), `end: null`, LOD1 extrusion Representation, and an assertion with **dual citation**:

```json
{"kind": "sanborn_sheet", "loc_item": "sanborn00111_001", "sheet": 1, "year": 1916,
 "block": 28, "loc_url": "https://www.loc.gov/item/sanborn00111_001/",
 "retrieved_from": "<exact Wikimedia Commons file URL the bytes came from>",
 "archived_copy": "data/source_images/anchorage_1916_s1.jpg"}
```

Add the survey itself as an Event (`kind: "survey"`, instant precision with UTC offset) so the timeline shows when the evidence was observed.

## 6. Reconcile pass (each later year)

A **separate pass by fresh eyes** (a different person/agent than the baseline — this keeps counts honest). Against the baseline roster, classify every building on the later sheet:

| Class | Rule |
|---|---|
| PERSISTED | Same lot, compatible footprint/label. Footprint reused VERBATIM; state unchanged; add the later sheet's citation to `sources[]`. Name change on the same structure = new entry in `names[]`, not a new state. |
| ALTERED | Same building, visibly changed (stories/extension). Close the old state `circa` mid-window, new state with `transition_in: renovated` + new representation + later citation. |
| NEW | Only on later sheet. New Feature, `circa` start spanning the between-surveys window (`{value:"1917", earliest:"1916-10", latest:"1922-09", qualifier:"circa"}`), `transition_in: constructed`. |
| GONE | Only on earlier sheet. Close the state `circa` mid-window with `transition_out: {kind:"demolished"}`. |

Ambiguous unlabeled outbuildings: identical position → PERSISTED; clearly moved → GONE + NEW. Log every named-building classification and every ambiguous call in the pass report.

## 7. Independent QA (do not skip)

A reviewer who did NOT produce the trace: (a) recounts buildings per block directly from the crops — tolerance ±3 per block for ambiguous outbuildings; systematic bias or any invented name is a hard fail; (b) verifies a sample of named buildings (name legible on crop, material matches color, height matches stories rule, citations complete); (c) checks grid math (block rectangles, street gaps, no cross-block overlaps); (d) confirms persisted footprints are byte-identical across years. Executed examples with evidence tables: `docs/trace-reports/`.

## 8. Bake, verify, deploy

```bash
python3 -m unittest discover bake   # FuzzyDate math, non-overlap, winding, multi-region layout
python3 bake/bake.py                # data/source/*.json -> public/v0/{region_id}/...
npm run build                       # Vite, base '/mappa/'
npm run preview                     # then drive the real page (region picker, scrub, inspector)
# deploy: push dist/ contents to the gh-pages branch (pushing main alone does NOT update the site)
```

Browser verification drives `window.__mappa` (`setTime(t)`, `getState()`, `screenshot()` — in-page render-target capture, no OS permission needed) and asserts visible-building counts at probe times against `timeline.json` cumulative appear/disappear math.

## Executed instances

- `reg_port_alder` — fictional control region (hand-invented data; documents the 1964-quake event mechanics).
- `reg_anchorage_downtown` — real data, blocks 28/29/40, Sanborn Anchorage Sept 1916 (sheet 1) + Sept 1922 (sheet 3). Trace evidence: `docs/trace-reports/`.
