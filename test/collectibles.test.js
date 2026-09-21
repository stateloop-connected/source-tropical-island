import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SHELL_COUNT, SHELL_POSITIONS, COLLECT_RADIUS,
  createShellState, collectNear, collectAll, collectedCount, updateTreasure, shellY
} from '../src/sim/collectibles.js';
import { CAVE, terrainHeight, biomeAt } from '../src/sim/terrain.js';

test('there are exactly 7 shells on walkable island spots', () => {
  assert.equal(SHELL_COUNT, 7);
  assert.equal(SHELL_POSITIONS.length, 7);
  for (const p of SHELL_POSITIONS) {
    const h = terrainHeight(p.x, p.z);
    assert.ok(h > 0.2, `shell at (${p.x}, ${p.z}) is above water (h=${h.toFixed(2)})`);
    assert.ok(shellY(SHELL_POSITIONS.indexOf(p)) > h);
  }
  // Shells span distinct biomes so players explore the whole island.
  const biomes = new Set(SHELL_POSITIONS.map((p) => biomeAt(p.x, p.z)));
  assert.ok(biomes.size >= 3, `shells spread across biomes: ${[...biomes]}`);
});

test('collecting within radius collects; outside does not', () => {
  const s = createShellState();
  const p = SHELL_POSITIONS[0];
  collectNear(s, p.x + COLLECT_RADIUS + 5, p.z);
  assert.equal(collectedCount(s), 0);
  collectNear(s, p.x + 0.5, p.z);
  assert.equal(collectedCount(s), 1);
  assert.equal(s.justCollected, 0);
  // Re-collecting the same shell is a no-op.
  collectNear(s, p.x, p.z);
  assert.equal(collectedCount(s), 1);
});

test('collecting all 7 unlocks the cave exactly once', () => {
  const s = createShellState();
  assert.equal(s.caveUnlocked, false);
  for (let i = 0; i < 6; i++) {
    collectNear(s, SHELL_POSITIONS[i].x, SHELL_POSITIONS[i].z);
    assert.equal(s.caveUnlocked, false, 'not unlocked before the 7th');
  }
  collectNear(s, SHELL_POSITIONS[6].x, SHELL_POSITIONS[6].z);
  assert.equal(s.caveUnlocked, true);
  assert.equal(s.justUnlocked, true);
});

test('treasure reveals only inside the unlocked cave zone', () => {
  const s = createShellState();
  assert.equal(updateTreasure(s, CAVE.x, CAVE.z), false, 'locked cave: no reveal');
  collectAll(s);
  assert.equal(s.caveUnlocked, true);
  assert.equal(updateTreasure(s, 0, 0), false, 'outside cave: no reveal');
  assert.equal(updateTreasure(s, CAVE.x + 1, CAVE.z), true, 'inside cave: reveal');
  assert.equal(updateTreasure(s, CAVE.x, CAVE.z), false, 'reveals only once');
});
