import { activeObjective } from './world.js';

const hudObjective = document.getElementById('hud-objective');
const hudKills = document.getElementById('hud-kills');
const hudFollowers = document.getElementById('hud-followers');
const hudTime = document.getElementById('hud-time');
const hudSquad = document.getElementById('hud-squad');
const hudMode = document.getElementById('hud-mode');
const hudHeatFill = document.getElementById('hud-heat-fill');
const HEAT_THRESHOLD = 60;
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody = document.getElementById('overlay-body');
const overlayHint = document.getElementById('overlay-hint');
const overlayButton = document.getElementById('overlay-button');

let agentCards = null;

function ensureAgentCards(squad) {
  if (agentCards && agentCards.length === squad.agents.length) return;
  hudSquad.innerHTML = '';
  agentCards = squad.agents.map(agent => {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML = `
      <div class="agent-row">
        <span class="agent-id">${agent.id}</span>
        <span class="agent-name">${agent.name}</span>
        <span class="agent-status"></span>
      </div>
      <div class="agent-bar"><div class="agent-bar-fill"></div></div>
    `;
    hudSquad.appendChild(card);
    return {
      root: card,
      fill: card.querySelector('.agent-bar-fill'),
      status: card.querySelector('.agent-status'),
    };
  });
}

export function updateHUD(state) {
  if (state.mission) {
    const obj = activeObjective(state.mission);
    if (obj) {
      hudObjective.textContent = `${obj.description} (${obj.progress}/${obj.target})`;
    } else {
      hudObjective.textContent = 'All objectives complete';
    }
  } else {
    hudObjective.textContent = '—';
  }
  hudKills.textContent = state.kills;
  hudFollowers.textContent = state.followers ?? 0;
  const elapsed = state.startTime ? Math.floor((performance.now() - state.startTime) / 1000) : 0;
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  hudTime.textContent = `${minutes}:${seconds}`;
  hudMode.classList.toggle('hidden', !state.persuadertron);

  const heat = Math.max(0, state.heat ?? 0);
  const pct = Math.min(100, (heat / HEAT_THRESHOLD) * 100);
  hudHeatFill.style.width = `${pct}%`;
  hudHeatFill.classList.toggle('warm', pct >= 50 && pct < 85);
  hudHeatFill.classList.toggle('hot', pct >= 85);

  if (!state.squad) return;
  ensureAgentCards(state.squad);
  state.squad.agents.forEach((agent, i) => {
    const card = agentCards[i];
    if (!card) return;
    const pct = Math.max(0, agent.health / agent.maxHealth);
    card.fill.style.width = `${pct * 100}%`;
    card.fill.style.background = agent.color;
    card.root.classList.toggle('selected', agent.selected && !agent.dead);
    card.root.classList.toggle('dead', agent.dead);
    card.status.textContent = agent.dead ? 'KIA' : `${agent.health}`;
  });
}

export function showOverlay() {
  overlay.classList.remove('hidden');
}

export function hideOverlay() {
  overlay.classList.add('hidden');
}

let missionTabsEl = null;
function ensureMissionTabsContainer() {
  if (missionTabsEl) return missionTabsEl;
  missionTabsEl = document.createElement('div');
  missionTabsEl.id = 'overlay-tabs';
  overlayTitle.parentNode.insertBefore(missionTabsEl, overlayTitle.nextSibling);
  return missionTabsEl;
}

export function setOverlayContent({ title, body, button, hint, missionTabs, onSelectMission }) {
  overlayTitle.textContent = title || '';

  if (Array.isArray(missionTabs) && missionTabs.length > 0) {
    const container = ensureMissionTabsContainer();
    container.innerHTML = '';
    container.style.display = '';
    for (const tab of missionTabs) {
      const btn = document.createElement('button');
      btn.className = 'mission-tab' + (tab.active ? ' active' : '');
      btn.textContent = tab.name;
      btn.onclick = () => onSelectMission && onSelectMission(tab.id);
      container.appendChild(btn);
    }
  } else if (missionTabsEl) {
    missionTabsEl.innerHTML = '';
    missionTabsEl.style.display = 'none';
  }

  overlayBody.innerHTML = '';
  if (Array.isArray(body)) {
    for (const para of body) {
      const p = document.createElement('p');
      p.innerHTML = para;
      overlayBody.appendChild(p);
    }
  } else if (typeof body === 'string') {
    const p = document.createElement('p');
    p.innerHTML = body;
    overlayBody.appendChild(p);
  }
  overlayHint.textContent = hint || '';
  overlayHint.style.display = hint ? '' : 'none';
  if (button) {
    overlayButton.textContent = button.label;
    overlayButton.onclick = button.onClick;
    overlayButton.style.display = '';
  } else {
    overlayButton.style.display = 'none';
  }
}
