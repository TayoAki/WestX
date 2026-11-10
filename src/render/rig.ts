import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
import type { Fighter, Match } from "../sim/types";
import { choosePose, JOINTS, type Joint, type Pose, type RigClock } from "./poses";
import { makeGlow } from "./stage";
import { makeToon } from "./toon";

// A fighter drawn from primitives: capsule limbs, a poncho and a wide-brimmed
// hat for a silhouette that reads at any distance. Placeholder art, on purpose.

export interface Palette {
  poncho: string;
  shirt: string;
  legs: string;
  boots: string;
  skin: string;
  hat: string;
  band: string;
  /** Meter and aura colour. */
  aura: string;
}

export const PALETTES: [Palette, Palette] = [
  { poncho: "#1f8f8a", shirt: "#ecdcb8", legs: "#4a3a56", boots: "#2a1f2a", skin: "#c98a5e", hat: "#f1e3c4", band: "#ffd24a", aura: "#ffd24a" },
  { poncho: "#b8323f", shirt: "#33293a", legs: "#3d2c36", boots: "#1c1418", skin: "#e2ae82", hat: "#2a2030", band: "#ff4a6e", aura: "#ff4a6e" },
];

const OUTLINE = Color3.FromHexString("#1a1320");

export class Rig {
  readonly root: TransformNode;
  private nodes = {} as Record<Joint, TransformNode>;
  private cur = {} as Record<Joint, [number, number, number]>;
  private curY = 0;
  private mats: ShaderMaterial[] = [];
  private meshes: Mesh[] = [];
  private aura: Mesh;
  private auraMat: StandardMaterial;
  private clock: RigClock = { phase: 0, time: 0, tumble: 0, recoil: 0 };
  private flash = 0;
  private handGuns: Mesh[] = [];
  private hipGuns: Mesh[] = [];
  private lastPos = new Vector3();
  /** World position of the gun hand, for muzzle flashes and the lasso. */
  readonly hand: TransformNode;
  readonly auraColor: Color3;

  constructor(
    scene: Scene,
    readonly id: number,
    palette: Palette,
  ) {
    this.auraColor = Color3.FromHexString(palette.aura);
    const mat = (key: string, hex: string) => {
      const m = makeToon(scene, `f${id}-${key}`, hex);
      this.mats.push(m);
      return m;
    };
    const poncho = mat("poncho", palette.poncho);
    const shirt = mat("shirt", palette.shirt);
    const legs = mat("legs", palette.legs);
    const boots = mat("boots", palette.boots);
    const skin = mat("skin", palette.skin);
    const hat = mat("hat", palette.hat);
    const band = mat("band", palette.band);
    const steel = mat("steel", "#3a3a48");

    const node = (name: string, parent: TransformNode, x: number, y: number, z: number): TransformNode => {
      const n = new TransformNode(`f${id}-${name}`, scene);
      n.parent = parent;
      n.position.set(x, y, z);
      return n;
    };
    const part = (mesh: Mesh, parent: TransformNode, material: ShaderMaterial, x: number, y: number, z: number, outline = 0.022): Mesh => {
      mesh.parent = parent;
      mesh.position.set(x, y, z);
      mesh.material = material;
      mesh.isPickable = false;
      if (outline > 0) {
        mesh.renderOutline = true;
        mesh.outlineWidth = outline;
        mesh.outlineColor = OUTLINE;
      }
      this.meshes.push(mesh);
      return mesh;
    };
    const cap = (name: string, height: number, radius: number) =>
      CreateCapsule(`f${id}-${name}`, { height, radius, tessellation: 10, capSubdivisions: 4 }, scene);

    this.root = new TransformNode(`f${id}-root`, scene);
    const body = node("body", this.root, 0, 0.95, 0);
    this.nodes.body = body;
    part(CreateBox(`f${id}-pelvis`, { width: 0.36, height: 0.22, depth: 0.24 }, scene), body, legs, 0, 0, 0);

    const spine = node("spine", body, 0, 0.06, 0);
    this.nodes.spine = spine;
    part(CreateBox(`f${id}-torso`, { width: 0.42, height: 0.52, depth: 0.26 }, scene), spine, shirt, 0, 0.3, 0);
    part(CreateCylinder(`f${id}-poncho`, { height: 0.5, diameterTop: 0.3, diameterBottom: 1.04, tessellation: 9 }, scene), spine, poncho, 0, 0.33, 0, 0.03);

    const head = node("head", spine, 0, 0.6, 0);
    this.nodes.head = head;
    part(CreateSphere(`f${id}-skull`, { diameter: 0.32, segments: 10 }, scene), head, skin, 0, 0.14, 0);
    part(CreateBox(`f${id}-scarf`, { width: 0.3, height: 0.1, depth: 0.3 }, scene), head, band, 0, 0.0, 0, 0);
    part(CreateCylinder(`f${id}-brim`, { height: 0.035, diameter: 0.78, tessellation: 14 }, scene), head, hat, 0, 0.26, 0, 0.03);
    part(CreateCylinder(`f${id}-crown`, { height: 0.2, diameterTop: 0.3, diameterBottom: 0.36, tessellation: 12 }, scene), head, hat, 0, 0.37, 0);
    part(CreateCylinder(`f${id}-hatband`, { height: 0.05, diameter: 0.375, tessellation: 12 }, scene), head, band, 0, 0.3, 0, 0);

    let hand!: TransformNode;
    for (const side of [-1, 1]) {
      const s = side < 0 ? "L" : "R";
      const shoulder = node(`sh${s}`, spine, 0.27 * side, 0.5, 0);
      this.nodes[`sh${s}` as Joint] = shoulder;
      part(cap(`upper${s}`, 0.36, 0.075), shoulder, shirt, 0, -0.15, 0);
      const elbow = node(`el${s}`, shoulder, 0, -0.3, 0);
      this.nodes[`el${s}` as Joint] = elbow;
      part(cap(`fore${s}`, 0.34, 0.068), elbow, shirt, 0, -0.14, 0);
      part(CreateSphere(`f${id}-hand${s}`, { diameter: 0.14, segments: 8 }, scene), elbow, skin, 0, -0.31, 0);
      // A revolver in each hand, pointing along the forearm.
      this.handGuns.push(part(CreateBox(`f${id}-gun${s}`, { width: 0.05, height: 0.3, depth: 0.09 }, scene), elbow, steel, 0, -0.46, 0.03, 0.015));
      // The same gun, holstered on the hip. Only one of the pair is shown at a time.
      const holster = part(CreateBox(`f${id}-holster${s}`, { width: 0.06, height: 0.3, depth: 0.1 }, scene), body, steel, 0.215 * side, -0.16, 0.03, 0.015);
      holster.rotation.x = 0.25;
      holster.setEnabled(false);
      this.hipGuns.push(holster);
      if (side > 0) hand = node("handR", elbow, 0, -0.6, 0.03);

      const hip = node(`hip${s}`, body, 0.11 * side, -0.08, 0);
      this.nodes[`hip${s}` as Joint] = hip;
      part(cap(`thigh${s}`, 0.5, 0.095), hip, legs, 0, -0.21, 0);
      const knee = node(`kn${s}`, hip, 0, -0.43, 0);
      this.nodes[`kn${s}` as Joint] = knee;
      part(cap(`shin${s}`, 0.46, 0.082), knee, legs, 0, -0.2, 0);
      part(CreateBox(`f${id}-boot${s}`, { width: 0.15, height: 0.11, depth: 0.3 }, scene), knee, boots, 0, -0.42, 0.06);
    }
    this.hand = hand;

    for (const j of JOINTS) this.cur[j] = [0, 0, 0];

    // Aura: a flickering shell of light, shown while charging or awakened.
    this.aura = CreateCylinder(`f${id}-aura`, { height: 2.9, diameterTop: 0.25, diameterBottom: 1.9, tessellation: 12, cap: Mesh.NO_CAP }, scene);
    this.auraMat = makeGlow(scene, `f${id}-auraMat`, palette.aura, 0.0);
    this.auraMat.alphaMode = 1; // additive
    this.aura.material = this.auraMat;
    this.aura.parent = this.root;
    this.aura.position.y = 1.35;
    this.aura.isPickable = false;
    this.aura.setEnabled(false);
  }

