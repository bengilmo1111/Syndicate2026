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

// The sector map is the third face of the same card.
await page.evaluate(() => {
  const c = window.__syndicate.campaign;
  c.territory['sector-7'].held = true;
  c.territory['sector-7'].unrest = 80;
  c.territory['sector-7'].contest = 62;
  c.territory['sector-7'].contestedBy = 'amazon';
  c.territory['district-12'].held = true;
});
await page.click('#overlay-alt-button');           // SECTOR MAP
await page.waitForTimeout(400);
const mapRows = await page.$$eval('.sector-row', els => els.map(e => e.textContent.trim()));
check('the sector map lists Austin', mapRows.length >= 8, `${mapRows.length} sectors`);
check('and marks the ones you hold as straining',
  (await page.$$('.unrest i.crit')).length >= 1,
  (await page.$$eval('.unrest i', els => els.map(e => e.className || 'calm'))).join(','));

// The rivals have to be legible: who holds what, and who is pushing.
const mapText = mapRows.join(' ');
check('the map names who holds the sectors you have not taken',
  /AMAZON|GOOGLE|SPACEX|ANTHROPIC/.test(mapText),
  mapText.slice(0, 90));
check('and says when one is pushing on a sector of yours',
  /pushing/.test(mapText) && (await page.$$('.unrest.contest i')).length >= 2,
  `${(await page.$$('.unrest.contest')).length} contest bars`);

const throttleBefore = await page.evaluate(() =>
  window.__syndicate.campaign.territory['sector-7'].throttle);
await page.click('.implant.throttle');
await page.waitForTimeout(400);
const throttleAfter = await page.evaluate(() => ({
  throttle: window.__syndicate.campaign.territory['sector-7'].throttle,
  saved: JSON.parse(localStorage.getItem('syndicate2026.campaign')).territory['sector-7'].throttle,
}));
check('clicking a throttle changes the ration and persists it',
  throttleAfter.throttle !== throttleBefore && throttleAfter.saved === throttleAfter.throttle,
  `${throttleBefore} → ${throttleAfter.throttle} (saved ${throttleAfter.saved})`);

// ---- the map answering back ------------------------------------------
// A retake is only reachable through this button. Nothing headless can
// press it, which is exactly why it is checked here.
await page.evaluate(() => {
  const c = window.__syndicate.campaign;
  c.territory['sub-19'].held = false;
  c.territory['sub-19'].owner = 'google';
  c.territory['sub-19'].lostTo = 'google';
});
await page.click('#overlay-button');                // BACK TO BRIEFING
await page.waitForTimeout(300);
await page.click('#overlay-alt-button');            // CRYOVAT
await page.waitForTimeout(250);
await page.click('#overlay-alt-button');            // SECTOR MAP again
await page.waitForTimeout(400);

const retakeRow = await page.$$eval('.sector-row', els => els.findIndex(
  e => e.textContent.includes('SUB-SECTOR 19') && e.querySelector('button.retake')));
check('a block you lost offers a deployment to take it back', retakeRow >= 0,
  `row ${retakeRow}`);
check('and a block you hold does not',
  await page.$$eval('.sector-row', els => !els.some(
    e => e.textContent.includes('DISTRICT 12') && e.querySelector('button.retake'))));

// That row's button specifically — several blocks are offered at once here,
// and clicking "the first retake button" would deploy to a different sector.
await page.locator('.sector-row', { hasText: 'SUB-SECTOR 19' })
  .locator('button.retake').click();
await page.waitForTimeout(900);
const retakeCard = await page.evaluate(() => ({
  title: document.getElementById('overlay-title').textContent,
  eyebrow: document.getElementById('overlay-eyebrow').textContent,
  body: document.getElementById('overlay-body').textContent,
  selected: window.__syndicate.selectedMissionId,
}));
check('clicking it writes a briefing against whoever holds the block',
  /RETAKE/.test(retakeCard.title) && /GOOGLE/.test(retakeCard.body)
    && retakeCard.selected === 'retake:sub-19',
  `${retakeCard.title} · ${retakeCard.selected}`);
