// Instanced vegetation and rocks: ~140 low-poly palms (2 instanced draws for
// all of them) plus scattered rocks. Fronds sway via a tiny vertex-shader
// wind term injected with onBeforeCompile — zero per-frame CPU cost.

import * as THREE from 'three';
import { createRng } from '../sim/rng.js';
import { terrainHeight, biomeAt, LAGOON, VOLCANO } from '../sim/terrain.js';

function palmPlacements(count, seed) {
  const rng = createRng(seed);
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < 4000) {
    const x = rng.range(-115, 115);
    const z = rng.range(-115, 115);
    const biome = biomeAt(x, z);
    const h0 = terrainHeight(x, z);
    // Dense forest interior, plus scattered palms along the upper beach.
    if (biome !== 'forest' && !(biome === 'beach' && h0 > 1.5 && rng.next() < 0.4)) continue;
    // Keep clearings around landmarks and paths.
    if (Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.radius + 14) continue;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < VOLCANO.radius * 0.55) continue;
    let tooClose = false;
    for (const s of spots) {
      if (Math.hypot(s.x - x, s.z - z) < 4.5) { tooClose = true; break; }
    }
    if (tooClose) continue;
    spots.push({ x, z, h: terrainHeight(x, z), scale: rng.range(0.75, 1.3), rot: rng.range(0, Math.PI * 2), lean: rng.range(-0.12, 0.12) });
  }
  return spots;
}

function makeTrunkGeometry() {
  const geo = new THREE.CylinderGeometry(0.16, 0.3, 7, 5, 3);
  geo.translate(0, 3.5, 0);
  return geo;
}

// One frond: a bent diamond strip. Six of them make a crown.
function makeFrondGeometry() {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, 0, 0, 0.55, 0.25, 0.35, 0, 0.25, 0.7,
    0, 0, 0, 0, 0.25, 0.7, -0.55, 0.25, 0.35,
    0.55, 0.25, 0.35, 0.4, -0.15, 1.5, 0, 0.25, 0.7,
    0, 0.25, 0.7, 0.4, -0.15, 1.5, -0.4, -0.15, 1.5,
    0, 0.25, 0.7, -0.4, -0.15, 1.5, -0.55, 0.25, 0.35
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

function addWind(material, timeUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = timeUniform;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float windPhase = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.9;
        transformed.x += sin(uWindTime * 1.3 + windPhase) * position.y * 0.08;
        transformed.z += cos(uWindTime * 1.1 + windPhase * 1.3) * position.y * 0.06;
      #endif`
    );
  };
}

export function createVegetation(tier = 'high') {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const palmCount = tier === 'low' ? 90 : tier === 'medium' ? 115 : 140;
  const spots = palmPlacements(palmCount, 2024);
  const timeUniform = { value: 0 };

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1, flatShading: true });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f9e4f, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  addWind(frondMat, timeUniform);

  const trunks = new THREE.InstancedMesh(makeTrunkGeometry(), trunkMat, spots.length);
  const fronds = new THREE.InstancedMesh(makeFrondGeometry(), frondMat, spots.length * 6);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  let fi = 0;
  spots.forEach((p, i) => {
    e.set(p.lean, p.rot, 0);
    q.setFromEuler(e);
    s.setScalar(p.scale);
    m.compose(new THREE.Vector3(p.x, p.h - 0.15, p.z), q, s);
    trunks.setMatrixAt(i, m);
    const top = new THREE.Vector3(p.x + Math.sin(p.lean) * -6 * p.scale, p.h - 0.15 + 6.9 * p.scale, p.z);
    for (let f = 0; f < 6; f++) {
      // Yaw around the crown, then pitch the frond downward (YXZ order) so
      // crowns read as drooping palm canopies, not flat umbrellas.
      e.set(-0.55 - (f % 2) * 0.18, (f / 6) * Math.PI * 2 + p.rot, 0, 'YXZ');
      q.setFromEuler(e);
      s.setScalar(p.scale * (2.1 + (f % 3) * 0.25));
      m.compose(top, q, s);
      fronds.setMatrixAt(fi++, m);
    }
  });
  trunks.castShadow = true;
  fronds.castShadow = true;
  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  group.add(trunks, fronds);

  // Rocks: one instanced draw of dodecahedrons along the beach/rim/volcano.
  const rng = createRng(555);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7168, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 70);
  let placed = 0;
  let guard = 0;
  while (placed < 70 && guard++ < 800) {
    const x = rng.range(-150, 150);
    const z = rng.range(-150, 150);
    const h = terrainHeight(x, z);
    if (h < 0.1 || h > 40) continue;
    const nearLagoon = Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.radius + 12;
    const biome = biomeAt(x, z);
    if (!nearLagoon && biome !== 'beach' && biome !== 'volcano') continue;
    e.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    q.setFromEuler(e);
    s.set(rng.range(0.4, 1.6), rng.range(0.3, 1.1), rng.range(0.4, 1.6));
    // Sink into the ground so rocks never hover on sloped terrain facets.
    m.compose(new THREE.Vector3(x, h - 0.22, z), q, s);
    rocks.setMatrixAt(placed++, m);
  }
  rocks.count = placed;
  rocks.castShadow = true;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

  return {
    group,
    palmCount: spots.length,
    applyTier(newTier) {
      const scale = newTier === 'low' ? 0.6 : newTier === 'medium' ? 0.8 : 1;
      const visiblePalms = Math.max(1, Math.floor(spots.length * scale));
      trunks.count = visiblePalms;
      fronds.count = visiblePalms * 6;
    },
    update(time) {
      timeUniform.value = time;
    }
  };
}
