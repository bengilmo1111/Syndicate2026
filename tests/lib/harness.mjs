// A test harness with no dependencies, because the project has none and
// shouldn't acquire any to run its own checks.
//
// `src/core/` imports no Three.js and no DOM, which means Node can load it
// directly and the simulation is testable without a browser. That boundary
// is the whole reason this file can be twenty lines of registry.

const registry = [];
let currentSuite = 'core';

export function suite(name) {
  currentSuite = name;
}

export function test(name, fn) {
  registry.push({ suite: currentSuite, name, fn });
}

export function collected() {
  return registry;
}

// --------------------------------------------------------------- assertions

export class AssertionError extends Error {}

function fail(msg) {
  throw new AssertionError(msg);
}

export function ok(value, msg = 'expected truthy') {
  if (!value) fail(`${msg} — got ${format(value)}`);
}

export function notOk(value, msg = 'expected falsy') {
  if (value) fail(`${msg} — got ${format(value)}`);
}

export function eq(actual, expected, msg = 'values differ') {
  if (!Object.is(actual, expected)) {
    fail(`${msg}\n    expected: ${format(expected)}\n    actual:   ${format(actual)}`);
  }
}

export function near(actual, expected, tolerance, msg = 'value out of tolerance') {
  if (Math.abs(actual - expected) > tolerance) {
    fail(`${msg}\n    expected: ${format(expected)} ±${tolerance}\n    actual:   ${format(actual)}`);
  }
}

export function lt(actual, bound, msg = 'expected less than') {
  if (!(actual < bound)) fail(`${msg} ${format(bound)} — got ${format(actual)}`);
}

export function gte(actual, bound, msg = 'expected at least') {
  if (!(actual >= bound)) fail(`${msg} ${format(bound)} — got ${format(actual)}`);
}

export function includes(haystack, needle, msg = 'expected to contain') {
  if (!String(haystack).includes(needle)) {
    fail(`${msg} ${format(needle)}\n    in: ${format(haystack)}`);
  }
}

function format(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