  /** White flash on taking a hit. */
  hit(amount: number): void {
    this.flash = Math.max(this.flash, amount);
  }

  /** Kicks the gun arm, for shots fired during the ultimate. */
  recoil(): void {
    this.clock.recoil = 1;
  }

  /**
   * Updates the rig from sim state. `x,y,z` is the interpolated render position.
   */
  update(f: Fighter, m: Match, dt: number, x: number, y: number, z: number): void {
    const clock = this.clock;
    clock.time += dt;
    clock.recoil = Math.max(0, clock.recoil - dt * 7);
    const dx = x - this.lastPos.x;
    const dz = z - this.lastPos.z;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    this.lastPos.set(x, y, z);
    if (f.state === "free" && f.grounded) clock.phase += Math.min(speed, 12) * dt * 1.45;
    const tumbling = f.state === "launched" || f.state === "blasted" || f.state === "bounced" || (f.state === "ko" && !f.grounded);
    clock.tumble = tumbling ? clock.tumble + dt * 13 : 0;

    const res = choosePose(f, m, clock, speed);
    this.root.setEnabled(!res.hidden);
    this.root.position.set(x, y, z);
    this.root.rotation.y = f.yaw;

    const k = 1 - Math.exp(-res.rate * dt);
    const target: Pose = res.pose;
    for (const j of JOINTS) {
      const c = this.cur[j];
      const t = target[j];
      c[0] += (t[0] - c[0]) * k;
      c[1] += (t[1] - c[1]) * k;
      c[2] += (t[2] - c[2]) * k;
      const n = this.nodes[j];
      if (j === "body") n.rotation.set(c[0] + res.spin[0], c[1] + res.spin[1], c[2] + res.spin[2]);
      else n.rotation.set(c[0], c[1], c[2]);
    }
    this.curY += (target.y - this.curY) * k;
    this.nodes.body.position.y = 0.95 + this.curY;

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 9);
      for (const mat of this.mats) mat.setFloat("uFlash", this.flash * 0.85);
    }

    for (const g of this.handGuns) g.setEnabled(!res.holstered);
    for (const g of this.hipGuns) g.setEnabled(res.holstered);

    // The aura belongs to the supernatural moments. Holding steady is quiet.
    let aura = 0;
    if (f.state === "burst") aura = 0.34;
    else if (f.state === "chase") aura = 0.14;
    else if (f.state === "cine") aura = 0;
    else if (f.awakened > 0) aura = 0.08;
    const a = this.auraMat.alpha + (aura - this.auraMat.alpha) * (1 - Math.exp(-14 * dt));
    this.auraMat.alpha = a;
    const on = a > 0.01 && !res.hidden;
    this.aura.setEnabled(on);
    if (on) {
      const flick = 1 + Math.sin(clock.time * 31) * 0.07 + Math.sin(clock.time * 53) * 0.05;
      this.aura.scaling.set(flick, 1 + Math.sin(clock.time * 23) * 0.1, flick);
      this.aura.rotation.y = clock.time * 5;
    }
  }

  /** Centre of mass in world space, for effects. */
  center(out: Vector3): Vector3 {
    return out.set(this.root.position.x, this.root.position.y + 0.95, this.root.position.z);
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v);
  }
}
