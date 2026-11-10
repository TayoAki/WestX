import { Camera } from "@babylonjs/core/Cameras/camera";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { isUp, targetOf } from "../sim/match";
import type { Match } from "../sim/types";
import { angleDiff } from "../sim/vec";
import type { Rig } from "./rig";

// A fight is watched from the side, the way a stage is: the two fighters face each
// other across the screen, and the player sees their own fighter, not the back of
// their head. The camera pulls back as they separate and needs no mouse.
//
// With nobody to fight it becomes a follow camera: behind the hero, turning to
// look where they are heading.
//
// Either way the player steers by what is on screen. `heading` is the way the
// camera is looking, and the game turns the stick by it.

export type CameraMode = "duel" | "attract";

export class CameraRig {
  mode: CameraMode = "attract";
  private pos = new Vector3(0, 26, -52);
  private look = new Vector3(0, 1, 0);
  private yaw = 0;
  private fov = 0.95;
  private orbit = 0.6;
  private cinePhase = -1;
  /** Which side of the line between the fighters the camera stands on: 1 is the player's right. */
  private side = 1;
  /** True while the side-on fight shot is the one in use. */
  private framing = false;
  /** Half the width of the view, as a tangent: how far back the camera must be to fit a given span. */
  private tanH = 0.9;
  private wantPos = new Vector3();
  private wantLook = new Vector3();

  constructor(private camera: TargetCamera) {}

  /**
   * While a fight is being watched side-on: 1 if the player's fighter is on the left of the
   * screen, -1 if on the right. 0 when some other shot is in use.
   */
  get fightSide(): number {
    return this.framing ? this.side : 0;
  }

  /** The way the camera is looking, on the ground. Up the screen is this way. */
  get heading(): number {
    return Math.atan2(this.look.x - this.pos.x, this.look.z - this.pos.z);
  }

  /** Starts a new shot from a high, wide establishing position. */
  establish(): void {
    // From the side the fight will be watched from: the player's right, so they open on the left of the screen.
    this.pos.set(26, 20, -30);
    this.look.set(0, 1, 0);
    this.yaw = 0;
    this.side = 1;
    this.framing = true;
    this.cinePhase = -1;
  }

  resize(aspect: number): void {
    // In portrait, fix the horizontal view so both fighters stay in frame.
    this.camera.fovMode = aspect < 1 ? Camera.FOVMODE_HORIZONTAL_FIXED : Camera.FOVMODE_VERTICAL_FIXED;
    const half = Math.tan(0.95 / 2);
    this.tanH = aspect < 1 ? half : half * aspect;
  }

