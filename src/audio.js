// Procedural WebAudio ambience: waves (filtered noise), birds (FM-ish chirp
// scheduler), crickets (pulsed high band). The AudioContext is created ONLY
// inside unlock() — called from the start-button gesture — so nothing here
// can throw before user interaction. All other methods safely no-op.

export function createAmbience() {
  let ctx = null;
  let master = null;
  const layers = {}; // name -> { gain, ... }
  let current = { waves: 0, birds: 0, crickets: 0 };
  let nextChirpAt = 0;
  let unlocked = false;

  function makeNoiseBuffer(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Pinkish noise: cheap one-pole lowpassed white noise.
      const white = Math.random() * 2 - 1;
      last = last * 0.94 + white * 0.06;
      data[i] = last * 6;
    }
    return buf;
  }

  function buildWaves() {
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(3);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const swell = ctx.createGain();
    swell.gain.value = 0.65;
    // Slow swell LFO makes the surf breathe.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(swell.gain);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(swell).connect(gain).connect(master);
    src.start();
    lfo.start();
    layers.waves = { gain };
  }

  function buildCrickets() {
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(2);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4300;
    bp.Q.value = 9;
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    // ~24 Hz gating = classic cricket chirp train.
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 24;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const offset = ctx.createConstantSource();
    offset.offset.value = 0.5;
    lfo.connect(lfoGain).connect(pulse.gain);
    offset.connect(pulse.gain);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(pulse).connect(gain).connect(master);
    src.start();
    lfo.start();
    offset.start();
    layers.crickets = { gain };
  }

  function chirp(now) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = 2200 + Math.random() * 1400;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(base * 0.8, now + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g).connect(layers.birds.gain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  return {
    // MUST be called from a user gesture. Idempotent and fail-safe.
    unlock() {
      if (unlocked) return true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        buildWaves();
        buildCrickets();
        layers.birds = { gain: ctx.createGain() };
        layers.birds.gain.gain.value = 0;
        layers.birds.gain.connect(master);
        unlocked = true;
      } catch (err) {
        console.warn('[tropical-island] audio unavailable:', err.message || err);
        ctx = null;
        unlocked = false;
      }
      return unlocked;
    },

    // Crossfade layer gains toward the sim-provided mix; schedule bird chirps.
    update(mix, _dt) {
      if (!unlocked || !ctx) return;
      current = mix;
      const t = ctx.currentTime;
      for (const name of ['waves', 'birds', 'crickets']) {
        const target = Math.min(1, mix[name] ?? 0) * (name === 'birds' ? 0.35 : name === 'crickets' ? 0.16 : 0.85);
        layers[name].gain.gain.setTargetAtTime(target, t, 0.4);
      }
      if (mix.birds > 0.06 && t >= nextChirpAt) {
        chirp(t);
        nextChirpAt = t + 0.6 + Math.random() * 3.2 * (1.2 - mix.birds);
      }
    },

    // Tiny chime for shell pickup; higher arpeggio for the cave unlock.
    playChime(kind = 'shell') {
      if (!unlocked || !ctx) return;
      const t0 = ctx.currentTime;
      const notes = kind === 'unlock' ? [523, 659, 784, 1047] : kind === 'treasure' ? [392, 523, 659, 784, 1047] : [880, 1320];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = ctx.createGain();
        const t = t0 + i * 0.09;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.22, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    },

    getState() {
      return {
        unlocked,
        running: !!ctx && ctx.state === 'running',
        contextState: ctx ? ctx.state : 'none',
        mix: { ...current }
      };
    }
  };
}
