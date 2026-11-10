import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Joint } from "./poses";

// Puts the game's moves onto a real character model.
//
// The game animates eleven joints by hand: a body, a spine, a head, and two-part
// arms and legs. A character model from a generator arrives with its own skeleton,
// fifty or sixty bones, standing however its maker left it: arms straight out or
// half lowered, palms forward or down. This maps one onto the other. Each of the
// game's joints drives one bone (the spine and neck are spread over a few), and
// every other bone simply follows its parent.
//
// Nothing is assumed about how the model stands. Where each limb points at rest is
// measured, and from that comes the turn that brings it to where the game's rig
// rests: arms at its sides, thumbs forward. Only directions are copied, never
// positions, so a model with longer legs or a shorter back still moves the same way.
//
// The game's rig has no fingers. A model does, and left alone they stay flat, as
// they were made. So the hands are closed here: each can be curled from open to a fist.

type R3 = readonly [number, number, number];

/** The bones each game joint drives, by the names generators give them. First match wins. */
const BONES: Record<Joint, string[][]> = {
  body: [["Hips", "mixamorig:Hips", "pelvis"]],
  // The game bends the back in one place; a model bends it in three.
  spine: [
    ["Spine", "mixamorig:Spine", "spine_01"],
    ["Chest", "mixamorig:Spine1", "spine_02"],
    ["UpperChest", "mixamorig:Spine2", "spine_03"],
  ],
  head: [
    ["Neck", "mixamorig:Neck", "neck_01"],
    ["Head", "mixamorig:Head", "head"],
  ],
  shL: [["Left_UpperArm", "mixamorig:LeftArm", "upperarm_l"]],
  elL: [["Left_LowerArm", "mixamorig:LeftForeArm", "lowerarm_l"]],
  shR: [["Right_UpperArm", "mixamorig:RightArm", "upperarm_r"]],
  elR: [["Right_LowerArm", "mixamorig:RightForeArm", "lowerarm_r"]],
  hipL: [["Left_UpperLeg", "mixamorig:LeftUpLeg", "thigh_l"]],
  knL: [["Left_LowerLeg", "mixamorig:LeftLeg", "calf_l"]],
  hipR: [["Right_UpperLeg", "mixamorig:RightUpLeg", "thigh_r"]],
  knR: [["Right_LowerLeg", "mixamorig:RightLeg", "calf_r"]],
};
const HANDS: Record<"L" | "R", string[]> = {
  L: ["Left_Hand", "mixamorig:LeftHand", "hand_l"],
  R: ["Right_Hand", "mixamorig:RightHand", "hand_r"],
};
const FEET: Record<"L" | "R", string[]> = {
  L: ["Left_Foot", "mixamorig:LeftFoot", "foot_l"],
  R: ["Right_Foot", "mixamorig:RightFoot", "foot_r"],
};

/** Which of the game's joints each one hangs from. */
const PARENT: Record<Joint, Joint | null> = {
  body: null,
  spine: "body",
  head: "spine",
  shL: "spine",
  elL: "shL",
  shR: "spine",
  elR: "shR",
  hipL: "body",
  knL: "hipL",
  hipR: "body",
  knR: "hipR",
};
const ORDER: Joint[] = ["body", "spine", "head", "shL", "elL", "shR", "elR", "hipL", "knL", "hipR", "knR"];
/** The same joint on the other side of the body. */
const ACROSS: Record<Joint, Joint> = {
  body: "body",
  spine: "spine",
  head: "head",
  shL: "shR",
  elL: "elR",
  shR: "shL",
  elR: "elL",
  hipL: "hipR",
  knL: "knR",
  hipR: "hipL",
  knR: "knL",
};
/** The limbs: each joint, the side it is on, and what its bone reaches down to. */
const LIMBS: { joint: Joint; side: "L" | "R"; to: Joint | "hand" | "foot" }[] = [
  { joint: "shL", side: "L", to: "elL" },
  { joint: "elL", side: "L", to: "hand" },
  { joint: "shR", side: "R", to: "elR" },
  { joint: "elR", side: "R", to: "hand" },
  { joint: "hipL", side: "L", to: "knL" },
  { joint: "knL", side: "L", to: "foot" },
  { joint: "hipR", side: "R", to: "knR" },
  { joint: "knR", side: "R", to: "foot" },
];

