"""FuzzyDate / Interval resolution — shared semantics, per spec v0.5 §3.3 (G2).

Stdlib-only. This module is the bake-side implementation; the Babylon client
(Task 3, `src/fuzzydate.js`) is a deliberate small port of the same rules —
keep the two in lockstep if this file ever changes.

Resolution rules (normative, spec §3.3):
  1. Resolution is on `value` only; `earliest`/`latest`/`qualifier` are
     display metadata, never used for query/overlap logic.
  2. Truncated values expand to calendar intervals ("1922" -> [1922-01-01,
     1923-01-01)); an interval bound (start OR end) resolves to the
     expansion's LOWER bound.
  3. Bare (non-instant) dates are calendar dates with no timezone; we use a
     'Z' (UTC) suffix as an arbitrary-but-consistent convention documented in
     spec/contract.md.
  4. `precision: "instant"` values already carry a full ISO 8601 datetime
     with a UTC offset and resolve to that exact point, unmodified.
  5. Null bounds (the whole Interval.start/end is `null`, not a FuzzyDate
     object) resolve to -infinity / +infinity respectively.
"""
from datetime import datetime, timezone, timedelta

NEG_INF = None  # sentinel: -infinity
POS_INF = "9999-12-31T00:00:00Z"  # sentinel: +infinity (sorts after everything real)


def _parse_offset_datetime(value):
    """Parse a full ISO 8601 datetime string that may carry +HH:MM/-HH:MM or Z."""
    v = value
    if v.endswith("Z"):
        dt = datetime.fromisoformat(v[:-1]).replace(tzinfo=timezone.utc)
    else:
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    return dt


def resolve_fuzzy_date(fuzzy_date):
    """Resolve a single FuzzyDate object to an ISO 8601 UTC-normalized string
    (the expansion's lower bound, per rule 2), or None if fuzzy_date is None
    (meaning unbounded — caller decides -inf vs +inf by position)."""
    if fuzzy_date is None:
        return None

    precision = fuzzy_date["precision"]
    value = fuzzy_date["value"]

    if precision == "instant":
        dt = _parse_offset_datetime(value)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    if precision == "year":
        year = int(value)
        return f"{year:04d}-01-01T00:00:00Z"

    if precision == "month":
        year_s, month_s = value.split("-")
        return f"{int(year_s):04d}-{int(month_s):02d}-01T00:00:00Z"

    if precision == "day":
        year_s, month_s, day_s = value.split("-")
        return f"{int(year_s):04d}-{int(month_s):02d}-{int(day_s):02d}T00:00:00Z"

    raise ValueError(f"unknown FuzzyDate precision: {precision!r}")


def resolve_bound(fuzzy_date_or_none, is_start):
    """Resolve an Interval.start or Interval.end (each may be null) to a
    comparable ISO string, using NEG_INF/POS_INF sentinels for null bounds
    (rule 5). `is_start` picks which infinity a null bound represents."""
    if fuzzy_date_or_none is None:
        return NEG_INF if is_start else POS_INF
    return resolve_fuzzy_date(fuzzy_date_or_none)


def sort_key(resolved):
    """Comparable sort key for a resolved bound string, treating NEG_INF (None)
    as sorting before everything."""
    if resolved is NEG_INF:
        return ""
    return resolved


def resolve_interval(interval):
    """Resolve an Interval {"start": FuzzyDate|null, "end": FuzzyDate|null}
    to (resolved_start, resolved_end) comparable strings."""
    return (
        resolve_bound(interval.get("start"), is_start=True),
        resolve_bound(interval.get("end"), is_start=False),
    )
