import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, valueNoise2, fbm2 } from '../src/sim/rng.js';

test('rng is seeded and deterministic', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
  const c = createRng(43);
  assert.notEqual(createRng(42).next(), c.next());
});

test('rng ranges and ints stay in bounds', () => {
  const r = createRng(7);
  for (let i = 0; i < 500; i++) {
    const v = r.range(-2, 5);
    assert.ok(v >= -2 && v < 5);
    const n = r.int(1, 6);
    assert.ok(n >= 1 && n <= 6 && Number.isInteger(n));
  }
});

test('value noise is smooth, bounded, and deterministic', () => {
  for (let i = 0; i < 100; i++) {
    const v = valueNoise2(i * 0.37, i * 0.11, 5);
    assert.ok(v >= 0 && v <= 1);
    assert.equal(v, valueNoise2(i * 0.37, i * 0.11, 5));
  }
  const f = fbm2(3.3, 8.8, 3, 1);
  assert.ok(f >= 0 && f <= 1);
});
