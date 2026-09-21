import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerState, stepPlayer, MOVE } from '../src/sim/movement.js';
import { terrainHeight, waterLevelAt, LAGOON } from '../src/sim/terrain.js';

function run(state, input, seconds, dt = 1 / 60) {
  let s = state;
  for (let t = 0; t < seconds; t += dt) s = stepPlayer(s, input, dt);
  return s;
}

test('player walks in the input direction and stays grounded', () => {
  let s = createPlayerState(0, 0);
  s = run(s, { moveX: 1, moveZ: 0, jump: false }, 1.5);
  assert.ok(s.x > 5, `moved east (x=${s.x.toFixed(1)})`);
  assert.ok(Math.abs(s.y - terrainHeight(s.x, s.z)) < 0.05, 'stays on the ground');
  assert.ok(s.onGround);
  assert.equal(s.swimming, false);
});

test('walk speed is capped near walkSpeed', () => {
  let s = createPlayerState(0, 0);
  s = run(s, { moveX: 1, moveZ: 0, jump: false }, 3);
  const speed = Math.hypot(s.vx, s.vz);
  assert.ok(speed <= MOVE.walkSpeed + 0.2, `speed ${speed.toFixed(2)}`);
  assert.ok(speed > MOVE.walkSpeed * 0.85);
});

test('jump launches the player and gravity lands them again', () => {
  let s = createPlayerState(0, 0);
  const groundY = s.y;
  s = stepPlayer(s, { moveX: 0, moveZ: 0, jump: true }, 1 / 60);
  assert.ok(s.vy > 0, 'jump imparts upward velocity');
  s = run(s, { moveX: 0, moveZ: 0, jump: false }, 0.25);
  assert.ok(s.y > groundY + 0.2, `airborne (y=${s.y.toFixed(2)})`);
  s = run(s, { moveX: 0, moveZ: 0, jump: false }, 2);
  assert.ok(Math.abs(s.y - groundY) < 0.05, 'lands back');
  assert.ok(s.onGround);
});

test('entering deep water switches to slower swim mode', () => {
  // Walk east into the ocean until swimming.
  let s = createPlayerState(60, 0);
  s = run(s, { moveX: 1, moveZ: 0, jump: false }, 20);
  assert.ok(waterLevelAt(s.x, s.z) !== null, 'reached water');
  assert.equal(s.swimming, true);
  const swimSpeed = Math.hypot(s.vx, s.vz);
  assert.ok(swimSpeed <= MOVE.swimSpeed + 0.2, `swim speed ${swimSpeed.toFixed(2)} < walk ${MOVE.walkSpeed}`);
  // Buoyancy keeps the capsule near the surface.
  const surface = waterLevelAt(s.x, s.z);
  assert.ok(Math.abs(s.y - (surface - 0.25)) < 0.6, `floats near surface (y=${s.y.toFixed(2)})`);
});

test('lagoon is swimmable', () => {
  let s = createPlayerState(LAGOON.x, LAGOON.z);
  s = run(s, { moveX: 0, moveZ: 0, jump: false }, 1);
  assert.equal(s.swimming, true);
});

test('no input means no drift', () => {
  let s = createPlayerState(5, 5);
  s = run(s, { moveX: 0, moveZ: 0, jump: false }, 1);
  assert.ok(Math.hypot(s.vx, s.vz) < 0.3);
});

test('movement is deterministic', () => {
  const a = run(createPlayerState(0, 0), { moveX: 0.7, moveZ: 0.7, jump: true }, 2);
  const b = run(createPlayerState(0, 0), { moveX: 0.7, moveZ: 0.7, jump: true }, 2);
  assert.deepEqual(a, b);
});
