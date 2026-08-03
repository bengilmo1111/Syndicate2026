#!/usr/bin/env node
// Integration check for the things Node cannot see: that the page actually
// loads, that ES modules resolve over HTTP, that WebGL renders, that the HUD
// updates, and that the console stays clean.
//
//   node tests/browser.mjs            headless
//   node tests/browser.mjs --shots    also write screenshots to tests/shots/
//
// Opt-in: needs Playwright, which the project does not otherwise depend on.
// `node tests/run.mjs` is the gate; this is the extra mile before a release.
// Skips cleanly (exit 0) when Playwright isn't installed, so CI without it
// doesn't report a false failure.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const shots = process.argv.includes('--shots');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('· playwright not installed — skipping browser checks');
  console.log('  (npm i playwright, or run `node tests/run.mjs` for the gate)');
  process.exit(0);
}

// ---------------------------------------------------------- static server

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const path = join(root, rel === '/' ? 'index.html' : rel);
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ------------------------------------------------------------- launch

async function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!dir) return undefined;
  for await (const p of glob(`${dir}/chromium-*/chrome-linux/chrome`)) return p;
  return undefined;
}

const browser = await chromium.launch({
  executablePath: await findChromium(),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(`${e.message}\n${e.stack ?? ''}`));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n\x1b[1mbrowser\x1b[0m');

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

check('the page boots and shows a briefing', !!(await page.textContent('#overlay-title')));

const tabs0 = await page.$$eval('.mission-tab',
  els => els.map(e => ({ text: e.textContent, locked: e.disabled })));
check('every mission has a briefing tab', tabs0.length >= 4,
  tabs0.map(t => t.text).join(', '));

// A cold save must gate everything past the first mission — the Act I→II
// turn only lands if the player walked Act I in order.
check('a fresh campaign locks everything past mission one',
  !tabs0[0].locked && tabs0.slice(1).every(t => t.locked),
  `${tabs0.filter(t => t.locked).length} of ${tabs0.length} locked`);

const lockedTitle = await page.getAttribute('.mission-tab:nth-child(2)', 'title');
check('a locked tab says what to do first', /REQUIRES/.test(lockedTitle ?? ''), lockedTitle);

// Unlock everything for the render sweep below.
await page.evaluate(() => {
  localStorage.setItem('syndicate2026.campaign', JSON.stringify({
    version: 2,
    completed: ['sector-7', 'district-12', 'sable-campus', 'the-bracket',
      'okafor-contract', 'calibration-window', 'welfare-node-7', 'the-refusal', 'gradient-relay-4', 'run-south',
      'reverse-the-gradient', 'the-tower', 'yelin',
      'the-core'],
    flags: { ending: 'walk' },
    records: {},
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const missions = await page.$$eval('.mission-tab', els => els.map(e => e.textContent));
check('a completed campaign unlocks every mission',
  await page.$$eval('.mission-tab', els => els.every(e => !e.disabled)));

// Deploy and render each mission in turn — this is what catches a renderer
// crash on a city shape the sim tests never build a mesh for.
for (let i = 0; i < missions.length; i++) {
  await page.click(`.mission-tab:nth-child(${i + 1})`);
  await page.waitForTimeout(400);
  const title = await page.textContent('#overlay-title');

  // The epilogue has no world and no decision — it reads back the ending
  // the player chose, and there is nothing to deploy. It must not be
  // treated as a field mission or the sweep clicks through to a null sim.
  const isEpilogue = await page.evaluate(() =>
    !window.__syndicate.sim && !document.getElementById('overlay-choices').checkVisibility());
  if (isEpilogue) {
    const body = await page.textContent('#overlay-body');
    check(`${title}: reads back the ending instead of deploying`,
      body.length > 400 && title !== 'SYNDICATE 2026', `${title} · ${body.length} chars`);
    await page.click('#overlay-button');
    await page.waitForTimeout(600);
    continue;
  }

  // Decision missions have no field component — they render a choice
  // instead of a deploy button.
  if (await page.isVisible('#overlay-choices')) {
    const options = await page.$$eval('.choice-button', els => els.map(e => e.textContent));
    check(`${title}: offers a decision instead of deploying`, options.length >= 2,
      options.join(' / '));
    await page.click('.choice-button');
    await page.waitForTimeout(500);
    const flag = await page.evaluate(() => window.__syndicate.campaign.flags);
    check('and choosing records a narrative flag', Object.keys(flag).length > 0,
      JSON.stringify(flag));
    await page.click('#overlay-button');
    await page.waitForTimeout(600);
    continue;
  }

  await page.click('#overlay-button');
  await page.waitForTimeout(1100);

  const state = await page.evaluate(() => {
    const app = window.__syndicate;
    const canvas = document.getElementById('game-canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return {
      phase: app.phase,
      agents: app.sim.squad.alive.length,
      structures: app.sim.city.structures.length,
      glLost: !gl || gl.isContextLost(),
      objective: document.getElementById('hud-objective').textContent,
    };
  });
  check(`${title}: deploys and renders`,
    state.phase === 'playing' && state.agents === 4 && !state.glLost && state.structures > 10,
    `${state.agents} agents · ${state.structures} structures · objective "${state.objective}"`);

  if (shots) {
    await mkdir(join(root, 'tests/shots'), { recursive: true });
    await page.screenshot({ path: join(root, `tests/shots/${i}-deployed.png`) });
  }

  // Wipe the squad, then take the debrief's secondary action back to the
  // briefing room. A lost mission that can only redeploy is a dead end.
  await page.evaluate(() => { window.__syndicate.sim.squad.agents.forEach(a => { a.dead = true; }); });
  await page.waitForTimeout(600);
  const escape = await page.isVisible('#overlay-alt-button');
  if (i === 0) check('a lost mission can return to mission select', escape);
  await page.click('#overlay-alt-button');
  await page.waitForTimeout(600);
}

// --- the roster and the cryovat. The sim tests prove implants reach the
// --- Agent; only a browser run proves the player can actually buy one.
await page.click('.mission-tab:nth-child(1)');
await page.waitForTimeout(400);

const rosterRows = await page.$$eval('.roster-row', els => els.map(e => e.textContent));
check('the briefing card shows who is going in', rosterRows.length >= 4,
  `${rosterRows.length} operatives`);
check('and names them', /IDRIS/.test(rosterRows.join(' ')) && /MAREN-TWO/.test(rosterRows.join(' ')));

// Bank some research the way a finished mission would, then open the vat.
await page.evaluate(() => {
  window.__syndicate.campaign.roster.research = 9;
});
await page.click('#overlay-alt-button');           // CRYOVAT
await page.waitForTimeout(400);
const offers = await page.$$('.implant.offer:not([disabled])');
check('the cryovat offers fittings you can afford', offers.length > 0, `${offers.length} available`);

const bankedBefore = await page.evaluate(() => window.__syndicate.campaign.roster.research);
await offers[0].click();
await page.waitForTimeout(500);
const fitted = await page.evaluate(() => ({
  research: window.__syndicate.campaign.roster.research,
  implants: window.__syndicate.campaign.roster.operatives[0].implants.length,
  saved: JSON.parse(localStorage.getItem('syndicate2026.campaign')).roster.operatives[0].implants.length,
}));
check('fitting one spends research and persists to the save',
  fitted.research < bankedBefore && fitted.implants === 1 && fitted.saved === 1,
  `${bankedBefore} → ${fitted.research} research · ${fitted.implants} fitted · ${fitted.saved} in the save`);

// A fitting with nothing left to spend must be refused, not silently free.
await page.evaluate(() => { window.__syndicate.campaign.roster.research = 0; });
await page.click('#overlay-button');               // CLOSE CRYOVAT
await page.waitForTimeout(300);
await page.click('#overlay-alt-button');           // CRYOVAT again
await page.waitForTimeout(400);
check('with nothing banked every fitting is disabled',
  (await page.$$('.implant.offer:not([disabled])')).length === 0);
await page.click('#overlay-button');
await page.waitForTimeout(300);

// --- input wiring: the sim tests drive state directly, so only a browser
// --- run proves the keyboard and mouse are actually connected to it.
await page.click('.mission-tab:nth-child(1)');
await page.waitForTimeout(300);
await page.click('#overlay-button');
await page.waitForTimeout(800);

const before = await page.evaluate(() => window.__syndicate.sim.squad.agents[0].z);
await page.keyboard.down('w');
await page.waitForTimeout(700);
await page.keyboard.up('w');
const after = await page.evaluate(() => window.__syndicate.sim.squad.agents[0].z);
check('WASD moves the squad', Math.abs(after - before) > 1, `Δz ${(after - before).toFixed(1)}`);

await page.keyboard.press('2');
const sel = await page.evaluate(() => window.__syndicate.sim.squad.agents.map(a => a.selected));
check('number keys select a single agent', sel.filter(Boolean).length === 1 && sel[1]);
await page.keyboard.press('q');

await page.keyboard.press(' ');
await page.waitForTimeout(300);
const alignerOn = await page.evaluate(() => ({
  mode: window.__syndicate.sim.squad.alignerMode,
  badge: !document.getElementById('hud-mode').classList.contains('hidden'),
}));
check('Space engages the Aligner and the HUD says so', alignerOn.mode === 'bind' && alignerOn.badge);
await page.keyboard.press(' ');

// --- compute allocation: keys move points, and surge visibly costs the street
const alloc0 = await page.evaluate(() => ({ ...window.__syndicate.sim.squad.compute.alloc }));
await page.keyboard.press('v');
await page.keyboard.press('v');
const alloc1 = await page.evaluate(() => ({ ...window.__syndicate.sim.squad.compute.alloc }));
check('C/V/B move compute between channels',
  alloc1.precision === alloc0.precision + 2,
  `precision ${alloc0.precision} -> ${alloc1.precision}`);
check('and the budget is conserved',
  Object.values(alloc1).reduce((a, b) => a + b, 0) === Object.values(alloc0).reduce((a, b) => a + b, 0));

await page.keyboard.press('g');
await page.waitForTimeout(700);
const surge = await page.evaluate(() => ({
  on: window.__syndicate.sim.squad.compute.surging,
  badge: document.getElementById('compute-surge').classList.contains('active'),
  throttled: window.__syndicate.sim.throttledCount,
  heat: window.__syndicate.sim.heat,
  foot: document.getElementById('compute-throttle').textContent,
}));
check('G surges, the HUD says so, and it throttles the street',
  surge.on && surge.badge && surge.throttled > 0 && surge.heat > 0,
  `${surge.throttled} throttled · heat ${surge.heat.toFixed(1)} · "${surge.foot}"`);
await page.keyboard.press('g');

check('agents carry different weapons',
  new Set(await page.evaluate(() =>
    window.__syndicate.sim.squad.agents.map(a => a.weapon.id))).size === 4);

await page.keyboard.press('Tab');
await page.waitForTimeout(300);
const panel = await page.evaluate(() => ({
  open: !document.getElementById('objective-panel').classList.contains('hidden'),
  items: document.querySelectorAll('#objective-list li').length,
}));
check('Tab opens the objective panel with live objectives', panel.open && panel.items > 0);
await page.keyboard.press('Tab');

const yaw0 = await page.evaluate(() => window.__syndicate.sim.city.seed);
await page.keyboard.down('z');
await page.waitForTimeout(600);
await page.keyboard.up('z');
check('camera rotation does not disturb the simulation',
  (await page.evaluate(() => window.__syndicate.sim.city.seed)) === yaw0);

// --- mid-mission dialog. The sim freezes the field and the overlay has to
// --- come back up over a live mission and then get out of the way again.
await page.evaluate(() => {
  const app = window.__syndicate;
  app.sim.interludeDefs = [{
    id: 'browser-probe',
    speaker: 'CHANNEL TEST',
    blocking: true,
    lines: ['A line that has to appear on the card.'],
    when: () => true,
    options: [
      { id: 'reply', label: 'ANSWER', lines: ['And a reply that has to appear too.'] },
      { id: 'quiet', label: 'SAY NOTHING' },
    ],
  }];
  app.sim.interludesSeen = new Set();
});
await page.waitForTimeout(500);
const parleyBody = await page.textContent('#overlay-body');
check('a mid-mission beat raises a card over the live mission',
  await page.isVisible('#overlay-choices')
    && parleyBody.includes('has to appear on the card'),
  await page.textContent('#overlay-title'));

const frozen = await page.evaluate(() => window.__syndicate.sim.elapsed);
await page.waitForTimeout(700);
check('and the field is frozen while it is up',
  (await page.evaluate(() => window.__syndicate.sim.elapsed)) === frozen);

await page.click('.choice-button');
await page.waitForTimeout(400);
check('answering shows the reply',
  (await page.textContent('#overlay-body')).includes('reply that has to appear'));

await page.click('#overlay-button');
await page.waitForTimeout(700);
check('and dismissing it returns to the floor',
  await page.evaluate(() => window.__syndicate.phase === 'playing'
    && window.__syndicate.sim.elapsed > 0 && !window.__syndicate.sim.interlude)
    && !(await page.isVisible('#overlay-choices')));

// --- fire discipline. H cycles it and the HUD has to say so on screen —
// --- a stance the player must remember they set is one they will blame
// --- the game for.
const stance0 = await page.textContent('#hud-stance');
await page.keyboard.press('h');
await page.waitForTimeout(300);
const stance1 = await page.textContent('#hud-stance');
await page.keyboard.press('h');
await page.waitForTimeout(300);
const stance2 = await page.evaluate(() => ({
  label: document.getElementById('hud-stance').textContent,
  cls: document.getElementById('hud-stance').className,
  stance: window.__syndicate.sim.squad.stance,
}));
check('H cycles fire discipline and the HUD follows',
  stance0 !== stance1 && stance1 !== stance2.label && stance2.stance === 'hold',
  `${stance0} → ${stance1} → ${stance2.label}`);
check('and holding fire is called out, not just labelled',
  stance2.cls.includes('holding'), stance2.cls);
await page.keyboard.press('h');
await page.waitForTimeout(300);

// --- field devices. The sim tests prove the mechanics; only a browser run
// --- proves E and T are actually wired to them and the HUD says so.
const beltBefore = await page.evaluate(() => ({ ...window.__syndicate.sim.belt }));
check('the HUD shows what the squad is carrying',
  (await page.$$('.device-row')).length >= 2,
  (await page.$$eval('.device-row', els => els.map(e => e.textContent.trim()))).join(' / '));

await page.keyboard.press('t');
await page.waitForTimeout(500);
const afterT = await page.evaluate(() => ({
  belt: { ...window.__syndicate.sim.belt },
  devices: window.__syndicate.sim.devices.length,
}));
check('T throws a standdown aerosol and spends a charge',
  afterT.devices === 1 && afterT.belt.STANDDOWN === beltBefore.STANDDOWN - 1,
  `${beltBefore.STANDDOWN} → ${afterT.belt.STANDDOWN} charges · ${afterT.devices} on the map`);

await page.keyboard.press('e');
await page.waitForTimeout(500);
const afterE = await page.evaluate(() => ({
  belt: { ...window.__syndicate.sim.belt },
  devices: window.__syndicate.sim.devices.length,
  pips: [...document.querySelectorAll('.device-charges i.on')].length,
}));
check('E throws a choke field, and the HUD counts down',
  afterE.devices === 2 && afterE.belt.CHOKE === beltBefore.CHOKE - 1
    && afterE.pips < beltBefore.CHOKE + beltBefore.STANDDOWN,
  `${afterE.devices} on the map · ${afterE.pips} charges lit`);

// --- full building destruction. The sim tests prove the cost model; this
// --- proves the renderer turns a nine-floor block into a rubble field
// --- without losing the GL context on the way.
const demolition = await page.evaluate(async () => {
  const app = window.__syndicate;
  const tower = app.sim.city.structures
    .filter(s => s.kind === 'tower' && !s.collapsed)
    .sort((a, b) => b.occupancy - a.occupancy)[0];
  if (!tower) return { ok: false, why: 'no tower' };
  const before = { deaths: app.sim.civilianDeaths, height: tower.h };
  // Drop it directly — driving 14 seconds of fire through the render loop
  // is what the headless suite is for.
  const mod = await import('/src/core/city.js');
  mod.damageStructure(tower, tower.hp, app.sim.city);
  app.sim.events.push({ type: 'collapse', structure: tower });
  return { ok: true, id: tower.id, before, occupancy: tower.occupancy, after: tower.h };
});
check('a tower can be brought down', demolition.ok && demolition.after < demolition.before.height,
  `${demolition.occupancy} tenants · ${demolition.before.height?.toFixed(1)}m → ${demolition.after?.toFixed(1)}m`);

await page.waitForTimeout(900);
const rendered = await page.evaluate(() => {
  const app = window.__syndicate;
  const canvas = document.getElementById('game-canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  return { phase: app.phase, glLost: !gl || gl.isContextLost() };
});
check('and the renderer reconciles it without losing the context',
  rendered.phase === 'playing' && !rendered.glLost);

// --- fullscreen. Headless Chromium will not actually go fullscreen, so
// --- what is checkable is that the control exists, is wired, and that
// --- neither the button nor the shortcut throws.
check('there is a fullscreen control', await page.isVisible('#hud-fullscreen'),
  await page.textContent('#hud-fullscreen-label'));

const errsBefore = consoleErrors.length;
await page.click('#hud-fullscreen');
await page.waitForTimeout(400);
await page.keyboard.press('Alt+Enter');
await page.waitForTimeout(400);
check('and neither the button nor Alt+Enter throws',
  consoleErrors.length === errsBefore
    && await page.evaluate(() => window.__syndicate.phase === 'playing'),
  `${consoleErrors.length - errsBefore} errors`);

check('the controls card documents it',
  (await page.evaluate(() => {
    const app = window.__syndicate;
    app.sim.squad.agents.forEach(a => { a.dead = true; });
    return true;
  })) && (await page.waitForTimeout(700), (await page.textContent('#overlay-hint')).includes('fullscreen')));
await page.click('#overlay-alt-button');
await page.waitForTimeout(600);
await page.click('#overlay-button');
await page.waitForTimeout(900);

// --- frame rate, on a software rasterizer. Hardware has headroom on this.
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => {
    n++;
    if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
    else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1));
  };
  requestAnimationFrame(tick);
}));
check('renders at a usable rate under software rasterization', fps > 20, `${fps} fps`);

// Progress survives a reload — the whole point of persistence.
await page.evaluate(() => { window.__syndicate.campaign.completed = ['sector-7']; });
await page.evaluate(() => {
  localStorage.setItem('syndicate2026.campaign', JSON.stringify({
    version: 2, completed: ['sector-7'], flags: {}, records: {},
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const resumed = await page.$$eval('.mission-tab',
  els => els.map(e => ({ done: e.classList.contains('done'), locked: e.disabled })));
check('progress survives a reload and opens the next mission',
  resumed[0].done && !resumed[1].locked && resumed[2].locked,
  `first done, second open, third still locked`);
check('the briefing resumes on the next unfinished mission',
  /DISTRICT 12/.test(await page.textContent('#overlay-title')),
  await page.textContent('#overlay-title'));

check('the console stayed clean', consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors[0].slice(0, 160) : '0 errors');

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(failed.length
  ? `\n\x1b[31m${failed.length} failed\x1b[0m\x1b[2m · ${results.length - failed.length}/${results.length}\x1b[0m`
  : `\n\x1b[32mall passed\x1b[0m\x1b[2m · ${results.length}/${results.length}\x1b[0m`);
process.exit(failed.length ? 1 : 0);
