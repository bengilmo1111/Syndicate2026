// Entry point: input, the fixed-step loop, and the briefing → mission →
// debrief state machine. Everything else is either pure simulation
// (`src/core`) or pure presentation (`src/render`, `src/ui`).

import './missions/index.js';
import { getAllMissions, getMissionDef } from './core/mission.js';
import { createSim, step, PHASE } from './core/sim.js';
import { View } from './render/view.js';
import { updateHUD, toggleObjectivePanel } from './ui/hud.js';
import { setOverlay, showOverlay, hideOverlay, CONTROLS_HINT } from './ui/overlay.js';

const canvas = document.getElementById('game-canvas');
const view = new View(canvas);

const app = {
  sim: null,
  phase: PHASE.BRIEFING,
  selectedMissionId: getAllMissions()[0].id,
};

const keys = new Set();
const pointer = { nx: 0.5, ny: 0.5, firing: false, orbiting: false, lastX: 0, lastY: 0 };

// ---------------------------------------------------------------------------
// Mission lifecycle
// ---------------------------------------------------------------------------

/**
 * Build the mission's world but leave it paused, so the briefing card sits
 * over a live view of the sector you're about to walk into.
 */
function loadPreview() {
  app.sim = createSim(app.selectedMissionId);
  view.loadCity(app.sim.city);
  const c = app.sim.squad.center();
  view.rig.smoothTarget.set(c.x, 0, c.z);
  view.rig.pitch = 0.62;
  view.rig.distance = 82;
}

function showBriefing() {
  app.phase = PHASE.BRIEFING;
  loadPreview();
  const def = getMissionDef(app.selectedMissionId);
  setOverlay({
    eyebrow: `${def.act} · ${def.sector}`,
    title: def.name,
    tabs: getAllMissions().map(m => ({
      id: m.id, name: m.name.split(' — ')[0], active: m.id === app.selectedMissionId,
    })),
    onSelectTab: (id) => { app.selectedMissionId = id; showBriefing(); },
    body: def.briefing,
    button: { label: 'DEPLOY', onClick: startMission },
    hint: CONTROLS_HINT,
  });
  showOverlay();
}

function startMission() {
  app.sim = createSim(app.selectedMissionId);
  view.loadCity(app.sim.city);
  view.rig.yaw = 0;
  view.rig.pitch = 0.78;
  view.rig.distance = 70;
  const c = app.sim.squad.center();
  view.rig.smoothTarget.set(c.x, 0, c.z);
  app.phase = PHASE.PLAYING;
  hideOverlay();
  updateHUD(app.sim);
}

function showDebrief(won) {
  app.phase = won ? PHASE.WON : PHASE.LOST;
  const def = getMissionDef(app.sim.mission.id);
  // A mission can be lost specifically — the escorted asset died, the
  // target got away — and the debrief should say which.
  const lines = won
    ? def.debrief.win
    : (def.debrief[app.sim.failReason] ?? def.debrief.loss);
  const stats = [
    '',
    `HOSTILES DOWN <strong>${app.sim.kills}</strong> · ALIGNED <strong>${app.sim.alignedCount}</strong> · CIVILIAN LOSSES <strong>${app.sim.civilianDeaths}</strong>`,
  ];
  const titles = def.debrief.titles ?? {};
  const lostTitle = titles[app.sim.failReason]
    ?? (app.sim.failReason === 'assetLost' ? 'ASSET LOST' : 'DEPLOYMENT TERMINATED');
  setOverlay({
    eyebrow: won ? 'DEPLOYMENT CLOSED' : 'DEPLOYMENT LOST',
    title: won ? (titles.win ?? 'SECTOR PROVISIONED') : lostTitle,
    body: [...lines, ...stats],
    button: { label: won ? 'RETURN TO BRIEFING' : 'REDEPLOY', onClick: won ? showBriefing : startMission },
    hint: CONTROLS_HINT,
  });
  showOverlay();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (MOVE_KEYS.has(k) || k === ' ' || k === 'tab') e.preventDefault();

  if (app.phase !== PHASE.PLAYING || !app.sim) return;
  const squad = app.sim.squad;

  if (k >= '1' && k <= '4') {
    const i = Number(k) - 1;
    if (e.shiftKey) squad.toggleSelect(i);
    else squad.selectOnly(i);
  } else if (k === 'q' || k === '`') {
    squad.selectAll();
  } else if (k === ' ') {
    squad.cycleAligner();
  } else if (k === 'tab') {
    toggleObjectivePanel();
  }
});

