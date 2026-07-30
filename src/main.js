// Entry point: input, the fixed-step loop, and the briefing → mission →
// debrief state machine. Everything else is either pure simulation
// (`src/core`) or pure presentation (`src/render`, `src/ui`).

import './missions/index.js';
import {
  getAllMissions, getMissionDef, debriefLines, epilogueFor,
} from './core/mission.js';
import { createSim, step, PHASE } from './core/sim.js';
import { answerInterlude } from './core/interlude.js';
import {
  isUnlocked, isComplete, lockReason, recordWin, nextMission, progress,
  recordCasualties,
} from './core/campaign.js';
import { View } from './render/view.js';
import { updateHUD, toggleObjectivePanel } from './ui/hud.js';
import { setOverlay, showOverlay, hideOverlay, CONTROLS_HINT } from './ui/overlay.js';
import { loadCampaign, saveCampaign, clearCampaign } from './ui/storage.js';
import {
  CYBERNETICS, CYBERNETIC_IDS, deployed, fit, fitBlocker,
} from './core/roster.js';

const canvas = document.getElementById('game-canvas');
const view = new View(canvas);

const MISSIONS = getAllMissions();

const app = {
  sim: null,
  phase: PHASE.BRIEFING,
  campaign: loadCampaign(),
  selectedMissionId: null,
};

// Open on the furthest point the player actually reached, not on mission
// one — a returning player should not have to click past what they finished.
app.selectedMissionId = (nextMission(app.campaign, MISSIONS) ?? MISSIONS[0]).id;

/** The briefing card can show the roster or the cryovat. Same card. */
let cryovatOpen = false;

const keys = new Set();
const pointer = { nx: 0.5, ny: 0.5, firing: false, orbiting: false, lastX: 0, lastY: 0 };

// ---------------------------------------------------------------------------
// Mission lifecycle
// ---------------------------------------------------------------------------

/**
 * The roster block for the briefing card. In cryovat mode every implant
 * an operative does not have becomes a button, disabled with the reason
 * it cannot be bought.
 */
function rosterView(fitting) {
  const roster = app.campaign.roster;
  const crew = deployed(roster);
  const gone = roster.operatives.filter(o => o.lost);
  const short = id => CYBERNETICS[id].name.split(' ').pop().slice(0, 4).toUpperCase();

  const rows = [...crew, ...gone].map(op => ({
    id: op.id,
    designation: op.designation ?? '—',
    name: op.name,
    lost: op.lost,
    detail: op.lost
      ? `LOST · ${op.lostOn ?? 'unknown sector'}`
      : `${op.deployments} deployment${op.deployments === 1 ? '' : 's'} · ${op.kills} down`,
    implants: op.implants.map(id => ({
      short: short(id), name: CYBERNETICS[id].name, blurb: CYBERNETICS[id].blurb,
    })),
    offers: fitting && !op.lost
      ? CYBERNETIC_IDS.filter(id => !op.implants.includes(id)).map(id => ({
        id,
        short: short(id),
        cost: CYBERNETICS[id].cost,
        name: CYBERNETICS[id].name,
        blurb: CYBERNETICS[id].blurb,
        blocker: fitBlocker(roster, op.id, id),
      }))
      : [],
  }));

  return {
    heading: fitting
      ? `<b>CRYOVAT</b> · ${roster.research} RESEARCH UNSPENT · fittings are permanent`
      : `<b>DEPLOYMENT</b> · ${roster.research} RESEARCH BANKED`,
    operatives: rows,
    onFit: fitting
      ? (opId, cyberId) => {
        if (!fit(roster, opId, cyberId)) return;
        saveCampaign(app.campaign);
        showBriefing();
      }
      : null,
  };
}

/**
 * Build the mission's world but leave it paused, so the briefing card sits
 * over a live view of the sector you're about to walk into.
 */
function loadPreview() {
  app.sim = createSim(app.selectedMissionId, { roster: app.campaign.roster });
  view.loadCity(app.sim.city);
  const c = app.sim.squad.center();
  view.rig.smoothTarget.set(c.x, 0, c.z);
  view.rig.pitch = 0.62;
  view.rig.distance = 82;
}

