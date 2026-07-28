// The PS1 look, as a material factory.
//
// Three things do most of the work:
//   1. Flat shading + Lambert (no PBR) — hard facets, no roughness maps.
//   2. Vertex snapping in clip space — the signature Syndicate Wars / PS1
//      wobble, caused by the original hardware having no sub-pixel precision.
//   3. Exponential fog with a short draw distance, so the block fades out
//      instead of revealing that there is nothing past it.
//
// The low internal render resolution is set in `view.js`, not here.

import * as THREE from '../../vendor/three.module.min.js';

/** Clip-space grid the PS1 snapped vertices to. Lower = chunkier wobble. */
export const JITTER = 190;

const patched = new WeakSet();

/**
 * Inject vertex snapping into any built-in material's shader.
 * Safe to call more than once on the same material.
 */
export function applyVertexJitter(material, jitter = JITTER) {
  if (patched.has(material)) return material;
  patched.add(material);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uJitter = { value: jitter };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uJitter;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          // Snap to a coarse raster grid in normalised device coords, then
          // scale back by w so perspective still behaves.
          vec2 grid = vec2( uJitter, uJitter * 0.75 );
          gl_Position.xy = floor( gl_Position.xy / gl_Position.w * grid ) / grid * gl_Position.w;
        }`,
      );
  };
  // Without this, three reuses the un-patched program for identical params.
  material.customProgramCacheKey = () => `ps1-${jitter}`;
  return material;
}

// ---------------------------------------------------------------------------
// Facade windows
//
// A single 64×64 canvas of lit window cells, point-filtered and tiled per
// building. One texture, no files, and it does more for "this is a city at
// night" than any amount of geometry.
// ---------------------------------------------------------------------------

let windowTex = null;

function buildWindowCanvas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      // Roughly two in five windows are dark. Rationed lighting, allegedly.
      if (Math.random() < 0.42) continue;
      const v = 90 + Math.floor(Math.random() * 150);
      g.fillStyle = `rgb(${v}, ${Math.floor(v * 0.93)}, ${Math.floor(v * 0.72)})`;
      g.fillRect(i * 16 + 4, j * 16 + 5, 8, 7);
    }
  }
  return c;
}

function windowTexture() {
  if (!windowTex) {
    windowTex = new THREE.CanvasTexture(buildWindowCanvas());
    windowTex.magFilter = THREE.NearestFilter;
    windowTex.minFilter = THREE.NearestFilter;
    windowTex.wrapS = THREE.RepeatWrapping;
    windowTex.wrapT = THREE.RepeatWrapping;
    windowTex.colorSpace = THREE.SRGBColorSpace;
  }
  return windowTex;
}

/**
 * A building facade: flat-shaded body plus emissive window tiling scaled to
 * the structure's real dimensions, so a tower gets more floors than a kiosk.
 */
export function facade(color, w, h) {
  const tex = windowTexture().clone();
  tex.needsUpdate = true;
  // Each tile carries a 4×4 window grid, so keep the repeat low or the
  // facade turns into noise at render resolution.
  tex.repeat.set(
    Math.max(1, Math.round(w / 11)),
    Math.max(1, Math.round(h / 9)),
  );
  tex.offset.set(Math.random(), Math.random());

  const m = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    emissive: 0xffcb8f,
    emissiveMap: tex,
    emissiveIntensity: 0.85,
  });
  m.userData.tex = tex;
  return applyVertexJitter(m);
}

/** Flat-shaded solid. The default surface for everything in the city. */
export function solid(color, opts = {}) {
  const m = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    ...opts,
  });
  return applyVertexJitter(m);
}

/** Unlit emissive-ish surface for signage, trim bands, tracers, HUD marks. */
export function glow(color, opts = {}) {
  const m = new THREE.MeshBasicMaterial({
    color,
    fog: opts.fog ?? true,
    ...opts,
  });
  return applyVertexJitter(m);
}

export const FOG_COLOR = 0x0b101c;
export const FOG_DENSITY = 0.0068;

export function makeFog() {
  return new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
}

/**
 * Lighting rig: one cold key from high above, one warm bounce from the
 * street, and a dim hemisphere so nothing reads as pure black.
 */
export function makeLights() {
  const group = new THREE.Group();

  // Strong, low-angle key. Flat shading only reads if adjacent faces get
  // meaningfully different light, so keep ambient well below the key.
  const key = new THREE.DirectionalLight(0xc8dcff, 2.1);
  key.position.set(-70, 90, 55);
  group.add(key);

  // Warm sodium bounce off the street, opposite the key.
  const bounce = new THREE.DirectionalLight(0xff9a52, 0.5);
  bounce.position.set(60, 14, -45);
  group.add(bounce);

  group.add(new THREE.HemisphereLight(0x4a5c85, 0x14161f, 0.7));
  group.add(new THREE.AmbientLight(0x28304a, 0.55));

  return group;
}
