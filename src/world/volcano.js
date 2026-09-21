// Volcano dressing: glowing lava pool inside the crater (the cone itself is
// part of the terrain heightfield), a flickering crater light, and drifting
// ember sparks.

import * as THREE from 'three';
import { VOLCANO, terrainHeight } from '../sim/terrain.js';

export function createVolcano() {
  const group = new THREE.Group();
  group.name = 'volcano';

  const craterFloor = terrainHeight(VOLCANO.x, VOLCANO.z);
  const lavaY = craterFloor + 0.9;

  // Lava surface: emissive disc with a slow churn shader.
  const lavaUniforms = { uTime: { value: 0 } };
  const lava = new THREE.Mesh(
    new THREE.CircleGeometry(VOLCANO.craterRadius - 2.5, 26),
    new THREE.ShaderMaterial({
      uniforms: lavaUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float r = length(vUv);
          float churn = sin(vUv.x * 9.0 + uTime * 0.8) * sin(vUv.y * 8.0 - uTime * 0.6)
                      + sin((vUv.x + vUv.y) * 5.0 + uTime * 0.45);
          vec3 hot = vec3(1.0, 0.82, 0.25);
          vec3 mid = vec3(0.95, 0.35, 0.08);
          vec3 crust = vec3(0.25, 0.06, 0.03);
          vec3 col = mix(mid, hot, smoothstep(0.2, 1.4, churn));
          col = mix(col, crust, smoothstep(0.55, 0.95, r));
          gl_FragColor = vec4(col * 1.6, 1.0);
        }
      `
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(VOLCANO.x, lavaY, VOLCANO.z);
  group.add(lava);

  // Flickering crater light (cheap: one point light, only enabled with lava).
  const glow = new THREE.PointLight(0xff5a18, 60, 90, 1.8);
  glow.position.set(VOLCANO.x, lavaY + 4, VOLCANO.z);
  group.add(glow);

  // Ember sparks: a small points cloud cycling upward from the lava.
  const EMBERS = 40;
  const emberGeo = new THREE.BufferGeometry();
  const seeds = new Float32Array(EMBERS * 3);
  for (let i = 0; i < EMBERS; i++) {
    seeds[i * 3] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3));
  emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const emberMat = new THREE.ShaderMaterial({
    uniforms: { uTime: lavaUniforms.uTime, uOrigin: { value: new THREE.Vector3(VOLCANO.x, lavaY, VOLCANO.z) } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uOrigin;
      attribute vec3 aSeed;
      varying float vFade;
      void main() {
        float life = fract(uTime * (0.12 + aSeed.x * 0.1) + aSeed.y);
        float ang = aSeed.z * 6.2831;
        float rad = (1.0 - life) * (2.0 + aSeed.x * 8.0);
        vec3 p = uOrigin + vec3(cos(ang) * rad, life * (7.0 + aSeed.y * 9.0), sin(ang) * rad);
        vFade = 1.0 - life;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + aSeed.y * 3.0) * vFade * 4.0;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * 2.0, vFade * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  group.add(embers);

  return {
    group,
    lavaLight: glow,
    update(time) {
      lavaUniforms.uTime.value = time;
      glow.intensity = 55 + Math.sin(time * 7.3) * 9 + Math.sin(time * 13.7) * 5;
    }
  };
}
