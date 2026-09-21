// World assembly: terrain, water, volcano, vegetation, sky, wildlife, shells,
// cave, player — plus lighting, fog, and per-frame time-of-day grading.

import * as THREE from 'three';
import { createTerrain } from './terrainView.js';
import { createWater } from './water.js';
import { createVolcano } from './volcano.js';
import { createVegetation } from './vegetation.js';
import { createSky } from './sky.js';
import { createWildlifeView } from './wildlifeView.js';
import { createShellsAndCave } from './shells.js';
import { createPlayerView } from './playerView.js';
import { paletteAt, sunDirection, starsVisibility, firefliesVisibility } from '../sim/timecycle.js';
import { TIERS } from '../sim/quality.js';

export function createWorld(scene, { tier, crabs, schools }) {
  const terrain = createTerrain();
  const water = createWater();
  const volcano = createVolcano();
  const vegetation = createVegetation(tier);
  const sky = createSky();
  const wildlife = createWildlifeView(crabs, schools);
  const shellsCave = createShellsAndCave();
  const playerView = createPlayerView();

  scene.add(
    terrain, water.group, volcano.group, vegetation.group,
    sky.group, wildlife.group, shellsCave.group, playerView.group
  );

  // --- lighting -------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = TIERS[tier].shadows;
  sun.shadow.mapSize.setScalar(TIERS[tier].shadowMapSize || 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xbfd9e8, 0x51684a, 0.7);
  scene.add(hemi);

  scene.fog = new THREE.Fog(0xbfd9e8, 90, 420);

  const fogColor = new THREE.Color();
  const horizonColor = new THREE.Color();
  const sunColorWarm = new THREE.Color(0xff9448);
  const sunColorDay = new THREE.Color(0xfff3dc);
  const moonColor = new THREE.Color(0x8fa8d8);

  function applyTier(renderer, newTier) {
    const t = TIERS[newTier];
    sun.castShadow = t.shadows;
    if (t.shadows) {
      sun.shadow.mapSize.setScalar(t.shadowMapSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    renderer.shadowMap.enabled = t.shadows;
    vegetation.applyTier(newTier);
    // Toggling shadow maps requires every material program to recompile.
    scene.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.needsUpdate = true;
    });
  }

  return {
    playerView,
    applyTier,
    update(dt, ctx) {
      const { time, timeOfDay, player, flock, crabs: crabStates, fishOut, shellState } = ctx;
      const palette = paletteAt(timeOfDay);
      const sunDir = sunDirection(timeOfDay);

      // Key light follows the sun; at night it becomes cool moonlight.
      const night = 1 - palette.day;
      sun.position.set(player.x + sunDir.x * 140, Math.max(14, sunDir.y * 180), player.z + sunDir.z * 140);
      sun.target.position.set(player.x, player.y, player.z);
      if (palette.day > 0.08) {
        sun.intensity = palette.sunIntensity;
        sun.color.copy(sunColorDay).lerp(sunColorWarm, palette.warm);
      } else {
        sun.intensity = 0.55;
        sun.color.copy(moonColor);
      }
      hemi.intensity = palette.ambientIntensity;

      fogColor.setRGB(...palette.fog);
      scene.fog.color.copy(fogColor);
      scene.fog.near = 90 - night * 35;
      scene.fog.far = 420 - night * 140;

      horizonColor.setRGB(...palette.horizon);
      water.update(time, horizonColor);
      volcano.update(time);
      vegetation.update(time);
      sky.update({
        time,
        palette,
        sunDir,
        starsVis: starsVisibility(timeOfDay),
        firefliesVis: firefliesVisibility(timeOfDay),
        starCount: TIERS[ctx.tier].stars,
        fireflyCount: TIERS[ctx.tier].fireflies
      });
      wildlife.update({ flock, crabs: crabStates, fishOut, time });
      shellsCave.update(dt, time, shellState);
      playerView.update(dt, time, player);
    }
  };
}
