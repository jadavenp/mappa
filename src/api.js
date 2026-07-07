// G5: the ONLY module that fetches. Every URL is prefixed with
// import.meta.env.BASE_URL so this works under Vite's configured base
// ('/mappa/') both in dev and in the built/previewed app (no absolute
// '/...' paths, per G8).

const BASE = import.meta.env.BASE_URL;

async function fetchJson(relativePath) {
  const url = `${BASE}v0/${relativePath}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// regions.json stays at the top level (GA2) — one array covering every
// region, used both at boot and by the region picker.
export function getRegions() {
  return fetchJson('regions.json');
}

// Everything else is per-region, at /v0/{regionId}/... (GA2).
export function getSceneWindow(regionId) {
  return fetchJson(`${regionId}/scene.json`);
}

export function getTimeline(regionId) {
  return fetchJson(`${regionId}/timeline.json`);
}

export function getEvents(regionId) {
  return fetchJson(`${regionId}/events.json`);
}
