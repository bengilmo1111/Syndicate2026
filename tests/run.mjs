#!/usr/bin/env node
// Test runner. No dependencies, no config, no package.json.
//
//   node tests/run.mjs              run everything
//   node tests/run.mjs nav          run suites/tests matching "nav"
//
// Exits non-zero on any failure, so CI and pre-push hooks can gate on it.

import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { collected, AssertionError } from './lib/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2]?.toLowerCase() ?? '';

const dim = s => `\x1b[2m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const bold = s => `\x1b[1m${s}\x1b[0m`;

const files = (await readdir(here))
  .filter(f => f.endsWith('.test.mjs'))
  .sort();

for (const f of files) {
  await import(pathToFileURL(join(here, f)).href);
}

const all = collected();
const selected = filter
  ? all.filter(t => `${t.suite} ${t.name}`.toLowerCase().includes(filter))
  : all;

if (!selected.length) {
  console.error(red(`no tests match "${filter}"`));
  process.exit(1);
}

let passed = 0;
const failures = [];
let lastSuite = null;
const started = Date.now();

for (const t of selected) {
  if (t.suite !== lastSuite) {
    console.log(`\n${bold(t.suite)}`);
    lastSuite = t.suite;
  }
  const t0 = Date.now();
  try {
    await t.fn();
    const ms = Date.now() - t0;
    console.log(`  ${green('✓')} ${t.name}${ms > 250 ? dim(` (${ms}ms)`) : ''}`);
    passed++;
  } catch (err) {
    console.log(`  ${red('✗')} ${t.name}`);
    failures.push({ t, err });
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (failures.length) {
  console.log(`\n${bold(red('failures'))}`);
  for (const { t, err } of failures) {
    console.log(`\n  ${red('✗')} ${bold(`${t.suite} › ${t.name}`)}`);
    const body = err instanceof AssertionError ? err.message : (err.stack ?? String(err));
    console.log(body.split('\n').map(l => `    ${l}`).join('\n'));
  }
}

console.log(
  `\n${failures.length ? red(`${failures.length} failed`) : green('all passed')}` +
  dim(` · ${passed}/${selected.length} · ${elapsed}s`),
);

process.exit(failures.length ? 1 : 0);
