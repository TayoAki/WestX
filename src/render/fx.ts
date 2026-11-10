import "@babylonjs/core/Engines/Extensions/engine.alpha";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import type { Match, PropKind, SimEvent } from "../sim/types";
import type { V3 } from "../sim/vec";
import type { Rig } from "./rig";
import { makeGlow, type Stage } from "./stage";
import { makeToon } from "./toon";

// Everything that sells an impact: sparks, shock rings, starbursts, dust,
// afterimages, craters, debris, bullets and the lasso. All pooled and
// generated in code.

const WHITE = Color3.White();
const FULGUR = Color3.FromHexString("#5ef2ff");
const SAND = new Color3(0.86, 0.66, 0.46);
const ADD = 1;

const vec = (v: V3): Vector3 => new Vector3(v.x, v.y, v.z);

function texture(scene: Scene, name: string, draw: (g: CanvasRenderingContext2D, s: number) => void): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture(name, size, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, size, size);
  draw(g, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

interface Pulse {
  mesh: Mesh;
  mat: StandardMaterial;
  t: number;
  dur: number;
  s0: number;
  s1: number;
  a0: number;
  active: boolean;
}

class PulsePool {
  readonly items: Pulse[] = [];
  private next = 0;

  add(mesh: Mesh, mat: StandardMaterial): void {
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    this.items.push({ mesh, mat, t: 0, dur: 1, s0: 1, s1: 1, a0: 1, active: false });
  }

  spawn(pos: Vector3, color: Color3, s0: number, s1: number, dur: number, alpha = 1): Pulse {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.t = 0;
    p.dur = dur;
    p.s0 = s0;
    p.s1 = s1;
    p.a0 = alpha;
    p.active = true;
    p.mesh.position.copyFrom(pos);
    p.mesh.scaling.setAll(s0);
    p.mat.emissiveColor.copyFrom(color);
    p.mat.alpha = alpha;
    p.mesh.setEnabled(true);
    return p;
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.active) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const ease = 1 - (1 - k) * (1 - k);
      p.mesh.scaling.setAll(p.s0 + (p.s1 - p.s0) * ease);
      p.mat.alpha = p.a0 * (1 - k);
      if (k >= 1) {
        p.active = false;
        p.mesh.setEnabled(false);
      }
    }
  }
}

interface Chunk {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
  life: number;
}