  update(dt: number, m: Match, rigs: Rig[], shake: number, view: number): void {
    const hero = m.fighters[view];
    const foe = targetOf(m, hero);
    let me = rigs[view].root.position;
    // With nobody to face, aim at a point ahead so the framing maths below still has two ends.
    let them = foe ? rigs[foe.id].root.position : me;
    if (m.standoff) {
      // A standoff is framed from its first fighter's side, whoever is watching.
      const seat = m.standoff.ids[0] === view ? 0 : m.standoff.ids[1] === view ? 1 : 0;
      me = rigs[m.standoff.ids[seat]].root.position;
      them = rigs[m.standoff.ids[1 - seat]].root.position;
    }
    const want = this.wantPos;
    const look = this.wantLook;
    let rate = 7;
    let lookRate = 11;
    let cut = false;
    let fov = 0.95;
    const wasFraming = this.framing;
    this.framing = false;

    if (m.cine) {
      const a = rigs[m.cine.att].root.position;
      const d = rigs[m.cine.def].root.position;
      const dx = d.x - a.x;
      const dz = d.z - a.z;
      const sep = Math.max(1, Math.hypot(dx, dz));
      const fx = dx / sep;
      const fz = dz / sep;
      const rx = fz;
      const rz = -fx;
      const t = m.cine.t;
      const phase = t < 44 ? 0 : t < 100 ? 1 : t < 128 ? 2 : 3;
      cut = phase !== this.cinePhase;
      this.cinePhase = phase;
      rate = 2.5;
      lookRate = 6;
      if (phase === 0) {
        // Close on the shooter as the hat comes down.
        const push = 2.9 - (t / 44) * 0.6;
        want.set(a.x + fx * push + rx * 1.15, a.y + 1.25, a.z + fz * push + rz * 1.15);
        look.set(a.x, a.y + 1.55, a.z);
        fov = 0.8;
      } else if (phase === 1) {
        // Wide profile for the six shots.
        const side = sep * 0.75 + 4;
        want.set(a.x + dx * 0.5 + rx * side, a.y + 2.0, a.z + dz * 0.5 + rz * side);
        look.set(a.x + dx * 0.5, a.y + 1.2, a.z + dz * 0.5);
      } else if (phase === 2) {
        // Over the target's shoulder, looking back down the barrel.
        want.set(d.x + fx * 3.2 - rx * 1.3, d.y + 1.0, d.z + fz * 3.2 - rz * 1.3);
        look.set(a.x, a.y + 1.4, a.z);
        fov = 0.75;
      } else {
        want.set(d.x - fx * 1.5 + rx * 6.5, d.y + 1.5, d.z - fz * 1.5 + rz * 6.5);
        look.set(d.x, d.y + 1.1, d.z);
      }
    } else if (m.standoff) {
      // The standoff gets two shots: the classic wide profile, then low over the
      // player's holster, looking past the gun hand at the rival.
      const dx = them.x - me.x;
      const dz = them.z - me.z;
      const sep = Math.max(1, Math.hypot(dx, dz));
      const fx = dx / sep;
      const fz = dz / sep;
      const rx = fz;
      const rz = -fx;
      const phase = m.standoff.t < 56 ? 10 : 11;
      cut = phase !== this.cinePhase;
      this.cinePhase = phase;
      this.yaw = Math.atan2(dx, dz);
      rate = 1.2;
      lookRate = 5;
      if (phase === 10) {
        const side = sep * 0.6 + 3 - (m.standoff.t / 56) * 0.8;
        want.set(me.x + dx * 0.5 + rx * side, me.y + 1.15, me.z + dz * 0.5 + rz * side);
        look.set(me.x + dx * 0.5, me.y + 1.0, me.z + dz * 0.5);
        fov = 0.85;
      } else {
        want.set(me.x - fx * 2.6 + rx * 1.05, me.y + 0.82, me.z - fz * 2.6 + rz * 1.05);
        look.set(them.x - rx * 0.9, them.y + 1.0, them.z - rz * 0.9);
        // A long lens flattens the distance, so the rival looms.
        fov = 0.55;
      }
    } else if (m.phase === "verdict") {
      // Low behind the beaten fighter, looking up at the one deciding.
      const loser = rigs[m.loser].root.position;
      const winner = rigs[m.winner].root.position;
      const dx = winner.x - loser.x;
      const dz = winner.z - loser.z;
      const sep = Math.max(1, Math.hypot(dx, dz));
      const fx = dx / sep;
      const fz = dz / sep;
      cut = this.cinePhase !== 20;
      this.cinePhase = 20;
      want.set(loser.x - fx * 2.7 + fz * 1.5, loser.y + 0.8, loser.z - fz * 2.7 - fx * 1.5);
      look.set(loser.x + dx * 0.6, loser.y + 1.15, loser.z + dz * 0.6);
      rate = 1.5;
      lookRate = 5;
      fov = 0.8;
    } else if (this.mode === "attract") {
      this.cinePhase = -1;
      this.orbit += dt * 0.22;
      const mx = (me.x + them.x) / 2;
      const mz = (me.z + them.z) / 2;
      const my = (me.y + them.y) / 2;
      const sep = Vector3.Distance(me, them);
      const r = Math.min(46, 9 + sep * 0.8);
      want.set(mx + Math.cos(this.orbit) * r, my + 3.2 + sep * 0.1, mz + Math.sin(this.orbit) * r);
      look.set(mx, my + 1.2, mz);
      rate = 2.2;
      lookRate = 4;
    } else if (m.phase === "ko" || m.phase === "done") {
      this.cinePhase = -1;
      const loser = rigs[m.loser].root.position;
      const winner = rigs[m.winner].root.position;
      if (m.phase === "ko" && m.phaseT < 85) {
        this.orbit += dt * 0.5;
        want.set(loser.x + Math.cos(this.orbit) * 7.5, Math.max(1.2, loser.y + 1.6), loser.z + Math.sin(this.orbit) * 7.5);
        look.set(loser.x, loser.y + 0.8, loser.z);
        rate = 4;
      } else {
        // Settle on the winner from the front.
        const f = m.fighters[m.winner];
        const fx = Math.sin(f.yaw);
        const fz = Math.cos(f.yaw);
        want.set(winner.x + fx * 4.4 + fz * 1.4, winner.y + 1.5, winner.z + fz * 4.4 - fx * 1.4);
        look.set(winner.x, winner.y + 1.35, winner.z);
        rate = 3;
        fov = 0.8;
      }
    } else if (!foe) {
      // Nobody to fight: follow from behind, and swing round to look where the hero is going.
      this.cinePhase = -1;
      const moving = Math.hypot(hero.vel.x, hero.vel.z) > 1 || hero.state === "chase";
      const turn = angleDiff(hero.yaw, this.yaw);
      // Running toward the camera does not spin it round: you can back away from something and keep it in view.
      if (moving && Math.abs(turn) < 2.3) this.yaw += turn * (1 - Math.exp(-1.7 * dt));
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      want.set(me.x - fx * 9, me.y + 3.6, me.z - fz * 9);
      look.set(me.x + fx * 5, me.y + 1.3, me.z + fz * 5);
      rate = 5;
      lookRate = 8;
      if (hero.state === "chase") fov = 1.1;
      if (m.phase === "intro") {
        rate = 2.4;
        lookRate = 5;
      }
    } else {
      this.cinePhase = -1;
      this.framing = true;
      const dx = them.x - me.x;
      const dz = them.z - me.z;
      const dh = Math.hypot(dx, dz);
      const midX = (me.x + them.x) / 2;
      const midY = (me.y + them.y) / 2;
      const midZ = (me.z + them.z) / 2;
      if (dh > 0.6) {
        const line = Math.atan2(dx, dz);
        // If the two have swapped ends (a slip behind, a chase straight past), the camera stays
        // where it is and they swap sides of the screen. Swinging round to follow would spin the view.
        if (wasFraming && Math.abs(angleDiff(line, this.yaw)) > Math.PI / 2) {
          this.yaw += Math.PI;
          this.side = -this.side;
        }
        this.yaw += angleDiff(line, this.yaw) * (1 - Math.exp(-6.5 * dt));
      }
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      if (!wasFraming) {
        // Coming in from another shot: take whichever side the camera is already on.
        const across = (this.pos.x - midX) * fz - (this.pos.z - midZ) * fx;
        if (Math.abs(across) > 1.5) this.side = across > 0 ? 1 : -1;
      }
      // A crowd needs more room in the frame than one rival does.
      let crowd = 0;
      for (const g of m.fighters) {
        if (g.team !== hero.team && g.awake && isUp(g) && Math.hypot(g.pos.x - hero.pos.x, g.pos.z - hero.pos.z) < 14) crowd++;
      }
      const wide = Math.min(1, Math.max(0, crowd - 1) / 4);
      // Far enough back to hold both of them, with room at the edges, and one thrown high.
      const span = Math.max(dh / 2, Math.abs(them.y - me.y) * 0.9) + 2.4 + wide * 2.6;
      const dist = Math.min(36, Math.max(4.8, span / this.tanH));
      // Out to the side (right of forward is (fz, -fx)), and a little toward the rival's end,
      // so that the player's own fighter is seen from the front quarter.
      const lean = dist * 0.2;
      want.set(midX + fz * this.side * dist + fx * lean, midY + 1.5 + dist * 0.2 + wide * 1.2, midZ - fx * this.side * dist + fz * lean);
      look.set(midX, midY + 1.1, midZ);
      rate = 6;
      lookRate = 10;
      const state = m.fighters[view].state;
      if (state === "chase" || state === "blasted" || state === "zip") fov = 1.05;
      if (m.phase === "intro") {
        rate = 2.4;
        lookRate = 5;
      }
    }

    want.y = Math.max(0.5, want.y);
    if (cut) {
      this.pos.copyFrom(want);
      this.look.copyFrom(look);
    } else {
      Vector3.LerpToRef(this.pos, want, 1 - Math.exp(-rate * dt), this.pos);
      Vector3.LerpToRef(this.look, look, 1 - Math.exp(-lookRate * dt), this.look);
    }
    this.fov += (fov - this.fov) * (1 - Math.exp(-8 * dt));

    const s = shake * shake * 0.5;
    const jx = (Math.random() - 0.5) * s;
    const jy = (Math.random() - 0.5) * s;
    const jz = (Math.random() - 0.5) * s;
    this.camera.position.set(this.pos.x + jx, this.pos.y + jy, this.pos.z + jz);
    this.camera.setTarget(new Vector3(this.look.x + jx * 0.5, this.look.y + jy * 0.5, this.look.z + jz * 0.5));
    this.camera.fov = this.fov;
  }
}
