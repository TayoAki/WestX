import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TrailMesh } from "@babylonjs/core/Meshes/trailMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
import type { KitId } from "../sim/kits";
import { isUp } from "../sim/match";
import { MOVES } from "../sim/moves";
import type { Fighter, Match, MoveId } from "../sim/types";
import type { ModelBody } from "./model";
import { choosePose, JOINTS, type Joint, type Pose, type RigClock } from "./poses";
import { makeGlow, noGlow } from "./stage";
import { makeToon } from "./toon";

// A fighter drawn from primitives: capsule limbs, a poncho and a wide-brimmed
// hat for a silhouette that reads at any distance. Placeholder art, on purpose.
//
// A class with a real character model wears it over this rig. The rig goes on
// working out the poses exactly as before; the model is what gets drawn.

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

/** One look per class, so you can tell who you are fighting from across the arena. */
export const KIT_PALETTE: Record<KitId, Palette> = {
  hunter: { poncho: "#1f8f8a", shirt: "#ecdcb8", legs: "#4a3a56", boots: "#2a1f2a", skin: "#c98a5e", hat: "#f1e3c4", band: "#ffd24a", aura: "#ffd24a" },
  witch: { poncho: "#5a3b8c", shirt: "#3b2a55", legs: "#2c2140", boots: "#1a1326", skin: "#d9a57c", hat: "#2a2040", band: "#c77dff", aura: "#c77dff" },
  engineer: { poncho: "#8a5a34", shirt: "#d8c9a0", legs: "#5b4a3a", boots: "#2b211b", skin: "#b9805a", hat: "#6b4a2e", band: "#b5e853", aura: "#b5e853" },
  outlaw: { poncho: "#b8323f", shirt: "#33293a", legs: "#3d2c36", boots: "#1c1418", skin: "#e2ae82", hat: "#2a2030", band: "#ff4a6e", aura: "#ff4a6e" },
  // Rabble wear their leader's colours: see crewPalette.
  thug: { poncho: "#6d5a4c", shirt: "#8a7662", legs: "#4a3d36", boots: "#241b18", skin: "#cf9a72", hat: "#3a2f2a", band: "#b8a48a", aura: "#b8a48a" },
  gunhand: { poncho: "#5a5248", shirt: "#a39274", legs: "#40362f", boots: "#241b18", skin: "#d8a47c", hat: "#57463a", band: "#b8a48a", aura: "#b8a48a" },
};

/** A crew dresses drab, with its leader's colour on the poncho and the hatband, so you can tell whose it is. */
export function crewPalette(kit: KitId, leader: Palette): Palette {
  const drab = Color3.FromHexString(KIT_PALETTE[kit].poncho);
  const theirs = Color3.FromHexString(leader.poncho);
  return { ...KIT_PALETTE[kit], poncho: Color3.Lerp(drab, theirs, 0.55).toHexString(), band: leader.aura, aura: leader.aura };
}

/** Materials every fighter shares: the shadow under them and the health bar over them. */
const SHARED = new WeakMap<Scene, { shadow: StandardMaterial; barBack: StandardMaterial; barFill: StandardMaterial }>();
function shared(scene: Scene) {
  let s = SHARED.get(scene);
  if (!s) {
    s = { shadow: makeGlow(scene, "shadowMat", "#150f1c", 0.42), barBack: makeGlow(scene, "barBackMat", "#1a1320", 0.75), barFill: makeGlow(scene, "barFillMat", "#ff4a6e") };
    SHARED.set(scene, s);
  }
  return s;
}

const OUTLINE = Color3.FromHexString("#1a1320");

/** Which hand a strike is thrown with, for the trail it leaves. Anything not listed uses both. */
const RIGHT_HAND: ReadonlySet<MoveId> = new Set<MoveId>(["w1", "e1", "g1", "s1", "enderBlast", "prodBlast", "prodLaunch", "prodSlam"]);
const LEFT_HAND: ReadonlySet<MoveId> = new Set<MoveId>(["a2", "e2", "g2", "s2", "armBlast", "armLaunch", "armSlam", "thunderclap"]);

/** A ribbon of light that follows a hand, shown while that hand is swinging. */
interface Trail {
  /** A point kept at the hand each frame. The ribbon follows this, not the hand, so it is drawn the same on any body. */
  at: TransformNode;
  mesh: TrailMesh;
  shown: number;
}