export class Fx {
  /** Camera shake amount; the camera reads and applies it. */
  shake = 0;
  private sparks: ParticleSystem[] = [];
  private dusts: ParticleSystem[] = [];
  private auras: ParticleSystem[] = [];
  private auraPos: Vector3[] = [];
  private sparkI = 0;
  private dustI = 0;
  private stars = new PulsePool();
  private shocks = new PulsePool();
  private rings = new PulsePool();
  private ghosts = new PulsePool();
  private slashes = new PulsePool();
  private craters: Mesh[] = [];
  private craterI = 0;
  private chunks: Chunk[] = [];
  private chunkI = 0;
  private chunkMats: Record<PropKind | "dirt", ShaderMaterial>;
  private bullets: Mesh[] = [];
  private heavies: Mesh[] = [];
  private ults: Mesh[] = [];
  private loops: Mesh[] = [];
  private ropes: Mesh[] = [];
  private orb: Mesh;
  private beams: Mesh[] = [];
  private ghostTimer = [0, 0];
  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(
    scene: Scene,
    stage: Stage,
    private rigs: [Rig, Rig],
  ) {
    const dot = texture(scene, "dot", (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.75)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
    const puff = texture(scene, "puff", (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(255,255,255,0.85)");
      grad.addColorStop(0.7, "rgba(255,255,255,0.5)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
    // A hard-edged eight-point starburst: the anime impact flash.
    const star = texture(scene, "star", (g, s) => {
      const c = s / 2;
      g.fillStyle = "white";
      g.beginPath();
      const points = 16;
      for (let i = 0; i < points; i++) {
        const a = (i / points) * Math.PI * 2;
        const r = i % 2 === 0 ? c * (i % 4 === 0 ? 0.98 : 0.66) : c * 0.2;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
    const ring = texture(scene, "ring", (g, s) => {
      const c = s / 2;
      g.strokeStyle = "white";
      g.lineWidth = s * 0.07;
      g.beginPath();
      g.arc(c, c, c * 0.84, 0, Math.PI * 2);
      g.stroke();
    });
    const scorch = texture(scene, "scorch", (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, s * 0.05, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(40,22,40,0.75)");
      grad.addColorStop(0.55, "rgba(60,32,44,0.6)");
      grad.addColorStop(0.7, "rgba(120,70,60,0.35)");
      grad.addColorStop(1, "rgba(120,70,60,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });

    const particles = (name: string, capacity: number, tex: DynamicTexture, additive: boolean): ParticleSystem => {
      const ps = new ParticleSystem(name, capacity, scene);
      ps.particleTexture = tex;
      ps.emitter = new Vector3(0, -50, 0);
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.blendMode = additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
      ps.createSphereEmitter(0.25, 1);
      ps.start();
      return ps;
    };
    for (let i = 0; i < 4; i++) this.sparks.push(particles(`sparks${i}`, 160, dot, true));
    for (let i = 0; i < 3; i++) this.dusts.push(particles(`dust${i}`, 90, puff, false));
    for (let i = 0; i < 2; i++) {
      const ps = particles(`aura${i}`, 220, dot, true);
      const pos = new Vector3(0, -50, 0);
      ps.emitter = pos;
      ps.manualEmitCount = -1;
      ps.createCylinderEmitter(0.7, 0.2, 1, 0);
      ps.minEmitPower = 3;
      ps.maxEmitPower = 8;
      ps.minLifeTime = 0.25;
      ps.maxLifeTime = 0.6;
      ps.minSize = 0.12;
      ps.maxSize = 0.42;
      ps.gravity = new Vector3(0, 9, 0);
      const c = rigs[i].auraColor;
      ps.color1 = new Color4(c.r, c.g, c.b, 0.9);
      ps.color2 = new Color4(1, 1, 1, 0.8);
      ps.colorDead = new Color4(c.r, c.g * 0.5, c.b * 0.5, 0);
      this.auras.push(ps);
      this.auraPos.push(pos);
    }

    const billboard = (name: string, tex: DynamicTexture, pool: PulsePool, count: number) => {
      for (let i = 0; i < count; i++) {
        const mesh = CreatePlane(`${name}${i}`, { size: 1 }, scene);
        mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
        const mat = makeGlow(scene, `${name}Mat${i}`, "#ffffff");
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.alphaMode = ADD;
        // Textured quads would glow as solid squares, so keep them out of the glow pass.
        stage.glow.addExcludedMesh(mesh);
        pool.add(mesh, mat);
      }
    };
    billboard("star", star, this.stars, 12);
    billboard("shock", ring, this.shocks, 14);

    for (let i = 0; i < 10; i++) {
      const mesh = CreateTorus(`gring${i}`, { diameter: 1, thickness: 0.035, tessellation: 40 }, scene);
      const mat = makeGlow(scene, `gringMat${i}`, "#ffffff");
      mat.alphaMode = ADD;
      this.rings.add(mesh, mat);
    }
    for (let i = 0; i < 18; i++) {
      const mesh = CreateCapsule(`ghost${i}`, { height: 1.9, radius: 0.33, tessellation: 8, capSubdivisions: 3 }, scene);
      const mat = makeGlow(scene, `ghostMat${i}`, "#ffffff", 0.5);
      mat.alphaMode = ADD;
      this.ghosts.add(mesh, mat);
    }
    for (let i = 0; i < 6; i++) {
      // A crescent band swept in front of the attacker.
      const mesh = CreateCylinder(`slash${i}`, { height: 0.34, diameter: 3.4, tessellation: 24, arc: 0.42, cap: Mesh.NO_CAP }, scene);
      const mat = makeGlow(scene, `slashMat${i}`, "#ffffff", 0.8);
      mat.alphaMode = ADD;
      this.slashes.add(mesh, mat);
    }

    const scorchMat = makeGlow(scene, "scorchMat", "#ffffff");
    scorchMat.diffuseTexture = scorch;
    scorchMat.useAlphaFromDiffuseTexture = true;
    scorchMat.zOffset = -2;
    for (let i = 0; i < 18; i++) {
      const mesh = CreateDisc(`crater${i}`, { radius: 1, tessellation: 24 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.material = scorchMat;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      stage.glow.addExcludedMesh(mesh);
      this.craters.push(mesh);
    }

    this.chunkMats = {
      crate: makeToon(scene, "chunkWood", "#b07840"),
      barrel: makeToon(scene, "chunkBarrel", "#8a4f2e"),
      cactus: makeToon(scene, "chunkCactus", "#5f9a4d"),
      rock: makeToon(scene, "chunkRock", "#b8674a"),
      dirt: makeToon(scene, "chunkDirt", "#c98a58"),
    };
    for (let i = 0; i < 56; i++) {
      const mesh = CreateBox(`chunk${i}`, { size: 0.3 }, scene);
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.chunks.push({ mesh, vel: new Vector3(), spin: new Vector3(), life: 0 });
    }

    const bulletMat = makeGlow(scene, "bulletMat", "#fff3b0");
    for (let i = 0; i < 14; i++) {
      const b = CreateBox(`bullet${i}`, { width: 0.07, height: 0.07, depth: 2.4 }, scene);
      b.material = bulletMat;
      b.isPickable = false;
      b.setEnabled(false);
      this.bullets.push(b);
    }
    for (let i = 0; i < 2; i++) {
      const col = rigs[i].auraColor.toHexString();
      const h = CreateSphere(`heavy${i}`, { diameter: 1.3, segments: 12 }, scene);
      h.material = makeGlow(scene, `heavyMat${i}`, col);
      const core = CreateSphere(`heavyCore${i}`, { diameter: 0.7, segments: 8 }, scene);
      core.material = makeGlow(scene, `heavyCoreMat${i}`, "#ffffff");
      core.parent = h;
      h.isPickable = false;
      h.setEnabled(false);
      this.heavies.push(h);

      const u = CreateBox(`ult${i}`, { width: 0.5, height: 0.5, depth: 7 }, scene);
      u.material = makeGlow(scene, `ultMat${i}`, "#ffffff");
      u.isPickable = false;
      u.setEnabled(false);
      this.ults.push(u);

      const loop = CreateTorus(`loop${i}`, { diameter: 1.1, thickness: 0.07, tessellation: 20 }, scene);
      loop.material = makeGlow(scene, `loopMat${i}`, "#5ef2ff");
      loop.isPickable = false;
      loop.setEnabled(false);
      this.loops.push(loop);

      const rope = CreateCylinder(`rope${i}`, { height: 1, diameter: 0.06, tessellation: 6 }, scene);
      rope.rotation.x = Math.PI / 2;
      rope.bakeCurrentTransformIntoVertices();
      rope.material = makeGlow(scene, `ropeMat${i}`, "#5ef2ff");
      rope.isPickable = false;
      rope.setEnabled(false);
      this.ropes.push(rope);

      const beam = CreateCylinder(`beam${i}`, { height: 1, diameter: 0.7, tessellation: 10 }, scene);
      beam.rotation.x = Math.PI / 2;
      beam.bakeCurrentTransformIntoVertices();
      beam.material = makeGlow(scene, `beamMat${i}`, col, 0.85);
      beam.isPickable = false;
      beam.setEnabled(false);
      this.beams.push(beam);
    }
    this.orb = CreateSphere("clashOrb", { diameter: 2, segments: 14 }, scene);
    this.orb.material = makeGlow(scene, "orbMat", "#ffffff");
    this.orb.isPickable = false;
    this.orb.setEnabled(false);
  }

  // ------------------------------------------------------------ primitives

  private spark(pos: Vector3, count: number, color: Color3, speed = 14, size = 0.32, life = 0.3): void {
    const ps = this.sparks[this.sparkI];
    this.sparkI = (this.sparkI + 1) % this.sparks.length;
    (ps.emitter as Vector3).copyFrom(pos);
    ps.color1 = new Color4(color.r, color.g, color.b, 1);
    ps.color2 = new Color4(1, 1, 1, 1);
    ps.colorDead = new Color4(color.r, color.g * 0.6, color.b * 0.6, 0);
    ps.minEmitPower = speed * 0.4;
    ps.maxEmitPower = speed;
    ps.minSize = size * 0.4;
    ps.maxSize = size;
    ps.minLifeTime = life * 0.5;
    ps.maxLifeTime = life;
    ps.gravity = new Vector3(0, -14, 0);
    ps.manualEmitCount = count;
  }

  private dust(pos: Vector3, count: number, size = 1.6, speed = 4): void {
    const ps = this.dusts[this.dustI];
    this.dustI = (this.dustI + 1) % this.dusts.length;
    (ps.emitter as Vector3).set(pos.x, Math.max(0.2, pos.y), pos.z);
    ps.color1 = new Color4(SAND.r, SAND.g, SAND.b, 0.7);
    ps.color2 = new Color4(SAND.r * 0.9, SAND.g * 0.85, SAND.b * 0.85, 0.55);
    ps.colorDead = new Color4(SAND.r, SAND.g, SAND.b, 0);
    ps.minEmitPower = speed * 0.3;
    ps.maxEmitPower = speed;
    ps.minSize = size * 0.5;
    ps.maxSize = size;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 1.0;
    ps.gravity = new Vector3(0, 1.5, 0);
    ps.manualEmitCount = count;
  }

  private star(pos: Vector3, color: Color3, size: number, dur: number): void {
    const p = this.stars.spawn(pos, color, size * 0.45, size, dur, 1);
    p.mesh.rotation.z = Math.random() * Math.PI;
  }

  private shock(pos: Vector3, color: Color3, s0: number, s1: number, dur: number): void {
    this.shocks.spawn(pos, color, s0, s1, dur, 0.9);
  }

  private groundRing(pos: Vector3, color: Color3, s0: number, s1: number, dur: number): void {
    this.tmp.set(pos.x, 0.08, pos.z);
    this.rings.spawn(this.tmp, color, s0, s1, dur, 0.9);
  }

  private ghost(pos: Vector3, color: Color3, yaw: number, lean: number, dur = 0.22): void {
    this.tmp.set(pos.x, pos.y + 0.95, pos.z);
    const p = this.ghosts.spawn(this.tmp, color, 1, 1.05, dur, 0.45);
    p.mesh.rotation.set(lean, yaw, 0);
  }

  private crater(pos: Vector3, size: number): void {
    const mesh = this.craters[this.craterI];
    this.craterI = (this.craterI + 1) % this.craters.length;
    mesh.position.set(pos.x, 0.03 + this.craterI * 0.002, pos.z);
    mesh.scaling.setAll(size);
    mesh.rotation.y = Math.random() * 6.28;
    mesh.setEnabled(true);
  }

  private debris(pos: Vector3, dir: V3, kind: PropKind | "dirt", count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const c = this.chunks[this.chunkI];
      this.chunkI = (this.chunkI + 1) % this.chunks.length;
      c.mesh.material = this.chunkMats[kind];
      c.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 1.2, pos.z + (Math.random() - 0.5) * 0.8);
      const s = 0.6 + Math.random() * 1.3;
      c.mesh.scaling.set(s, s * (0.4 + Math.random() * 0.8), s);
      c.vel.set(dir.x * power * (0.4 + Math.random()) + (Math.random() - 0.5) * 7, 4 + Math.random() * 9, dir.z * power * (0.4 + Math.random()) + (Math.random() - 0.5) * 7);
      c.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      c.life = 1.2 + Math.random() * 0.8;
      c.mesh.setEnabled(true);
    }
  }

  /** The sweep of a strike, drawn on its first active frame. */
  slash(rig: Rig, yaw: number, kind: "side" | "up" | "down" | "spin"): void {
    rig.center(this.tmp);
    const p = this.slashes.spawn(this.tmp, kind === "spin" ? WHITE : rig.auraColor, 0.75, 1.15, 0.14, 0.75);
    // The arc is centred on the attacker's facing.
    const arcHalf = 0.42 * Math.PI;
    p.mesh.rotation.set(0, yaw - Math.PI / 2 + arcHalf - Math.PI / 2, 0);
    if (kind === "up") p.mesh.rotation.z = 1.2;
    else if (kind === "down") p.mesh.rotation.z = -1.2;
    else if (kind === "side") p.mesh.rotation.z = (Math.random() - 0.5) * 0.7;
  }

  /** Clears persistent marks between matches. */
  reset(): void {
    for (const c of this.craters) c.setEnabled(false);
    for (const c of this.chunks) {
      c.life = 0;
      c.mesh.setEnabled(false);
    }
    this.shake = 0;
  }

  // ------------------------------------------------------------ events

  onEvent(e: SimEvent): void {
    const rigs = this.rigs;
    switch (e.type) {
      case "hit": {
        const pos = vec(e.pos);
        const color = rigs[e.att].auraColor;
        if (e.blocked) {
          if (e.perfect) {
            this.star(pos, FULGUR, 4.2, 0.26);
            this.shock(pos, WHITE, 0.6, 5.5, 0.3);
            this.spark(pos, 30, FULGUR, 20, 0.36, 0.4);
            this.shake = Math.min(1.3, this.shake + 0.4);
          } else {
            this.shock(pos, new Color3(0.75, 0.92, 1), 0.4, 2.3, 0.18);
            this.spark(pos, 6, new Color3(0.75, 0.92, 1), 9, 0.22, 0.2);
            this.shake = Math.min(1.3, this.shake + 0.06 * e.strength);
          }
          break;
        }
        const s = e.strength;
        rigs[e.def].hit(1);
        this.star(pos, WHITE, 1.5 + s * 1.3, 0.12 + s * 0.035);
        this.shock(pos, color, 0.5, 2.2 + s * 2.0, 0.2 + s * 0.06);
        this.spark(pos, 6 + s * 9, color, 10 + s * 5, 0.24 + s * 0.06, 0.22 + s * 0.06);
        if (s >= 3) {
          this.shock(pos, WHITE, 1.2, 9, 0.38);
          if (pos.y < 3) this.dust(pos, 10, 2.2, 7);
        }
        this.shake = Math.min(1.3, this.shake + [0, 0.1, 0.22, 0.6][s]);
        break;
      }
      case "shot": {
        const pos = vec(e.pos);
        this.star(pos, new Color3(1, 0.9, 0.55), e.heavy ? 3 : 1.2, 0.07);
        if (e.heavy) {
          this.shock(pos, rigs[e.owner].auraColor, 0.5, 4, 0.22);
          this.shake = Math.min(1.3, this.shake + 0.3);
        }
        break;
      }
      case "slipOut": {
        const pos = vec(e.pos);
        this.shock(pos, WHITE, 0.8, 3.2, 0.2);
        this.tmp2.set(pos.x, pos.y - 0.95, pos.z);
        this.ghost(this.tmp2, WHITE, 0, 0, 0.3);
        break;
      }
      case "slipIn": {
        const pos = vec(e.pos);
        this.shock(pos, rigs[e.id].auraColor, 3.4, 0.5, 0.16);
        this.star(pos, WHITE, 1.8, 0.1);
        break;
      }
      case "chase":
        this.shock(vec(e.pos).addInPlaceFromFloats(0, 0.95, 0), rigs[e.id].auraColor, 0.8, 5, 0.25);
        if (e.pos.y < 0.5) this.dust(vec(e.pos), 8, 1.8, 6);
        break;
      case "chaseCatch":
        this.star(vec(e.pos), rigs[e.id].auraColor, 2.6, 0.12);
        this.shock(vec(e.pos), WHITE, 0.6, 3.5, 0.18);
        break;
      case "step":
        if (e.pos.y < 0.5) this.dust(vec(e.pos), 4, 1.1, 3);
        break;
      case "jump":
        if (e.double) this.groundRingAt(vec(e.pos), WHITE, 0.6, 2.6, 0.2);
        else this.dust(vec(e.pos), 5, 1.2, 3);
        break;
      case "land":
        this.dust(vec(e.pos), e.hard ? 12 : 4, e.hard ? 2.2 : 1.1, e.hard ? 6 : 2.5);
        if (e.hard) {
          this.groundRing(vec(e.pos), SAND, 1, 5, 0.3);
          this.shake = Math.min(1.3, this.shake + 0.25);
        }
        break;
      case "groundSlam": {
        const pos = vec(e.pos);
        this.crater(pos, 3.4);
        this.dust(pos, 22, 3.2, 10);
        this.groundRing(pos, WHITE, 1, 11, 0.42);
        this.groundRing(pos, rigs[1 - e.id].auraColor, 0.6, 6.5, 0.3);
        this.star(pos.addInPlaceFromFloats(0, 0.6, 0), WHITE, 4.5, 0.16);
        this.debris(pos, { x: 0, y: 0, z: 0 }, "dirt", 8, 2);
        this.shake = Math.min(1.3, this.shake + 0.9);
        break;
      }
      case "wallHit": {
        const pos = vec(e.pos);
        this.shock(pos, FULGUR, 1, 8, 0.4);
        this.spark(pos, 26, FULGUR, 16, 0.3, 0.4);
        this.shake = Math.min(1.3, this.shake + 0.4);
        break;
      }
      case "propBreak": {
        const pos = vec(e.pos);
        this.dust(pos, 8, 1.8, 5);
        // The match is the source of truth for what the prop was.
        this.debris(pos, e.dir, this.propKind(e.index), 7, 13);
        this.shake = Math.min(1.3, this.shake + 0.12);
        break;
      }
      case "guardBreak": {
        const pos = vec(e.pos);
        this.spark(pos, 34, FULGUR, 18, 0.34, 0.45);
        this.shock(pos, FULGUR, 0.6, 6, 0.3);
        this.star(pos, WHITE, 3.4, 0.16);
        this.shake = Math.min(1.3, this.shake + 0.5);
        break;
      }
      case "awaken": {
        const pos = vec(e.pos);
        const c = rigs[e.id].auraColor;
        this.groundRing(pos, c, 1, 18, 0.6);
        this.groundRing(pos, WHITE, 1, 10, 0.4);
        this.shock(pos, c, 1, 12, 0.5);
        this.star(pos, WHITE, 7, 0.3);
        this.dust(pos, 20, 3, 12);
        this.shake = Math.min(1.3, this.shake + 0.9);
        break;
      }
      case "ultStart":
        this.star(vec(e.pos), WHITE, 5, 0.3);
        this.shock(vec(e.pos), rigs[e.id].auraColor, 0.8, 7, 0.4);
        break;
      case "cineHit": {
        const pos = vec(e.pos);
        rigs[e.att].recoil();
        rigs[e.def].recoil();
        rigs[e.def].hit(1);
        this.star(pos, WHITE, e.final ? 8 : 3.2, e.final ? 0.3 : 0.12);
        this.spark(pos, e.final ? 50 : 14, rigs[e.att].auraColor, e.final ? 26 : 16, 0.36, 0.4);
        if (e.final) {
          this.shock(pos, WHITE, 1, 16, 0.5);
          this.shock(pos, rigs[e.att].auraColor, 1, 10, 0.4);
        }
        this.shake = Math.min(1.3, this.shake + (e.final ? 1.2 : 0.35));
        break;
      }
      case "clashStart":
        this.star(vec(e.pos), WHITE, 6, 0.25);
        this.shake = Math.min(1.3, this.shake + 0.5);
        break;
      case "clashEnd": {
        const pos = vec(e.pos);
        this.star(pos, WHITE, 11, 0.35);
        this.shock(pos, WHITE, 1, 20, 0.55);
        this.spark(pos, 60, e.winner >= 0 ? rigs[e.winner].auraColor : WHITE, 28, 0.4, 0.5);
        this.shake = 1.3;
        break;
      }
      case "ko": {
        const pos = vec(e.pos).addInPlaceFromFloats(0, 0.95, 0);
        this.star(pos, WHITE, 10, 0.4);
        this.shock(pos, rigs[e.winner].auraColor, 1, 18, 0.6);
        this.shake = 1.3;
        break;
      }
    }
  }

  private groundRingAt(pos: Vector3, color: Color3, s0: number, s1: number, dur: number): void {
    const p = this.rings.spawn(pos, color, s0, s1, dur, 0.8);
    p.mesh.position.y = pos.y;
  }

  private kinds: PropKind[] = [];
  /** Tells effects what each prop is, so debris matches it. */
  setPropKinds(kinds: PropKind[]): void {
    this.kinds = kinds;
  }
  private propKind(index: number): PropKind {
    return this.kinds[index] ?? "crate";
  }

  // ------------------------------------------------------------ per frame

  update(dt: number, m: Match, alpha: number): void {
    this.stars.update(dt);
    this.shocks.update(dt);
    this.rings.update(dt);
    this.ghosts.update(dt);
    this.slashes.update(dt);
    this.shake = Math.max(0, this.shake - dt * 3.2);

    for (const c of this.chunks) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 30 * dt;
      c.mesh.position.addInPlaceFromFloats(c.vel.x * dt, c.vel.y * dt, c.vel.z * dt);
      c.mesh.rotation.addInPlaceFromFloats(c.spin.x * dt, c.spin.y * dt, c.spin.z * dt);
      if (c.mesh.position.y < 0.12) {
        c.mesh.position.y = 0.12;
        c.vel.set(c.vel.x * 0.45, Math.abs(c.vel.y) * 0.3, c.vel.z * 0.45);
        c.spin.scaleInPlace(0.5);
      }
      if (c.life < 0.3) c.mesh.scaling.scaleInPlace(Math.max(0, 1 - dt * 5));
      if (c.life <= 0) c.mesh.setEnabled(false);
    }

    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const rig = this.rigs[i];
      const hidden = f.state === "slip";
      // Rising embers: dense while charging, a steady trickle while awakened.
      let rate = 0;
      if (f.state === "charge") rate = 170;
      else if (f.state === "burst") rate = 260;
      else if (f.awakened > 0) rate = 55;
      else if (f.shotHold >= 12) rate = 30 + 60 * Math.min(1, f.shotHold / 34);
      this.auras[i].emitRate = hidden ? 0 : rate;
      this.auraPos[i].set(rig.root.position.x, rig.root.position.y + 0.2, rig.root.position.z);

      // Afterimages trail any fast movement.
      const fast = f.state === "chase" || f.state === "zip" || f.state === "step" || f.state === "blasted";
      if (fast) {
        this.ghostTimer[i] -= dt;
        if (this.ghostTimer[i] <= 0) {
          this.ghostTimer[i] = f.state === "blasted" ? 0.05 : 0.022;
          const lean = f.state === "chase" || f.state === "zip" ? 1.1 : f.state === "blasted" ? -1.2 : 0;
          this.ghost(rig.root.position, f.state === "blasted" ? WHITE : rig.auraColor, f.yaw, lean, f.state === "blasted" ? 0.16 : 0.24);
        }
      } else this.ghostTimer[i] = 0;
    }

    this.syncProjectiles(m, alpha);
    this.syncRopes(m);
    this.syncClash(m, dt);
  }

  private syncProjectiles(m: Match, alpha: number): void {
    let b = 0;
    const used = [false, false];
    const usedU = [false, false];
    const usedL = [false, false];
    for (const p of m.projectiles) {
      const x = p.prev.x + (p.pos.x - p.prev.x) * alpha;
      const y = p.prev.y + (p.pos.y - p.prev.y) * alpha;
      const z = p.prev.z + (p.pos.z - p.prev.z) * alpha;
      let mesh: Mesh | undefined;
      if (p.kind === "bullet") mesh = this.bullets[b++];
      else if (p.kind === "heavy") {
        mesh = this.heavies[p.owner];
        used[p.owner] = true;
        const pulse = 1 + Math.sin(m.tick * 0.9) * 0.12;
        mesh.scaling.setAll(pulse);
      } else if (p.kind === "ult") {
        mesh = this.ults[p.owner];
        usedU[p.owner] = true;
      } else {
        mesh = this.loops[p.owner];
        usedL[p.owner] = true;
      }
      if (!mesh) continue;
      mesh.position.set(x, y, z);
      this.tmp.set(x + p.vel.x, y + p.vel.y, z + p.vel.z);
      mesh.lookAt(this.tmp);
      mesh.setEnabled(true);
    }
    for (let i = b; i < this.bullets.length; i++) this.bullets[i].setEnabled(false);
    for (let i = 0; i < 2; i++) {
      if (!used[i]) this.heavies[i].setEnabled(false);
      if (!usedU[i]) this.ults[i].setEnabled(false);
      if (!usedL[i]) this.loops[i].setEnabled(false);
    }
  }

  private stretch(mesh: Mesh, from: Vector3, to: Vector3): void {
    const len = Vector3.Distance(from, to);
    if (len < 0.05) {
      mesh.setEnabled(false);
      return;
    }
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.scaling.z = len;
    mesh.lookAt(to);
    mesh.setEnabled(true);
  }

  private syncRopes(m: Match): void {
    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const o = m.fighters[1 - i];
      const rope = this.ropes[i];
      const lasso = m.projectiles.find((p) => p.kind === "lasso" && p.owner === i);
      const from = this.rigs[i].hand.getAbsolutePosition();
      if (lasso) {
        this.tmp.set(lasso.pos.x, lasso.pos.y, lasso.pos.z);
        this.stretch(rope, from, this.tmp);
      } else if (o.state === "pulled" || f.state === "zip") {
        this.rigs[1 - i].center(this.tmp);
        this.stretch(rope, from, this.tmp);
      } else rope.setEnabled(false);
    }
  }

  private syncClash(m: Match, dt: number): void {
    const clash = m.clash;
    if (!clash) {
      this.orb.setEnabled(false);
      this.beams[0].setEnabled(false);
      this.beams[1].setEnabled(false);
      return;
    }
    // The orb slides toward whoever is losing the struggle.
    const lead = clash.power[0] - clash.power[1];
    const a = this.rigs[0].hand.getAbsolutePosition();
    const b = this.rigs[1].hand.getAbsolutePosition();
    const k = 0.5 + Math.max(-0.4, Math.min(0.4, lead * 0.035));
    this.tmp2.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    this.orb.position.copyFrom(this.tmp2);
    this.orb.scaling.setAll(1 + Math.sin(clash.t * 0.8) * 0.15 + Math.random() * 0.1);
    this.orb.setEnabled(true);
    this.stretch(this.beams[0], a, this.tmp2);
    this.stretch(this.beams[1], b, this.tmp2);
    if (Math.random() < dt * 30) this.spark(this.tmp2, 8, WHITE, 18, 0.3, 0.3);
    this.shake = Math.max(this.shake, 0.25);
  }
}
