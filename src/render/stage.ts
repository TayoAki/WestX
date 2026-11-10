import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { C } from "../sim/moves";
import { makeRng } from "../sim/rng";
import { HAZE, LIGHT_DIR, makeToon } from "./toon";

// The arena: dusk sky, sand floor with distance rings, mesas on the horizon and
// the Standing Storm to the north. Everything is generated; there are no asset files.

ShaderStore.ShadersStore["westxSkyVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = viewProjection * (world * vec4(position, 1.0));
}`;

ShaderStore.ShadersStore["westxSkyFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform vec3 uSun;
uniform float uStormFlash;
uniform float uFlashAz;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 horizon = vec3(1.0, 0.78, 0.52);
  vec3 low = vec3(0.95, 0.53, 0.43);
  vec3 mid = vec3(0.47, 0.34, 0.6);
  vec3 top = vec3(0.13, 0.13, 0.33);
  vec3 col = mix(horizon, low, smoothstep(0.0, 0.14, h));
  col = mix(col, mid, smoothstep(0.1, 0.42, h));
  col = mix(col, top, smoothstep(0.38, 0.95, h));
  // Long flat streaks of cloud low in the sky.
  float az = atan(d.x, d.z);
  float streak = step(0.62, fract(h * 19.0 + sin(az * 3.0) * 0.35)) * smoothstep(0.34, 0.05, h) * smoothstep(0.0, 0.03, h);
  col = mix(col, col * 0.9 + vec3(0.06, 0.01, 0.05), streak * 0.55);
  float sun = dot(d, uSun);
  col += vec3(1.0, 0.72, 0.42) * pow(max(sun, 0.0), 22.0) * 0.5;
  col = mix(col, vec3(1.0, 0.95, 0.82), smoothstep(0.9968, 0.9976, sun));

  // The Standing Storm: a dark anvil in the north, lit from inside by lightning.
  float a = az / 0.95;
  float crown = 0.37 * (1.0 - a * a) + 0.03 * sin(az * 11.0) + 0.018 * sin(az * 29.0 + 1.7);
  float inside = step(abs(a), 1.0) * step(h, crown) * step(0.0, h);
  float layer = floor(clamp(h / max(crown, 0.001), 0.0, 0.999) * 3.0) / 3.0;
  vec3 cloud = mix(vec3(0.13, 0.11, 0.24), vec3(0.3, 0.24, 0.42), layer);
  float lit = uStormFlash * exp(-pow((az - uFlashAz) * 4.5, 2.0));
  cloud = mix(cloud, vec3(0.62, 0.97, 1.0), clamp(lit, 0.0, 1.0) * 0.85);
  col = mix(col, cloud, inside);
  float boltX = uFlashAz + 0.014 * sin(h * 130.0) + 0.007 * sin(h * 410.0);
  float bolt = step(abs(az - boltX), 0.004) * step(h, 0.13) * step(0.0, h) * step(0.45, uStormFlash);
  col = mix(col, vec3(0.88, 1.0, 1.0), bolt);
  gl_FragColor = vec4(col, 1.0);
}`;