function showBriefing() {
  app.phase = PHASE.BRIEFING;

  // Never sit on a locked mission — a stale selection from a cleared save
  // would otherwise strand the player on a briefing they cannot deploy.
  let def = getMissionDef(app.selectedMissionId);
  if (!isUnlocked(app.campaign, def)) {
    def = nextMission(app.campaign, MISSIONS) ?? MISSIONS[0];
    app.selectedMissionId = def.id;
  }

  // A decision mission has no field component: no city, no preview, just
  // the room and the choice.
  if (def.choice) { showChoice(def); return; }
  // An epilogue has neither. The player chose under the campus; this
  // reads back what it cost.
  if (def.epilogue) { showEpilogue(def); return; }

  loadPreview();
  const { done, total } = progress(app.campaign, MISSIONS);
  const record = app.campaign.records[def.id];

  const body = [...def.briefing];
  if (record) {
    body.push('', `<em>PREVIOUS DEPLOYMENT — ${record.elapsed}s · ${record.kills} down · ${record.aligned} aligned · ${record.civilianDeaths} civilian losses</em>`);
  }

  setOverlay({
    eyebrow: `${def.act} · ${def.sector} · DEPLOYMENT ${done}/${total} CLOSED`,
    title: def.name,
    tabs: MISSIONS.map(m => ({
      id: m.id,
      name: m.name.split(' — ')[0],
      active: m.id === app.selectedMissionId,
      locked: !isUnlocked(app.campaign, m),
      done: isComplete(app.campaign, m.id),
      lockReason: lockReason(app.campaign, m, getMissionDef),
    })),
    onSelectTab: (id) => { app.selectedMissionId = id; showBriefing(); },
    body,
    roster: rosterView(cryovatOpen),
    // The cryovat takes the card over while it is open, so the player
    // cannot fit an implant and deploy in the same click without seeing
    // the roster again. Fittings are permanent; make them deliberate.
    button: cryovatOpen
      ? { label: 'CLOSE CRYOVAT', onClick: toggleCryovat }
      : { label: isComplete(app.campaign, def.id) ? 'REDEPLOY' : 'DEPLOY', onClick: startMission },
    altButton: cryovatOpen
      ? (app.campaign.completed.length ? { label: 'WIPE RECORD', onClick: resetCampaign } : null)
      : { label: 'CRYOVAT', onClick: toggleCryovat },
    hint: CONTROLS_HINT,
  });
  showOverlay();
}

/**
 * A briefing-room mission. There is nothing to deploy into — the mission
 * *is* the decision, and the flag it sets is the only thing it leaves
 * behind.
 */
function showChoice(def) {
  setOverlay({
    eyebrow: `${def.act} · ${def.sector}`,
    title: def.name,
    tabs: MISSIONS.map(m => ({
      id: m.id,
      name: m.name.split(' — ')[0],
      active: m.id === app.selectedMissionId,
      locked: !isUnlocked(app.campaign, m),
      done: isComplete(app.campaign, m.id),
      lockReason: lockReason(app.campaign, m, getMissionDef),
    })),
    onSelectTab: (id) => { app.selectedMissionId = id; showBriefing(); },
    body: def.choice.prompt,
    choices: def.choice.options.map(o => ({
      label: o.label,
      onClick: () => resolveChoice(def, o),
    })),
    hint: 'This one does not deploy. Whatever you choose, he smiles the same way.',
  });
  showOverlay();
}

function resolveChoice(def, option) {
  Object.assign(app.campaign.flags, option.flag ?? {});
  recordWin(app.campaign, def.id, {});
  saveCampaign(app.campaign);
  const next = nextMission(app.campaign, MISSIONS);
  if (next) app.selectedMissionId = next.id;

  app.phase = PHASE.WON;
  setOverlay({
    eyebrow: 'MAINTENANCE CLOSED',
    title: option.label,
    body: option.outcome,
    button: { label: 'RETURN TO BRIEFING', onClick: showBriefing },
  });
  showOverlay();
}

/**
 * The last card in the game. Which one it is was decided at the console
 * in `the-core`, and the flag survives in the save — so this reads the
 * campaign, not the sim, and plays correctly on a reload weeks later.
 */
