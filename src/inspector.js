// GA5 (Task 8): "Data" inspector — a full-screen overlay with two tabs.
//
// Source tab: the region's Sanborn sheet image(s), pan/zoomable via CSS
// transform (wheel zoom around cursor, drag pan; no library), with caption +
// LoC link + attribution. Port Alder has no real source imagery — its tab
// says so plainly (fail loud, never fake — GA5).
//
// JSON tab: pretty-printed scene.json / timeline.json for the CURRENT
// region, passed in by main.js from data it already fetched (G5 — this
// module does not fetch). Pop-out buttons open the raw baked JSON in a new
// tab via BASE_URL-built hrefs (G8).
//
// Deferred (not built here, per the plan): live sync/highlighting of which
// states are visible at the current scrubber time.

const BASE = import.meta.env.BASE_URL;

// Static, minimal per-region source-image config. regions.json carries no
// source-image metadata (by design — GA2 keeps that file to region/time/
// camera shape), so this small table lives here instead of round-tripping
// through data/source/*.json + bake for something purely presentational.
const SOURCE_CONFIG = {
  reg_anchorage_downtown: {
    kind: 'sheets',
    attribution:
      'Sanborn Fire Insurance Maps, Anchorage, Alaska — Library of Congress, Sanborn Maps collection (public domain).',
    images: [
      {
        url: 'sources/reg_anchorage_downtown/anchorage_1916_s1.jpg',
        label: '1916',
        caption:
          'Sanborn Fire Insurance Map, Anchorage, Alaska, Sept 1916, sheet 1 (Library of Congress, public domain).',
        locUrl: 'https://www.loc.gov/item/sanborn00111_001/',
      },
      {
        url: 'sources/reg_anchorage_downtown/anchorage_1922_s3.jpg',
        label: '1922',
        caption:
          'Sanborn Fire Insurance Map, Anchorage, Alaska, Sept 1922, sheet 3 (Library of Congress, public domain).',
        locUrl: 'https://www.loc.gov/item/sanborn00111_002/',
      },
    ],
  },
  reg_port_alder: {
    kind: 'fictional',
    note:
      'Port Alder is a fictional demo region. There is no real source imagery — every Feature, name, and state here was hand-invented for the demo, not traced from any historical record.',
  },
};

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildSourceTab(regionId) {
  const config = SOURCE_CONFIG[regionId];
  if (!config) {
    return `<div class="inspector-empty">No source-image config for region "${escapeHtml(
      regionId
    )}".</div>`;
  }

  if (config.kind === 'fictional') {
    return `<div class="inspector-fictional-note">${escapeHtml(config.note)}</div>`;
  }

  const thumbsHtml = config.images
    .map(
      (img, i) =>
        `<button class="inspector-thumb${i === 0 ? ' active' : ''}" data-idx="${i}">${escapeHtml(
          img.label
        )}</button>`
    )
    .join('');

  return `
    <div class="inspector-source">
      <div class="inspector-thumbs">${thumbsHtml}</div>
      <div class="inspector-viewport" id="inspector-viewport">
        <img class="inspector-image" id="inspector-image" draggable="false" />
      </div>
      <div class="inspector-caption">
        <div id="inspector-caption-text"></div>
        <a id="inspector-loc-link" href="#" target="_blank" rel="noopener">View at loc.gov</a>
      </div>
      <div class="inspector-attribution">${escapeHtml(config.attribution)}</div>
    </div>`;
}

