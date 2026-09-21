// Pure third-person character physics: walk, jump, swim. The step function is
// deterministic given (state, input, dt, env) so it is unit-testable without
// a renderer. `env` provides terrainHeight(x, z) and waterLevelAt(x, z).

import { terrainHeight, waterLevelAt } from './terrain.js';

export const MOVE = {
  walkSpeed: 6.2,
  swimSpeed: 2.6,
  acceleration: 34,
  swimAcceleration: 12,
  gravity: -22,
  swimGravity: -4,
  jumpVelocity: 7.5,
  buoyancy: 9,
  swimDepth: 0.9, // deeper than this -> swimming
  maxSlopeDelta: 1.35, // meters of rise allowed per step (climb limit)
  radius: 0.42,
  eyeHeight: 1.62
};

export function createPlayerState(x = 0, z = 90) {
  return {
    x,
    z,
    y: terrainHeight(x, z),
    vx: 0,
    vy: 0,
    vz: 0,
    heading: Math.PI, // facing the island center from the southern beach
    onGround: true,
    swimming: false,
    moving: false
  };
}

const defaultEnv = { terrainHeight, waterLevelAt };

// input: { moveX, moveZ } — desired world-space move direction (normalized or
// analog magnitude 0..1), jump: boolean edge-triggered by the caller.
export function stepPlayer(state, input, dt, env = defaultEnv) {
  const terrain = env.terrainHeight || terrainHeight;
  const waterAt = env.waterLevelAt || waterLevelAt;
  const s = { ...state };
  const step = Math.min(dt, 0.05); // clamp huge frames, integrate substeps

  const groundY = terrain(s.x, s.z);
  const waterY = waterAt(s.x, s.z);
  const depth = waterY !== null ? waterY - groundY : 0;
  s.swimming = waterY !== null && depth > MOVE.swimDepth && s.y < waterY + 0.2;

  const mag = Math.hypot(input.moveX, input.moveZ);
  const wish = mag > 1 ? { x: input.moveX / mag, z: input.moveZ / mag } : { x: input.moveX, z: input.moveZ };
  const targetSpeed = (s.swimming ? MOVE.swimSpeed : MOVE.walkSpeed) * Math.min(mag, 1);
  const accel = s.swimming ? MOVE.swimAcceleration : MOVE.acceleration;

  s.vx += (wish.x * targetSpeed - s.vx) * Math.min(1, (accel * step) / Math.max(targetSpeed, 1));
  s.vz += (wish.z * targetSpeed - s.vz) * Math.min(1, (accel * step) / Math.max(targetSpeed, 1));
  s.moving = mag > 0.08;

  if (s.moving) {
    s.heading = Math.atan2(wish.x, wish.z);
  }

  if (s.swimming) {
    // Buoyancy pulls the capsule toward the surface; weak gravity underwater.
    const floatTarget = waterY - 0.25;
    s.vy += (floatTarget - s.y) * MOVE.buoyancy * step + MOVE.swimGravity * step;
    s.vy *= 1 - Math.min(1, 3.2 * step);
    if (input.jump) s.vy += 2.2; // paddle upward
  } else {
    s.vy += MOVE.gravity * step;
    if (input.jump && s.onGround) {
      s.vy = MOVE.jumpVelocity;
      s.onGround = false;
    }
  }

  // Horizontal integration with a simple slope/wall limit so the volcano rim
  // and lagoon rocks shape movement without full collision meshes.
  const nx = s.x + s.vx * step;
  const nz = s.z + s.vz * step;
  const aheadGround = terrain(nx, nz);
  const rise = aheadGround - Math.max(groundY, s.y - 1.2);
  if (!s.swimming && rise > MOVE.maxSlopeDelta && s.onGround) {
    // Too steep: slide along, blocking the steep component.
    s.vx *= 0.15;
    s.vz *= 0.15;
  } else {
    s.x = nx;
    s.z = nz;
  }

  s.y += s.vy * step;

  const newGround = terrain(s.x, s.z);
  if (s.swimming) {
    const floor = newGround + 0.35;
    if (s.y < floor) {
      s.y = floor;
      s.vy = Math.max(0, s.vy);
    }
    s.onGround = false;
  } else if (s.y <= newGround) {
    s.y = newGround;
    s.vy = 0;
    s.onGround = true;
  } else {
    s.onGround = false;
  }
  return s;
}
