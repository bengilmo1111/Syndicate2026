// Briefing and debrief cards. Copy comes from the mission definitions, which
// draw on NARRATIVE.md — nothing here invents fiction.

const el = id => document.getElementById(id);

export function setOverlay({
  eyebrow, title, body, tabs, onSelectTab, button, altButton, choices, hint,
}) {
  el('overlay-eyebrow').textContent = eyebrow ?? '';
  el('overlay-title').textContent = title;

  const tabBar = el('overlay-tabs');
  tabBar.innerHTML = '';
  tabBar.classList.toggle('hidden', !tabs || !tabs.length);
  if (tabs) {
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'mission-tab';
      if (t.active) b.classList.add('active');
      if (t.locked) b.classList.add('locked');
      if (t.done) b.classList.add('done');
      b.textContent = t.locked ? `▮ ${t.name}` : (t.done ? `■ ${t.name}` : t.name);
      b.disabled = !!t.locked;
      if (t.locked) b.title = t.lockReason ?? 'LOCKED';
      else b.addEventListener('click', () => onSelectTab(t.id));
      tabBar.appendChild(b);
    }
  }

  el('overlay-body').innerHTML = (body ?? [])
    .map(line => (line === '' ? '<div class="spacer"></div>' : `<p>${line}</p>`))
    .join('');

  // A decision mission renders its options instead of a deploy button.
  const choiceHost = el('overlay-choices');
  choiceHost.innerHTML = '';
  choiceHost.classList.toggle('hidden', !choices || !choices.length);
  if (choices) {
    for (const c of choices) {
      const b = document.createElement('button');
      b.className = 'choice-button';
      b.textContent = c.label;
      b.addEventListener('click', () => c.onClick());
      choiceHost.appendChild(b);
    }
  }

  const actions = el('overlay-actions');
  actions.classList.toggle('hidden', !button);
  const btn = el('overlay-button');
  if (button) {
    btn.textContent = button.label;
    btn.onclick = button.onClick;
  }

  // Secondary action. Without one, a lost mission is a dead end — the only
  // button redeploys you into the same sector forever.
  const alt = el('overlay-alt-button');
  alt.classList.toggle('hidden', !altButton);
  if (altButton) {
    alt.textContent = altButton.label;
    alt.onclick = altButton.onClick;
  }

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
  '<b>C / V / B</b> shift compute into latency / precision / resilience',
  '<b>G</b> surge — faster, straighter, tougher. Taken from the street.',
  '<b>Z / X</b> rotate city · <b>R / F</b> tilt · <b>Wheel</b> zoom · <b>Middle-drag</b> orbit',
].join('<br>');
