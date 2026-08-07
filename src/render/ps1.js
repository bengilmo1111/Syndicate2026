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

/**
 * Several window patterns, not one.
 *
 * The city used to share a single 64×64 canvas, offset randomly per
 * building. That reads as *tiling*: every tower has the same rhythm of lit
 * and dark cells and the skyline looks like wallpaper. A block where one
 * building has three lights on and its neighbour is fully occupied reads
 * as a place where different things are happening, which is the entire job
 * of a facade at this resolution.
 *
 * `lit` is how much of the building is awake and `warm` is what its
 * lighting is like — a residential block, an office floor still working,
 * and a mostly-dark tower with a service light on are three different
 * buildings made of the same eight numbers.
 */
const WINDOW_PATTERNS = [
  { lit: 0.58, warm: 1.00 },   // ordinary residential
  { lit: 0.34, warm: 0.94 },   // half empty
  { lit: 0.82, warm: 0.86 },   // an office floor still at it
  { lit: 0.16, warm: 1.06 },   // nearly dark, a few late rooms
  { lit: 0.66, warm: 0.78 },   // colder, newer glass
  { lit: 0.06, warm: 1.10 },   // service lighting only
];

const windowTex = new Map();

function buildWindowCanvas({ lit, warm }, rng) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (rng() > lit) continue;
      const v = 90 + Math.floor(rng() * 150);
      g.fillStyle = `rgb(${Math.min(255, Math.floor(v * warm))}, `
        + `${Math.floor(v * 0.93)}, ${Math.floor(v * 0.72 / warm)})`;
      g.fillRect(i * 16 + 4, j * 16 + 5, 8, 7);
    }
  }
  return c;
}

/**
 * Deterministic per pattern index, so the same block looks the same every
 * time it is loaded — a skyline that reshuffles on every redeploy is a
 * different bug from a skyline that is boring.
 */
function windowTexture(index) {
  const key = index % WINDOW_PATTERNS.length;
  if (!windowTex.has(key)) {
    let seed = 0x9e3779b9 ^ (key * 0x85ebca6b);
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const tex = new THREE.CanvasTexture(buildWindowCanvas(WINDOW_PATTERNS[key], rng));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    windowTex.set(key, tex);
  }
  return windowTex.get(key);
}

export const WINDOW_PATTERN_COUNT = WINDOW_PATTERNS.length;

/**
 * A building facade: flat-shaded body plus emissive window tiling scaled to
 * the structure's real dimensions, so a tower gets more floors than a kiosk.
 */
