// Island terrain mesh: one displaced, vertex-colored, flat-shaded grid.
// 400x400 m sampled from the SAME height function the physics uses.

import * as THREE from 'three';
import { terrainHeight, biomeAt, VOLCANO, LAGOON, WORLD_SIZE } from '../sim/terrain.js';

const SAND = new THREE.Color(0xf5eeda);
const GRASS_A = new THREE.Color(0x4f9c4a);
const GRASS_B = new THREE.Color(0x2f7a3e);
const ROCK = new THREE.Color(0x6d5a52);
const ROCK_DARK = new THREE.Color(0x453a38);
const WET_SAND = new THREE.Color(0xd9c9a8);

export function createTerrain() {
  const segs = 128;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    const biome = biomeAt(x, z);
    if (h < 0.35) {
      c.copy(WET_SAND);
    } else if (biome === 'beach' || biome === 'ocean') {
      c.copy(SAND);
    } else if (biome === 'volcano' || biome === 'crater') {
      const dVolc = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
      c.copy(dVolc < VOLCANO.craterRadius + 3 ? ROCK_DARK : ROCK);
      if (h < 9) c.lerp(GRASS_B, 0.35); // vegetation creeps up the base
    } else if (biome === 'lagoon' || biome === 'cave') {
      const dLag = Math.hypot(x - LAGOON.x, z - LAGOON.z);
      c.copy(dLag > LAGOON.radius ? ROCK : SAND).lerp(GRASS_B, dLag > LAGOON.radius ? 0.25 : 0);
    } else {
      // Forest floor: patchy two-tone green.
      const patch = Math.sin(x * 0.31) * Math.sin(z * 0.27);
      c.copy(GRASS_A).lerp(GRASS_B, 0.5 + 0.5 * patch);
      if (h < 3.4) c.lerp(SAND, (3.4 - h) / 1.6); // grass fades into the sand
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Flat-shaded low-poly facets require non-indexed triangles.
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0
  });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
