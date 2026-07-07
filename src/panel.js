// Pointer pick on meshes -> side panel with the Feature's name(s), type, and
// its States (interval, transition kinds, attributes, and each
// Representation Assertion's method/status/confidence/sources). Highlights
// the picked building; click on empty space dismisses.

import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
// Side-effect import: registers EffectLayer._SceneComponentInitialization on
// the Scene. Without this, `new HighlightLayer(...)` below throws
// "EffectLayerSceneComponent needs to be imported before..." at runtime —
// Babylon's modular ES build requires this registration import explicitly.
import '@babylonjs/core/Layers/effectLayerSceneComponent';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { Color3 } from '@babylonjs/core/Maths/math.color';

function fuzzyDateLabel(fuzzyDate) {
  if (fuzzyDate == null) return 'open';
  const q = fuzzyDate.qualifier && fuzzyDate.qualifier !== 'exact' ? ` (${fuzzyDate.qualifier})` : '';
  return `${fuzzyDate.value}${q}`;
}

function intervalLabel(interval) {
  return `${fuzzyDateLabel(interval.start)} → ${fuzzyDateLabel(interval.end)}`;
}

function assertionBlock(assertion) {
  return `
    <div class="assertion">
      <div><span class="k">method</span> ${assertion.method}</div>
      <div><span class="k">status</span> ${assertion.status}</div>
      <div><span class="k">confidence</span> ${assertion.confidence}</div>
      <div><span class="k">sources</span> ${assertion.sources.join(', ') || '(none)'}</div>
    </div>`;
}

function renderChangeLog(featureId, timeline, eventsById) {
  const rows = timeline.filter((t) => t.feature_id === featureId);
  if (rows.length === 0) return '';
  const rowsHtml = rows
    .map((row) => {
      const eventName = row.event_id ? eventsById.get(row.event_id)?.name : null;
      const eventNote = eventName ? ` — ${eventName}` : '';
      return `<div>${row.t} <span class="k">${row.change}</span>${eventNote}</div>`;
    })
    .join('');
  return `
    <div class="panel-section">
      <h3>Change Log</h3>
      ${rowsHtml}
    </div>`;
}

function renderFeature(feature, timeline, eventsById) {
  const namesHtml = feature.names
    .map(
      (n) => `
      <div class="name-entry">
        <div class="name-value">${n.value}</div>
        <div class="muted">${intervalLabel(n.interval)}</div>
        ${assertionBlock(n.assertion)}
      </div>`
    )
    .join('');

  const statesHtml = feature.states
    .map((s) => {
      const attrsHtml = s.attributes
        .map((a) => `<div><span class="k">${a.key}</span> ${a.value}</div>`)
        .join('');
      const repsHtml = s.representations
        .map(
          (r) => `
          <div class="rep">
            <div class="muted">representation (lod ${r.lod}, ${r.kind})</div>
            ${assertionBlock(r.assertion)}
          </div>`
        )
        .join('');
      return `
        <div class="state-entry">
          <div class="muted">${intervalLabel(s.interval)}</div>
          <div><span class="k">in</span> ${s.transition_in ? s.transition_in.kind : '(none)'}
               &nbsp;<span class="k">out</span> ${s.transition_out ? s.transition_out.kind : '(none)'}</div>
          <div class="attrs">${attrsHtml}</div>
          ${repsHtml}
        </div>`;
    })
    .join('');

  return `
    <div class="panel-header">
      <div class="feature-type">${feature.type}</div>
      <button class="panel-close" id="panel-close">&times;</button>
    </div>
    <div class="panel-section">
      <h3>Names</h3>
      ${namesHtml}
    </div>
    <div class="panel-section">
      <h3>States</h3>
      ${statesHtml}
    </div>
    ${renderChangeLog(feature.id, timeline, eventsById)}`;
}

/**
 * @param {HTMLElement} panelEl - the #panel aside
 * @param {import('@babylonjs/core/scene').Scene} scene
 * @param {Array} entries - from scene.js buildFeatures()
 * @param {Array} timeline - timeline.json (t-sorted change entries)
 * @param {Array} events - events.json
 */
export function initPanel(panelEl, scene, entries, timeline, events) {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const highlightLayer = new HighlightLayer('pick-highlight', scene);
  let highlighted = null;

  function clearHighlight() {
    if (highlighted) {
      highlightLayer.removeMesh(highlighted);
      highlighted = null;
    }
  }

  function dismiss() {
    clearHighlight();
    panelEl.classList.remove('open');
    panelEl.innerHTML = '';
  }

  function select(entry) {
    clearHighlight();
    highlighted = entry.mesh;
    highlightLayer.addMesh(highlighted, Color3.FromHexString('#ffcc55'));
    panelEl.innerHTML = renderFeature(entry.feature, timeline, eventsById);
    panelEl.classList.add('open');
    const closeBtn = panelEl.querySelector('#panel-close');
    if (closeBtn) closeBtn.addEventListener('click', dismiss);
  }

  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
    const pick = pointerInfo.pickInfo;
    if (pick && pick.hit && pick.pickedMesh) {
      const entry = entries.find((e) => e.mesh === pick.pickedMesh);
      if (entry) {
        select(entry);
        return;
      }
    }
    dismiss();
  });

  return { dismiss };
}