export function facade(color, w, h, pattern = 0) {
  const tex = windowTexture(pattern).clone();
  tex.needsUpdate = true;
  // Each tile carries a 4×4 window grid, so keep the repeat low or the
  // facade turns into noise at render resolution.
  tex.repeat.set(
    Math.max(1, Math.round(w / 11)),
    Math.max(1, Math.round(h / 9)),
  );
  // Offset by the pattern index rather than at random, so two neighbours
  // sharing a pattern still do not line up and a reload does not reshuffle
  // the skyline.
  tex.offset.set(((pattern * 0.37) % 1), ((pattern * 0.61) % 1));

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

// ---------------------------------------------------------------------------
// The sky
//
// There was not one. The background was flat `FOG_COLOR`, which is fine at
// street level — the fog swallows everything before the horizon — and
// falls apart the moment the camera tilts up or a tower breaks the skyline,
// because the tower is then a silhouette against nothing.
//
// A gradient dome fixes it for about thirty lines. Deliberately banded
// rather than smooth: a PS1 sky was a handful of vertex-coloured bands and
// the dithering artefacts were the look, not a limitation to apologise for.
// ---------------------------------------------------------------------------

/**
 * Bottom to top. The warm band is the important one — a city at night puts
 * its own light back into the haze above it, and that glow is the
 * difference between "night" and "the renderer forgot to draw anything".
 */
const SKY_BANDS = [
  { at: 0.00, color: '#1a1620' },
  { at: 0.06, color: '#33241f' },   // sodium haze off the block
  { at: 0.14, color: '#1c1c2c' },
  { at: 0.38, color: '#101428' },
  { at: 1.00, color: '#070a14' },
];

// ---------------------------------------------------------------------------
// The air
//
// `GAP_ANALYSIS.md` §4 lists "environments that don't vary" among the
// things the original got wrong and says, in as many words: keep pushing
// so a SpaceX launch sector doesn't read as an Amazon depot with new
// colours. Repainting the buildings was the first half of that and it is
// not enough — every block still shares one fog colour, one sky and one
// key light, so at any distance they are the same picture.
//
// So the air belongs to whoever holds the ground. Not a time of day:
// `NARRATIVE.md` pins when things happen and a renderer should not be
// inventing a clock. Weather and particulates over a sector are a fact
// about the place, and the place is already in the data — `city.syndicate`
// has been there since the first block was generated.
//
// Each entry is deliberately small: a fog tint and density, the sodium
// band at the horizon, and what the key light is coming through. Enough
// that two blocks are different weather, not enough that either stops
// looking like this game.
// ---------------------------------------------------------------------------

export const AIR = Object.freeze({
  // The default, and the one every screenshot in the docs was taken in.
  openai: {
    fog: 0x0b101c, density: 0.0068, haze: '#33241f',
    key: 0xc8dcff, keyPower: 2.1, bounce: 0xff9a52,
  },
  // Campus air, and the cleanest on the map: filtered, watered, lit for
  // the cameras. Thin fog and a colder key.
  google: {
    fog: 0x0c1424, density: 0.0056, haze: '#2a2c46',
    key: 0xd2e2ff, keyPower: 2.3, bounce: 0xff9a52,
  },
  // Depot air. Diesel, dust off the pads, and the sodium floods they
  // never turned off. The thickest and warmest of the five.
  amazon: {
    fog: 0x140f0c, density: 0.0092, haze: '#4a2e16',
    key: 0xffd6a8, keyPower: 1.85, bounce: 0xff8236,
  },
  // A launch corridor: burnt-off, hard-edged and nearly colourless, with
  // the sky washed pale by pad lighting rather than by a city.
  spacex: {
    fog: 0x14161c, density: 0.0062, haze: '#4c4f57',
    key: 0xf0f4ff, keyPower: 2.5, bounce: 0xbfc6d4,
  },
  // Low, wet and shuttered. Anthropic sectors are off the update channel
  // and it shows before anybody says so.
  anthropic: {
    fog: 0x120e14, density: 0.0104, haze: '#3a2436',
    key: 0xbfb0cc, keyPower: 1.7, bounce: 0xd08a5a,
  },
  // Unclaimed ground. Nobody's brand, nobody's air handling.
  none: {
    fog: 0x101210, density: 0.0086, haze: '#2e2e26',
    key: 0xc4c8bc, keyPower: 1.9, bounce: 0xd9a463,
  },
});

export function airFor(syndicate) {
  return AIR[syndicate] ?? AIR.openai;
}

export function makeSky(radius = 380, air = AIR.openai) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  for (const b of SKY_BANDS) {
    // Only the sodium band moves. The rest of the gradient is what makes
    // this look like this game, and five different skies would be five
    // different games.
    grad.addColorStop(b.at, b.at === 0.06 ? air.haze : b.color);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;   // banding on purpose
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;

  // Half a sphere is enough: the camera never goes below the ground plane,
  // and the outer ground plane covers everything under the horizon.
  const geo = new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,          // the sky *is* the fog colour at the horizon
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Drawn first and never depth-tested against, so it can never poke
  // through a building.
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// The road
//
// Everything painted on the asphalt — lane lines, crossings, and the warm
// pools under the street lights — is one canvas stretched over the roadway,
// not geometry.
//
// That is a performance decision before it is an aesthetic one. Eighty-one
// transparent quads for the light pools cost forty per cent of the frame
// rate under software rasterisation, because large transparent surfaces are
// pure overdraw. Baked into a texture they cost nothing at all, and it
// happens to be exactly how a PS1 game would have done it: light is paint.
// ---------------------------------------------------------------------------

/**
 * @param city  the block, for its street centrelines
 * @param lamps `[{ x, z }]` in world space — where the pools go
 */
export function roadTexture(city, lamps = []) {
  const SIZE = 1024;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext('2d');

  // World → canvas. The road box spans the whole block, so UV 0..1 is
  // -halfW..halfW and -halfD..halfD.
  const px = x => ((x + city.halfW) / city.width) * SIZE;
  const py = z => ((z + city.halfD) / city.depth) * SIZE;
  const scale = SIZE / city.width;

  g.fillStyle = '#191c26';
  g.fillRect(0, 0, SIZE, SIZE);

  // The pools first, under everything else, so markings read on top of them.
  for (const l of lamps) {
    const r = 15 * scale;
    const grad = g.createRadialGradient(px(l.x), py(l.z), 0, px(l.x), py(l.z), r);
    grad.addColorStop(0, 'rgba(255, 168, 82, 0.30)');
    grad.addColorStop(0.55, 'rgba(255, 150, 70, 0.12)');
    grad.addColorStop(1, 'rgba(255, 140, 60, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(px(l.x), py(l.z), r, 0, Math.PI * 2);
    g.fill();
  }

  // Lane dashes down every centreline. Dashed rather than solid, because a
  // solid line reads as a rail and a dashed one reads as a road.
  g.strokeStyle = 'rgba(120, 138, 178, 0.5)';
  g.lineWidth = Math.max(1, 0.35 * scale);
  g.setLineDash([3.5 * scale, 4.5 * scale]);
  for (const x of city.streetsX) {
    g.beginPath();
    g.moveTo(px(x), 0);
    g.lineTo(px(x), SIZE);
    g.stroke();
  }
  for (const z of city.streetsZ) {
    g.beginPath();
    g.moveTo(0, py(z));
    g.lineTo(SIZE, py(z));
    g.stroke();
  }
  g.setLineDash([]);

  // Crossings on the approach to every intersection. Four bars a side is
  // enough at this resolution and it is the single clearest signal that the
  // grey strip between the buildings is a street.
  g.fillStyle = 'rgba(150, 168, 205, 0.34)';
  const bar = 0.8 * scale;
  const gap = 1.9 * scale;
  const reach = 5.2 * scale;
  const stand = 7.5 * scale;
  for (const x of city.streetsX) {
    for (const z of city.streetsZ) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          g.fillRect(px(x) - reach + i * gap, py(z) + side * stand, bar, reach * 0.9);
          g.fillRect(px(x) + side * stand, py(z) - reach + i * gap, reach * 0.9, bar);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const FOG_COLOR = 0x0b101c;
export const FOG_DENSITY = 0.0068;

export function makeFog(air = AIR.openai) {
  return new THREE.FogExp2(air.fog, air.density);
}

/**
 * Lighting rig: one cold key from high above, one warm bounce from the
 * street, and a dim hemisphere so nothing reads as pure black.
 */
export function makeLights(air = AIR.openai) {
  const group = new THREE.Group();

  // Strong, low-angle key. Flat shading only reads if adjacent faces get
  // meaningfully different light, so keep ambient well below the key.
  const key = new THREE.DirectionalLight(air.key, air.keyPower);
  key.position.set(-70, 90, 55);
  group.add(key);
  group.userData.key = key;

  // Warm sodium bounce off the street, opposite the key.
  const bounce = new THREE.DirectionalLight(air.bounce, 0.5);
  bounce.position.set(60, 14, -45);
  group.add(bounce);

  group.add(new THREE.HemisphereLight(0x4a5c85, 0x14161f, 0.7));
  group.add(new THREE.AmbientLight(0x28304a, 0.55));

  return group;
}
