// Collectible glowing shells, the secret cave entrance (stone door, rock
// arch, dark interior), and the treasure chest reveal animation.

import * as THREE from 'three';
import { SHELL_POSITIONS, shellY } from '../sim/collectibles.js';
import { CAVE, terrainHeight } from '../sim/terrain.js';

function makeShellMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffe9f2,
    emissive: 0xff9ecf,
    emissiveIntensity: 1.2,
    roughness: 0.35,
    flatShading: true
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 5), mat);
  body.scale.set(1, 0.45, 0.85);
  g.add(body);
  // Ridges hint at a scallop shell.
  for (let i = -2; i <= 2; i++) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.8), mat);
    ridge.position.set(i * 0.16, 0.14, 0);
    ridge.rotation.z = -i * 0.16;
    g.add(ridge);
  }
  // Soft additive halo so shells glow from afar without a real light.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xff9ecf,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  g.add(halo);
  g.userData.mat = mat;
  g.userData.halo = halo;
  return g;
}

function makeChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.9, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0xa8730a, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.6, flatShading: true });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), wood);
  base.position.y = 0.35;
  g.add(base);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.7, -0.45);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.9), wood);
  lid.position.set(0, 0.17, 0.45);
  lidPivot.add(lid);
  g.add(lidPivot);
  const treasure = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.3, 0.65), gold);
  treasure.position.y = 0.62;
  g.add(treasure);
  g.userData.lidPivot = lidPivot;
  g.userData.gold = gold;
  return g;
}

export function createShellsAndCave() {
  const group = new THREE.Group();
  group.name = 'shells-cave';

  const shells = SHELL_POSITIONS.map((p, i) => {
    const mesh = makeShellMesh();
    mesh.position.set(p.x, shellY(i), p.z);
    group.add(mesh);
    return mesh;
  });

  // --- cave: rock arch + stone door + dark interior + treasure chest -------
  const cave = new THREE.Group();
  const caveY = terrainHeight(CAVE.x, CAVE.z);
  cave.position.set(CAVE.x, caveY, CAVE.z);
  // Face outward from the lagoon (toward the waterfall side).
  cave.rotation.y = Math.atan2(CAVE.x - 74, CAVE.z - 62) + Math.PI;

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5c4f48, roughness: 1, flatShading: true });
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.6, 1.6), rockMat);
  pillarL.position.set(-2.1, 2.3, 0);
  const pillarR = pillarL.clone();
  pillarR.position.x = 2.1;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.6, 1.9), rockMat);
  lintel.position.set(0, 4.9, 0);
  lintel.rotation.z = 0.06;
  cave.add(pillarL, pillarR, lintel);

  // Dark interior pocket (a half-dome sunk into the rock behind the arch).
  const interior = new THREE.Mesh(
    new THREE.SphereGeometry(2.3, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x0b0e14, side: THREE.BackSide })
  );
  interior.position.set(0, 0.2, 2.1);
  cave.add(interior);

  // Stone door sealing the entrance until all 7 shells are found.
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x8a7d70, roughness: 1, flatShading: true }));
  door.position.set(0, 2.2, 0.15);
  cave.add(door);

  const chest = makeChest();
  chest.position.set(0, 0.05, 1.9);
  chest.rotation.y = Math.PI;
  cave.add(chest);

  const treasureLight = new THREE.PointLight(0xffc93c, 0, 18, 1.6);
  treasureLight.position.set(0, 2, 1.6);
  cave.add(treasureLight);

  // Coin burst: golden sparks that jump out of the chest on reveal.
  const BURST = 36;
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST * 3), 3));
  const burstSeeds = new Float32Array(BURST * 3);
  for (let i = 0; i < BURST; i++) {
    burstSeeds[i * 3] = Math.random() * 2 - 1;
    burstSeeds[i * 3 + 1] = Math.random();
    burstSeeds[i * 3 + 2] = Math.random() * 2 - 1;
  }
  burstGeo.setAttribute('aSeed', new THREE.BufferAttribute(burstSeeds, 3));
  const burstUniforms = { uT: { value: -1 } }; // -1 idle, 0..1 animating
  const burst = new THREE.Points(burstGeo, new THREE.ShaderMaterial({
    uniforms: burstUniforms,
    vertexShader: /* glsl */ `
      uniform float uT;
      attribute vec3 aSeed;
      varying float vA;
      void main() {
        float t = clamp(uT * 1.4 - aSeed.y * 0.4, 0.0, 1.0);
        vec3 p = vec3(aSeed.x * 1.6 * t, 0.6 + 5.5 * t - 6.5 * t * t, aSeed.z * 1.6 * t);
        vA = (uT < 0.0 || uT >= 1.0) ? 0.0 : 1.0 - t * 0.6;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 6.0 * (1.0 - t * 0.5);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        if (vA <= 0.0) discard;
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.3) * 1.7, vA);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  burst.position.copy(chest.position);
  burst.frustumCulled = false;
  cave.add(burst);

  group.add(cave);

  // Animation state.
  let doorOpen = 0; // 0 closed -> 1 sunk into the ground
  let revealT = -1; // treasure reveal progress

  return {
    group,
    update(dt, time, shellState) {
      // Shell idle animation + collection pop.
      shells.forEach((mesh, i) => {
        if (shellState.collected[i]) {
          if (mesh.scale.x > 0.01) mesh.scale.multiplyScalar(0.82);
          mesh.visible = mesh.scale.x > 0.02;
          return;
        }
        mesh.position.y = shellY(i) + Math.sin(time * 2 + i * 1.7) * 0.18;
        mesh.rotation.y = time * 1.2 + i;
        const pulse = 1.0 + Math.sin(time * 3 + i * 2.1) * 0.45;
        mesh.userData.mat.emissiveIntensity = pulse;
        mesh.userData.halo.material.opacity = 0.14 + pulse * 0.1;
      });

      // Door slides down once unlocked.
      if (shellState.caveUnlocked && doorOpen < 1) {
        doorOpen = Math.min(1, doorOpen + dt / 2.2);
        const k = 1 - Math.pow(1 - doorOpen, 3);
        door.position.y = 2.2 - k * 4.6;
        door.visible = doorOpen < 0.98;
      }

      // Treasure reveal: lid opens, light blooms, coins burst.
      if (shellState.treasureRevealed) {
        if (revealT < 0) revealT = 0;
        if (revealT < 1) revealT = Math.min(1, revealT + dt / 2.6);
        const open = Math.min(1, revealT * 1.6);
        chest.userData.lidPivot.rotation.x = -open * 1.9;
        chest.userData.gold.emissiveIntensity = 0.8 + revealT * 2.2;
        treasureLight.intensity = revealT * 55;
        burstUniforms.uT.value = revealT;
      }
    }
  };
}
