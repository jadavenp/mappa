// Engine/scene/camera/lights, ground plane, and ALL state meshes (built once
// at load time, per G6 — zero mesh creation during scrubbing). Axis map
// (G7): local east -> +X, north -> +Z, up -> +Y.

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { ExtrudePolygon } from '@babylonjs/core/Meshes/Builders/polygonBuilder';
import earcut from 'earcut';

import { resolveInterval, resolvedToMs } from './fuzzydate.js';

const MATERIAL_COLORS = {
  water: '#2a5d8f',
  paved: '#5a5a5a',
  wood_frame: '#8a6642',
  brick: '#9b4d3f',
  concrete: '#8d8d8d',
};
const DEFAULT_COLOR = '#aaaaaa';

// Small y-offsets (meters) so flat water/road polygons and building bases
// don't z-fight with the ground plane or each other. Buildings extrude
// upward from their own baseY.
const BASE_Y_BY_TYPE = {
  water: 0.0,
  road: 0.05,
  building: 0.1,
};
const GROUND_Y = -0.15;
const GROUND_MARGIN_M = 50;

function hexToColor3(hex) {
  return Color3.FromHexString(hex);
}

function materialFor(scene, materialCache, materialClass) {
  const key = materialClass || 'default';
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new StandardMaterial(`mat_${key}`, scene);
  mat.diffuseColor = hexToColor3(MATERIAL_COLORS[key] || DEFAULT_COLOR);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  materialCache.set(key, mat);
  return mat;
}

function footprintToShape(ring) {
  // ring: [[x_east, y_north], ...] (RFC 7946 ring, first point repeated at
  // the end — ExtrudePolygon drops a duplicate closing point itself, but a
  // stray duplicate does no harm). Axis map: x_east -> X, y_north -> Z, y=0
  // (the extrusion plane); the mesh is translated up to baseY afterwards.
  return ring.map(([xEast, yNorth]) => new Vector3(xEast, 0, yNorth));
}

/**
 * Initialize the Babylon engine, scene, camera and lights against `canvas`.
 * Starts the render loop and wires up window resize. Does NOT build any
 * feature geometry (see buildFeatures).
 */
export function initScene(canvas, region) {
  const engine = new Engine(canvas, true, { stencil: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.07, 0.07, 0.08, 1);

  const cam = region?.default_camera || {};
  const headingRad = ((cam.heading_deg ?? 0) * Math.PI) / 180;
  const pitchRad = ((cam.pitch_deg ?? -30) * Math.PI) / 180;
  const alpha = -Math.PI / 2 - headingRad; // sensible default orientation
  const beta = Math.PI / 2 + pitchRad; // pitch is negative-down in source data
  const radius = cam.height_m || 400;

  const camera = new ArcRotateCamera(
    'camera',
    alpha,
    Math.min(Math.max(beta, 0.05), Math.PI / 2 - 0.01),
    radius,
    Vector3.Zero(),
    scene
  );
  camera.lowerRadiusLimit = 20;
  camera.upperRadiusLimit = 2000;
  camera.lowerBetaLimit = 0.05;
  camera.upperBetaLimit = Math.PI / 2 - 0.01;
  camera.wheelPrecision = 2;
  camera.panningSensibility = 50;
  camera.attachControl(canvas, true);

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.7;

  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.3), scene);
  sun.intensity = 0.6;

  engine.runRenderLoop(() => {
    scene.render();
  });
  window.addEventListener('resize', () => {
    engine.resize();
  });

  return { engine, scene, camera };
}

/**
 * Build every State's representation mesh for every Feature in the scene
 * window, once, at load time (G6). Returns { entries, bounds } where entries
 * is an array of { mesh, featureId, stateId, feature, state, resolvedStart,
 * resolvedEnd } (resolvedStart/End are ms, -Infinity/+Infinity for open
 * bounds) and bounds is the local-meter footprint bounding box used to size
 * the ground plane.
 */
export function buildFeatures(scene, sceneWindow) {
  const materialCache = new Map();
  const entries = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const feature of sceneWindow.features) {
    const baseY = BASE_Y_BY_TYPE[feature.type] ?? 0.1;

    for (const state of feature.states) {
      const [start, end] = resolveInterval(state.interval);
      const resolvedStart = resolvedToMs(start);
      const resolvedEnd = resolvedToMs(end);

      // v0 bakes exactly one representation per State (lod 1); use the
      // first if more are ever present rather than guessing which wins.
      const rep = state.representations[0];
      if (!rep) continue;

      const { footprint, height_m: heightM, material_class: materialClass } =
        rep.payload;
      const [exteriorRing, ...holeRings] = footprint.coordinates;
      const shape = footprintToShape(exteriorRing);
      const holes = holeRings.map(footprintToShape);

      for (const pt of exteriorRing) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minZ) minZ = pt[1];
        if (pt[1] > maxZ) maxZ = pt[1];
      }

      const mesh = ExtrudePolygon(
        `mesh_${state.id}`,
        {
          shape,
          holes,
          depth: heightM,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        scene,
        earcut
      );
      mesh.position.y = baseY + heightM;
      mesh.material = materialFor(scene, materialCache, materialClass);
      mesh.isPickable = true;

      entries.push({
        mesh,
        featureId: feature.id,
        stateId: state.id,
        feature,
        state,
        resolvedStart,
        resolvedEnd,
      });
    }
  }

  if (Number.isFinite(minX)) {
    const width = maxX - minX + GROUND_MARGIN_M * 2;
    const depth = maxZ - minZ + GROUND_MARGIN_M * 2;
    const ground = CreateGround(
      'ground',
      { width, height: depth, subdivisions: 1 },
      scene
    );
    ground.position.x = (minX + maxX) / 2;
    ground.position.z = (minZ + maxZ) / 2;
    ground.position.y = GROUND_Y;
    ground.isPickable = false;
    const groundMat = new StandardMaterial('mat_ground', scene);
    groundMat.diffuseColor = Color3.FromHexString('#2f3a2f');
    groundMat.specularColor = new Color3(0, 0, 0);
    ground.material = groundMat;

    scene.activeCamera.target = new Vector3(
      (minX + maxX) / 2,
      0,
      (minZ + maxZ) / 2
    );
  }

  return { entries, bounds: { minX, maxX, minZ, maxZ } };
}

/**
 * Toggle mesh visibility for a given scrub time `t` (ms). Zero mesh
 * creation happens here (G6) — this only flips `setEnabled`.
 */
export function applyVisibility(entries, tMs) {
  let visibleCount = 0;
  for (const entry of entries) {
    const visible = entry.resolvedStart <= tMs && tMs < entry.resolvedEnd;
    entry.mesh.setEnabled(visible);
    if (visible) visibleCount += 1;
  }
  return visibleCount;
}