ShaderStore.ShadersStore["westxGroundVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vW;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = viewProjection * w;
}`;

ShaderStore.ShadersStore["westxGroundFragmentShader"] = `
precision highp float;
varying vec3 vW;
uniform vec3 cameraPosition;
uniform vec3 uHaze;
uniform float uArena;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vW.xz;
  float r = length(p);
  float n = noise(p * 0.05) * 0.6 + noise(p * 0.19) * 0.4;
  vec3 base = vec3(0.87, 0.61, 0.38);
  // Two soft tones and a scatter of pebbles: enough texture to read motion against.
  vec3 sand = base * mix(0.94, 1.05, smoothstep(0.44, 0.5, n));
  sand = mix(sand, base * 0.86, step(0.76, n) * 0.55);
  sand = mix(sand, base * 0.74, step(0.986, hash(floor(p * 3.7))) * 0.5);
  // Distance rings every 10 m inside the arena, for judging range and speed.
  float ring = 1.0 - smoothstep(0.0, 0.07, abs(fract(r / 10.0 + 0.5) - 0.5) * 10.0);
  sand = mix(sand, sand * 0.78, ring * step(r, uArena - 1.0) * 0.8);
  // The boundary: a line of live fulgur wire.
  float edge = 1.0 - smoothstep(0.0, 0.35, abs(r - uArena));
  sand = mix(sand, vec3(0.37, 0.95, 1.0), edge);
  sand *= mix(1.0, 0.86, step(uArena, r));
  float haze = clamp((length(cameraPosition - vW) - 70.0) / 300.0, 0.0, 0.8);
  gl_FragColor = vec4(mix(sand, uHaze, haze), 1.0);
}`;

export interface Stage {
  engine: Engine;
  scene: Scene;
  camera: TargetCamera;
  glow: GlowLayer;
  /** Sets how far out the boundary wire runs: the arena's edge, or the open field's. */
  setBounds(radius: number): void;
  update(dt: number): void;
}

/** A flat, unlit, optionally see-through material for effects. It shows up in the glow pass. */
export function makeGlow(scene: Scene, name: string, hex: string, alpha = 1): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(hex);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.alpha = alpha;
  mat.backFaceCulling = false;
  return mat;
}

/** Keeps a mesh out of the bloom: flat markers such as shadows and health bars should not glow. */
export function noGlow(scene: Scene, mesh: Mesh): void {
  const layer = scene.effectLayers.find((l) => l.name === "glow");
  if (layer instanceof GlowLayer) layer.addExcludedMesh(mesh);
}

export function createStage(canvas: HTMLCanvasElement, lowRes: boolean): Stage {
  const engine = new Engine(canvas, true, { stencil: true, powerPreference: "high-performance" }, false);
  // Cap the pixel ratio: phones report 3x, which triples the fill cost for little gain.
  const ratio = lowRes ? 0.6 : Math.min(window.devicePixelRatio || 1, 1.75);
  engine.setHardwareScalingLevel(1 / ratio);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(HAZE.r, HAZE.g, HAZE.b, 1);
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;

  const camera = new TargetCamera("cam", new Vector3(0, 6, -20), scene);
  camera.fov = 0.95;
  camera.minZ = 0.2;
  camera.maxZ = 1200;
  camera.setTarget(new Vector3(0, 1, 0));
  scene.activeCamera = camera;

  // Sky dome.
  const sky = CreateSphere("sky", { diameter: 1000, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = new ShaderMaterial("skyMat", scene, { vertex: "westxSky", fragment: "westxSky" }, {
    attributes: ["position"],
    uniforms: ["world", "viewProjection", "uSun", "uStormFlash", "uFlashAz"],
  });
  skyMat.setVector3("uSun", LIGHT_DIR.scale(-1));
  skyMat.setFloat("uStormFlash", 0);
  skyMat.setFloat("uFlashAz", 0);
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  // Ground.
  const ground = CreateGround("ground", { width: 1000, height: 1000, subdivisions: 1 }, scene);
  const groundMat = new ShaderMaterial("groundMat", scene, { vertex: "westxGround", fragment: "westxGround" }, {
    attributes: ["position"],
    uniforms: ["world", "viewProjection", "cameraPosition", "uHaze", "uArena"],
  });
  groundMat.setColor3("uHaze", HAZE);
  groundMat.setFloat("uArena", C.ARENA_R);
  ground.material = groundMat;
  ground.isPickable = false;

  // Mesas ring the horizon. Seeded, so the skyline is the same every session.
  const rng = makeRng(1880);
  const rock = makeToon(scene, "mesa", "#c4583c", { strata: 0.16 });
  const rockDark = makeToon(scene, "mesaDark", "#a34a3a", { strata: 0.22 });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + rng.range(-0.1, 0.1);
    // Leave the north open so the storm stays visible.
    if (Math.abs(a - Math.PI / 2) < 0.35) continue;
    const r = rng.range(125, 230);
    const h = rng.range(16, 52);
    const w = rng.range(26, 80);
    const butte = rng.chance(0.4);
    const mesh = butte
      ? CreateCylinder(`butte${i}`, { height: h, diameterTop: w * 0.45, diameterBottom: w * 0.7, tessellation: 7 }, scene)
      : CreateBox(`mesa${i}`, { width: w, height: h, depth: rng.range(24, 60) }, scene);
    mesh.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    mesh.rotation.y = rng.range(0, Math.PI);
    mesh.material = rng.chance(0.5) ? rock : rockDark;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    // A scree skirt at the foot of each mesa.
    const skirt = CreateCylinder(`skirt${i}`, { height: h * 0.3, diameterTop: w * 0.9, diameterBottom: w * 1.5, tessellation: 9 }, scene);
    skirt.position.set(mesh.position.x, h * 0.15 - 1, mesh.position.z);
    skirt.material = rockDark;
    skirt.isPickable = false;
    skirt.freezeWorldMatrix();
  }

  const glow = new GlowLayer("glow", scene, { mainTextureRatio: 0.5, blurKernelSize: 40 });
  glow.intensity = 0.85;

  // Lightning in the storm: a quick double flash every few seconds.
  let flash = 0;
  let nextStrike = 3;
  let echo = 0;

  return {
    engine,
    scene,
    camera,
    glow,
    setBounds(radius) {
      groundMat.setFloat("uArena", radius);
    },
    update(dt) {
      nextStrike -= dt;
      if (nextStrike <= 0) {
        flash = 1;
        skyMat.setFloat("uFlashAz", rng.range(-0.6, 0.6));
        echo = rng.chance(0.6) ? 0.12 : 0;
        nextStrike = rng.range(2.5, 8);
      }
      if (echo > 0) {
        echo -= dt;
        if (echo <= 0) flash = 0.8;
      }
      flash = Math.max(0, flash - dt * 4.5);
      skyMat.setFloat("uStormFlash", flash);
    },
  };
}
