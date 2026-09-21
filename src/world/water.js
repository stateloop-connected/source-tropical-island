// Ocean, lagoon pool, and the waterfall sheet. Water is a custom shader:
// gentle vertex swell + fresnel tint + animated sparkle fakes refraction well
// enough to read fish through the surface at a fraction of the cost.

import * as THREE from 'three';
import { LAGOON, LAGOON_LEVEL, OCEAN_LEVEL } from '../sim/terrain.js';

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSwell;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float w = sin(world.x * 0.11 + uTime * 1.1) * 0.5
            + sin(world.z * 0.13 - uTime * 0.9) * 0.35
            + sin((world.x + world.z) * 0.05 + uTime * 0.55) * 0.45;
    world.y += w * uSwell;
    vWave = w;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFresnel;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(viewDir.y, 0.0), 2.0);
    // Wobble the "refraction" tint so fish/shadows beneath feel displaced.
    float ripple = sin(vWorld.x * 1.7 + uTime * 2.0) * sin(vWorld.z * 1.9 - uTime * 1.6);
    vec3 body = mix(uDeep, uShallow, clamp(0.5 + vWave * 0.4 + ripple * 0.08, 0.0, 1.0));
    vec3 col = mix(body, uSky, fresnel * uFresnel);
    // Sparkle glints on wave crests.
    float glint = smoothstep(0.75, 0.98, sin(vWorld.x * 3.1 + uTime * 2.4) * sin(vWorld.z * 2.7 - uTime * 2.1));
    col += glint * 0.25;
    gl_FragColor = vec4(col, uOpacity + fresnel * 0.2);
  }
`;

export function createWater() {
  const group = new THREE.Group();
  group.name = 'water';

  const uniforms = {
    uTime: { value: 0 },
    uSwell: { value: 0.22 },
    uShallow: { value: new THREE.Color(0x3fd2c0) },
    uDeep: { value: new THREE.Color(0x0e5f86) },
    uSky: { value: new THREE.Color(0x9fd4e8) },
    uOpacity: { value: 0.78 },
    uFresnel: { value: 0.65 }
  };
  const oceanMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false
  });
  const ocean = new THREE.Mesh(new THREE.CircleGeometry(340, 64), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = OCEAN_LEVEL;
  ocean.renderOrder = 2;
  group.add(ocean);

  // Lagoon pool: calmer, clearer, greener.
  const lagoonUniforms = {
    uTime: uniforms.uTime, // shared clock
    uSwell: { value: 0.05 },
    uShallow: { value: new THREE.Color(0x54e0c8) },
    uDeep: { value: new THREE.Color(0x1b8f8a) },
    uSky: uniforms.uSky,
    uOpacity: { value: 0.66 },
    uFresnel: { value: 0.28 }
  };
  const lagoon = new THREE.Mesh(
    new THREE.CircleGeometry(LAGOON.radius + 0.5, 28),
    new THREE.ShaderMaterial({
      uniforms: lagoonUniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false
    })
  );
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(LAGOON.x, LAGOON_LEVEL, LAGOON.z);
  lagoon.renderOrder = 2;
  group.add(lagoon);

  // Waterfall: a scrolling, semi-transparent sheet spilling over the lagoon
  // rim into the pool, right where the cave sits behind it.
  const fallUniforms = { uTime: uniforms.uTime };
  const fallMat = new THREE.ShaderMaterial({
    uniforms: fallUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float flow = fract(vUv.y * 3.0 + uTime * 1.4);
        float streaks = 0.55 + 0.45 * sin(vUv.x * 28.0 + sin(uTime + vUv.y * 9.0) * 1.5);
        float foam = smoothstep(0.16, 0.0, vUv.y) * 0.9 + smoothstep(0.9, 1.0, vUv.y) * 0.35;
        float alpha = clamp(0.35 + streaks * 0.3 + foam + flow * 0.12, 0.0, 0.92);
        vec3 col = mix(vec3(0.75, 0.92, 0.95), vec3(0.95, 1.0, 1.0), foam + streaks * 0.3);
        // Soft side fade so the sheet has no hard edges.
        alpha *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const angle = Math.atan2(78 - LAGOON.z, 58 - LAGOON.x); // toward the cave
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(7, 6.4, 1, 4), fallMat);
  const fx = LAGOON.x + Math.cos(angle) * (LAGOON.radius + 1.5);
  const fz = LAGOON.z + Math.sin(angle) * (LAGOON.radius + 1.5);
  fall.position.set(fx, LAGOON_LEVEL + 2.6, fz);
  fall.rotation.y = -angle + Math.PI / 2;
  fall.rotation.x = 0.12;
  fall.renderOrder = 3;
  group.add(fall);

  return {
    group,
    update(time, skyColor) {
      uniforms.uTime.value = time;
      uniforms.uSky.value.copy(skyColor);
    }
  };
}
