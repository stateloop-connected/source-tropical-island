// Pure adaptive quality controller. Tiers trade pixels/shadows/effects for
// frame rate; the controller watches a rolling FPS window and steps down fast,
// up cautiously. Renderer wiring lives in main.js.

export const TIERS = {
  high: { name: 'high', pixelRatioCap: 2.0, shadows: true, shadowMapSize: 2048, fireflies: 90, stars: 900, palmScale: 1.0 },
  medium: { name: 'medium', pixelRatioCap: 1.5, shadows: true, shadowMapSize: 1024, fireflies: 50, stars: 500, palmScale: 0.8 },
  low: { name: 'low', pixelRatioCap: 1.0, shadows: false, shadowMapSize: 0, fireflies: 24, stars: 260, palmScale: 0.6 }
};

export const TIER_ORDER = ['high', 'medium', 'low'];

export function initialTier(isMobile) {
  return isMobile ? 'medium' : 'high';
}

export function createQualityController(tier) {
  return {
    tier,
    samples: [],
    windowSeconds: 2.0,
    cooldown: 0,
    upStreak: 0
  };
}

// Feed one frame. Returns the (possibly new) tier name.
export function feedFrame(q, dt) {
  const fps = 1 / Math.max(dt, 1 / 240);
  q.samples.push({ fps, dt });
  let acc = 0;
  let kept = 0;
  for (let i = q.samples.length - 1; i >= 0; i--) {
    if (acc + q.samples[i].dt > q.windowSeconds) break;
    acc += q.samples[i].dt;
    kept++;
  }
  q.samples = q.samples.slice(-kept);
  q.cooldown = Math.max(0, q.cooldown - dt);
  if (acc < q.windowSeconds * 0.9 || q.cooldown > 0) return q.tier;

  const avg = q.samples.reduce((s, f) => s + f.fps, 0) / q.samples.length;
  const idx = TIER_ORDER.indexOf(q.tier);
  if (avg < 45 && idx < TIER_ORDER.length - 1) {
    q.tier = TIER_ORDER[idx + 1];
    q.cooldown = 4;
    q.upStreak = 0;
    q.samples = [];
  } else if (avg > 58 && idx > 0) {
    q.upStreak++;
    if (q.upStreak >= 3) {
      q.tier = TIER_ORDER[idx - 1];
      q.cooldown = 6;
      q.upStreak = 0;
      q.samples = [];
    }
  } else {
    q.upStreak = 0;
  }
  return q.tier;
}

export function pixelRatioFor(tier, devicePixelRatio) {
  return Math.min(devicePixelRatio || 1, TIERS[tier].pixelRatioCap);
}