window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  pointer.nx = (e.clientX - r.left) / r.width;
  pointer.ny = (e.clientY - r.top) / r.height;

  if (pointer.orbiting) {
    view.rig.rotate((e.clientX - pointer.lastX) * -0.006);
    view.rig.tilt((e.clientY - pointer.lastY) * 0.004);
  }
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;
});

canvas.addEventListener('pointerdown', (e) => {
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;
  if (e.button === 0) {
    pointer.firing = true;
  } else if (e.button === 1) {
    pointer.orbiting = true;
    canvas.setPointerCapture(e.pointerId);
  } else if (e.button === 2 && app.phase === PHASE.PLAYING && app.sim) {
    const p = view.screenToGround(pointer.nx, pointer.ny);
    if (p) app.sim.squad.issueMove(p, app.sim.city);
  }
});

window.addEventListener('pointerup', (e) => {
  if (e.button === 0) pointer.firing = false;
  if (e.button === 1) pointer.orbiting = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.rig.zoom(Math.sign(e.deltaY) * 4);
}, { passive: false });

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

/** Fixed simulation step. Rendering interpolates nothing — the PS1 didn't. */
const FIXED_DT = 1 / 60;
let accumulator = 0;
let last = performance.now();

function readIntent() {
  const { forward, right } = view.rig.basis();
  let mx = 0;
  let mz = 0;
  if (keys.has('w') || keys.has('arrowup')) { mx += forward.x; mz += forward.z; }
  if (keys.has('s') || keys.has('arrowdown')) { mx -= forward.x; mz -= forward.z; }
  if (keys.has('d') || keys.has('arrowright')) { mx += right.x; mz += right.z; }
  if (keys.has('a') || keys.has('arrowleft')) { mx -= right.x; mz -= right.z; }

  const aimPoint = view.screenToGround(pointer.nx, pointer.ny);
  return { moveX: mx, moveZ: mz, firing: pointer.firing, aimPoint };
}

function handleCameraKeys(dt) {
  if (app.phase !== PHASE.PLAYING) return;
  if (keys.has('z')) view.rig.rotate(1.7 * dt);
  if (keys.has('x')) view.rig.rotate(-1.7 * dt);
  if (keys.has('r')) view.rig.tilt(0.9 * dt);
  if (keys.has('f')) view.rig.tilt(-0.9 * dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(raw, 0.1);

  handleCameraKeys(dt);
  // Slow drift over the sector while a card is up. Sells the block as a place.
  if (app.phase !== PHASE.PLAYING) view.rig.rotate(0.055 * dt);

  if (app.sim) {
    const intent = readIntent();
    if (intent.aimPoint) view.fx.setCursor(intent.aimPoint.x, intent.aimPoint.z, app.phase === PHASE.PLAYING);
    else view.fx.setCursor(0, 0, false);

    if (app.phase === PHASE.PLAYING) {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= FIXED_DT && guard++ < 5) {
        accumulator -= FIXED_DT;
        const before = app.sim.events.length;
        step(app.sim, FIXED_DT, intent);
        // Collapses are the one event worth shaking the camera for.
        for (let i = before; i < app.sim.events.length; i++) {
          if (app.sim.events[i].type === 'collapse') view.rig.kick(0.8);
        }
      }
      updateHUD(app.sim);
      if (app.sim.phase === PHASE.WON) showDebrief(true);
      else if (app.sim.phase === PHASE.LOST) showDebrief(false);
    }

    view.render(app.sim, dt);
  }
}

// ---------------------------------------------------------------------------

showBriefing();
requestAnimationFrame(frame);

// Surface the app for console poking during development.
window.__syndicate = app;
