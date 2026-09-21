import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  terrainHeight, waterLevelAt, biomeAt,
  VOLCANO, LAGOON, OCEAN_LEVEL, LAGOON_LEVEL, CAVE
} from '../src/sim/terrain.js';

test('terrain height is deterministic', () => {
  for (const [x, z] of [[10, 20], [-63.5, 41.25], [0, 0]]) {
    assert.equal(terrainHeight(x, z), terrainHeight(x, z));
  }
});

test('island has a white-sand beach ring between sea and interior', () => {
  // Walk outward along +x: land rises above sea, then drops below it.
  let sawBeach = false;
  let sawOcean = false;
  let prev = terrainHeight(0, 0);
  assert.ok(prev > OCEAN_LEVEL, 'center is above sea level');
  for (let r = 1; r <= 200; r++) {
    const h = terrainHeight(r, 0);
    if (h > OCEAN_LEVEL && h < 2.6 && prev > h) sawBeach = true;
    if (h < OCEAN_LEVEL) sawOcean = true;
    prev = h;
  }
  assert.ok(sawBeach, 'beach band exists on the way out');
  assert.ok(sawOcean, 'terrain eventually sinks under the ocean');
});

test('volcano is the highest point and has a crater below its rim', () => {
  let max = -Infinity;
  for (let x = -200; x <= 200; x += 4) {
    for (let z = -200; z <= 200; z += 4) {
      max = Math.max(max, terrainHeight(x, z));
    }
  }
  const rim = terrainHeight(VOLCANO.x + VOLCANO.craterRadius, VOLCANO.z);
  const floor = terrainHeight(VOLCANO.x, VOLCANO.z);
  assert.ok(max > 35, `volcano peak is tall (got ${max.toFixed(1)})`);
  assert.ok(rim > floor + 6, `crater floor (${floor.toFixed(1)}) sits below rim (${rim.toFixed(1)})`);
  assert.equal(biomeAt(VOLCANO.x, VOLCANO.z), 'crater');
});

test('lagoon holds its own water level behind the rim', () => {
  const floor = terrainHeight(LAGOON.x, LAGOON.z);
  assert.ok(floor < LAGOON_LEVEL, 'lagoon floor is below lagoon water level');
  assert.equal(waterLevelAt(LAGOON.x, LAGOON.z), LAGOON_LEVEL);
  // Rim between lagoon and open sea rises above the lagoon surface.
  const rimH = terrainHeight(LAGOON.x - LAGOON.radius - 4, LAGOON.z);
  assert.ok(rimH > LAGOON_LEVEL + 1, `lagoon rim (${rimH.toFixed(1)}) shelters the pool`);
});

test('ocean is water and far offshore has no land', () => {
  assert.ok(terrainHeight(190, 190) < OCEAN_LEVEL);
  assert.equal(waterLevelAt(190, 190), OCEAN_LEVEL);
  assert.equal(biomeAt(190, 190), 'ocean');
});

test('biomes cover the required set', () => {
  assert.equal(biomeAt(CAVE.x, CAVE.z), 'cave');
  assert.equal(biomeAt(LAGOON.x, LAGOON.z), 'lagoon');
  assert.equal(biomeAt(0, 0), 'forest');
});
