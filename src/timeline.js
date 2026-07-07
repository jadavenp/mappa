// Bottom-bar scrubber: range input over the Region's time horizon, a year
// label, and event tick marks (from events.json). Zero fetches, zero mesh
// creation on input (G6) — `onTimeChange` is the only side effect, and it is
// the caller's job (scene.js's applyVisibility) to just flip visibility.

import { resolveInterval, resolveFuzzyDate, resolvedToMs } from './fuzzydate.js';

const STEP_COUNT = 2000; // ~granularity of the scrub, not a hard requirement

function fmtYear(ms) {
  return String(new Date(ms).getUTCFullYear());
}

/**
 * @param {HTMLElement} container - the #timeline element
 * @param {object} region - regions.json[0]
 * @param {Array} events - events.json
 * @param {(tMs: number) => void} onTimeChange
 * @returns {{ setTime(t: number|string): void, getTime(): number, minMs: number, maxMs: number }}
 */
export function initTimeline(container, region, events, onTimeChange) {
  const [startResolved, endResolved] = resolveInterval(region.time_horizon);
  const minMs = resolvedToMs(startResolved);
  const maxMs = resolvedToMs(endResolved);
  const step = Math.max(1, Math.floor((maxMs - minMs) / STEP_COUNT));

  container.innerHTML = '';

  const inner = document.createElement('div');
  inner.className = 'timeline-inner';

  const ticks = document.createElement('div');
  ticks.className = 'timeline-ticks';
  for (const event of events) {
    const tMs = resolvedToMs(resolveFuzzyDate(event.time));
    if (tMs < minMs || tMs > maxMs) continue;
    const pct = ((tMs - minMs) / (maxMs - minMs)) * 100;
    const tick = document.createElement('div');
    tick.className = 'timeline-tick';
    tick.style.left = `${pct}%`;
    tick.title = event.name;
    ticks.appendChild(tick);
  }

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'timeline-scrubber';
  slider.min = String(minMs);
  slider.max = String(maxMs);
  slider.step = String(step);
  slider.value = String(minMs);

  const yearLabel = document.createElement('div');
  yearLabel.className = 'timeline-year';
  yearLabel.textContent = fmtYear(minMs);

  inner.appendChild(ticks);
  inner.appendChild(slider);
  inner.appendChild(yearLabel);
  container.appendChild(inner);

  let currentMs = minMs;

  function apply(tMs) {
    currentMs = Math.min(Math.max(tMs, minMs), maxMs);
    slider.value = String(currentMs);
    yearLabel.textContent = fmtYear(currentMs);
    onTimeChange(currentMs);
  }

  slider.addEventListener('input', () => {
    apply(Number(slider.value));
  });

  return {
    setTime(t) {
      const tMs = typeof t === 'string' ? Date.parse(t) : t;
      apply(tMs);
    },
    getTime() {
      return currentMs;
    },
    minMs,
    maxMs,
  };
}
