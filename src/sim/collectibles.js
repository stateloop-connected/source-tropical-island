// Pure shell-collection and cave-unlock state machine. Shell positions are
// fixed, hand-placed on interesting landmarks so exploration spans the whole
// island (beach, forest, volcano rim, lagoon, near the waterfall...).

import { terrainHeight, CAVE, LAGOON, VOLCANO } from './terrain.js';

export const SHELL_COUNT = 7;
export const COLLECT_RADIUS = 2.6;

export const SHELL_POSITIONS = [
  { x: 18, z: 96 },      // southern beach
  { x: -52, z: 84 },     // south-west beach
  { x: 96, z: -18 },     // eastern shore
  { x: 8, z: -96 },      // northern beach
  { x: -30, z: 26 },     // palm forest interior
  { x: VOLCANO.x + 20, z: VOLCANO.z + 20 }, // volcano lower slope
  { x: LAGOON.x - 4, z: LAGOON.z - 13 }     // lagoon rim by the waterfall
];

export function createShellState() {
  return {
    collected: SHELL_POSITIONS.map(() => false),
    caveUnlocked: false,
    treasureRevealed: false,
    justCollected: -1,
    justUnlocked: false
  };
}

export function collectedCount(state) {
  return state.collected.reduce((n, c) => n + (c ? 1 : 0), 0);
}

// Collect any shells within reach of the player. Returns events for the
// UI/audio layers; mutates a copy of the flags on the passed state object.
export function collectNear(state, x, z) {
  state.justCollected = -1;
  state.justUnlocked = false;
  for (let i = 0; i < SHELL_POSITIONS.length; i++) {
    if (state.collected[i]) continue;
    const p = SHELL_POSITIONS[i];
    if (Math.hypot(x - p.x, z - p.z) <= COLLECT_RADIUS) {
      state.collected[i] = true;
      state.justCollected = i;
      if (collectedCount(state) === SHELL_COUNT && !state.caveUnlocked) {
        state.caveUnlocked = true;
        state.justUnlocked = true;
      }
      break; // one shell per frame keeps events readable
    }
  }
  return state;
}

export function collectAll(state) {
  state.collected = state.collected.map(() => true);
  if (!state.caveUnlocked) {
    state.caveUnlocked = true;
    state.justUnlocked = true;
  }
  return state;
}

// Treasure reveal triggers once when the unlocked player enters the cave zone.
export function updateTreasure(state, x, z) {
  if (state.caveUnlocked && !state.treasureRevealed) {
    if (Math.hypot(x - CAVE.x, z - CAVE.z) < CAVE.radius) {
      state.treasureRevealed = true;
      return true;
    }
  }
  return false;
}

// World-space Y for rendering a shell (hover above terrain).
export function shellY(i) {
  const p = SHELL_POSITIONS[i];
  return terrainHeight(p.x, p.z) + 0.55;
}
