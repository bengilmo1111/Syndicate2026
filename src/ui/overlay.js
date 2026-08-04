// Briefing and debrief cards. Copy comes from the mission definitions, which
// draw on NARRATIVE.md — nothing here invents fiction.

const el = id => document.getElementById(id);

export function setOverlay({
  eyebrow, title, body, tabs, onSelectTab, button, altButton, choices, roster, map, hint,
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
  renderMap(map);

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

/**
 * The sector map.
 *
 * Deliberately the same visual grammar as the roster — a row per thing
 * you own, its state, and the controls that change it — because the two
 * panels are asking the same question in different currencies: who is
 * worth spending on, and what is worth squeezing.
 *
 * The throttle button is the whole panel. Everything else is the
 * consequence of pressing it, said out loud.
 */
function renderMap(map) {
  const host = el('overlay-map');
  host.innerHTML = '';
  host.classList.toggle('hidden', !map);
  if (!map) return;

  const head = document.createElement('p');
  head.className = 'roster-head';
  head.innerHTML = map.heading;
  host.appendChild(head);

  // Who the other four are and how each of them comes at you. Without
  // this the doctrines are invisible mechanics and the syndicates are
  // four names on the same behaviour.
  if (map.dossier) {
    const d = document.createElement('p');
    d.className = 'rival-dossier';
    d.innerHTML = map.dossier;
    host.appendChild(d);
  }

  for (const s of map.sectors) {
    const row = document.createElement('div');
    row.className = `roster-row sector-row ${s.status.toLowerCase()}`;

    const who = document.createElement('span');
    who.className = 'roster-who';
    who.innerHTML = s.held
      ? `<b>${s.name}</b>`
      : `<b class="unheld">${s.name}</b>`;
    who.title = s.detail;
    row.appendChild(who);

    const stat = document.createElement('span');
    stat.className = 'roster-stat';
    stat.textContent = s.detail_line;
    row.appendChild(stat);

    const kit = document.createElement('span');
    kit.className = 'roster-kit';

    if (s.held) {
      // Two bars, because there are two ways to lose a sector and the
      // player has to be able to tell which one is closer: the people
      // throwing you out, and somebody with a logo walking in.
      const meter = document.createElement('span');
      meter.className = 'unrest';
      meter.title = `UNREST ${Math.round(s.unrest)} / ${s.revoltAt} — at full, the sector revolts`;
      const fill = document.createElement('i');
      fill.style.width = `${Math.min(100, (s.unrest / s.revoltAt) * 100)}%`;
      if (s.unrest >= s.revoltAt * 0.7) fill.classList.add('crit');
      else if (s.unrest >= s.revoltAt * 0.35) fill.classList.add('warn');
      meter.appendChild(fill);
      kit.appendChild(meter);

      const push = document.createElement('span');
      push.className = 'unrest contest';
      push.title = s.contestedBy
        ? `${s.contestedBy} PUSH ${Math.round(s.contest)} / ${s.seizeAt} — at full, they take it`
        : 'NOBODY IS PUSHING HERE';
      const pushFill = document.createElement('i');
      pushFill.style.width = `${Math.min(100, (s.contest / s.seizeAt) * 100)}%`;
      if (s.status === 'CONTESTED') pushFill.classList.add('crit');
      push.appendChild(pushFill);
      kit.appendChild(push);

      const b = document.createElement('button');
      b.className = 'implant throttle';
      b.textContent = s.throttleLabel;
      b.title = s.throttleNote;
      b.addEventListener('click', () => map.onThrottle(s.id));
      kit.appendChild(b);
    } else {
      const tag = document.createElement('span');
      tag.className = 'implant unheld-tag';
      tag.textContent = s.status;
      kit.appendChild(tag);

      // A block you held once and do not hold now. The button is the whole
      // reason the map is not a spreadsheet: it writes a deployment against
      // whoever is standing in it, rather than sending you back through the
      // briefing that took it the first time.
      if (s.retake) {
        const b = document.createElement('button');
        b.className = 'implant throttle retake';
        b.textContent = s.status === 'REVOLTED' ? 'GO BACK' : 'RETAKE';
        b.title = 'Write a deployment for this block and open its briefing';
        b.addEventListener('click', () => map.onRetake(s.id));
        kit.appendChild(b);
      }
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
  '<b>H</b> fire discipline — engage at will / return fire / hold fire',
  '<b>C / V / B</b> shift compute into latency / precision / resilience',
  '<b>G</b> surge — faster, straighter, tougher. Taken from the street.',
  '<b>E</b> choke field · <b>T</b> standdown aerosol — thrown at the cursor,',
  'and neither of them asks whose side you are on.',
  'Set <b>HOLD FIRE</b> while the aerosol works and a deployment can end',
  'with nobody dead. (The Aligner suppresses fire too, if your hands are',
  'already there.)',
  'The belt grows with the campaign: <b>U</b> razor wire, <b>Y</b> misalignment',
  'aerosol, <b>O</b> graviton charge, <b>I</b> satellite rain. None of them is a',
  'bigger gun and every one of them applies to your squad. The rain gives',
  'you three and a half seconds and a ring on the ground; that is the whole',
  'warning, and it is the same warning everyone else in the block gets.',
  '<b>Z / X</b> rotate city · <b>R / F</b> tilt · <b>Wheel</b> zoom · <b>Middle-drag</b> orbit',
  '<b>Alt+Enter</b> fullscreen · <b>M</b> sound — or the panels, top right',
].join('<br>');
