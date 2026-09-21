// Boot: WebGL renderer (ACES, capped pixel ratio, adaptive quality), world,
// UI, procedural audio, third-person camera with idle sway, the main loop,
// and the window.__tropicalIsland debug handle used by tests.

import * as THREE from 'three';
import { createWorld } from './world/world.js';
import { createUI } from './ui.js';
import { createAmbience } from './audio.js';
import { terrainHeight, biomeAt, CAVE, OCEAN_LEVEL } from './sim/terrain.js';
import { createPlayerState, stepPlayer } from './sim/movement.js';
import { timeOfDayAt, phaseAt } from './sim/timecycle.js';
import {
  createGullFlock, stepGulls, createCrabs, stepCrabs,
  createFishSchools, fishPositions
} from './sim/wildlife.js';
import {
  createShellState, collectNear, collectAll, collectedCount, updateTreasure, SHELL_POSITIONS
} from './sim/collectibles.js';
import { createQualityController, feedFrame, initialTier, pixelRatioFor, TIERS } from './sim/quality.js';
import { targetMix, smoothMix } from './sim/audiomix.js';

function configureRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    // Canvas sampling is needed only under automation; avoid the mobile
    // fill-rate cost in normal play.
    preserveDrawingBuffer: navigator.webdriver === true
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function boot() {
  const canvas = document.getElementById('scene');
  const isMobile =
    matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 620;

  let renderer;
  try {
    renderer = configureRenderer(canvas);
  } catch (err) {
    document.getElementById('loading').innerHTML =
      '<div class="load-card"><h1>Tropical Island</h1><p>This experience needs WebGL, which your browser blocked.</p></div>';
    throw err;
  }

  // --- sim state ------------------------------------------------------------
  let elapsed = 0;
  let timeOffset = 0.32; // start mid-morning
  let player = createPlayerState(0, 82);
  const flock = createGullFlock();
  const crabs = createCrabs();
  const schools = createFishSchools();
  const fishOut = [];
  const shellState = createShellState();
  const quality = createQualityController(initialTier(isMobile));
  let mix = { waves: 0, birds: 0, crickets: 0 };
  let started = false;
  let fpsAvg = 60;

  // --- scene ----------------------------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1400);
  const world = createWorld(scene, { tier: quality.tier, crabs, schools });

  function applyPixelRatio() {
    renderer.setPixelRatio(pixelRatioFor(quality.tier, window.devicePixelRatio));
  }
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyPixelRatio();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- input ----------------------------------------------------------------
  const ui = createUI({
    onStart() {
      started = true;
      ambience.unlock();
      ui.toast('Welcome to the island 🌴');
    }
  });
  const ambience = createAmbience();

  // Camera orbit by dragging anywhere on the canvas.
  // The camera position formula below subtracts dir(camYaw), so camYaw equals
  // the player's heading when the camera is behind them.
  let camYaw = player.heading;
  let camPitch = 0.42;
  let dragging = false;
  let lastPX = 0;
  let lastPY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastPX = e.clientX;
    lastPY = e.clientY;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    camYaw -= (e.clientX - lastPX) * 0.005;
    camPitch = THREE.MathUtils.clamp(camPitch + (e.clientY - lastPY) * 0.003, 0.12, 1.1);
    lastPX = e.clientX;
    lastPY = e.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  // --- camera follow --------------------------------------------------------
  let idleTime = 0;
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(player.x, player.y + 4, player.z + 8);
  function updateCamera(dt, time) {
    const speed = Math.hypot(player.vx, player.vz);
    idleTime = speed < 0.4 ? idleTime + dt : 0;
    // Auto-align behind the player while moving (unless the user is orbiting).
    if (!dragging && speed > 0.5) {
      camYaw = lerpAngle(camYaw, player.heading, Math.min(1, dt * 2.2));
    }
    const dist = player.swimming ? 9.5 : 7.5;
    const horiz = Math.cos(camPitch) * dist;
    const vert = Math.sin(camPitch) * dist + 1.6;
    camTarget.set(
      player.x - Math.sin(camYaw) * horiz,
      player.y + vert,
      player.z - Math.cos(camYaw) * horiz
    );
    // Subtle idle sway: the camera breathes when the player stands still.
    if (idleTime > 1.2) {
      const sway = Math.min(1, (idleTime - 1.2) / 2);
      camTarget.x += Math.sin(time * 0.45) * 0.35 * sway;
      camTarget.y += Math.sin(time * 0.7 + 1) * 0.18 * sway;
    }
    // Pull the camera in when terrain (e.g. the volcano cone) blocks the shot.
    const headY = player.y + 1.6;
    let clearT = 1;
    for (let t = 0.3; t <= 1.001; t += 0.14) {
      const sx = player.x + (camTarget.x - player.x) * t;
      const sy = headY + (camTarget.y - headY) * t;
      const sz = player.z + (camTarget.z - player.z) * t;
      if (sy < terrainHeight(sx, sz) + 0.9) {
        clearT = Math.max(0.22, t - 0.14);
        break;
      }
    }
    if (clearT < 1) {
      camTarget.set(
        player.x + (camTarget.x - player.x) * clearT,
        headY + (camTarget.y - headY) * clearT,
        player.z + (camTarget.z - player.z) * clearT
      );
    }
    camPos.lerp(camTarget, Math.min(1, dt * 4.5));
    // Never sink the camera under the ground or the waves.
    const minY = Math.max(terrainHeight(camPos.x, camPos.z) + 0.6, OCEAN_LEVEL + 0.5);
    if (camPos.y < minY) camPos.y = minY;
    camera.position.copy(camPos);
    camera.lookAt(player.x, player.y + 1.7, player.z);
  }

  // --- gameplay events ------------------------------------------------------
  function handleEvents() {
    const before = collectedCount(shellState);
    collectNear(shellState, player.x, player.z);
    if (shellState.justCollected >= 0) {
      const n = before + 1;
      ui.setShells(n, 7);
      ambience.playChime('shell');
      if (shellState.justUnlocked) {
        ui.toast('✨ All 7 shells! The secret cave rumbles open…', 4200);
        ui.setObjective('Enter the cave behind the waterfall');
        ambience.playChime('unlock');
      } else {
        ui.toast(`Shell found — ${n}/7`);
      }
    }
    if (updateTreasure(shellState, player.x, player.z)) {
      ui.toast('🏆 You found the hidden treasure!', 5000);
      ui.setObjective('Island complete — enjoy paradise');
      ambience.playChime('treasure');
    }
  }

  // --- per-frame sim step ----------------------------------------------------
  function stepSim(dt) {
    const mv = ui.readMove();
    // Screen-space input -> world-space via the camera's ground-projected axes.
    const fx = player.x - camPos.x;
    const fz = player.z - camPos.z;
    const fl = Math.hypot(fx, fz) || 1;
    const fX = fx / fl;
    const fZ = fz / fl;
    const input = {
      moveX: fX * mv.y + -fZ * mv.x,
      moveZ: fZ * mv.y + fX * mv.x,
      jump: ui.consumeJump()
    };
    const sub = Math.max(1, Math.ceil(dt / 0.034));
    for (let i = 0; i < sub; i++) {
      player = stepPlayer(player, input, dt / sub);
      input.jump = false;
    }
    stepGulls(flock, dt, elapsed);
    stepCrabs(crabs, player, dt, elapsed);
    fishPositions(schools, elapsed, fishOut);
    handleEvents();
  }

  // --- main loop --------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;
    fpsAvg = fpsAvg * 0.95 + (1 / Math.max(dt, 1e-4)) * 0.05;

    const timeOfDay = timeOfDayAt(elapsed, timeOffset);
    stepSim(dt);
    world.update(dt, {
      time: elapsed,
      timeOfDay,
      player,
      flock,
      crabs,
      fishOut,
      shellState,
      tier: quality.tier
    });
    updateCamera(dt, elapsed);
    ui.setPhase(phaseAt(timeOfDay));

    // Adaptive quality.
    const before = quality.tier;
    feedFrame(quality, dt);
    if (quality.tier !== before) {
      world.applyTier(renderer, quality.tier);
      applyPixelRatio();
    }

    // Ambient audio follows biome + time once unlocked.
    mix = smoothMix(mix, targetMix(biomeAt(player.x, player.z), timeOfDay), dt);
    ambience.update(mix, dt);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // --- debug handle -----------------------------------------------------------
  window.__tropicalIsland = {
    getState() {
      const timeOfDay = timeOfDayAt(elapsed, timeOffset);
      return {
        started,
        elapsed,
        timeOfDay,
        phase: phaseAt(timeOfDay),
        biome: biomeAt(player.x, player.z),
        player: {
          x: player.x, y: player.y, z: player.z,
          vx: player.vx, vy: player.vy, vz: player.vz,
          heading: player.heading,
          swimming: player.swimming,
          onGround: player.onGround
        },
        shells: {
          collected: collectedCount(shellState),
          total: 7,
          caveUnlocked: shellState.caveUnlocked,
          treasureRevealed: shellState.treasureRevealed
        },
        wildlife: {
          gulls: flock.gulls.length,
          crabs: crabs.length,
          fishSchools: schools.length
        },
        quality: { tier: quality.tier, fps: Math.round(fpsAvg), pixelRatio: renderer.getPixelRatio() },
        audio: ambience.getState(),
        renderer: {
          type: 'webgl',
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles
        }
      };
    },
    startGame() {
      if (!started) ui.elements.startBtn.click();
      return started;
    },
    setTimeOfDay(t) {
      timeOffset = ((t - elapsed / 360) % 1 + 1) % 1;
      return timeOfDayAt(elapsed, timeOffset);
    },
    collectAllShells() {
      collectAll(shellState);
      ui.setShells(7, 7);
      ui.setObjective('Enter the cave behind the waterfall');
      return collectedCount(shellState);
    },
    forceUnlock() {
      shellState.caveUnlocked = true;
      return shellState.caveUnlocked;
    },
    setPlayerPosition(x, z) {
      player = { ...player, x, z, y: terrainHeight(x, z) + 0.2, vx: 0, vy: 0, vz: 0 };
      return { x: player.x, y: player.y, z: player.z };
    },
    teleportToShell(i) {
      const p = SHELL_POSITIONS[i];
      this.setPlayerPosition(p.x + 0.4, p.z);
      return collectedCount(shellState);
    },
    enterCave() {
      this.setPlayerPosition(CAVE.x, CAVE.z);
      return { x: CAVE.x, z: CAVE.z };
    },
    simulateMove(x, z, seconds = 1) {
      const steps = Math.ceil(seconds * 60);
      for (let i = 0; i < steps; i++) {
        player = stepPlayer(player, { moveX: x, moveZ: z, jump: false }, 1 / 60);
      }
      return { x: player.x, y: player.y, z: player.z };
    },
    simulateJump() {
      ui.queueJump();
      return true;
    },
    setJoystick(x, y) {
      ui.setJoystick(x, y);
      return true;
    },
    releaseJoystick() {
      ui.releaseJoystick();
      return true;
    },
    unlockAudio() {
      return ambience.unlock();
    },
    TIER_NAMES: Object.keys(TIERS)
  };

  requestAnimationFrame(frame);
}

boot();