const DOWN = new Vector3(0, -1, 0);
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const IDENTITY = Quaternion.Identity();
const euler = (e: R3): Quaternion => Quaternion.RotationYawPitchRoll(e[1], e[0], e[2]);

/** The shortest turn that carries one direction onto another. */
function arc(from: Vector3, to: Vector3): Quaternion {
  const dot = Math.min(1, Math.max(-1, Vector3.Dot(from, to)));
  const axis = Vector3.Cross(from, to);
  if (axis.lengthSquared() < 1e-10) {
    if (dot > 0) return Quaternion.Identity();
    // Exactly opposite: any half turn about a line square to it will do.
    const square = Vector3.Cross(from, Math.abs(from.y) < 0.9 ? UP : FORWARD).normalize();
    return Quaternion.RotationAxis(square, Math.PI);
  }
  axis.normalize();
  const angle = Math.acos(dot);
  const q = Quaternion.RotationAxis(axis, angle);
  // Whichever way round the engine counts a turn, make sure this one arrives.
  return Vector3.Dot(from.applyRotationQuaternion(q), to) > 0.999 ? q : Quaternion.RotationAxis(axis, -angle);
}

/** How a hand lies as the model was made: where the wrist is, and which way the forearm, the thumb and the palm point. */
export interface Hold {
  wrist: Vector3;
  along: Vector3;
  thumb: Vector3;
  palm: Vector3;
}

/** A finger bone: the hand it hangs from, as shown, how far along the finger it sits, and the turn that closes it. */
interface Finger {
  hand: Link;
  side: "L" | "R";
  depth: number;
  axis: Vector3;
}
const FINGER = /Index|Middle|Ring|Pinky|Little/i;
const THUMB = /Thumb/i;
/** How far along its finger a bone is, from the name generators give it. */
const fingerDepth = (name: string): number => (/Proximal|1$/.test(name) ? 1 : /Intermediate|2$/.test(name) ? 2 : /Distal$|3$/.test(name) ? 3 : 0);

interface Link {
  node: TransformNode;
  parent: Link | null;
  finger: Finger | null;
  /** How the bone is turned at rest: against its parent, and against the whole model. */
  restLocal: Quaternion;
  restWorld: Quaternion;
  /** The game joint driving this bone, and how much of that joint's turn it takes (the spine is shared out). */
  joint: Joint | null;
  share: number;
  /** For a limb: the turn from how the model holds it at rest to how the game's rig does. */
  turn: Quaternion | null;
  /** Where the bone is turned to this frame, against the whole model. */
  world: Quaternion;
}

export class ModelSkin {
  private links: Link[] = [];
  private hips: Link | null = null;
  /** Height of the hips above the ground at rest, in the model's own units. */
  readonly hipsY: number;
  /** Game joints with no bone to drive, for reporting a model that does not fit. */
  readonly missing: Joint[] = [];
  /** How far each hand is closed, as shown: 0 is flat, as the model was made, and about 1.2 is a fist. */
  readonly curl = { L: 0, R: 0 };
  /** How each hand lies at rest, as shown. Anything the hand is to carry is built against this. */
  readonly holds: Partial<Record<"L" | "R", Hold>> = {};

