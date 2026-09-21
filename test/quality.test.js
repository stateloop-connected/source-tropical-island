import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, createQualityController, feedFrame, initialTier, pixelRatioFor } from '../src/sim/quality.js';
import { targetMix, smoothMix } from '../src/sim/audiomix.js';

test('mobile starts on medium, desktop on high', () => {
  assert.equal(initialTier(true), 'medium');
  assert.equal(initialTier(false), 'high');
});

test('sustained low fps steps quality down, then shadows disable on low', () => {
  const q = createQualityController('high');
  // ~5 s at 30 fps: one downgrade (cooldown prevents an instant second step).
  for (let i = 0; i < 150; i++) feedFrame(q, 1 / 30);
  assert.equal(q.tier, 'medium');
  for (let i = 0; i < 400; i++) feedFrame(q, 1 / 25);
  assert.equal(q.tier, 'low');
  assert.equal(TIERS[q.tier].shadows, false);
});

test('good fps eventually steps quality back up', () => {
  const q = createQualityController('low');
  for (let i = 0; i < 4000; i++) feedFrame(q, 1 / 120);
  assert.notEqual(q.tier, 'low');
});

test('pixel ratio is capped per tier', () => {
  assert.equal(pixelRatioFor('high', 3), 2);
  assert.equal(pixelRatioFor('medium', 3), 1.5);
  assert.equal(pixelRatioFor('low', 3), 1);
  assert.equal(pixelRatioFor('high', 1.2), 1.2);
});

test('audio mix follows biome and time of day', () => {
  const beachNoon = targetMix('beach', 0.5);
  const forestNoon = targetMix('forest', 0.5);
  const forestNight = targetMix('forest', 0.0);
  const crater = targetMix('crater', 0.5);
  assert.ok(beachNoon.waves > forestNoon.waves, 'waves louder at the beach');
  assert.ok(forestNoon.birds > 0.5, 'birds sing in the daytime forest');
  assert.equal(forestNoon.crickets, 0, 'no crickets at noon');
  assert.ok(forestNight.crickets > 0.5, 'crickets own the night forest');
  assert.ok(forestNight.birds < 0.2, 'birds sleep at night');
  assert.ok(crater.waves < 0.2, 'the crater is far from the surf');
});

test('mix smoothing converges and never overshoots', () => {
  let cur = { waves: 0, birds: 0, crickets: 0 };
  const target = { waves: 0.8, birds: 0.5, crickets: 0.1 };
  for (let i = 0; i < 600; i++) cur = smoothMix(cur, target, 1 / 60);
  assert.ok(Math.abs(cur.waves - 0.8) < 0.01);
  assert.ok(cur.waves <= 0.8);
});
