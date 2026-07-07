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

export function getRegions() {
  return fetchJson('regions.json');
}

export function getSceneWindow() {
  return fetchJson('scene.json');
}

export function getTimeline() {
  return fetchJson('timeline.json');
}

export function getEvents() {
  return fetchJson('events.json');
}
