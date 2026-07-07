// Orchestration only: api loads -> scene builds -> timeline binds -> panel
// binds. Loading indicator until first frame; hard error banner on any load
// failure (fail loud, never fake/fallback).

import { getRegions, getSceneWindow, getTimeline, getEvents } from './api.js';
import { initScene, buildFeatures, applyVisibility } from './scene.js';
import { initTimeline } from './timeline.js';
import { initPanel } from './panel.js';
import { initInspector } from './inspector.js';
import { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools';

const DEFAULT_REGION_ID = 'reg_port_alder';

function showLoading(label) {
  const el = document.createElement('div');
  el.id = 'mappa-loading';
  el.textContent = `Loading ${label}…`;
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

// GA3: the picker's only job is to set ?region=<id> and let the browser do
// a full page reload — no in-place scene teardown/rebuild.
function initRegionPicker(container, regions, currentRegionId) {
  container.innerHTML = '';

  const label = document.createElement('label');
  label.setAttribute('for', 'region-picker');
  label.textContent = 'Region';

  const select = document.createElement('select');
  select.id = 'region-picker';
  for (const region of regions) {
    const opt = document.createElement('option');
    opt.value = region.id;
    opt.textContent = region.name || region.id;
    if (region.id === currentRegionId) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const params = new URLSearchParams(window.location.search);
    params.set('region', select.value);
    window.location.search = params.toString();
  });

  container.appendChild(label);
  container.appendChild(select);
}

async function boot() {
  const requestedRegionId =
    new URLSearchParams(window.location.search).get('region') || DEFAULT_REGION_ID;

  const loadingEl = showLoading(requestedRegionId);

  let regions;
  try {
    regions = await getRegions();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
    throw err;
  }

  const region = regions.find((r) => r.id === requestedRegionId);
  if (!region) {
    const validIds = regions.map((r) => r.id).join(', ');
    showError(
      `Unknown region "${requestedRegionId}" — valid regions: ${validIds}`
    );
    throw new Error(`region "${requestedRegionId}" not found`);
  }

  const topbarEl = document.getElementById('topbar');
  initRegionPicker(topbarEl, regions, region.id);

  let sceneWindow;
  let timeline;
  let events;
  try {
    [sceneWindow, timeline, events] = await Promise.all([
      getSceneWindow(region.id),
      getTimeline(region.id),
      getEvents(region.id),
    ]);
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
    throw err;
  }

  if (sceneWindow.region_id !== region.id) {
    showError(
      `scene.json region_id "${sceneWindow.region_id}" does not match requested region "${region.id}"`
    );
    throw new Error(
      `scene.json region_id mismatch: expected "${region.id}", got "${sceneWindow.region_id}"`
    );
  }

  try {
    const canvas = document.getElementById('scene');
    const { scene } = initScene(canvas, region);
    const { entries } = buildFeatures(scene, sceneWindow);

    const panelEl = document.getElementById('panel');
    initPanel(panelEl, scene, entries, timeline, events);

    initInspector(topbarEl, region, sceneWindow, timeline);

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
      // Verification-only helper: engine wasn't created with
      // preserveDrawingBuffer, so a bare canvas.toDataURL() would be blank.
      // Renders to an offscreen render target instead (no engine/production
      // behavior change) and returns a PNG data URL.
      screenshot(width = 1280, height = 720) {
        return CreateScreenshotUsingRenderTargetAsync(
          scene.getEngine(),
          scene.activeCamera,
          { width, height }
        );
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
