// Pure wildlife simulation: 12 flocking seagulls, beach crabs that scuttle
// away from the player, and fish schools circling the shallows and lagoon.
// Deterministic given the seed; the view layer only reads positions.

import { createRng } from './rng.js';
import { terrainHeight, waterLevelAt, LAGOON, ISLAND_RADIUS, VOLCANO } from './terrain.js';

export const GULL_COUNT = 12;

// ---------------------------------------------------------------------------
// Seagulls — lightweight boids (separation / alignment / cohesion) attracted
// to slowly drifting waypoints over the island and the sea.
export function createGullFlock(seed = 4242) {
  const rng = createRng(seed);
  const gulls = [];
  for (let i = 0; i < GULL_COUNT; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(30, 90);
    gulls.push({
      x: Math.cos(a) * r,
      y: rng.range(18, 34),
      z: Math.sin(a) * r,
      vx: rng.range(-4, 4),
      vy: 0,
      vz: rng.range(-4, 4),
      wingPhase: rng.range(0, Math.PI * 2)
    });
  }
  return { gulls, waypoint: { x: 0, y: 26, z: 0 }, waypointTimer: 0, rngSeed: seed };
}

export function stepGulls(flock, dt, time) {
  const { gulls } = flock;
  // Drifting waypoint: lazy lissajous over the island.
  flock.waypoint = {
    x: Math.sin(time * 0.05) * 80,
    y: 24 + Math.sin(time * 0.11) * 6,
    z: Math.cos(time * 0.037) * 80
  };
  // Flock centroid and mean velocity for alignment/cohesion.
  let cx = 0, cy = 0, cz = 0, mvx = 0, mvy = 0, mvz = 0;
  for (const g of gulls) {
    cx += g.x; cy += g.y; cz += g.z;
    mvx += g.vx; mvy += g.vy; mvz += g.vz;
  }
  cx /= gulls.length; cy /= gulls.length; cz /= gulls.length;
  mvx /= gulls.length; mvy /= gulls.length; mvz /= gulls.length;

  for (const g of gulls) {
    let ax = (flock.waypoint.x - g.x) * 0.06 + (cx - g.x) * 0.02 + (mvx - g.vx) * 0.4;
    let ay = (flock.waypoint.y - g.y) * 0.08 + (cy - g.y) * 0.02 + (mvy - g.vy) * 0.4;
    let az = (flock.waypoint.z - g.z) * 0.06 + (cz - g.z) * 0.02 + (mvz - g.vz) * 0.4;
    // Separation.
    for (const o of gulls) {
      if (o === g) continue;
      const dx = g.x - o.x, dy = g.y - o.y, dz = g.z - o.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 36 && d2 > 0.0001) {
        const push = 3.5 / d2;
        ax += dx * push; ay += dy * push; az += dz * push;
      }
    }
    g.vx += ax * dt * 8; g.vy += ay * dt * 8; g.vz += az * dt * 8;
    // Clamp airspeed and keep gulls above terrain, inside the world.
    const speed = Math.hypot(g.vx, g.vy, g.vz);
    const clamped = Math.max(3.5, Math.min(speed, 11));
    if (speed > 0.0001) {
      g.vx *= clamped / speed; g.vy *= clamped / speed; g.vz *= clamped / speed;
    } else {
      g.vx = clamped; g.vy = 0; g.vz = 0;
    }
    g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
    const floor = Math.max(terrainHeight(g.x, g.z) + 4, 6);
    if (g.y < floor) { g.y = floor; g.vy = Math.abs(g.vy); }
    if (g.y > 55) { g.y = 55; g.vy = -Math.abs(g.vy); }
    const rr = Math.hypot(g.x, g.z);
    if (rr > ISLAND_RADIUS + 60) {
      g.vx -= (g.x / rr) * 20 * dt;
      g.vz -= (g.z / rr) * 20 * dt;
    }
    g.wingPhase += dt * (6 + speed * 0.4);
  }
  return flock;
}

// ---------------------------------------------------------------------------
// Crabs — idle wander on the beach; sprint directly away from a near player.
export const CRAB_FLEE_RADIUS = 7;
export const CRAB_FLEE_SPEED = 4.2;

export function createCrabs(count = 9, seed = 909) {
  const rng = createRng(seed);
  const crabs = [];
  let guard = 0;
  while (crabs.length < count && guard++ < 400) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(70, 104);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < 0.25 || h > 2.4) continue; // beach band only
    crabs.push({ x, z, dirX: 0, dirZ: 1, speed: 0, wanderTimer: rng.range(0, 3), fleeing: false, rngState: rng.next() });
  }
  return crabs;
}

