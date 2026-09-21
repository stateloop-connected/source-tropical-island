// The player: a friendly low-poly capsule explorer with a sun hat, animated
// from the pure movement state (bob while walking, lean while swimming).

import * as THREE from 'three';

export function createPlayerView() {
  const group = new THREE.Group();
  group.name = 'player';

  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.8, flatShading: true });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2fb3a6, roughness: 0.8, flatShading: true });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xf0dc9a, roughness: 0.9, flatShading: true });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.72, 3, 8), shirt);
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 9), hatMat);
  brim.position.y = 1.78;
  group.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.22, 8), hatMat);
  crown.position.y = 1.9;
  group.add(crown);

  // Little nose so the facing direction is readable at a glance.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.6, 0.27);
  group.add(nose);

  let phase = 0;

  return {
    group,
    update(dt, time, player) {
      group.position.set(player.x, player.y, player.z);
      group.rotation.y = player.heading;
      const speed = Math.hypot(player.vx, player.vz);
      if (player.swimming) {
        // Lean forward and bob on the swell.
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 1.15, 0.12);
        group.position.y = player.y - 0.55 + Math.sin(time * 2.4) * 0.08;
      } else {
        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, 0.15);
        if (speed > 0.6 && player.onGround) {
          phase += dt * speed * 2.4;
          group.position.y = player.y + Math.abs(Math.sin(phase)) * 0.09;
        }
      }
    }
  };
}