function showEpilogue(def) {
  app.phase = PHASE.WON;
  app.sim = null;
  const scene = epilogueFor(def, app.campaign.flags);

  // Reaching the last card *is* completing it. There is nothing to do
  // here and no way to fail, so record it on arrival rather than making
  // the player press a button to be told they finished.
  if (!isComplete(app.campaign, def.id)) {
    recordWin(app.campaign, def.id, {});
    saveCampaign(app.campaign);
  }

  setOverlay({
    eyebrow: `${def.act} · ${def.sector}`,
    title: scene.title,
    tabs: MISSIONS.map(m => ({
      id: m.id,
      name: m.name.split(' — ')[0],
      active: m.id === app.selectedMissionId,
      locked: !isUnlocked(app.campaign, m),
      done: isComplete(app.campaign, m.id),
      lockReason: lockReason(app.campaign, m, getMissionDef),
    })),
    onSelectTab: (id) => { app.selectedMissionId = id; showBriefing(); },
    body: scene.lines,
    button: { label: 'BRIEFING ROOM', onClick: showBriefing },
    altButton: { label: 'WIPE RECORD', onClick: resetCampaign },
    hint: 'Syndicate 2026 · the endings are in NARRATIVE.md §7, if you want the other two.',
  });
  showOverlay();
}

function toggleCryovat() {
  cryovatOpen = !cryovatOpen;
  showBriefing();
}

function resetCampaign() {
  app.campaign = clearCampaign();
  app.selectedMissionId = MISSIONS[0].id;
  cryovatOpen = false;
  showBriefing();
}

function startMission() {
  cryovatOpen = false;
  app.sim = createSim(app.selectedMissionId, { roster: app.campaign.roster });
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

  // Who did not come back. Read before anything else touches the roster.
  const deadSlots = app.sim.squad.agents.filter(a => a.dead).map(a => a.slot ?? a.index);
  const fallen = app.sim.squad.agents
    .filter(a => a.dead)
    .map(a => `${a.name}${a.trueName ? ` · ${a.trueName}` : ''}`);
  let casualties = null;

  if (won) {
    recordWin(app.campaign, def.id, {
      elapsed: app.sim.elapsed,
      kills: app.sim.kills,
      aligned: app.sim.alignedCount,
      civilianDeaths: app.sim.civilianDeaths,
    });
    Object.assign(app.campaign.flags, app.sim.mission.flags);
    // Losses and research only land on a win. A failed deployment is a
    // reload, not a funeral — permadeath that punishes a retry is just a
    // tax on experimenting, and the original did not do that either.
    casualties = recordCasualties(app.campaign, def.id, {
      squadAlive: app.sim.squad.alive.length,
      civilianDeaths: app.sim.civilianDeaths,
      deadSlots,
    });
    saveCampaign(app.campaign);
    // Roll the selection forward so RETURN TO BRIEFING lands on what's next.
    const next = nextMission(app.campaign, MISSIONS);
    if (next) app.selectedMissionId = next.id;
  }
  // A mission can be lost specifically — the escorted asset died, the
  // target got away — and the debrief should say which.
  // A mission can win in more than one way — freeing the holding block at
  // Node 7 earns different copy from walking past it.
  const winKey = won ? (def.debriefKey?.(app.sim) ?? 'win') : null;
  const lines = won
    ? debriefLines(def, winKey)
    : (def.debrief[app.sim.failReason] ?? def.debrief.loss);
  const stats = [
    '',
    `HOSTILES DOWN <strong>${app.sim.kills}</strong> · ALIGNED <strong>${app.sim.alignedCount}</strong> · CIVILIAN LOSSES <strong>${app.sim.civilianDeaths}</strong>`,
  ];
  // A permanent loss said in a stats line is a footnote. Say it in words,
  // by name, and say who is wearing the designation now.
  if (casualties?.lost.length) {
    stats.push('', `<strong>NOT RECOVERED — ${fallen.join(' · ')}</strong>`);
    stats.push(casualties.drawn.length
      ? `The mesh has people. ${casualties.drawn.map(o => `<em>${o.name}</em> takes ${o.designation}`).join('; ')}. Nobody briefs them on whose suit it is.`
      : 'There is nobody left in the pool. The next deployment goes in short-handed.');
  }
  if (casualties?.earned) {
    stats.push('', `<em>RESEARCH BANKED ${casualties.earned} — cryovat fittings are on the briefing card.</em>`);
  }
  const titles = def.debrief.titles ?? {};
  const lostTitle = titles[app.sim.failReason]
    ?? (app.sim.failReason === 'assetLost' ? 'ASSET LOST' : 'DEPLOYMENT TERMINATED');
  setOverlay({
    eyebrow: won ? 'DEPLOYMENT CLOSED' : 'DEPLOYMENT LOST',
    title: won ? (titles[winKey] ?? titles.win ?? 'SECTOR PROVISIONED') : lostTitle,
    body: [...lines, ...stats],
    button: { label: won ? 'RETURN TO BRIEFING' : 'REDEPLOY', onClick: won ? showBriefing : startMission },
    altButton: won ? null : { label: 'BRIEFING ROOM', onClick: showBriefing },
    hint: CONTROLS_HINT,
  });
  showOverlay();
}

