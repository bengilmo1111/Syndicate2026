// Briefing and debrief cards. Copy comes from the mission definitions, which
// draw on NARRATIVE.md — nothing here invents fiction.

const el = id => document.getElementById(id);

export function setOverlay({ eyebrow, title, body, tabs, onSelectTab, button, hint }) {
  el('overlay-eyebrow').textContent = eyebrow ?? '';
  el('overlay-title').textContent = title;

  const tabBar = el('overlay-tabs');
  tabBar.innerHTML = '';
  tabBar.classList.toggle('hidden', !tabs || !tabs.length);
  if (tabs) {
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = `mission-tab${t.active ? ' active' : ''}`;
      b.textContent = t.name;
      b.addEventListener('click', () => onSelectTab(t.id));
      tabBar.appendChild(b);
    }
  }

  el('overlay-body').innerHTML = (body ?? [])
    .map(line => (line === '' ? '<div class="spacer"></div>' : `<p>${line}</p>`))
    .join('');

  const btn = el('overlay-button');
  btn.textContent = button.label;
  btn.onclick = button.onClick;

  el('overlay-hint').innerHTML = hint ?? '';
}

export function showOverlay() {
  el('overlay').classList.remove('hidden');
}

export function hideOverlay() {
  el('overlay').classList.add('hidden');
}

export const CONTROLS_HINT = [
  '<b>1–4</b> select agent · <b>Shift+1–4</b> add · <b>Q</b> whole deployment',
  '<b>WASD</b> move (camera-relative) · <b>Right-click</b> move order',
  '<b>Left-click</b> focus fire — release for auto-fire',
  '<b>Space</b> Aligner · <b>Tab</b> objectives',
  '<b>Z / X</b> rotate city · <b>R / F</b> tilt · <b>Wheel</b> zoom · <b>Middle-drag</b> orbit',
].join('<br>');