export class Rig {
  readonly root: TransformNode;
  private nodes = {} as Record<Joint, TransformNode>;
  private cur = {} as Record<Joint, [number, number, number]>;
  private curY = 0;
  private mats: ShaderMaterial[] = [];
  private meshes: Mesh[] = [];
  private aura: Mesh;
  private auraMat: StandardMaterial;
  private clock: RigClock = { phase: 0, time: 0, tumble: 0, recoil: 0, brace: 0 };
  private coreMat: StandardMaterial | null = null;
  private coreFlash = 0;
  private flash = 0;
  private handGuns: Mesh[] = [];
  private hipGuns: Mesh[] = [];
  private lastPos = new Vector3();
  private shadow: Mesh;
  private bar: TransformNode;
  private barFill: Mesh;
  /** Seconds one of the rabble has been lying where they fell. */
  private gone = 0;
  /** Swing trails for the right hand and the left. Rabble go without. */
  private trails: Trail[] = [];
  /** World position of the gun hand, for muzzle flashes and the lasso. */
  hand: TransformNode;
  /** World position of the brace fist, for the hunter's arm effects. */
  fist: TransformNode;
  /** The character model this rig is wearing, if its class has one. */
  body: ModelBody | null = null;
  readonly auraColor: Color3;

  constructor(
    scene: Scene,
    readonly id: number,
    palette: Palette,
    kit: KitId,
    /** Rabble are drawn more cheaply: there are a lot of them. */
    lite = false,
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
      if (outline > 0 && !lite) {
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
    if (lite) this.root.scaling.setAll(0.93);
    const body = node("body", this.root, 0, 0.95, 0);
    this.nodes.body = body;
    part(CreateBox(`f${id}-pelvis`, { width: 0.36, height: 0.22, depth: 0.24 }, scene), body, legs, 0, 0, 0);

    const spine = node("spine", body, 0, 0.06, 0);
    this.nodes.spine = spine;
    part(CreateBox(`f${id}-torso`, { width: 0.42, height: 0.52, depth: 0.26 }, scene), spine, shirt, 0, 0.3, 0);
    const witch = kit === "witch";
    const engineer = kit === "engineer";
    if (witch) {
      // A shawl and a long robe: the one silhouette in the Territory with no legs showing.
      part(CreateCylinder(`f${id}-shawl`, { height: 0.34, diameterTop: 0.3, diameterBottom: 0.86, tessellation: 9 }, scene), spine, poncho, 0, 0.42, 0, 0.03);
      part(CreateCylinder(`f${id}-robe`, { height: 0.98, diameterTop: 0.44, diameterBottom: 1.12, tessellation: 10 }, scene), body, poncho, 0, -0.44, 0, 0.03);
    } else if (engineer) {
      // A leather apron, and a pressure tank on the back with a gauge that glows.
      part(CreateBox(`f${id}-apron`, { width: 0.46, height: 0.62, depth: 0.06 }, scene), spine, poncho, 0, 0.2, 0.15, 0.02);
      part(CreateCylinder(`f${id}-tank`, { height: 0.56, diameter: 0.28, tessellation: 10 }, scene), spine, steel, 0, 0.3, -0.24, 0.025);
      const gauge = CreateBox(`f${id}-gauge`, { width: 0.1, height: 0.3, depth: 0.04 }, scene);
      gauge.material = makeGlow(scene, `f${id}-gaugeMat`, palette.aura);
      gauge.parent = spine;
      gauge.position.set(0, 0.3, -0.39);
      gauge.isPickable = false;
    } else {
      part(CreateCylinder(`f${id}-poncho`, { height: 0.5, diameterTop: 0.3, diameterBottom: 1.04, tessellation: 9 }, scene), spine, poncho, 0, 0.33, 0, 0.03);
    }

    const head = node("head", spine, 0, 0.6, 0);
    this.nodes.head = head;
    part(CreateSphere(`f${id}-skull`, { diameter: 0.32, segments: 10 }, scene), head, skin, 0, 0.14, 0);
    part(CreateBox(`f${id}-scarf`, { width: 0.3, height: 0.1, depth: 0.3 }, scene), head, band, 0, 0.0, 0, 0);
    if (witch) {
      // A wide brim and a tall crooked point.
      part(CreateCylinder(`f${id}-brim`, { height: 0.035, diameter: 1.0, tessellation: 14 }, scene), head, hat, 0, 0.26, 0, 0.03);
      const point = part(CreateCylinder(`f${id}-crown`, { height: 0.62, diameterTop: 0.03, diameterBottom: 0.38, tessellation: 10 }, scene), head, hat, 0, 0.57, -0.04);
      point.rotation.x = -0.22;
      part(CreateCylinder(`f${id}-hatband`, { height: 0.06, diameter: 0.4, tessellation: 12 }, scene), head, band, 0, 0.31, 0, 0);
    } else if (engineer) {
      // A flat cap and a pair of goggles.
      part(CreateCylinder(`f${id}-cap`, { height: 0.1, diameter: 0.38, tessellation: 12 }, scene), head, hat, 0, 0.3, 0);
      part(CreateBox(`f${id}-peak`, { width: 0.3, height: 0.03, depth: 0.2 }, scene), head, hat, 0, 0.26, 0.2, 0.02);
      for (const x of [-0.075, 0.075]) {
        const lens = CreateCylinder(`f${id}-lens${x}`, { height: 0.05, diameter: 0.11, tessellation: 10 }, scene);
        lens.material = makeGlow(scene, `f${id}-lensMat${x}`, palette.aura);
        lens.parent = head;
        lens.rotation.x = Math.PI / 2;
        lens.position.set(x, 0.16, 0.16);
        lens.isPickable = false;
      }
    } else {
      part(CreateCylinder(`f${id}-brim`, { height: 0.035, diameter: 0.78, tessellation: 14 }, scene), head, hat, 0, 0.26, 0, 0.03);
      part(CreateCylinder(`f${id}-crown`, { height: 0.2, diameterTop: 0.3, diameterBottom: 0.36, tessellation: 12 }, scene), head, hat, 0, 0.37, 0);
      part(CreateCylinder(`f${id}-hatband`, { height: 0.05, diameter: 0.375, tessellation: 12 }, scene), head, band, 0, 0.3, 0, 0);
    }

    let hand!: TransformNode;
    let fist!: TransformNode;
    const braced = kit === "hunter";
    for (const side of [-1, 1]) {
      const s = side < 0 ? "L" : "R";
      const shoulder = node(`sh${s}`, spine, 0.27 * side, 0.5, 0);
      this.nodes[`sh${s}` as Joint] = shoulder;
      part(cap(`upper${s}`, 0.36, 0.075), shoulder, shirt, 0, -0.15, 0);
      const elbow = node(`el${s}`, shoulder, 0, -0.3, 0);
      this.nodes[`el${s}` as Joint] = elbow;
      part(cap(`fore${s}`, 0.34, 0.068), elbow, shirt, 0, -0.14, 0);
      if (side < 0) fist = node("fistL", elbow, 0, -0.36, 0);
      if (braced && side < 0) {
        // The hunter's left arm: a brass brace bound over a storm-struck forearm.
        // It is his shield and, when it discharges, his heaviest weapon.
        const brass = mat("brass", "#c9963a");
        part(CreateCylinder(`f${id}-brace`, { height: 0.36, diameter: 0.27, tessellation: 8 }, scene), elbow, brass, 0, -0.16, 0, 0.028);
        for (const y of [-0.04, -0.28]) part(CreateCylinder(`f${id}-band${y}`, { height: 0.05, diameter: 0.31, tessellation: 8 }, scene), elbow, steel, 0, y, 0, 0);
        part(CreateSphere(`f${id}-fist`, { diameter: 0.21, segments: 8 }, scene), elbow, brass, 0, -0.38, 0, 0.022);
        // A strip of fulgur glass down the brace. It brightens as Nerve builds.
        const core = CreateBox(`f${id}-core`, { width: 0.07, height: 0.26, depth: 0.05 }, scene);
        this.coreMat = makeGlow(scene, `f${id}-coreMat`, "#5ef2ff");
        core.material = this.coreMat;
        core.parent = elbow;
        core.position.set(0, -0.16, 0.135);
        core.isPickable = false;
      } else if (witch) {
        part(CreateSphere(`f${id}-hand${s}`, { diameter: 0.14, segments: 8 }, scene), elbow, skin, 0, -0.31, 0);
        if (side > 0) {
          // A staff with a hex-light at its head.
          part(CreateCylinder(`f${id}-staff`, { height: 1.55, diameter: 0.045, tessellation: 6 }, scene), elbow, steel, 0, -0.1, 0.06, 0.015);
          const orb = CreateSphere(`f${id}-orb`, { diameter: 0.19, segments: 8 }, scene);
          orb.material = makeGlow(scene, `f${id}-orbMat`, palette.aura);
          orb.parent = elbow;
          orb.position.set(0, 0.72, 0.06);
          orb.isPickable = false;
        }
      } else if (engineer && side > 0) {
        // The steam gauntlet: the engineer's striking hand.
        const copper = mat("copper", "#b66a3c");
        part(CreateCylinder(`f${id}-gauntlet`, { height: 0.34, diameter: 0.25, tessellation: 8 }, scene), elbow, copper, 0, -0.17, 0, 0.026);
        part(CreateSphere(`f${id}-knuckle`, { diameter: 0.2, segments: 8 }, scene), elbow, copper, 0, -0.38, 0, 0.022);
      } else if (kit === "thug" || (kit === "gunhand" && side < 0)) {
        // Bare hands. A thug has two; a gunhand keeps one free.
        part(CreateSphere(`f${id}-hand${s}`, { diameter: 0.15, segments: 8 }, scene), elbow, skin, 0, -0.31, 0);
      } else {
        part(CreateSphere(`f${id}-hand${s}`, { diameter: 0.14, segments: 8 }, scene), elbow, skin, 0, -0.31, 0);
        // A revolver in the hand, pointing along the forearm.
        this.handGuns.push(part(CreateBox(`f${id}-gun${s}`, { width: 0.05, height: 0.3, depth: 0.09 }, scene), elbow, steel, 0, -0.46, 0.03, 0.015));
        // The same gun, holstered on the hip. Only one of the pair is shown at a time.
        const holster = part(CreateBox(`f${id}-holster${s}`, { width: 0.06, height: 0.3, depth: 0.1 }, scene), body, steel, 0.215 * side, -0.16, 0.03, 0.015);
        holster.rotation.x = 0.25;
        holster.setEnabled(false);
        this.hipGuns.push(holster);
      }
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
    this.fist = fist;

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

    // A trail off each hand, for swings.
    if (!lite) {
      for (const side of ["R", "L"]) {
        const at = new TransformNode(`f${id}-trailAt${side}`, scene);
        const mesh = new TrailMesh(`f${id}-trail${side}`, at, scene, { diameter: 0.2, length: 11, segments: 11, sections: 4, autoStart: true });
        const mat = makeGlow(scene, `f${id}-trailMat${side}`, palette.aura, 0.75);
        mat.alphaMode = 1; // additive
        mesh.material = mat;
        mesh.isPickable = false;
        // It moves every frame; the box it was measured in means nothing.
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(false);
        this.trails.push({ at, mesh, shown: 0 });
      }
    }

    // A soft shadow on the ground, and a health bar overhead for anyone who is not the hero.
    const mats = shared(scene);
    this.shadow = CreateDisc(`f${id}-shadow`, { radius: 0.72, tessellation: 18 }, scene);
    this.shadow.rotation.x = Math.PI / 2;
    this.shadow.material = mats.shadow;
    this.shadow.isPickable = false;
    this.bar = new TransformNode(`f${id}-bar`, scene);
    this.bar.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    const back = CreatePlane(`f${id}-barBack`, { width: 0.96, height: 0.13 }, scene);
    back.material = mats.barBack;
    this.barFill = CreatePlane(`f${id}-barFill`, { width: 0.9, height: 0.075 }, scene);
    this.barFill.material = mats.barFill;
    for (const mesh of [back, this.barFill]) {
      mesh.parent = this.bar;
      mesh.isPickable = false;
      noGlow(scene, mesh);
    }
    noGlow(scene, this.shadow);
    this.barFill.position.z = -0.01;
    this.bar.setEnabled(false);
  }

  /** Dresses the rig in a character model: the primitives are hidden and the model takes their poses. */
  wear(body: ModelBody): void {
    for (const mesh of this.root.getChildMeshes(false)) if (mesh !== this.aura) mesh.setEnabled(false);
    this.body = body;
    body.root.parent = this.root;
    this.mats.push(...body.mats);
    // Effects that start at a hand now start at hers.
    if (body.handR) this.hand = body.handR;
    if (body.handL) this.fist = body.handL;
  }

  /** White flash on taking a hit. */
  hit(amount: number): void {
    this.flash = Math.max(this.flash, amount);
  }

  /** Snaps the brace up for a moment and flares its core: a deflect or a catch. */
  brace(seconds: number): void {
    this.clock.brace = Math.max(this.clock.brace, seconds);
    this.coreFlash = 1;
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
    clock.brace = Math.max(0, clock.brace - dt);
    const dx = x - this.lastPos.x;
    const dz = z - this.lastPos.z;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    this.lastPos.set(x, y, z);
    if ((f.state === "free" || f.state === "guard") && f.grounded) clock.phase += Math.min(speed, 12) * dt * 1.45;
    const tumbling = f.state === "launched" || f.state === "blasted" || f.state === "bounced" || (f.state === "ko" && !f.grounded);
    clock.tumble = tumbling ? clock.tumble + dt * 13 : 0;

    const res = choosePose(f, m, clock, speed);
    // Rabble who have been thrown out of the fight lie where they land for a moment, then they are gone.
    this.gone = f.rank === "rabble" && f.state === "ko" && f.grounded ? this.gone + dt : 0;
    if (this.gone > 3.5) res.hidden = true;
    this.root.setEnabled(!res.hidden);
    this.root.position.set(x, y, z);
    this.root.rotation.y = f.yaw;

    // The shadow stays on the ground, and thins out as the fighter leaves it.
    this.shadow.setEnabled(!res.hidden);
    this.shadow.position.set(x, 0.04, z);
    this.shadow.scaling.setAll(Math.max(0.35, 1 - y * 0.05));
    this.shadow.visibility = Math.max(0.25, 1 - y * 0.06);

    // Health bars are for the brawl. Anything staged (a standoff, an ultimate, a verdict) plays without them.
    const brawl = m.opts.mode === "roam" && m.phase === "fight" && !m.standoff && !m.cine;
    const shown = brawl && f.rank !== "hero" && isUp(f) && !res.hidden && (f.hp < f.maxHp || m.fighters[0].target === f.id);
    this.bar.setEnabled(shown);
    if (shown) {
      const k = Math.max(0, f.hp / f.maxHp);
      this.bar.position.set(x, y + 2.35, z);
      this.barFill.scaling.x = Math.max(0.001, k);
      // Empties from the right, like the bars at the top of the screen.
      this.barFill.position.x = -0.45 * (1 - k);
    }

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

    if (this.coreMat) {
      // The glass glows with the Nerve stored in it, and flares when the brace does its work.
      this.coreFlash = Math.max(0, this.coreFlash - dt * 4);
      const armed = f.state === "attack" && (f.move === "thunderclap" || f.move === "armBlast" || f.move === "armLaunch" || f.move === "armSlam");
      const glow = Math.min(1.6, 0.12 + 0.88 * (f.meter / 100) + this.coreFlash + (armed ? 0.6 + Math.sin(clock.time * 40) * 0.2 : 0));
      this.coreMat.emissiveColor.set(0.37 * glow, 0.95 * glow, glow);
    }
    if (this.body) {
      // The off hand makes a fist to hit with, and to hold a guard.
      const fist = f.state === "attack" || f.state === "guard" || f.state === "blockstun" || f.state === "chase";
      this.body.pose(this.cur, res.spin, this.curY, res.holstered, fist, dt);
    }
    else {
      for (const g of this.handGuns) g.setEnabled(!res.holstered);
      for (const g of this.hipGuns) g.setEnabled(res.holstered);
    }

    // Swing trails: the ribbon always follows the hand, and is lit only while that hand is striking.
    if (this.trails.length) {
      const mv = f.state === "attack" && f.move ? MOVES[f.move] : null;
      const live = !!mv && mv.hits.length > 0 && f.mf >= mv.hits[0].from - 3 && f.mf <= mv.hits[mv.hits.length - 1].to + 4 && !res.hidden;
      const hands = [this.hand, this.fist];
      this.trails.forEach((trail, i) => {
        hands[i].computeWorldMatrix(true);
        trail.at.position.copyFrom(hands[i].getAbsolutePosition());
        const mine = live && !(i === 0 ? LEFT_HAND : RIGHT_HAND).has(f.move!);
        trail.shown += ((mine ? 1 : 0) - trail.shown) * (1 - Math.exp(-(mine ? 40 : 12) * dt));
        trail.mesh.visibility = trail.shown;
        trail.mesh.setEnabled(trail.shown > 0.03);
      });
    }

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

  /** Removes the fighter from the scene, for when the classes change between matches. */
  dispose(): void {
    // The model goes first, on its own terms: its texture is shared with every other copy.
    this.body?.dispose();
    for (const trail of this.trails) {
      trail.mesh.dispose(false, true);
      trail.at.dispose();
    }
    this.root.dispose(false, true);
    this.shadow.dispose(false, false);
    this.bar.dispose(false, false);
  }

  /** Centre of mass in world space, for effects. */
  center(out: Vector3): Vector3 {
    return out.set(this.root.position.x, this.root.position.y + 0.95, this.root.position.z);
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v);
  }
}
