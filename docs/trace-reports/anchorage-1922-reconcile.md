# Task 7c — 1922 Reconcile Pass (fresh-eyes pass against the 1916 baseline)

Source: `data/source_images/anchorage_1922_s3.jpg` (Sanborn Anchorage, Sept 1922,
sheet 3, LoC item `sanborn00111_002`), crops `a1922_block{28,29,40}.jpg`.
Reconciled against the committed 1916 baseline (`ftr_axx_{28,29,40}_*`, 86
Features) per `docs/methodology.md` §6.

## Per-block reconcile table

| Block | PERSISTED | ALTERED | NEW | GONE |
|---|---|---|---|---|
| 28 | 26 | 2 | 1 | 11 |
| 29 | 8 | 1 | 2 | 10 |
| 40 | 12 | 1 | 4 | 15 |
| **Total** | **46** | **4** | **7** | **36** |

46 + 4 + 36 = 86 (all 1916 features accounted for). 7 new Features added → 93
total Features after reconcile.

## Named-building classification (every named 1916/1922 building)

| Feature / new building | Block | Class | Notes |
|---|---|---|---|
| Unfinished Hotel → "Hotel" | 28 | PERSISTED | Renamed only (finished by 1922); footprint verbatim. |
| Wilkes Cabinet Shop | 28 | GONE | Rear structure behind Hotel; no footprint visible in 1922 crop. |
| McCain's Studio | 28 | ALTERED | Site now labeled "D" (dwelling), footprint widened; converted use. |
| Frisco Cafe | 28 | PERSISTED | 1922 label genericized to "Rest."; not re-named (avoid inventing a business name not legible). |
| California Pool Hall | 28 | PERSISTED | New name "Cigars & Tobacco" added. |
| Matanuska Hardware Co. | 28 | PERSISTED | New name "Laundry" added. |
| Paint & Oils | 28 | PERSISTED | New name "Wall Paper, Linoleum, Paints & Oils". |
| Sanitary Market | 28 | PERSISTED | 1922 label generic "Rest."; not re-named. |
| W.W. Butts | 28 | PERSISTED | New name "Candy". |
| Paint Shop | 28 | PERSISTED | New name "Tailor". |
| Riverside Hotel | 28 | GONE | Far-east lot cleared; hotel-scale footprint absent in 1922. |
| Garage (named) | 28 | GONE | Same east-lot clearing as Riverside Hotel. |
| new dwelling (28_40) | 28 | NEW | Small unnamed dwelling on the cleared Riverside Hotel/Garage lot. |
| Knik Hardware Co. | 29 | GONE | Absorbed into Parson's Hotel expansion footprint. |
| Parsons Hotel | 29 | ALTERED | Rebuilt/expanded to 3 stories, absorbing the Knik Hardware lot; material kept `wood_frame` (no color evidence of concrete on the sheet — fail loud, not inferred). |
| Annex | 29 | NEW | Labeled addition behind the rebuilt hotel. |
| Lodgings | 29 | GONE | West lots (847/839 on 1922 addressing) drawn vacant. |
| Northern Pool Hall | 29 | GONE | Same vacant-lot area. |
| Denver Rooms | 29 | PERSISTED | New name "Cigars & D". |
| Laundry | 29 | PERSISTED | New name "Jap Laundry". |
| U.G. Crocker Furniture | 29 | GONE | Site relabeled to a distinct new business. |
| Needle Work | 29 | NEW | New shop on the former Crocker Furniture lot. |
| Empress Building | 29 | PERSISTED | New name "Apartments" (still same large mixed-commercial structure). |
| Bolte Hardware | 40 | GONE | Wood-frame 2-story hardware store absent; area now part of the enlarged concrete complex. |
| Empress Theatre Building | 40 | PERSISTED | Concrete, present both years per acceptance criterion; new tenant name "Moving Pictures" added. |
| Fowler Building | 40 | PERSISTED | New name "Photo". |
| Alaska Building | 40 | PERSISTED | New name "Bank". |
| Ford Garage / Auto Accessories | 40 | NEW | Large 3-story building (2nd/3rd-floor apartments) replacing several small 1916 shops (cobbler, offices, tailors — all GONE). |
| Plumbing | 40 | ALTERED | Renamed "Plumbg & Sheet Metal Shop"; gains an attached tent-roofed wing, footprint extended. |
| Groceries | 40 | PERSISTED | New name "Cyclery & D". |
| Storage | 40 | GONE | Footprint absorbed/cleared alongside the Groceries-site rebuild. |
| Heavy Hardware Warehouse | 40 | NEW | Replaces the 1916 blacksmith shop (GONE); no story count legible, so stories carried as 1 rather than inferred. |
| unnamed dwelling → "Cont. Off." | 40 | PERSISTED | Far-west lot, name added (contractor's office). |
| Gro. (grocery, generic) | 40 | NEW | Generic abbreviation only — `names: []` (not invented). |
| Hardw. (small unit, generic) | 40 | NEW | Generic abbreviation only — `names: []`. |

## Ambiguous calls (logged)

- **North-row rear outbuildings, block 28 (28_06/07/08/09/10)** — not visibly redrawn in the 1922 crop behind the altered Lodgings/Hotel row; called GONE rather than PERSISTED given the visible redevelopment in that strip. Tolerance-band call, not a hard identification.
- **South-row rear outbuildings, blocks 28 (28_11/12/15/17/18/22/23/24/26/27/28)** — smaller sheds/outbuildings behind the south (4th Ave) frontage row were left PERSISTED by default (identical position, no visible evidence of clearing) per the methodology's ambiguous-outbuilding rule.
- **Block 29 rear outbuildings (29_03 PERSISTED vs 29_05/07/08/18/19 GONE)** — the ones sitting inside the newly-expanded Parson's Hotel/vacant-lot footprints were called GONE; the one adjacent to the persisted dwelling (29_02→29_03) was left PERSISTED.
- **Block 40 rear outbuildings** — north-row rear (40_02/03/06/10, behind the new Ford Garage/Gro/Hardw complex) called GONE (footprint conflict with new construction); south-row rear (40_18/20/25) left PERSISTED, 40_23 called GONE (overlaps the Plumbing shop's new tent-wing addition).
- **Parson's Hotel material** — 1922 crop shows no fill color on the expanded hotel outline (unusual for a wood-frame Sanborn entry); rather than infer `concrete`, `wood_frame` was carried forward from the 1916 state (fail loud, not faked).
- **Gro./Hardw. small units, block 40** — generic abbreviations only, not treated as legible proper names; `names: []` per GA1's "do not invent" rule.

## Verification evidence

- `python3 -m unittest discover bake` — 33 tests, all pass.
- `python3 bake/bake.py` — `reg_anchorage_downtown: 93 features, 97 states, 133 timeline entries, 2 events`.
- `public/v0/reg_anchorage_downtown/events.json` — both `evt_1916survey` (1916-09-15) and `evt_1922survey` (1922-09-15) present.
- `public/v0/reg_anchorage_downtown/timeline.json` change counts by resolved instant:
  - `1915-01-01T00:00:00Z` appear ×86 (1916 baseline)
  - `1917-01-01T00:00:00Z` appear ×7 (NEW)
  - `1919-01-01T00:00:00Z` alter ×4 (ALTERED)
  - `1919-01-01T00:00:00Z` disappear ×36 (GONE)
  - All figures match the reconcile table exactly.
- Persisted-footprint byte-identity check (`git show HEAD:...` vs working tree) for `ftr_axx_40_13` (Empress Theatre Building), `ftr_axx_28_01` (Hotel), `ftr_axx_29_17` (Empress Building/Apartments), `ftr_axx_40_15` (Alaska Building) — all `True`.
- `npm run build` — clean, no errors (only the pre-existing chunk-size advisory from Babylon.js).