export function stepCrabs(crabs, player, dt, time) {
  for (const c of crabs) {
    const dx = c.x - player.x;
    const dz = c.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < CRAB_FLEE_RADIUS) {
      c.fleeing = true;
      c.dirX = dx / (d || 1);
      c.dirZ = dz / (d || 1);
      c.speed = CRAB_FLEE_SPEED;
    } else {
      c.fleeing = false;
      c.wanderTimer -= dt;
      if (c.wanderTimer <= 0) {
        const a = Math.sin(time * 1.7 + c.rngState * 40) * Math.PI + c.rngState * Math.PI * 2;
        c.dirX = Math.cos(a);
        c.dirZ = Math.sin(a);
        c.wanderTimer = 1.5 + c.rngState * 2;
        c.speed = c.rngState > 0.4 ? 0.7 : 0;
      }
    }
    const nx = c.x + c.dirX * c.speed * dt;
    const nz = c.z + c.dirZ * c.speed * dt;
    const h = terrainHeight(nx, nz);
    // Crabs never enter the water or climb — they bounce off instead.
    if (h > 0.15 && h < 2.6) {
      c.x = nx;
      c.z = nz;
    } else {
      c.dirX *= -1;
      c.dirZ *= -1;
    }
  }
  return crabs;
}

// ---------------------------------------------------------------------------
// Fish — schools orbit fixed centers inside water bodies; each fish keeps a
// rotating offset so the school shimmers. Visible through transparent water.
// Walk outward along a bearing until the sea is deep enough for a school.
function findDeepWater(angle, minDepth = 2.2) {
  for (let r = 105; r <= 175; r += 2) {
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (terrainHeight(x, z) < -minDepth) return { x, z };
  }
  return { x: Math.cos(angle) * 175, z: Math.sin(angle) * 175 };
}

export function createFishSchools(seed = 77) {
  const rng = createRng(seed);
  const seaA = findDeepWater(1.25);
  const seaB = findDeepWater(2.6);
  const schools = [
    { cx: LAGOON.x, cz: LAGOON.z, radius: 7, count: 14, waterY: 1.1, orbitSpeed: 0.35, phase: rng.range(0, 6) },
    { cx: seaA.x, cz: seaA.z, radius: 10, count: 16, waterY: 0, orbitSpeed: 0.22, phase: rng.range(0, 6) },
    { cx: seaB.x, cz: seaB.z, radius: 9, count: 14, waterY: 0, orbitSpeed: -0.27, phase: rng.range(0, 6) }
  ];
  for (const s of schools) {
    s.fish = [];
    for (let i = 0; i < s.count; i++) {
      s.fish.push({
        angle: rng.range(0, Math.PI * 2),
        dist: rng.range(0.8, s.radius),
        depth: rng.range(0.6, 1.9),
        wobble: rng.range(0.5, 1.6)
      });
    }
  }
  return schools;
}

// Writes stable {x,y,z,heading} objects into `out` (array of arrays).
// Buffers and fish objects are reused across frames to avoid mobile GC churn.
export function fishPositions(schools, time, out = []) {
  out.length = schools.length;
  for (let si = 0; si < schools.length; si++) {
    const s = schools[si];
    const schoolOut = out[si] || (out[si] = []);
    schoolOut.length = s.fish.length;
    const centerAngle = time * s.orbitSpeed + s.phase;
    const ccx = s.cx + Math.cos(centerAngle) * 3;
    const ccz = s.cz + Math.sin(centerAngle) * 3;
    for (let fi = 0; fi < s.fish.length; fi++) {
      const f = s.fish[fi];
      const a = f.angle + time * (0.8 * Math.sign(s.orbitSpeed)) * f.wobble;
      // Pull the fish toward the school center until it swims in water deep
      // enough to stay between floor and surface.
      let d = f.dist;
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 4; tries++) {
        x = ccx + Math.cos(a) * d;
        z = ccz + Math.sin(a) * d;
        const w = waterLevelAt(x, z);
        if (w !== null && w - terrainHeight(x, z) > 1.0) break;
        d *= 0.55;
      }
      const floor = terrainHeight(x, z) + 0.3;
      const surface = (waterLevelAt(x, z) ?? s.waterY) - 0.35;
      const y = Math.min(surface, Math.max(floor, surface - f.depth));
      const slot = schoolOut[fi] || (schoolOut[fi] = { x: 0, y: 0, z: 0, heading: 0 });
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.heading = a + Math.PI / 2;
    }
  }
  return out;
}

// Volcano-adjacent constant re-exported for the view layer's convenience.
export const VOLCANO_POS = { x: VOLCANO.x, z: VOLCANO.z };