// Wires the pan/zoom viewport + thumbnail switching for the Source tab. A
// no-op if the region has no real imagery (fictional note only).
function wireSourceTab(root, regionId) {
  const config = SOURCE_CONFIG[regionId];
  if (!config || config.kind !== 'sheets') return;

  const viewport = root.querySelector('#inspector-viewport');
  const img = root.querySelector('#inspector-image');
  const captionText = root.querySelector('#inspector-caption-text');
  const locLink = root.querySelector('#inspector-loc-link');
  const thumbs = root.querySelectorAll('.inspector-thumb');

  let scale = 1;
  let originX = 0;
  let originY = 0;

  function applyTransform() {
    img.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
  }

  function resetTransform() {
    scale = 1;
    originX = 0;
    originY = 0;
    applyTransform();
  }

  function showImage(idx) {
    const entry = config.images[idx];
    img.src = `${BASE}${entry.url}`;
    captionText.textContent = entry.caption;
    locLink.href = entry.locUrl;
    resetTransform();
    thumbs.forEach((t, i) => t.classList.toggle('active', i === idx));
  }

  thumbs.forEach((t) => {
    t.addEventListener('click', () => showImage(Number(t.dataset.idx)));
  });

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const prevScale = scale;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      scale = Math.min(8, Math.max(1, scale * factor));
      // Keep the point under the cursor fixed while zooming.
      originX = cx - ((cx - originX) * scale) / prevScale;
      originY = cy - ((cy - originY) * scale) / prevScale;
      applyTransform();
    },
    { passive: false }
  );

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  viewport.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    originX += e.clientX - lastX;
    originY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  });
  viewport.addEventListener('pointerup', () => {
    dragging = false;
  });
  viewport.addEventListener('pointercancel', () => {
    dragging = false;
  });

  showImage(0);
}

function buildJsonTab(regionId, sceneWindow, timeline) {
  return `
    <div class="inspector-json">
      <div class="inspector-json-block">
        <div class="inspector-json-header">
          <h3>scene.json</h3>
          <a href="${BASE}v0/${regionId}/scene.json" target="_blank" rel="noopener">Open raw &#8599;</a>
        </div>
        <pre>${escapeHtml(JSON.stringify(sceneWindow, null, 2))}</pre>
      </div>
      <div class="inspector-json-block">
        <div class="inspector-json-header">
          <h3>timeline.json</h3>
          <a href="${BASE}v0/${regionId}/timeline.json" target="_blank" rel="noopener">Open raw &#8599;</a>
        </div>
        <pre>${escapeHtml(JSON.stringify(timeline, null, 2))}</pre>
      </div>
    </div>`;
}

/**
 * Creates the "Data" button + overlay. Does not fetch anything (G5) — all
 * data (region id, sceneWindow, timeline) is passed in by main.js from
 * objects it already loaded at boot.
 *
 * @param {HTMLElement} topbarEl - the #topbar container to append the button to
 * @param {{id: string}} region - the current region record
 * @param {object} sceneWindow - the current region's scene.json
 * @param {Array} timeline - the current region's timeline.json
 */
export function initInspector(topbarEl, region, sceneWindow, timeline) {
  const button = document.createElement('button');
  button.id = 'inspector-open';
  button.type = 'button';
  button.textContent = 'Data';
  topbarEl.appendChild(button);

  const overlay = document.createElement('div');
  overlay.id = 'inspector-overlay';
  overlay.innerHTML = `
    <div class="inspector-panel">
      <div class="inspector-header">
        <div class="inspector-tabs">
          <button class="inspector-tab active" data-tab="source">Source</button>
          <button class="inspector-tab" data-tab="json">JSON</button>
        </div>
        <button class="inspector-close" id="inspector-close">&times;</button>
      </div>
      <div class="inspector-body">
        <div class="inspector-tab-panel active" data-panel="source">
          ${buildSourceTab(region.id)}
        </div>
        <div class="inspector-tab-panel" data-panel="json">
          ${buildJsonTab(region.id, sceneWindow, timeline)}
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  wireSourceTab(overlay, region.id);

  function open() {
    overlay.classList.add('open');
  }
  function close() {
    overlay.classList.remove('open');
  }

  button.addEventListener('click', open);
  overlay.querySelector('#inspector-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  overlay.querySelectorAll('.inspector-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      overlay
        .querySelectorAll('.inspector-tab')
        .forEach((b) => b.classList.toggle('active', b === tabBtn));
      overlay.querySelectorAll('.inspector-tab-panel').forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === tabBtn.dataset.tab);
      });
    });
  });

  return { open, close };
}
