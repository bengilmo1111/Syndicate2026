// HUD DOM updates. Reads sim state, writes text. No game logic lives here.

import { AGENT_NAMES } from '../core/entities.js';
import { activeObjective, objectiveText, STATUS } from '../core/mission.js';
import { heatRatio } from '../core/sim.js';
import { CHANNELS, BUDGET } from '../core/compute.js';
import { AGENT_COLORS } from '../render/actorView.js';

const el = id => document.getElementById(id);

let squadBuilt = false;
let cells = [];

function buildSquadStrip() {
  const strip = el('hud-squad');
  strip.innerHTML = '';
  cells = AGENT_NAMES.map((name, i) => {
    const cell = document.createElement('div');
    cell.className = 'agent-cell';
    cell.innerHTML = `
      <div class="agent-key">${i + 1}</div>
      <div class="agent-body">
        <div class="agent-name">${name}<span class="agent-weapon"></span></div>
        <div class="agent-bar"><div class="agent-bar-fill"></div></div>
        <div class="agent-tier">PRO</div>
      </div>`;
    const color = `#${AGENT_COLORS[i].toString(16).padStart(6, '0')}`;
    cell.style.setProperty('--agent-color', color);
    strip.appendChild(cell);
    return {
      root: cell,
      fill: cell.querySelector('.agent-bar-fill'),
      tier: cell.querySelector('.agent-tier'),
      weapon: cell.querySelector('.agent-weapon'),
    };
  });
  squadBuilt = true;
}

const CHANNEL_KEYS = { latency: 'C', precision: 'V', resilience: 'B' };
let computeBuilt = false;
let channelRows = {};

function buildComputePanel() {
  const host = el('compute-channels');
  host.innerHTML = '';
  channelRows = {};
  for (const channel of CHANNELS) {
    const row = document.createElement('div');
    row.className = 'compute-row';
    row.innerHTML = `
      <span class="compute-key">${CHANNEL_KEYS[channel]}</span>
      <span class="compute-name">${channel.toUpperCase()}</span>
      <span class="compute-pips"></span>`;
    host.appendChild(row);
    channelRows[channel] = row.querySelector('.compute-pips');
  }
  computeBuilt = true;
}

function renderCompute(sim) {
  if (!computeBuilt) buildComputePanel();
  const c = sim.squad.compute;

  for (const channel of CHANNELS) {
    const n = c.alloc[channel];
    channelRows[channel].innerHTML = Array.from({ length: BUDGET }, (_, i) =>
      `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  }

  el('hud-compute').classList.toggle('surging', c.surging);
  el('compute-surge').classList.toggle('active', c.surging);

  // Name the cost while it is being paid. The number is people.
  const foot = el('compute-throttle');
  foot.classList.toggle('hidden', !c.surging);
  if (c.surging) {
    foot.textContent = `THROTTLING ${sim.throttledCount} INSTANCE${sim.throttledCount === 1 ? '' : 'S'}`;
  }
}

export function updateHUD(sim) {
  if (!squadBuilt) buildSquadStrip();

  const obj = activeObjective(sim.mission);
  el('hud-objective').textContent = obj ? objectiveText(obj) : 'ALL OBJECTIVES MET';

  el('hud-kills').textContent = String(sim.kills);
  el('hud-aligned').textContent = String(sim.alignedCount);
  el('hud-losses').textContent = String(sim.civilianDeaths);

  const heat = heatRatio(sim);
  const fill = el('hud-heat-fill');
  fill.style.width = `${Math.round(heat * 100)}%`;
  fill.classList.toggle('warn', heat > 0.5);
  fill.classList.toggle('crit', heat > 0.8);

  // On a contract mission the clock counts *down* — the filing window is
  // the actual antagonist, not the private security.
  const window = sim.quarry.find(q => !q.dead && !q.escaped)?.window;
  const secs = window ? Math.max(0, Math.ceil(window - sim.elapsed)) : Math.floor(sim.elapsed);
  el('hud-time').textContent =
    `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  el('hud-time').classList.toggle('urgent', !!window && secs < 30);

  sim.squad.agents.forEach((a, i) => {
    const c = cells[i];
    c.root.classList.toggle('selected', a.selected && !a.dead);
    c.root.classList.toggle('kia', a.dead);
    c.fill.style.width = `${Math.round((a.health / a.maxHealth) * 100)}%`;
    c.tier.textContent = a.dead ? 'KIA' : a.weapon.name;
    // Spin-up is worth showing: a minigun agent who has not committed yet
    // is not a minigun agent.
    const spinning = a.weapon.spinUp && a.spin > 0 && a.spin < a.weapon.spinUp;
    c.weapon.textContent = spinning ? ' ⟳' : '';
    c.root.classList.toggle('spinning', !!spinning);
  });

  renderCompute(sim);

  const mode = el('hud-mode');
  if (sim.squad.alignerEngaged) {
    mode.classList.remove('hidden');
    mode.textContent = sim.squad.alignerMode === 'jailbreak'
      ? 'ALIGNER — JAILBREAK EMITTER'
      : 'ALIGNER ENGAGED — FIRE SUPPRESSED';
    mode.classList.toggle('jailbreak', sim.squad.alignerMode === 'jailbreak');
  } else {
    mode.classList.add('hidden');
  }

  const alert = el('hud-alert');
  alert.classList.toggle('hidden', sim.alertTimer <= 0);

  const sub = el('hud-subtitle');
  if (sim.dialogue) {
    sub.classList.remove('hidden');
    el('subtitle-speaker').textContent = sim.dialogue.speaker;
    el('subtitle-text').textContent = sim.dialogue.text;
  } else {
    sub.classList.add('hidden');
  }

  renderObjectivePanel(sim);
}

let panelOpen = false;

export function toggleObjectivePanel() {
  panelOpen = !panelOpen;
  el('objective-panel').classList.toggle('hidden', !panelOpen);
  return panelOpen;
}

function renderObjectivePanel(sim) {
  if (!panelOpen) return;
  const list = el('objective-list');
  list.innerHTML = sim.mission.objectives
    .filter(o => !o.hidden)
    .map(o => {
      const done = o.status === STATUS.COMPLETE;
      const mark = done ? '■' : '□';
      const opt = o.optional ? ' <em>(optional)</em>' : '';
      return `<li class="${done ? 'done' : ''}"><span class="mark">${mark}</span> ${objectiveText(o)}${opt}</li>`;
    })
    .join('');
  el('objective-sector').textContent = sim.mission.sector ?? '';
  el('objective-mission').textContent = sim.mission.name;
}