check('and it is not one of the fifteen',
  !(await page.$$eval('.mission-tab', els => els.some(e => e.className.includes('active')))),
  retakeCard.eyebrow);

await page.click('#overlay-button');               // DEPLOY
await page.waitForTimeout(1200);
const inRetake = await page.evaluate(() => {
  const s = window.__syndicate.sim;
  return {
    mission: s.mission.id,
    syndicate: s.city.syndicate,
    hostiles: s.hostiles.length,
    holder: s.hostiles[0]?.syndicate,
    zone: !!s.holdZone,
    frames: window.__syndicate.phase,
  };
});
check('and deploying drops the squad into the same block under new colours',
  inRetake.mission === 'retake:sub-19' && inRetake.syndicate === 'google'
    && inRetake.holder === 'google' && inRetake.hostiles > 0 && inRetake.zone,
  `${inRetake.hostiles} hostiles · ${inRetake.syndicate}`);

// Back out to the briefing so the checks below start where they expect to.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#overlay-alt-button');           // CRYOVAT
await page.waitForTimeout(400);

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

// The belt grows act by act, and the panel has to follow it — an empty row
// for a tool you have not been issued reads as "spent", which is a
// different and much more annoying thing than "not yours yet".
const act1Rows = await page.$$eval('.device-row', els => els.map(e => e.textContent.trim()));
check('Act I shows only the two tools it carries', act1Rows.length === 2,
  act1Rows.map(r => r.split('\n')[0]).join(' / '));

