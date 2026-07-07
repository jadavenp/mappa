// Orchestration only: api loads -> scene builds -> timeline binds -> panel
// binds. Loading indicator until first frame; hard error banner on any load
// failure (fail loud, never fake/fallback).

import { getRegions, getSceneWindow, getTimeline, getEvents } from './api.js';
import { initScene, buildFeatures, applyVisibility } from './scene.js';
import { initTimeline } from './timeline.js';
import { initPanel } from './panel.js';

function showLoading() {
  const el = document.createElement('div');
  el.id = 'mappa-loading';
  el.textContent = 'Loading Port Alder…';
  document.body.appendChild(el);
  return el;
}

function hideLoading(el) {
  el?.remove();
}

function showError(message) {
  document.getElementById('mappa-loading')?.remove();
  const el = document.createElement('div');
  el.id = 'mappa-error';
  el.textContent = message;
  document.body.appendChild(el);
}

async function boot() {
  const loadingEl = showLoading();

  let regions;
  let sceneWindow;
  let timeline;
  let events;
  try {
    [regions, sceneWindow, timeline, events] = await Promise.all([
      getRegions(),
      getSceneWindow(),
      getTimeline(),
      getEvents(),
    ]);
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
    throw err;
  }

  const region = regions.find((r) => r.id === sceneWindow.region_id);
  if (!region) {
    showError(`region "${sceneWindow.region_id}" not found in regions.json`);
    throw new Error(`region "${sceneWindow.region_id}" not found`);
  }

  try {
    const canvas = document.getElementById('scene');
    const { scene } = initScene(canvas, region);
    const { entries } = buildFeatures(scene, sceneWindow);

    const panelEl = document.getElementById('panel');
    initPanel(panelEl, scene, entries, timeline, events);

    const timelineEl = document.getElementById('timeline');
    const tl = initTimeline(timelineEl, region, events, (tMs) => {
      applyVisibility(entries, tMs);
    });

    // Establish the first visible frame at the horizon start (no fetches,
    // no mesh creation — just the same visibility toggle scrubbing uses).
    tl.setTime(tl.minMs);

    window.__mappa = {
      setTime(t) {
        tl.setTime(t);
      },
      getState() {
        const visibleCount = entries.filter((e) => e.mesh.isEnabled()).length;
        return {
          t: tl.getTime(),
          meshCount: entries.length,
          visibleCount,
          webglVersion: scene.getEngine().webGLVersion,
        };
      },
    };

    hideLoading(loadingEl);
  } catch (err) {
    showError(`Failed to build scene: ${err.message}`);
    throw err;
  }
}

boot().catch((err) => {
  // Loud in the console too — the banner is for the user, this is for us.
  console.error('[mappa] boot failed', err);
});
