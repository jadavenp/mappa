"""Ring-winding normalization per RFC 7946 (G9): exterior ring CCW, holes CW.

Stdlib-only. Operates on GeoJSON-shaped `Polygon.coordinates`: a list of
rings, each ring a list of `[x, y]` points with the first point repeated as
the last (closed ring). Ring 0 is the exterior; subsequent rings are holes.
"""


def signed_area(ring):
    """Shoelace formula. Positive => CCW, negative => CW (standard math
    convention: x increases rightward, y increases upward — matches our
    local ENU frame, x_east/y_north)."""
    total = 0.0
    n = len(ring)
    for i in range(n - 1):  # last point duplicates the first; don't double-count
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        total += (x0 * y1) - (x1 * y0)
    return total / 2.0


def is_ccw(ring):
    return signed_area(ring) > 0


def normalize_polygon_coordinates(coordinates):
    """Return new coordinates with ring 0 forced CCW and every hole ring
    (index >= 1) forced CW. Never mutates the input."""
    normalized = []
    for i, ring in enumerate(coordinates):
        want_ccw = (i == 0)
        ring_is_ccw = is_ccw(ring)
        if ring_is_ccw != want_ccw:
            normalized.append(list(reversed(ring)))
        else:
            normalized.append(list(ring))
    return normalized
