// Pure ambient-audio mixing decisions. Given biome + time phase, compute
// target gains for the three procedural layers (waves, birds, crickets).
// The WebAudio layer crossfades actual gain nodes toward these targets.

import { daylight } from './timecycle.js';

export function targetMix(biome, t) {
  const day = daylight(t);
  const night = 1 - day;
  let waves;
  switch (biome) {
    case 'ocean': waves = 0.9; break;
    case 'beach': waves = 0.75; break;
    case 'lagoon': waves = 0.55; break; // waterfall + lap of the pool
    case 'cave': waves = 0.35; break;
    case 'crater': waves = 0.12; break;
    case 'volcano': waves = 0.2; break;
    default: waves = 0.35; // forest carries softened surf
  }
  let birds = 0;
  if (day > 0.25) {
    birds = biome === 'forest' ? 0.8 : biome === 'beach' ? 0.5 : biome === 'lagoon' ? 0.45 : 0.25;
    birds *= day;
  }
  let crickets = 0;
  if (night > 0.4) {
    crickets = biome === 'forest' ? 0.85 : biome === 'lagoon' ? 0.7 : biome === 'beach' ? 0.55 : 0.4;
    crickets *= night;
  }
  return { waves, birds, crickets };
}

// Exponential smoothing toward targets; stable for any dt.
export function smoothMix(current, target, dt, rate = 1.6) {
  const k = 1 - Math.exp(-rate * dt);
  return {
    waves: current.waves + (target.waves - current.waves) * k,
    birds: current.birds + (target.birds - current.birds) * k,
    crickets: current.crickets + (target.crickets - current.crickets) * k
  };
}