// --- the offensive strange tools. Only a browser run proves the four new
// --- keys are wired and the panel grows to meet them.
await page.evaluate(() => {
  const app = window.__syndicate;
  app.selectedMissionId = 'reverse-the-gradient';
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('.mission-tab:nth-child(11)');
await page.waitForTimeout(400);
const act4Title = await page.textContent('#overlay-title');
await page.click('#overlay-button');
await page.waitForTimeout(1000);

// Eight hostiles who come the whole time. This section is about whether
// four keys are wired to four devices; a squad wipe halfway through it
// stops the input handler and fails the check for the wrong reason.
await page.evaluate(() => {
  for (const a of window.__syndicate.sim.squad.agents) { a.health = 99999; a.maxHealth = 99999; }
});

const act4Rows = await page.$$eval('.device-row',
  els => els.map(e => e.textContent.trim().replace(/\s+/g, ' ')));
check('Act IV deploys with the whole belt', act4Rows.length === 6,
  `${act4Title} — ${act4Rows.join(' / ')}`);
check('and every tool has its own key on the panel',
  ['E', 'T', 'U', 'Y', 'O', 'I'].every((k, i) => act4Rows[i]?.startsWith(k)),
  act4Rows.map(r => r[0]).join(''));

const canvasBox = await (await page.$('#game-canvas')).boundingBox();
const landedOn = id => page.evaluate(
  x => window.__syndicate.sim.devices.some(d => d.id === x), id);
for (const [key, id] of [['u', 'RAZOR'], ['y', 'PSYCHO'], ['o', 'GRAVITON']]) {
  // Two attempts. A device is placed on the next simulation step, and the
  // cursor has to have produced a ground point by then — one slow frame
  // between the pointer move and the keypress swallows the throw, which
  // is a race in the test, not a bug in the game.
  let placed = false;
  for (let attempt = 0; attempt < 2 && !placed; attempt++) {
    await page.mouse.move(
      canvasBox.x + canvasBox.width * (0.45 + attempt * 0.03),
      canvasBox.y + canvasBox.height * 0.4,
    );
    await page.waitForTimeout(200);
    await page.keyboard.press(key);
    await page.waitForTimeout(350);
    placed = await landedOn(id);
  }
  check(`${key.toUpperCase()} places a ${id.toLowerCase()}`, placed);
}

// Satellite rain is the one that has to be *seen* before it happens: the
// ring is the whole warning, and a warning that is not on screen is not one.
const scarredBefore = await page.evaluate(() =>
  window.__syndicate.sim.city.structures.filter(s => s.hp < s.maxHp).length);
await page.keyboard.press('i');
await page.waitForTimeout(400);
const warning = await page.evaluate(() => {
  const d = window.__syndicate.sim.devices.find(x => x.id === 'RAIN');
  return d && { arming: d.arming, fired: d.fired, radius: d.radius };
});
check('I calls a strike that spends its warning on the ground first',
  warning && warning.arming > 2 && !warning.fired,
  warning ? `${warning.arming.toFixed(1)}s of ring at ${warning.radius}m` : 'nothing placed');

await page.waitForTimeout(5000);
// What it *does* is covered by eight headless tests. What only a browser
// run can show is that the whole lifecycle completes inside a real frame
// loop: the ring spends its warning, the strike lands, and the block it
// landed on is marked for it.
const landed = await page.evaluate(() => ({
  gone: !window.__syndicate.sim.devices.some(d => d.id === 'RAIN'),
  scarred: window.__syndicate.sim.city.structures.filter(s => s.hp < s.maxHp).length,
}));
check('and then it lands, and the block wears it',
  landed.gone && landed.scarred > scarredBefore,
  `${scarredBefore} → ${landed.scarred} structures damaged`);

// --- sound. The mix is tested headlessly; only a browser run proves an
// --- AudioContext actually starts and cues actually reach the graph.
const sound = await page.evaluate(async () => {
  const app = window.__syndicate;
  const a = app.audio;
  const before = a.played;
  // A frame's worth of events, straight into the audio path. Not synthetic
  // ones — the same shapes `sim.events` carries.
  a.consume([
    { type: 'shot', x: 0, z: 0, friendly: true },
    { type: 'hit', x: 2, z: 0 },
    { type: 'collapse', x: 4, z: 0, structure: { maxHp: 3200 } },
    { type: 'line', speaker: 'nobody', text: 'not a sound' },
  ], { x: 0, z: 0, yaw: 0 });
  return {
    available: a.available,
    state: a.ctx && a.ctx.state,
    played: a.played - before,
    cues: a.lastCues.map(c => c.id),
  };
});
check('the audio context starts on the deploy click',
  sound.available && sound.state === 'running', `context ${sound.state}`);
check('and a frame of events reaches the graph as cues',
  sound.played === 3 && sound.cues.includes('COLLAPSE') && !sound.cues.includes('LINE'),
  sound.cues.join(', '));

// The room tone is one graph for the whole session, ridden by heat.
// Driven through the *game*, not by calling `room()` directly: the frame
// loop rides the bed every frame off the real heat, so anything the test
// sets by hand is overwritten before it can be read back.
const room = await page.evaluate(async () => {
  const app = window.__syndicate;
  const settle = ms => new Promise(r => setTimeout(r, ms));
  app.sim.heat = 0;
  await settle(1500);
  const calm = { cutoff: app.audio.bed.filter.frequency.value, gain: app.audio.bed.gain.gain.value };
  app.sim.heat = 55;
  await settle(1800);
  return {
    calm,
    hot: { cutoff: app.audio.bed.filter.frequency.value, gain: app.audio.bed.gain.gain.value },
    looping: app.audio.bed.src.loop,
    off: app.audio.room(0, false).gain,
  };
});
check('the room tone is running and rides the sector',
  room.looping && room.hot.cutoff > room.calm.cutoff * 1.5 && room.hot.gain > room.calm.gain,
  `${Math.round(room.calm.cutoff)}Hz → ${Math.round(room.hot.cutoff)}Hz`);
check('and goes quiet the moment a card is up', room.off === 0);

const muted = await page.evaluate(async () => {
  const a = window.__syndicate.audio;
  document.getElementById('hud-sound').click();
  const off = { muted: a.muted, gain: a.master.gain.value, label: document.getElementById('hud-sound-label').textContent.trim() };
  const before = a.played;
  a.consume([{ type: 'shot', x: 0, z: 0, friendly: true }], { x: 0, z: 0, yaw: 0 });
  const silent = a.played === before;
  document.getElementById('hud-sound').click();
  return { off, silent, back: a.muted, saved: localStorage.getItem('syndicate2026.muted') };
});
check('the mute control silences it and says so',
  muted.off.muted && muted.off.gain === 0 && muted.silent && /OFF/.test(muted.off.label),
  muted.off.label);
check('and it survives as a machine setting, not a campaign one',
  muted.back === false && muted.saved === '0',
  `saved "${muted.saved}"`);

// --- camera occlusion. The geometry is tested headlessly; only a browser
// --- run proves the renderer actually ghosts the mesh and puts it back.
const occlusion = await page.evaluate(async () => {
  const app = window.__syndicate;
  const { rig, cityView } = app.view;
  const tower = app.sim.city.structures
    .filter(s => s.kind === 'tower' && !s.collapsed && s.h > 14)
    .sort((a, b) => b.h - a.h)[0];

  // Stand the squad just past the tower, then put the camera on the tower's
  // side of them and drop it below the roofline. Now the block is between
  // the lens and four people the player is steering.
  const a = Math.atan2(tower.x, tower.z);
  for (const g of app.sim.squad.agents) {
    g.x = tower.x - Math.sin(a) * (tower.w / 2 + 7);
    g.z = tower.z - Math.cos(a) * (tower.d / 2 + 7);
  }
  rig.yaw = a;
  rig.pitch = 0.42;
  rig.distance = 40;
  rig.smoothTarget.set(app.sim.squad.agents[0].x, 0, app.sim.squad.agents[0].z);

  const settle = ms => new Promise(r => setTimeout(r, ms));
  await settle(900);
  const hidden = [...cityView.byId.values()].filter(v => v.opacity < 0.99);
  const ghosted = {
    count: hidden.length,
    min: hidden.length ? Math.min(...hidden.map(v => v.opacity)) : 1,
    tower: cityView.byId.get(tower.id).opacity,
    writesDepth: cityView.byId.get(tower.id).bodyMat.depthWrite,
  };

  // Now put the squad back on the open intersection they deployed onto and
  // look at them from overhead, where nothing can be in the way.
  for (const g of app.sim.squad.agents) {
    g.x = app.sim.city.deploy.x;
    g.z = app.sim.city.deploy.z;
  }
  rig.yaw = 0;
  rig.pitch = 1.28;
  rig.distance = 96;
  rig.smoothTarget.set(app.sim.city.deploy.x, 0, app.sim.city.deploy.z);
  await settle(1600);
  return {
    ghosted,
    restored: cityView.byId.get(tower.id).opacity,
    solidAgain: cityView.byId.get(tower.id).bodyMat.depthWrite,
  };
});
check('a block between the camera and the squad is ghosted',
  occlusion.ghosted.tower < 0.5 && occlusion.ghosted.count > 0,
  `${occlusion.ghosted.count} faded · tower at ${occlusion.ghosted.tower.toFixed(2)}`);
check('and it stops writing depth, so the squad renders through it',
  occlusion.ghosted.writesDepth === false);
check('and it comes back once it is out of the way',
  occlusion.restored > 0.99 && occlusion.solidAgain === true,
  `back to ${occlusion.restored.toFixed(2)}`);

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

// --- the graphics pass. None of this is reachable from Node: it is all
// --- canvases, materials and instanced meshes.
const look = await page.evaluate(() => {
  const app = window.__syndicate;
  const cv = app.view.cityView;
  const road = cv.root.children[0].children[0];
  const facades = [...cv.byId.values()]
    .filter(v => v.bodyMat.emissiveMap)
    .map(v => v.bodyMat.emissiveMap.image);
  let lamps = 0;
  cv.root.traverse(o => { if (o.isInstancedMesh && o !== cv.rooftops) lamps += o.count; });
  return {
    sky: !!app.view.sky && app.view.sky.visible,
    skyRides: app.view.sky.position.distanceTo(app.view.rig.camera.position) < 0.001,
    roadMapped: !!road.material.map,
    rooftops: cv.rooftops?.count ?? 0,
    towers: cv.city.structures.filter(s => s.kind === 'tower' && !s.collapsed).length,
    lamps,
    facades: facades.length,
    patterns: new Set(facades).size,
  };
});
check('there is a sky, and it rides with the camera',
  look.sky && look.skyRides);
check('the road is painted rather than bare',
  look.roadMapped, 'lane dashes, crossings and lamp pools are one texture');
// Scaled to the block rather than a flat count: a nine-by-nine of low
// slabs has five towers in it and a denser one has thirty, and both are
// correct. What must hold is that every tower gets something and none gets
// a pile.
check('every tower carries clutter, and none carries a pile',
  look.rooftops >= look.towers && look.rooftops <= look.towers * 3 && look.lamps > 10,
  `${look.rooftops} props on ${look.towers} towers · ${look.lamps} lamp parts`);
// The grade is CSS, so what matters is that it is over the picture and that
// it is not in the way of the mouse — a full-bleed div between the player
// and the canvas would silently eat every move order on the map.
const grade = await page.evaluate(() => {
  const el = document.getElementById('screen-grade');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.round(r.width / 2), Math.round(r.height / 2));
  return {
    covers: r.width > 100 && r.height > 100,
    background: getComputedStyle(el).backgroundImage.slice(0, 16),
    clickThrough: hit?.id === 'game-canvas',
  };
});
check('the picture is graded, and the grade does not eat clicks',
  grade?.covers && grade.background.includes('radial') && grade.clickThrough,
  grade?.clickThrough ? 'clicks reach the canvas' : 'blocked');
check('and the buildings do not all run the same window pattern',
  look.patterns > 2 && look.patterns < look.facades,
  `${look.patterns} patterns across ${look.facades} facades`);

// --- ambient traffic. The sim tests prove the driving; only a browser run
// --- proves the renderer builds cars and reconciles a wreck.
await page.evaluate(() => {
  localStorage.setItem('syndicate2026.campaign', JSON.stringify({
    version: 4, completed: ['sector-7'], flags: {}, records: {},
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('.mission-tab:nth-child(2)');
await page.waitForTimeout(400);
await page.click('#overlay-button');
await page.waitForTimeout(1500);
const traffic = await page.evaluate(async () => {
  const app = window.__syndicate;
  const view = app.view.trafficView;
  const before = app.sim.traffic.map(v => `${v.x.toFixed(1)},${v.z.toFixed(1)}`).join('|');
  await new Promise(r => setTimeout(r, 1200));
  const after = app.sim.traffic.map(v => `${v.x.toFixed(1)},${v.z.toFixed(1)}`).join('|');
  const car = app.sim.traffic[0];
  car.takeDamage(9999);
  await new Promise(r => setTimeout(r, 400));
  return {
    cars: app.sim.traffic.length,
    meshes: view.views.size,
    moved: before !== after,
    wreckedMesh: view.views.get(car.id)?.wrecked === true,
    heat: app.sim.heat,
  };
});
check('the street has traffic on it, and it is moving',
  traffic.cars >= 6 && traffic.meshes === traffic.cars && traffic.moved,
  `${traffic.cars} cars · ${traffic.meshes} meshes`);
check('and a wreck is reconciled into the scene',
  traffic.wreckedMesh && traffic.heat > 0, `heat ${Math.round(traffic.heat)}`);

// --- the Instance buffer. The sim tests own the model; what only a
// --- browser proves is that one bar carries two pools legibly and that
// --- the recovery is visible while it happens.
const pool = await page.evaluate(async () => {
  const app = window.__syndicate;
  const a = app.sim.squad.agents[0];
  const cell = document.querySelectorAll('.agent-cell')[0];
  const flesh = cell.querySelector('.agent-bar-fill');
  const buffer = cell.querySelector('.agent-bar-buffer');
  const width = el => parseFloat(el.style.width) || 0;

  const full = { flesh: width(flesh), buffer: width(buffer) };
  a.takeDamage(a.maxBuffer);
  await new Promise(r => setTimeout(r, 200));
  const spent = { flesh: width(flesh), buffer: width(buffer) };
  // Four and a half seconds of nobody shooting at them.
  await new Promise(r => setTimeout(r, 5200));
  const back = { flesh: width(flesh), buffer: width(buffer) };
  const pulsing = cell.classList.contains('recovering');
  await new Promise(r => setTimeout(r, 4000));
  return { full, spent, back, pulsing, filled: width(buffer), maxBuffer: a.maxBuffer };
});
check('one bar carries both pools, and the headroom is the tail of it',
  pool.full.buffer > 10 && pool.full.flesh > 50
    && Math.abs(pool.full.flesh + pool.full.buffer - 100) < 2,
  `${Math.round(pool.full.flesh)}% flesh + ${Math.round(pool.full.buffer)}% headroom`);
check('and spending the headroom shortens the bar without wounding anyone',
  pool.spent.buffer === 0 && Math.abs(pool.spent.flesh - pool.full.flesh) < 1,
  'the flesh is untouched');
check('and it visibly comes back once nobody is shooting',
  pool.back.buffer > 0 && pool.filled >= pool.back.buffer,
  `${Math.round(pool.back.buffer)}% back after five seconds`);

// --- drivable vehicles. The sim tests prove the model; what only a
// --- browser can prove is that the key is wired, that the crew stop
// --- being drawn on the street, and that the car the squad is in is
// --- findable in a lane of identical ones.
const drive = await page.evaluate(async () => {
  const app = window.__syndicate;
  // Not `traffic[0]`: the wreck check above blew that one up, and nobody
  // gets into a burnt-out shell. The fastest live one, because the lane
  // behind the wreck is a queue of cars that are already stopped and
  // proving that one of *those* brakes proves nothing. `t < 0.4` keeps
  // most of the lane ahead of it, so the drive below has somewhere to go
  // — a car near the far kerb is stopped by the edge of the block, which
  // would look exactly like the steering not working.
  const v = app.sim.traffic
    .filter(x => !x.dead && x.t < 0.4)
    .sort((a, b) => b.speed - a.speed)[0];
  // Give it a moment to get up to speed. Cars queued behind the wreck the
  // check above made are stopped through no fault of this feature, and a
  // car that was never moving cannot demonstrate braking.
  for (let i = 0; i < 30 && v.speed < 5; i++) await new Promise(r => setTimeout(r, 100));
  const moving = v.speed;
  // Stand in its lane. Traffic brakes for people, which is the whole way
  // into a car — there is no hotwiring verb.
  const park = (m) => {
    for (const g of app.sim.squad.agents) {
      g.x = v.x + Math.sin(v.facing) * m;
      g.z = v.z + Math.cos(v.facing) * m;
    }
  };
  park(10);
  await new Promise(r => setTimeout(r, 1600));
  const stopped = v.speed;
  // Walk up the lane to it, still in front, so it stays stopped.
  park(4);
  // Point the camera down the lane, so that 'w' — which is camera-relative
  // for a car exactly as it is for a person — means "forward".
  app.view.rig.yaw = v.facing + Math.PI;
  await new Promise(r => setTimeout(r, 200));
  return { moving, stopped };
});
check('a car brakes for a squad standing in its lane',
  drive.moving > 5 && drive.stopped < 1.5,
  `${drive.moving.toFixed(1)} → ${drive.stopped.toFixed(2)} m/s`);

await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const aboard = await page.evaluate(() => {
  const app = window.__syndicate;
  const views = [...app.view.agentLayer.views.values()];
  return {
    riding: !!app.sim.vehicle,
    crew: app.sim.vehicle?.crew.length ?? 0,
    afoot: app.sim.squad.afoot.length,
    alive: app.sim.squad.alive.length,
    drawn: views.filter(x => x.root.visible).length,
    badge: !document.getElementById('hud-vehicle').classList.contains('hidden'),
    paint: app.view.trafficView.views.get(app.sim.vehicle.id)?.bodyMat.color.getHex(),
    otherPaint: [...app.view.trafficView.views.entries()]
      .find(([id]) => id !== app.sim.vehicle.id)?.[1].bodyMat.color.getHex(),
  };
});
check('Enter puts the squad in it, and takes them off the street',
  aboard.riding && aboard.crew === 4 && aboard.afoot === 0 && aboard.alive === 4,
  `${aboard.crew} aboard · ${aboard.afoot} on foot`);
check('and they stop being drawn standing in the road',
  aboard.drawn === 0, `${aboard.drawn} agent meshes visible`);
check('and the HUD says so, because the squad is not on screen to say it',
  aboard.badge);
check('and their car is repainted so it is findable in a lane of them',
  aboard.paint !== aboard.otherPaint,
  `#${aboard.paint?.toString(16)} vs #${aboard.otherPaint?.toString(16)}`);

const from = await page.evaluate(() => {
  const v = window.__syndicate.sim.vehicle;
  return { x: v.x, z: v.z };
});
await page.keyboard.down('w');
await page.waitForTimeout(1500);
await page.keyboard.up('w');
const drove = await page.evaluate(([x, z]) => {
  const app = window.__syndicate;
  const v = app.sim.vehicle;
  return {
    moved: Math.hypot(v.x - x, v.z - z),
    speed: v.speed,
    phase: app.phase,
    onFoot: app.sim.squad.agents.filter(a => !a.riding).length,
    health: Math.round(v.health),
  };
}, [from.x, from.z]);
check('and WASD drives it, with the squad still inside',
  drove.moved > 8 && drove.speed > 4 && drove.phase === 'playing' && drove.onFoot === 0,
  `${drove.moved.toFixed(1)}m at ${drove.speed.toFixed(1)} m/s · car at ${drove.health}%`);

await page.keyboard.press('Enter');
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const app = window.__syndicate;
  const views = [...app.view.agentLayer.views.values()];
  const spots = new Set(app.sim.squad.agents.map(a => `${a.x.toFixed(1)},${a.z.toFixed(1)}`));
  return {
    riding: !!app.sim.vehicle,
    afoot: app.sim.squad.afoot.length,
    drawn: views.filter(x => x.root.visible).length,
    spread: spots.size,
    badge: !document.getElementById('hud-vehicle').classList.contains('hidden'),
  };
});
check('and Enter again puts four people back on the street, not one pile',
  !out.riding && out.afoot === 4 && out.drawn === 4 && out.spread === 4 && !out.badge,
  `${out.spread} positions`);

// --- blob shadows. Two things have to hold and only one of them is
// --- countable: that every body on the block gets a disc, and that the
// --- discs are actually dark enough to see. The first version of the
// --- layer passed the count and was invisible on screen — 0x05070c at
// --- 0.42 alpha over asphalt this dark is not a shadow, it is a rounding
// --- error. So this reads the framebuffer back and compares the same
// --- frame drawn with the layer and without it.
const shade = await page.evaluate(() => {
  const app = window.__syndicate;
  const canvas = document.getElementById('game-canvas');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  // Park the camera low and close, where a contact shadow is meant to
  // read, and stop the block so the two frames differ only in the layer.
  app.view.rig.pitch = 0.7;
  app.view.rig.distance = 30;
  for (const c of app.sim.civilians) c.speed = 0;
  for (const v of app.sim.traffic) v.speed = 0;

  const sample = (visible) => {
    app.view.shadows.mesh.visible = visible;
    // Render and read inside one task: the drawing buffer survives until
    // the compositor takes it at the end of the turn.
    app.view.render(app.sim, 1 / 60);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };
  const on = sample(true);
  const off = sample(false);
  app.view.shadows.mesh.visible = true;
  app.view.render(app.sim, 1 / 60);

  // Per pixel rather than an average over the frame: a mean is dominated
  // by the acres of roof and sky that no shadow ever touches, and it stays
  // green for a layer far too faint to see. What is being asserted is that
  // somewhere on this street a real number of pixels got visibly darker.
  let darkened = 0, deepest = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const d = (off[o] - on[o]) + (off[o + 1] - on[o + 1]) + (off[o + 2] - on[o + 2]);
    if (d >= 30) darkened++;
    if (d > deepest) deepest = d;
  }

  const bodies = app.sim.squad.alive.length
    + app.sim.hostiles.filter(x => !x.dead).length
    + app.sim.civilians.filter(x => !x.dead).length
    + app.sim.traffic.length;
  const before = app.view.shadows.mesh.count;

  // The pool is rewritten every frame, which is worth nothing if it is
  // never handed back to the GPU: the discs stay wherever they were on
  // frame one and everybody walks out of their own shadow. Three uploads
  // on a version bump, so the bump is the thing to assert — no camera
  // angle makes stale instance data visible to a pixel test.
  const version = app.view.shadows.mesh.instanceMatrix.version;
  app.view.shadows.sync(app.sim);
  const reuploaded = app.view.shadows.mesh.instanceMatrix.version > version;

  const victim = app.sim.civilians.find(c => !c.dead);
  victim.dead = true;
  app.view.shadows.sync(app.sim);
  const afterDeath = app.view.shadows.mesh.count;
  victim.dead = false;

  // Sizes, read back off the instance matrices. The layer fills them in a
  // fixed order — agents, hostiles, civilians, traffic — and the rotation
  // it bakes in is about X, which leaves the first element of each matrix
  // as the disc's radius.
  //
  // The block has no sedated hostile on it at this point in the run and
  // putting one there properly would mean fighting a mission for it, so
  // this hands the layer the four fields it actually reads.
  const alive = app.sim.squad.alive.length;
  app.sim.hostiles.push({ x: victim.x, z: victim.z, dead: false, downed: true });
  app.view.shadows.sync(app.sim);
  const m = app.view.shadows.mesh.instanceMatrix.array;
  const radii = {
    agent: m[0],
    fallen: m[alive * 16],
    civilian: m[(alive + 1) * 16],
    car: m[(app.view.shadows.mesh.count - 1) * 16],
  };
  app.sim.hostiles.pop();
  app.view.shadows.sync(app.sim);

  return {
    darkened, deepest, pixels: w * h, bodies, before, radii, afterDeath,
    reuploaded,
  };
});
check('everything standing on the block casts a shadow',
  shade.before === shade.bodies && shade.bodies > 20,
  `${shade.before} discs for ${shade.bodies} bodies`);
check('and a body that is gone stops casting one',
  shade.afterDeath === shade.before - 1);
check('and the pool goes back to the card, so a shadow follows its body',
  shade.reuploaded);
check('a body on the floor throws a wider one than a body on its feet',
  shade.radii.fallen > shade.radii.agent
    && shade.radii.agent > shade.radii.civilian
    && shade.radii.car > shade.radii.fallen,
  `civ ${shade.radii.civilian} · agent ${shade.radii.agent} · down ${shade.radii.fallen} · car ${shade.radii.car}`);
check('and the shadows are dark enough to actually see',
  shade.darkened > 80 && shade.deepest > 100,
  `${shade.darkened} of ${shade.pixels} pixels darkened · deepest ${shade.deepest}/765`);

// --- the ledger. Seven flags were being recorded and never read back;
// --- the last card now spends them.
await page.evaluate(() => {
  localStorage.setItem('syndicate2026.campaign', JSON.stringify({
    version: 4,
    completed: ['sector-7', 'district-12', 'sable-campus', 'the-bracket',
      'okafor-contract', 'calibration-window', 'welfare-node-7', 'the-refusal',
      'gradient-relay-4', 'run-south', 'reverse-the-gradient', 'the-tower',
      'yelin', 'the-core'],
    flags: {
      ending: 'walk', bravoCalibrated: false, playerSuspicion: false,
      defectedAtRefusal: true, heardYelin: false, askedTheReplacement: true,
    },
    records: {},
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const lastTab = (await page.$$('.mission-tab')).at(-1);
await lastTab.click();
await page.waitForTimeout(600);
const ending = await page.evaluate(() => ({
  title: document.getElementById('overlay-title').textContent,
  body: document.getElementById('overlay-body').innerText,
}));
check('the last card reads the campaign\'s choices back',
  /nobody filed/.test(ending.body)
    && /signed the replacement/.test(ending.body)
    && /cut the prisoner loose/.test(ending.body),
  `${ending.title} · ${ending.body.length} chars`);
check('and the scene itself knows BRAVO is not in the room',
  !/One of them is BRAVO/.test(ending.body) && /None of the names/.test(ending.body));

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
