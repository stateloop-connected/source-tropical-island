// Sky dome (time-graded gradient), sun/moon discs, stars, and fireflies.
// Everything is driven by the pure timecycle palette each frame.

import * as THREE from 'three';
import { createRng } from '../sim/rng.js';
import { terrainHeight } from '../sim/terrain.js';

export function createSky() {
  const group = new THREE.Group();
  group.name = 'sky';

  const skyUniforms = {
    uSky: { value: new THREE.Color(0x4b8fc4) },
    uHorizon: { value: new THREE.Color(0xbfe0ee) }
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(620, 24, 14),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // pin to the far plane
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSky;
        uniform vec3 uHorizon;
        varying vec3 vDir;
        void main() {
          float t = smoothstep(-0.05, 0.5, vDir.y);
          gl_FragColor = vec4(mix(uHorizon, uSky, t), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

  // Sun and moon: simple glowing discs on the dome.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 20),
    new THREE.MeshBasicMaterial({ color: 0xffdf8a, fog: false, transparent: true, opacity: 0.95 })
  );
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(15, 20),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false, transparent: true, opacity: 0.9 })
  );
  group.add(sun, moon);

  // Stars: static random points on the upper dome, faded in at night.
  const starGeo = new THREE.BufferGeometry();
  const STAR_MAX = 900;
  const starPos = new Float32Array(STAR_MAX * 3);
  const rng = createRng(31337);
  for (let i = 0; i < STAR_MAX; i++) {
    const az = rng.range(0, Math.PI * 2);
    const el = Math.asin(rng.range(0.06, 1));
    const r = 590;
    starPos[i * 3] = Math.cos(az) * Math.cos(el) * r;
    starPos[i * 3 + 1] = Math.sin(el) * r;
    starPos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xcfe0ff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(stars);

  // Fireflies: wandering warm points over the forest, night only.
  const FF_MAX = 90;
  const ffGeo = new THREE.BufferGeometry();
  const ffBase = new Float32Array(FF_MAX * 3);
  const ffSeed = new Float32Array(FF_MAX * 3);
  for (let i = 0; i < FF_MAX; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(6, 78);
    ffBase[i * 3] = Math.cos(a) * r;
    ffBase[i * 3 + 1] = terrainHeight(ffBase[i * 3], ffBase[i * 3 + 2]);
    ffBase[i * 3 + 2] = Math.sin(a) * r;
    ffSeed[i * 3] = rng.next();
    ffSeed[i * 3 + 1] = rng.next();
    ffSeed[i * 3 + 2] = rng.next();
  }
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffBase, 3));
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 3));
  const ffUniforms = { uTime: { value: 0 }, uVisible: { value: 0 } };
  const fireflies = new THREE.Points(ffGeo, new THREE.ShaderMaterial({
    uniforms: ffUniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec3 aSeed;
      varying float vBlink;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * (0.3 + aSeed.x * 0.5) + aSeed.y * 40.0) * 3.5;
        p.y = position.y + 0.8 + aSeed.z * 2.2 + sin(uTime * (0.5 + aSeed.y) + aSeed.x * 20.0) * 0.8;
        p.z += cos(uTime * (0.25 + aSeed.z * 0.5) + aSeed.x * 40.0) * 3.5;
        vBlink = 0.55 + 0.45 * sin(uTime * (2.0 + aSeed.x * 3.0) + aSeed.y * 50.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 130.0 / max(1.0, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uVisible;
      varying float vBlink;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5 || uVisible < 0.01) discard;
        float glow = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.85, 0.4) * 1.8, glow * vBlink * uVisible);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  fireflies.frustumCulled = false;
  group.add(fireflies);

  return {
    group,
    // palette: { sky, horizon } linear 0..1 arrays; dir: sun direction;
    // starsVis/firefliesVis: 0..1; tierCounts from quality tier.
    update({ time, palette, sunDir, starsVis, firefliesVis, starCount, fireflyCount }) {
      skyUniforms.uSky.value.setRGB(...palette.sky);
      skyUniforms.uHorizon.value.setRGB(...palette.horizon);
      sun.position.set(sunDir.x, sunDir.y, sunDir.z).normalize().multiplyScalar(590);
      sun.lookAt(0, 0, 0);
      sun.material.opacity = Math.min(1, Math.max(0, palette.day * 1.4));
      moon.position.copy(sun.position).multiplyScalar(-1);
      moon.position.y = Math.abs(moon.position.y) * 0.7 + 120;
      moon.lookAt(0, 0, 0);
      moon.material.opacity = starsVis * 0.9;
      starMat.opacity = starsVis * 0.9;
      starGeo.setDrawRange(0, starCount);
      ffUniforms.uTime.value = time;
      ffUniforms.uVisible.value = firefliesVis;
      ffGeo.setDrawRange(0, fireflyCount);
    }
  };
}