  /**
   * `root` is the top node of the loaded model, standing at rest, upright and facing forward;
   * everything under it is searched for bones. `flip` is for a model shown mirrored, left for
   * right: a bone named for one side then stands on the other, and is driven by the game's
   * joint for the side it stands on.
   */
  constructor(
    root: TransformNode,
    private flip = false,
  ) {
    const walk = (node: TransformNode, parent: Link | null): void => {
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.RotationYawPitchRoll(node.rotation.y, node.rotation.x, node.rotation.z);
      const restLocal = node.rotationQuaternion.clone();
      const link: Link = {
        node,
        parent,
        finger: null,
        restLocal,
        restWorld: parent ? parent.restWorld.multiply(restLocal) : restLocal.clone(),
        joint: null,
        share: 1,
        turn: null,
        world: IDENTITY.clone(),
      };
      this.links.push(link);
      for (const child of node.getChildTransformNodes(true)) walk(child, link);
    };
    // The loader's own top node turns the file's space into the engine's. Bones start below it.
    for (const child of root.getChildTransformNodes(true)) walk(child, null);

    for (const joint of ORDER) {
      const chain = BONES[flip ? ACROSS[joint] : joint];
      chain.forEach((names, i) => {
        const link = this.links.find((l) => names.includes(l.node.name));
        if (!link) {
          if (i === chain.length - 1) this.missing.push(joint);
          return;
        }
        link.joint = joint;
        link.share = (i + 1) / chain.length;
      });
    }
    this.hips = this.links.find((l) => l.joint === "body") ?? null;
    this.hipsY = this.hips ? this.hips.node.position.y : 0;

    this.measure();
  }

  /** Works out, from how the model stands, the turns that bring its limbs and hands to the game's. */
  private measure(): void {
    const at = (link: Link): Vector3 => {
      link.node.computeWorldMatrix(true);
      return link.node.getAbsolutePosition().clone();
    };
    const linkOf = (node: TransformNode | null): Link | null => (node ? (this.links.find((l) => l.node === node) ?? null) : null);
    const under = (link: Link, top: Link): boolean => {
      for (let up = link.parent; up; up = up.parent) if (up === top) return true;
      return false;
    };

    for (const limb of LIMBS) {
      const link = linkOf(this.bone(limb.joint));
      const hand = linkOf(this.hand(limb.side));
      const end = limb.to === "hand" ? hand : limb.to === "foot" ? linkOf(this.foot(limb.side)) : linkOf(this.bone(limb.to));
      if (!link || !end) continue;
      const along = at(end).subtract(at(link));
      if (along.lengthSquared() < 1e-8) continue;
      // The game's rig rests with every limb hanging straight down.
      link.turn = arc(along.normalize(), DOWN);
      if (limb.to !== "hand" || !hand) continue;
      // And with its thumbs forward, so a raised hand holds a gun upright. Roll the forearm to match.
      const thumb = this.links.find((l) => THUMB.test(l.node.name) && under(l, hand));
      if (!thumb) continue;
      const side = at(thumb).subtract(at(hand)).applyRotationQuaternion(link.turn);
      side.y = 0;
      if (side.lengthSquared() < 1e-6) continue;
      link.turn = arc(side.normalize(), FORWARD).multiply(link.turn);
    }

    for (const side of ["L", "R"] as const) {
      const hand = linkOf(this.hand(side));
      if (!hand) continue;
      const forearm = linkOf(this.bone(side === "L" ? "elL" : "elR"));
      const thumbBone = this.links.find((l) => THUMB.test(l.node.name) && under(l, hand));
      if (forearm) {
        const wrist = at(hand);
        const along = wrist.subtract(at(forearm)).normalize();
        const out = thumbBone ? at(thumbBone).subtract(wrist) : UP.clone();
        const thumb = out.subtract(along.scale(Vector3.Dot(out, along)));
        if (thumb.lengthSquared() > 1e-8) {
          thumb.normalize();
          const right = wrist.x > (this.hips ? at(this.hips).x : 0);
          this.holds[side] = { wrist, along, thumb, palm: Vector3.Cross(along, thumb).scale(right ? 1 : -1) };
        }
      }
      const bones = this.links.filter((l) => FINGER.test(l.node.name) && fingerDepth(l.node.name) > 0 && under(l, hand));
      const knuckle = bones.find((l) => fingerDepth(l.node.name) === 1 && /Middle/i.test(l.node.name)) ?? bones.find((l) => fingerDepth(l.node.name) === 1);
      if (!knuckle) continue;
      const wrist = at(hand);
      const reach = at(knuckle).subtract(wrist).normalize();
      // Fingers bend about the line across the knuckles, which runs the way the thumb sticks out.
      const thumb = this.links.find((l) => THUMB.test(l.node.name) && under(l, hand));
      const out = thumb ? at(thumb).subtract(wrist) : UP.clone();
      const axis = out.subtract(reach.scale(Vector3.Dot(out, reach)));
      if (axis.lengthSquared() < 1e-8) continue;
      axis.normalize();
      // They bend toward the palm. Which way that is depends on which hand it is.
      const right = wrist.x > (this.hips ? at(this.hips).x : 0);
      const palm = Vector3.Cross(reach, axis).scale(right ? 1 : -1);
      const closes = Vector3.Dot(reach.applyRotationQuaternion(Quaternion.RotationAxis(axis, 0.3)), palm) > 0;
      for (const link of bones) link.finger = { hand, side, depth: fingerDepth(link.node.name), axis: closes ? axis : axis.scale(-1) };
    }
  }

