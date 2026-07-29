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

const missions = await page.$$eval('.mission-tab', els => els.map(e => e.textContent));
check('every mission has a briefing tab', missions.length >= 4, missions.join(', '));

// Deploy and render each mission in turn — this is what catches a renderer
// crash on a city shape the sim tests never build a mesh for.
for (let i = 0; i < missions.length; i++) {
  await page.click(`.mission-tab:nth-child(${i + 1})`);
  await page.waitForTimeout(400);
  const title = await page.textContent('#overlay-title');
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

check('the console stayed clean', consoleErrors.length === 0,
  consoleErrors.length ? consoleErrors[0].slice(0, 160) : '0 errors');

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(failed.length
  ? `\n\x1b[31m${failed.length} failed\x1b[0m\x1b[2m · ${results.length - failed.length}/${results.length}\x1b[0m`
  : `\n\x1b[32mall passed\x1b[0m\x1b[2m · ${results.length}/${results.length}\x1b[0m`);
process.exit(failed.length ? 1 : 0);
