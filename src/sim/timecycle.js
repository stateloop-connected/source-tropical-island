// Pure six-real-minute day/night cycle. timeOfDay t is a fraction in [0, 1):
// 0.00 = midnight, 0.25 = sunrise, 0.50 = noon, 0.75 = sunset. All palette
// math is deterministic so tests can assert warm sunsets and night ambience.

export const DAY_LENGTH_SECONDS = 360;

export function timeOfDayAt(elapsedSeconds, offset = 0.32) {
  const t = (elapsedSeconds / DAY_LENGTH_SECONDS + offset) % 1;
  return t < 0 ? t + 1 : t;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Sun elevation in radians: peaks at noon, dips below the horizon at night.
export function sunElevation(t) {
  return Math.sin((t - 0.25) * Math.PI * 2) * (Math.PI / 3);
}

export function isNight(t) {
  return sunElevation(t) < -0.06;
}

export function phaseAt(t) {
  const e = sunElevation(t);
  if (e < -0.06) return 'night';
  if (e < 0.16) return t < 0.5 ? 'dawn' : 'sunset';
  return 'day';
}

// 0 at night, 1 in full daylight.
export function daylight(t) {
  return clamp01((sunElevation(t) + 0.06) / 0.5);
}

// Warmth peaks on the horizon band (sunrise/sunset) -> orange grading.
export function sunsetWarmth(t) {
  const e = sunElevation(t);
  const horizonBand = clamp01(1 - Math.abs(e) / 0.28);
  // Full warmth while the sun sits on the horizon band, fading once it dips
  // well below it (afterglow handled by the falling band itself).
  return horizonBand * clamp01((e + 0.1) / 0.06);
}

export function starsVisibility(t) {
  return clamp01(1 - daylight(t) * 2.2);
}

export function firefliesVisibility(t) {
  return clamp01(1 - daylight(t) * 1.8);
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function lerpColor(a, b, u) {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

const PALETTE = {
  nightSky: [0.015, 0.03, 0.09],
  nightHorizon: [0.05, 0.08, 0.16],
  daySky: [0.32, 0.62, 0.92],
  dayHorizon: [0.75, 0.88, 0.95],
  sunsetSky: [0.55, 0.3, 0.42],
  sunsetHorizon: [1.0, 0.52, 0.22],
  nightFog: [0.03, 0.05, 0.11],
  dayFog: [0.72, 0.85, 0.92],
  sunsetFog: [0.92, 0.55, 0.32]
};

// Full graded palette for a moment in the cycle. Values are linear RGB 0..1.
export function paletteAt(t) {
  const day = daylight(t);
  const warm = sunsetWarmth(t);
  let sky = lerpColor(PALETTE.nightSky, PALETTE.daySky, day);
  let horizon = lerpColor(PALETTE.nightHorizon, PALETTE.dayHorizon, day);
  let fog = lerpColor(PALETTE.nightFog, PALETTE.dayFog, day);
  sky = lerpColor(sky, PALETTE.sunsetSky, warm * 0.75);
  horizon = lerpColor(horizon, PALETTE.sunsetHorizon, warm);
  fog = lerpColor(fog, PALETTE.sunsetFog, warm * 0.8);
  return {
    sky,
    horizon,
    fog,
    sunIntensity: 0.25 + day * 2.6,
    ambientIntensity: 0.34 + day * 0.42,
    warm,
    day
  };
}

// Direction TO the sun (unit-ish vector) for the key light.
export function sunDirection(t) {
  const az = (t - 0.25) * Math.PI * 2; // east -> west
  const el = Math.max(sunElevation(t), -0.35);
  return {
    x: Math.cos(el) * Math.sin(az + Math.PI / 2),
    y: Math.sin(el),
    z: Math.cos(el) * Math.cos(az + Math.PI / 2) * 0.6
  };
}