  /** The bone a game joint drives. For a joint spread over several, the last of them. */
  bone(joint: Joint): TransformNode | null {
    return this.links.filter((l) => l.joint === joint).pop()?.node ?? null;
  }

  /** The hand on the character's left or right as shown. */
  hand(side: "L" | "R"): TransformNode | null {
    return this.named(HANDS, side);
  }

  private foot(side: "L" | "R"): TransformNode | null {
    return this.named(FEET, side);
  }

  private named(table: Record<"L" | "R", string[]>, side: "L" | "R"): TransformNode | null {
    const names = table[this.flip ? (side === "L" ? "R" : "L") : side];
    return this.links.find((l) => names.includes(l.node.name))?.node ?? null;
  }

  /**
   * The game's space has its right hand on +x; a model file has its left there, so a turn
   * in one is the same turn in the other with two of its parts negated. A model shown
   * mirrored has already been turned round once, and needs no change.
   */
  private toModel(q: Quaternion): Quaternion {
    return this.flip ? q : new Quaternion(q.x, -q.y, -q.z, q.w);
  }

  /**
   * Poses the model. `pose` is the game's joint angles, `spin` an extra turn of the whole
   * body, and `lift` how far the body sits above or below its standing height, in the
   * model's own units.
   */
  apply(pose: Record<Joint, R3>, spin: R3, lift: number): void {
    // Where each of the game's joints points, in the game's space. A parent is always worked out before its children.
    const local = {} as Record<Joint, Quaternion>;
    const world = {} as Record<Joint, Quaternion>;
    for (const j of ORDER) {
      local[j] = j === "body" ? euler([pose.body[0] + spin[0], pose.body[1] + spin[1], pose.body[2] + spin[2]]) : euler(pose[j]);
      const p = PARENT[j];
      world[j] = p ? world[p].multiply(local[j]) : local[j];
    }

    for (const link of this.links) {
      const above = link.parent ? link.parent.world : IDENTITY;
      if (link.joint) {
        const j = link.joint;
        const p = PARENT[j];
        // A bone that shares a joint takes its share of the turn, measured from the joint above.
        const turn = link.share < 1 ? Quaternion.Slerp(IDENTITY, local[j], link.share) : local[j];
        const aim = p ? world[p].multiply(turn) : turn;
        link.world = this.toModel(link.turn ? aim.multiply(link.turn) : aim).multiply(link.restWorld);
      } else if (link.finger && this.curl[link.finger.side] !== 0) {
        // Close the finger toward the palm, about the knuckle line as it lay at rest;
        // wherever the hand has gone since, the bend goes with it.
        const { hand, side, depth, axis } = link.finger;
        const bend = Quaternion.RotationAxis(axis, this.curl[side] * depth);
        const carried = hand.world.multiply(Quaternion.Inverse(hand.restWorld));
        link.world = carried.multiply(this.toModel(bend)).multiply(link.restWorld);
      } else {
        link.world = above.multiply(link.restLocal);
      }
      link.node.rotationQuaternion = Quaternion.Inverse(above).multiply(link.world);
    }
    if (this.hips) this.hips.node.position.y = this.hipsY + lift;
  }
}
