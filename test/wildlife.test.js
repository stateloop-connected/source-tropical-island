import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GULL_COUNT, createGullFlock, stepGulls,
  createCrabs, stepCrabs, CRAB_FLEE_RADIUS,
  createFishSchools, fishPositions
} from '../src/sim/wildlife.js';
import { terrainHeight, waterLevelAt, ISLAND_RADIUS } from '../src/sim/terrain.js';

test('flock has exactly 12 gulls and stays airborne in bounds', () => {
  const flock = createGullFlock();
  assert.equal(flock.gulls.length, GULL_COUNT);
  let time = 0;
  for (let i = 0; i < 600; i++) {
    time += 1 / 30;
    stepGulls(flock, 1 / 30, time);
  }
  for (const g of flock.gulls) {
    assert.ok(g.y >= Math.max(terrainHeight(g.x, g.z) + 3.9, 5.9), `gull above terrain (y=${g.y.toFixed(1)})`);
    assert.ok(g.y <= 56, 'gull below ceiling');
    assert.ok(Math.hypot(g.x, g.z) < ISLAND_RADIUS + 80, 'gull near the island');
    const speed = Math.hypot(g.vx, g.vy, g.vz);
    assert.ok(speed >= 3.4 && speed <= 11.2, `airspeed in band (${speed.toFixed(1)})`);
  }
});

test('flocking keeps gulls loosely grouped', () => {
  const flock = createGullFlock();
  let time = 0;
  for (let i = 0; i < 900; i++) {
    time += 1 / 30;
    stepGulls(flock, 1 / 30, time);
  }
  const cx = flock.gulls.reduce((s, g) => s + g.x, 0) / GULL_COUNT;
  const cz = flock.gulls.reduce((s, g) => s + g.z, 0) / GULL_COUNT;
  const spread = Math.max(...flock.gulls.map((g) => Math.hypot(g.x - cx, g.z - cz)));
  assert.ok(spread < 160, `flock stays cohesive (spread ${spread.toFixed(0)}m)`);
});

test('crabs scuttle directly away from a close player', () => {
  const crabs = createCrabs();
  assert.ok(crabs.length >= 6, `enough crabs spawned (${crabs.length})`);
  const c = crabs[0];
  const before = Math.hypot(c.x - (c.x + 3), c.z - c.z);
  const player = { x: c.x + 3, z: c.z }; // player 3 m east of the crab
  let time = 100;
  for (let i = 0; i < 60; i++) {
    time += 1 / 60;
    stepCrabs(crabs, player, 1 / 60, time);
  }
  const dAfter = Math.hypot(c.x - player.x, c.z - player.z);
  assert.ok(dAfter > before + 1.5, `crab fled (now ${dAfter.toFixed(1)}m away)`);
  assert.ok(c.x < player.x, 'crab fled west, away from the player');
  assert.ok(c.fleeing || dAfter >= CRAB_FLEE_RADIUS, 'crab keeps fleeing until safe');
});

test('idle crabs stay on the beach band', () => {
  const crabs = createCrabs();
  const farPlayer = { x: 0, z: -190 }; // swimming far away
  let time = 200;
  for (let i = 0; i < 300; i++) {
    time += 1 / 30;
    stepCrabs(crabs, farPlayer, 1 / 30, time);
  }
  for (const c of crabs) {
    const h = terrainHeight(c.x, c.z);
    assert.ok(h > 0.1 && h < 2.8, `crab on sand (h=${h.toFixed(2)})`);
  }
});

test('fish schools stay submerged in real water', () => {
  const schools = createFishSchools();
  assert.ok(schools.length >= 2, 'multiple schools');
  const out = [];
  for (let i = 0; i < 30; i++) {
    fishPositions(schools, i * 0.4, out);
    for (const school of out) {
      for (const f of school) {
        const water = waterLevelAt(f.x, f.z);
        if (water === null) continue; // briefly over a rock at the edge is ok
        assert.ok(f.y < water, `fish below surface (y=${f.y.toFixed(2)}, water=${water})`);
        assert.ok(f.y > terrainHeight(f.x, f.z), 'fish above the floor');
      }
    }
  }
  assert.ok(out[0].length >= 10, 'school has a shimmer of fish');
});

test('wildlife is deterministic per seed', () => {
  const a = createGullFlock(1);
  const b = createGullFlock(1);
  stepGulls(a, 0.1, 0.1);
  stepGulls(b, 0.1, 0.1);
  assert.deepEqual(a.gulls, b.gulls);
});

test('zero gull velocity recovers without NaN', () => {
  const flock = createGullFlock(3);
  for (const g of flock.gulls) { g.vx = 0; g.vy = 0; g.vz = 0; }
  stepGulls(flock, 1 / 60, 1);
  for (const g of flock.gulls) {
    assert.ok(Number.isFinite(g.x + g.y + g.z + g.vx + g.vy + g.vz));
  }
});

test('fish position buffers are reused across frames', () => {
  const schools = createFishSchools(9);
  const out = [];
  fishPositions(schools, 0, out);
  const first = out[0][0];
  fishPositions(schools, 0.2, out);
  assert.equal(out[0][0], first);
});
