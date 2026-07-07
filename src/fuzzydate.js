// FuzzyDate / Interval resolution — client-side mirror of bake/fuzzydate.py
// (spec v0.5 §3.3, contract §0, G2). Keep this in lockstep with the Python
// implementation if either ever changes.
//
// Resolution rules (normative, spec §3.3):
//   1. Resolution is on `value` only; `earliest`/`latest`/`qualifier` are
//      display metadata, never used for query/overlap logic.
//   2. Truncated values expand to calendar intervals ("1922" -> [1922-01-01,
//      1923-01-01)); an interval bound (start OR end) resolves to the
//      expansion's LOWER bound.
//   3. Bare (non-instant) dates are calendar dates with no timezone; a 'Z'
//      (UTC) suffix is the arbitrary-but-consistent convention (matches bake).
//   4. `precision: "instant"` values carry a full ISO 8601 datetime with a
//      UTC offset and resolve to that exact point, normalized to UTC.
//   5. Null bounds (the whole Interval.start/end is `null`, not a FuzzyDate
//      object) resolve to -infinity / +infinity respectively.

export const NEG_INF = null; // sentinel: -infinity
export const POS_INF = '9999-12-31T00:00:00Z'; // sentinel: +infinity

function pad(n, width) {
  return String(n).padStart(width, '0');
}

/**
 * Resolve a single FuzzyDate object to an ISO 8601 UTC-normalized string (the
 * expansion's lower bound, per rule 2), or null if fuzzyDate is null/undefined
 * (caller decides -inf vs +inf by position via resolveBound).
 */
export function resolveFuzzyDate(fuzzyDate) {
  if (fuzzyDate == null) return null;

  const { precision, value } = fuzzyDate;

  if (precision === 'instant') {
    // value carries a full ISO 8601 datetime with a UTC offset, e.g.
    // "1964-03-27T17:36:00-09:00"; the JS Date parser understands this and
    // toISOString() normalizes to UTC.
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      throw new Error(`unparseable instant FuzzyDate value: ${value}`);
    }
    return dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  if (precision === 'year') {
    const year = parseInt(value, 10);
    return `${pad(year, 4)}-01-01T00:00:00Z`;
  }

  if (precision === 'month') {
    const [y, m] = value.split('-');
    return `${pad(parseInt(y, 10), 4)}-${pad(parseInt(m, 10), 2)}-01T00:00:00Z`;
  }

  if (precision === 'day') {
    const [y, m, d] = value.split('-');
    return `${pad(parseInt(y, 10), 4)}-${pad(parseInt(m, 10), 2)}-${pad(parseInt(d, 10), 2)}T00:00:00Z`;
  }

  throw new Error(`unknown FuzzyDate precision: ${precision}`);
}

/**
 * Resolve an Interval.start or Interval.end (each may be null) to a
 * comparable ISO string, using NEG_INF/POS_INF sentinels for null bounds
 * (rule 5). `isStart` picks which infinity a null bound represents.
 */
export function resolveBound(fuzzyDateOrNull, isStart) {
  if (fuzzyDateOrNull == null) return isStart ? NEG_INF : POS_INF;
  return resolveFuzzyDate(fuzzyDateOrNull);
}

/**
 * Resolve an Interval {"start": FuzzyDate|null, "end": FuzzyDate|null} to
 * [resolvedStart, resolvedEnd] comparable strings.
 */
export function resolveInterval(interval) {
  return [
    resolveBound(interval.start, true),
    resolveBound(interval.end, false),
  ];
}

/**
 * Convert a resolved bound (string, or NEG_INF/null) to a millisecond
 * timestamp for numeric comparison/scrubbing. NEG_INF -> -Infinity; POS_INF
 * and any real ISO string parse via Date.parse (POS_INF's far-future year is
 * within JS Date's representable range).
 */
export function resolvedToMs(resolved) {
  if (resolved == null) return -Infinity;
  const ms = Date.parse(resolved);
  if (Number.isNaN(ms)) {
    throw new Error(`unparseable resolved bound: ${resolved}`);
  }
  return ms;
}
