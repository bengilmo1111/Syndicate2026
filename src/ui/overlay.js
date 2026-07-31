// Briefing and debrief cards. Copy comes from the mission definitions, which
// draw on NARRATIVE.md — nothing here invents fiction.

const el = id => document.getElementById(id);

export function setOverlay({
  eyebrow, title, body, tabs, onSelectTab, button, altButton, choices, roster, hint,
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

  renderRoster(roster);

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

/**
 * The four people going in, and what has been fitted to them.
 *
 * Rendered on the briefing card because that is where the player is
 * deciding whether to risk them. A roster tucked behind a menu is a stats
 * screen; a roster on the card you press DEPLOY from is a decision.
 *
 * `onFit` present means this is the cryovat: every unfitted implant
 * becomes a button, disabled with a reason when it cannot be bought.
 */
function renderRoster(roster) {
  const host = el('overlay-roster');
  host.innerHTML = '';
  host.classList.toggle('hidden', !roster);
  if (!roster) return;

  if (roster.heading) {
    const h = document.createElement('p');
    h.className = 'roster-head';
    h.innerHTML = roster.heading;
    host.appendChild(h);
  }

  for (const op of roster.operatives) {
    const row = document.createElement('div');
    row.className = `roster-row${op.lost ? ' lost' : ''}`;

    const who = document.createElement('span');
    who.className = 'roster-who';
    who.innerHTML = op.lost
      ? `<b>${op.designation}</b> <s>${op.name}</s>`
      : `<b>${op.designation}</b> ${op.name}`;
    row.appendChild(who);

    const stat = document.createElement('span');
    stat.className = 'roster-stat';
    stat.textContent = op.detail;
    row.appendChild(stat);

    const kit = document.createElement('span');
    kit.className = 'roster-kit';
    for (const item of op.implants) {
      const tag = document.createElement('span');
      tag.className = 'implant';
      tag.textContent = item.short;
      tag.title = `${item.name} — ${item.blurb}`;
      kit.appendChild(tag);
    }
    for (const item of op.offers ?? []) {
      const b = document.createElement('button');
      b.className = 'implant offer';
      b.textContent = `+ ${item.short} (${item.cost})`;
      b.title = item.blocker ? item.blocker : `${item.name} — ${item.blurb}`;
      b.disabled = !!item.blocker;
      if (!item.blocker) b.addEventListener('click', () => roster.onFit(op.id, item.id));
      kit.appendChild(b);
    }
    row.appendChild(kit);
    host.appendChild(row);
  }
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
  '<b>E</b> choke field · <b>T</b> standdown aerosol — thrown at the cursor,',
  'two charges each, and neither of them asks whose side you are on.',
  'Hold the Aligner while the aerosol works: it suppresses your own fire,',
  'which is the only way a deployment ends with nobody dead.',
  '<b>Z / X</b> rotate city · <b>R / F</b> tilt · <b>Wheel</b> zoom · <b>Middle-drag</b> orbit',
  '<b>Alt+Enter</b> fullscreen — or the <b>⛶ VIEW</b> panel, top right',
].join('<br>');
