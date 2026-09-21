// Pure procedural island model: heightfield, water surfaces, and biome lookup.
// The world renderer samples these exact functions, so visuals and gameplay
// physics always agree. All units are meters; the island spans 400x400 m.

import { fbm2 } from './rng.js';

export const WORLD_SIZE = 400;
export const OCEAN_LEVEL = 0;
export const LAGOON_LEVEL = 1.1;

// Island radial profile.
export const ISLAND_RADIUS = 150;
export const BEACH_HEIGHT = 2.6;

// Volcano cone (climbable, with a crater holding the lava pool).
export const VOLCANO = { x: -62, z: -58, radius: 58, height: 46, craterRadius: 15, craterDepth: 12 };

// Hidden lagoon behind the waterfall: a rocky bowl with its own water level.
export const LAGOON = { x: 74, z: 62, radius: 17, bowlDepth: 4.2, rimHeight: 5.5 };

// Cave entrance sits on the lagoon rim, hidden behind the waterfall sheet.
export const CAVE = { x: 58, z: 78, radius: 4.5 };

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, v) {
  return smoothstepUnit(clamp01((v - a) / (b - a)));
}

function smoothstepUnit(t) {
  return t * t * (3 - 2 * t);
}

function dist(x, z, cx, cz) {
  return Math.hypot(x - cx, z - cz);
}

// Island base: a broad dome with a white-sand beach ring that slopes gently
// under the ocean, plus low-frequency noise for organic coastline wobble.
function baseHeight(x, z) {
  const wobble = (fbm2(x * 0.012 + 40, z * 0.012 - 17, 3, 7) - 0.5) * 26;
  const r = Math.hypot(x, z) + wobble;
  const t = clamp01(r / ISLAND_RADIUS);
  // Dome interior rising to ~7 m, then a quick falloff into the sea.
  const dome = 7.2 * (1 - smoothstepUnit(smoothstepUnit(t)));
  const shelf = -14 * smoothstep(0.86, 1.25, t);
  const detail = (fbm2(x * 0.05, z * 0.05, 3, 23) - 0.5) * 1.6;
  return dome + shelf + detail * smoothstep(1.05, 0.55, t);
}

// Volcano cone with a crater dip. The crater floor stays above the lava pool
// renderer plane; the rim remains the highest walkable point.
function volcanoHeight(x, z) {
  const d = dist(x, z, VOLCANO.x, VOLCANO.z);
  if (d > VOLCANO.radius * 1.6) return -Infinity;
  // The cone peaks at the crater rim, then dips into a smooth bowl so the
  // crater floor (with the lava pool) sits clearly below the walkable rim.
  let h;
  let coneT;
  if (d >= VOLCANO.craterRadius) {
    coneT = clamp01(1 - (d - VOLCANO.craterRadius) / (VOLCANO.radius - VOLCANO.craterRadius));
    h = VOLCANO.height * Math.pow(coneT, 1.3);
  } else {
    coneT = 1;
    const c = d / VOLCANO.craterRadius;
    h = VOLCANO.height - VOLCANO.craterDepth * (1 - c * c);
  }
  const rock = (fbm2(x * 0.09 + 9, z * 0.09 + 3, 3, 51) - 0.5) * 3.2 * coneT;
  return h + rock;
}

// Lagoon: rim rocks form a bowl that holds its own water level; one gap in
// the rim (toward the cave/waterfall side) lets the waterfall spill over.
function lagoonHeight(x, z) {
  const d = dist(x, z, LAGOON.x, LAGOON.z);
  // Always finite: callers blend this with the island base near the boundary.
  const bowl = LAGOON_LEVEL - LAGOON.bowlDepth * smoothstepUnit(clamp01(1 - d / LAGOON.radius));
  const rim = LAGOON.rimHeight * smoothstepUnit(clamp01(1 - Math.abs(d - (LAGOON.radius + 4)) / 9));
  return Math.max(bowl, rim);
}

export function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  h = Math.max(h, volcanoHeight(x, z));
  // The lagoon CARVES its bowl into the island and raises its rim rocks, so
  // it replaces (not unions with) the base height inside its zone.
  const dLagoon = dist(x, z, LAGOON.x, LAGOON.z);
  if (dLagoon < LAGOON.radius + 24) {
    const blend = smoothstep(LAGOON.radius + 22, LAGOON.radius + 8, dLagoon);
    h = h * (1 - blend) + lagoonHeight(x, z) * blend;
  }
  return h;
}

// Water surface height at (x, z), or null when there is no water. The lagoon
// pool is checked first because it sits above ocean level inside the island.
export function waterLevelAt(x, z) {
  const dLagoon = dist(x, z, LAGOON.x, LAGOON.z);
  if (dLagoon < LAGOON.radius && terrainHeight(x, z) < LAGOON_LEVEL) {
    return LAGOON_LEVEL;
  }
  if (terrainHeight(x, z) < OCEAN_LEVEL) {
    return OCEAN_LEVEL;
  }
  return null;
}

export function isInCaveZone(x, z) {
  return dist(x, z, CAVE.x, CAVE.z) < CAVE.radius;
}

// Coarse biome classification for audio mixing, spawns, and tinting.
export function biomeAt(x, z) {
  if (isInCaveZone(x, z)) return 'cave';
  const dLagoon = dist(x, z, LAGOON.x, LAGOON.z);
  if (dLagoon < LAGOON.radius + 10) return 'lagoon';
  const h = terrainHeight(x, z);
  const dVolcano = dist(x, z, VOLCANO.x, VOLCANO.z);
  if (dVolcano < VOLCANO.craterRadius + 2 && h > VOLCANO.height - VOLCANO.craterDepth - 4) {
    return 'crater';
  }
  if (dVolcano < VOLCANO.radius * 0.95 && h > 9) return 'volcano';
  if (h < OCEAN_LEVEL) return 'ocean';
  if (h < BEACH_HEIGHT) return 'beach';
  return 'forest';
}
