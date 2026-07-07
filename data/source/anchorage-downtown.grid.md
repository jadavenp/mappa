# Anchorage Downtown — Shared Block Grid (Task 7a)

Documents the coordinate-frame constants used to author
`data/source/anchorage-downtown.json`. This file is prose-only — `bake.py`
never reads it, and the source JSON carries no top-level `_grid` key (per the
plan: keep the JSON clean; bake only reads `region` / `features` / `events` /
`assertions`, so an extra key would have been silently ignored, but a
separate doc is clearer for anyone tracing the geometry by hand).

## Source measurement

The Scale of Feet bar on `data/source_images/anchorage_1916_s1.jpg` (visible
in full on the `a1916_block40.jpg` crop, bottom margin) was measured directly
in pixels: three ~50 ft segments (0→50, 50→100, 100→150) each span ~300 px,
giving ~6.0 px/ft at that crop's resolution — consistent with the plan's
approximation of block/street dimensions. Both blocks 28/29 (12-lot street
frontage) and block 40 (16-lot street frontage on its 4th Ave side) were
cross-checked against this scale bar and against the sheet's own lot counts;
the constants below use the plan's stated round numbers (300×260 ft blocks,
80 ft avenues, 60 ft streets), which the measured scale bar confirms to
within normal hand-drafting tolerance for a 1916 fire-insurance map.

## Block/street/avenue layout (verified against the full sheet, not just the crops)

Reading the full `anchorage_1916_s1.jpg` sheet index (not only the supplied
crops) was necessary to resolve the block numbering unambiguously: each
numbered block (28, 29, 40, …) is drawn as **two lot rows split by a
mid-block service alley**, with the block's number printed in that alley gap
— not two separate blocks. Block 28 and block 29 each show a north-fronting
row (facing 3rd Ave, lots 1–12) and a south-fronting row (facing 4th Ave,
lots ~41–56); block 40 shows a north-fronting row (facing 4th Ave, lots
1–16, including the Empress Theatre/Bank/Alaska Building/Fowler Building
concrete complex) and a south-fronting row (facing 5th Ave, lots ~41–52).
This resolved an apparent contradiction in the acceptance criterion
("Empress Theatre … block 40"): the theatre sits in block 40's own
4th-Ave-fronting row, not a neighboring block.

```
                              3rd Ave
   ┌───────────────┐H┌───────────────┐
   │   Block 29     │ │   Block 28    │
   │ (N row: 3rd Ave)│ │(N row: 3rd Ave)│
   │  ·· mid-alley ··│ │ ·· mid-alley ··│
   │ (S row: 4th Ave)│ │(S row: 4th Ave)│
   └───────────────┘ │└───────────────┘
   I st (west)        H st              G st (east)
                              4th Ave
                       ┌───────────────┐
                       │   Block 40     │
                       │ (N row: 4th Ave)│
                       │  ·· mid-alley ··│
                       │ (S row: 5th Ave)│
                       └───────────────┘
                              5th Ave
```

Block 29 is west of block 28 across H Street (plan constraint). Block 40 is
south of block 28 across 4th Avenue (plan constraint).

## Constants (meters, `FT = 0.3048`)

| Name | ft | m |
|---|---|---|
| `BLOCK_W` (H↔G / I↔H street-to-street) | 260 | 79.248 |
| `BLOCK_D` (avenue-to-avenue, each block's own north+alley+south depth) | 300 | 91.44 |
| `AVE_W` (avenue width, e.g. 4th Ave between block 28 and block 40) | 80 | 24.384 |
| `ST_W` (street width, e.g. H St between block 29 and block 28) | 60 | 18.288 |

Per-block lot counts (read directly off each crop's own frontage, used only
to space lots evenly across `BLOCK_W` — not claimed as surveyed lot widths):

| Block | north-row lots (fronts 3rd/4th Ave) | south-row lots (fronts 4th/5th Ave) |
|---|---|---|
| 28 | 12 (lots 1–12) | 16 (lots 41–56) |
| 29 | 12 (lots 1–12) | 13 (lots 41–53) |
| 40 | 16 (lots 1–16) | 12 (lots 41–52) |

## Local-meter origins (region-local ENU, `[x_east, y_north]`)

Block 28's SW corner is the origin anchor `(0, 0)`.

```
block 28 origin = (0, 0)
block 29 origin = (-(ST_W + BLOCK_W), 0)                    = (-97.536, 0)
block 40 origin = (0, -(AVE_W + BLOCK_D))                   = (0, -115.824)
```

Each block occupies local rectangle `[origin_x, origin_x + BLOCK_W] ×
[origin_y, origin_y + BLOCK_D]` (79.248 m wide × 91.44 m deep). Within a
block, buildings fronting the block's *north* edge (3rd/4th Ave) are placed
with their front wall at `origin_y + BLOCK_D`, extending south by the
building's depth; buildings fronting the block's *south* edge (4th/5th Ave)
are placed with their front wall at `origin_y`, extending north by the
building's depth. Rear/interior structures (sheds, secondary dwellings) are
offset an additional ~22–28 m back from the same frontage line so they never
spatially overlap the frontage row's own footprints — the block's ~91 m
depth comfortably fits both a frontage row (max ~18 m deep) and a rear row
without reaching the mid-block alley on the opposite side.

Lot positions within a row are evenly spaced across `BLOCK_W` by that row's
own lot count (west→east for both ascending lot-number rows, 1→12/16, and
descending lot-number rows, 56/53/52→41) — a simplification (real lots were
not perfectly uniform width) acceptable at the block-layout precision this
demo targets (out of scope per the plan: "georeferenced accuracy beyond
block-level layout").

## Global frame anchor

`reg_anchorage_downtown.frame.origin` = real Anchorage lon/lat
`{lon: -149.89, lat: 61.218, elev_m: 31}`, matching the plan. All
`Feature.anchor` values in the baked scene reuse this single point (the
client renders from `scene.json`'s local-meter footprints, not from
per-building lon/lat, per the same convention `port-alder.json` already
uses).
