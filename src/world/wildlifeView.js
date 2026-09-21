// View layer for wildlife: 12 gull groups with flapping wings, crab bodies,
// and instanced fish schools. Reads positions from the pure sim every frame.

import * as THREE from 'three';
import { terrainHeight } from '../sim/terrain.js';
import { GULL_COUNT } from '../sim/wildlife.js';

function makeGull() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.8, flatShading: true });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 5), bodyMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const wingGeo = new THREE.PlaneGeometry(1.1, 0.34, 1, 1);
  wingGeo.translate(0.55, 0, 0);
  const left = new THREE.Mesh(wingGeo, wingMat);
  const right = new THREE.Mesh(wingGeo, wingMat);
  right.rotation.z = Math.PI;
  g.add(left, right);
  g.userData.wings = { left, right };
  return g;
}

function makeCrab() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd6552f, roughness: 0.8, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), mat);
  body.scale.set(1.3, 0.6, 1);
  g.add(body);
  const clawGeo = new THREE.SphereGeometry(0.12, 5, 4);
  const clawL = new THREE.Mesh(clawGeo, mat);
  clawL.position.set(0.3, 0.02, 0.26);
  const clawR = new THREE.Mesh(clawGeo, mat);
  clawR.position.set(-0.3, 0.02, 0.26);
  g.add(clawL, clawR);
  const eyeGeo = new THREE.SphereGeometry(0.045, 4, 3);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(0.1, 0.2, 0.14);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(-0.1, 0.2, 0.14);
  g.add(eyeL, eyeR);
  return g;
}

export function createWildlifeView(crabs, schools) {
  const group = new THREE.Group();
  group.name = 'wildlife';

  const gulls = [];
  for (let i = 0; i < GULL_COUNT; i++) {
    const g = makeGull();
    group.add(g);
    gulls.push(g);
  }

  const crabMeshes = crabs.map(() => {
    const c = makeCrab();
    group.add(c);
    return c;
  });

  // Fish: one InstancedMesh per school so each school gets its own tint.
  const schoolColors = [0xff8a5c, 0x5cc8ff, 0xffd75c];
  const fishGeo = new THREE.ConeGeometry(0.12, 0.5, 4);
  fishGeo.rotateX(Math.PI / 2); // point along +z (heading)
  const fishMeshes = schools.map((s, i) => {
    const mesh = new THREE.InstancedMesh(
      fishGeo,
      new THREE.MeshStandardMaterial({ color: schoolColors[i % schoolColors.length], roughness: 0.6, flatShading: true }),
      s.fish.length
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();

  return {
    group,
    update({ flock, crabs: crabStates, fishOut, time }) {
      // Gulls.
      flock.gulls.forEach((g, i) => {
        const mesh = gulls[i];
        mesh.position.set(g.x, g.y, g.z);
        mesh.rotation.y = Math.atan2(g.vx, g.vz);
        mesh.rotation.z = THREE.MathUtils.clamp(-g.vy * 0.08, -0.5, 0.5);
        const flap = Math.sin(g.wingPhase) * 0.75;
        mesh.userData.wings.left.rotation.x = flap;
        mesh.userData.wings.right.rotation.x = flap;
      });
      // Crabs.
      crabStates.forEach((c, i) => {
        const mesh = crabMeshes[i];
        if (!mesh) return;
        const wobble = c.fleeing ? Math.abs(Math.sin(time * 18 + i)) * 0.12 : 0;
        mesh.position.set(c.x, terrainHeight(c.x, c.z) + 0.16 + wobble, c.z);
        mesh.rotation.y = Math.atan2(c.dirX, c.dirZ);
      });
      // Fish.
      fishOut.forEach((school, si) => {
        const mesh = fishMeshes[si];
        school.forEach((f, fi) => {
          p.set(f.x, f.y, f.z);
          e.set(0, f.heading, 0);
          q.setFromEuler(e);
          m.compose(p, q, one);
          mesh.setMatrixAt(fi, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
  };
}
