import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_LENGTH_SECONDS, timeOfDayAt, phaseAt, paletteAt, sunElevation,
  sunsetWarmth, starsVisibility, firefliesVisibility, daylight
} from '../src/sim/timecycle.js';

test('cycle wraps every six real minutes', () => {
  assert.equal(DAY_LENGTH_SECONDS, 360);
  assert.ok(Math.abs(timeOfDayAt(0) - timeOfDayAt(360)) < 1e-9);
  assert.ok(Math.abs(timeOfDayAt(90) - timeOfDayAt(450)) < 1e-9);
});

test('phases land where expected', () => {
  assert.equal(phaseAt(0.0), 'night');
  assert.equal(phaseAt(0.5), 'day');
  assert.equal(phaseAt(0.27), 'dawn');
  assert.equal(phaseAt(0.73), 'sunset');
});

test('sun elevation peaks at noon and bottoms at midnight', () => {
  assert.ok(sunElevation(0.5) > 0.9);
  assert.ok(sunElevation(0.0) < -0.9);
});

test('sunset palette is warm orange (r > g > b on the horizon)', () => {
  const p = paletteAt(0.75);
  assert.ok(p.warm > 0.8, `warmth at sunset (got ${p.warm.toFixed(2)})`);
  const [r, g, b] = p.horizon;
  assert.ok(r > g && g > b, `horizon is orange: ${r}, ${g}, ${b}`);
  assert.ok(r > 0.8, 'strong red component');
});

test('day palette is blue and bright, night is dark', () => {
  const day = paletteAt(0.5);
  assert.ok(day.sky[2] > day.sky[0], 'day sky is blue-dominant');
  assert.ok(day.sunIntensity > 2);
  const night = paletteAt(0.0);
  assert.ok(night.sky[2] < 0.15, 'night sky is dark');
  assert.ok(night.sunIntensity < 0.5);
});

test('stars and fireflies only show at night', () => {
  assert.equal(starsVisibility(0.5), 0);
  assert.equal(firefliesVisibility(0.5), 0);
  assert.ok(starsVisibility(0.0) > 0.9);
  assert.ok(firefliesVisibility(0.0) > 0.9);
  assert.ok(daylight(0.5) > 0.9);
  assert.ok(sunsetWarmth(0.5) < 0.05, 'noon is not warm-graded');
});