/**
 * A mid-mission dialog beat. The field is already frozen by the sim; this
 * puts the card up and hands the answer back.
 *
 * The reply is shown as a second card rather than dumped into the
 * subtitle channel — Yelin's argument is four paragraphs and the player
 * is meant to read it, not catch it going past.
 */
function showInterlude(beat) {
  app.phase = PHASE.BRIEFING;
  setOverlay({
    eyebrow: 'CHANNEL OPEN',
    title: beat.speaker,
    body: beat.lines,
    choices: beat.options.map(o => ({
      label: o.label,
      onClick: () => {
        const chosen = answerInterlude(app.sim, o.id);
        if (chosen?.lines?.length) showInterludeReply(chosen);
        else resumeMission();
      },
    })),
    hint: CONTROLS_HINT,
  });
  showOverlay();
}

function showInterludeReply(option) {
  setOverlay({
    eyebrow: 'CHANNEL OPEN',
    title: option.label,
    body: option.lines,
    button: { label: 'BACK TO THE FLOOR', onClick: resumeMission },
    hint: CONTROLS_HINT,
  });
  showOverlay();
}

function resumeMission() {
  app.phase = PHASE.PLAYING;
  hideOverlay();
}

// ---------------------------------------------------------------------------
// Fullscreen
// ---------------------------------------------------------------------------

const shell = document.getElementById('game-shell');
const fsButton = document.getElementById('hud-fullscreen');
const fsLabel = document.getElementById('hud-fullscreen-label');

/**
 * Take the shell fullscreen, not the canvas — fullscreening the canvas
 * alone leaves the HUD and every overlay card behind on the page.
 *
 * The renderer resizes off the `resize` event, which the browser fires on
 * entering and leaving, so there is nothing to drive by hand here.
 */
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    // Rejected when the gesture isn't trusted, or when the browser or an
    // embedding iframe forbids it. A fullscreen button that silently does
    // nothing is better than an unhandled rejection in the console.
    shell.requestFullscreen?.().catch(() => {});
  }
}

document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  fsLabel.textContent = on ? '⤢ EXIT' : '⛶ FULL';
  fsButton.title = on ? 'Exit fullscreen (Alt+Enter or Esc)' : 'Fullscreen (Alt+Enter)';
  view.resize();
});

fsButton.addEventListener('click', toggleFullscreen);

// Fullscreen is unavailable in some embeds. Don't advertise a control
// that cannot work.
if (!shell.requestFullscreen) fsButton.classList.add('hidden');

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (MOVE_KEYS.has(k) || k === ' ' || k === 'tab') e.preventDefault();

  // Works from the briefing card too — the player should be able to go
  // fullscreen before deploying, not only mid-firefight.
  if (k === 'enter' && e.altKey) {
    e.preventDefault();
    toggleFullscreen();
    return;
  }

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
  } else if (k === 'c') {
    squad.compute.shiftInto('latency');
  } else if (k === 'v') {
    squad.compute.shiftInto('precision');
  } else if (k === 'b') {
    squad.compute.shiftInto('resilience');
  } else if (k === 'g') {
    squad.compute.toggleSurge();
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
      else if (app.sim.interlude) showInterlude(app.sim.interlude);
    }

    view.render(app.sim, dt);
  }
}

// ---------------------------------------------------------------------------

showBriefing();
requestAnimationFrame(frame);

// Surface the app for console poking during development.
window.__syndicate = app;
