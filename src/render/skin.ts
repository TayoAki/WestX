import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Joint } from "./poses";

// Puts the game's moves onto a real character model.
//
// The game animates eleven joints by hand: a body, a spine, a head, and two-part
// arms and legs. A character model from a generator arrives with its own skeleton,
// sixty bones or so, standing in a T-pose. This maps one onto the other: each of
// the game's joints drives one bone (the spine and neck are spread over a few), and
// every other bone, fingers and toes included, simply follows its parent.
//
// Only directions are copied, never positions, so a model with longer legs or a
// shorter back still moves the same way.
//
// The game's rig has no fingers. A model does, and left alone they stay flat, as they
// were made. So the hands are closed here: each can be curled anywhere from open to a fist.

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

/**
 * The model stands with its arms straight out, palms to the front, thumbs up. The game's rig rests
 * with its arms at its sides. These turns bring one to the other, about the axis that points forward.
 * The forearms are also rolled a quarter turn first, so that a hanging hand has its palm to the
 * thigh and a raised one holds a gun upright, the way a person's does.
 */
const FORWARD = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const ARM_DOWN_L = Quaternion.RotationAxis(FORWARD, Math.PI / 2);
const ARM_DOWN_R = Quaternion.RotationAxis(FORWARD, -Math.PI / 2);
const PALM_DOWN = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
const REST_TURN: Partial<Record<Joint, Quaternion>> = {
  shL: ARM_DOWN_L,
  elL: ARM_DOWN_L.multiply(PALM_DOWN),
  shR: ARM_DOWN_R,
  elR: ARM_DOWN_R.multiply(PALM_DOWN),
};

/** A finger bone: whose hand it is on, as shown, and how far along the finger it sits. */
interface Finger {
  hand: Link;
  side: "L" | "R";
  depth: number;
}
const FINGER = /Index|Middle|Ring|Pinky|Little/i;
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
  /** Where the bone is turned to this frame, against the whole model. */
  world: Quaternion;
}

const IDENTITY = Quaternion.Identity();
const euler = (e: R3): Quaternion => Quaternion.RotationYawPitchRoll(e[1], e[0], e[2]);

export class ModelSkin {
  private links: Link[] = [];
  private hips: Link | null = null;
  /** Height of the hips above the ground at rest, in the model's own units. */
  readonly hipsY: number;
  /** Game joints with no bone to drive, for reporting a model that does not fit. */
  readonly missing: Joint[] = [];

  /**
   * `root` is the top node of the loaded model; everything under it is searched for bones.
   * `flip` is for a model shown mirrored, left for right: a bone named for one side then
   * stands on the other, and is driven by the game's joint for the side it stands on.
   */
  constructor(
    root: TransformNode,
    private flip = false,
  ) {
    const walk = (node: TransformNode, parent: Link | null): void => {
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.RotationYawPitchRoll(node.rotation.y, node.rotation.x, node.rotation.z);
      const restLocal = node.rotationQuaternion.clone();
      const link: Link = { node, parent, finger: null, restLocal, restWorld: parent ? parent.restWorld.multiply(restLocal) : restLocal.clone(), joint: null, share: 1, world: IDENTITY.clone() };
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

    // Fingers: every bone of the four fingers, tied to the hand it hangs from. Thumbs are left as made.
    for (const side of ["L", "R"] as const) {
      const hand = this.links.find((l) => l.node === this.hand(side));
      if (!hand) continue;
      for (const link of this.links) {
        const depth = FINGER.test(link.node.name) ? fingerDepth(link.node.name) : 0;
        if (!depth) continue;
        let up = link.parent;
        while (up && up !== hand) up = up.parent;
        if (up === hand) link.finger = { hand, side, depth };
      }
    }
  }

  /** How far each hand is closed, as shown: 0 is flat, as the model was made, and about 1.3 is a fist. */
  readonly curl = { L: 0, R: 0 };

  /** The bone a game joint drives. For a joint spread over several, the last of them. */
  bone(joint: Joint): TransformNode | null {
    return this.links.filter((l) => l.joint === joint).pop()?.node ?? null;
  }

  /** The hand on the character's left or right as shown. */
  hand(side: "L" | "R"): TransformNode | null {
    const names = HANDS[this.flip ? (side === "L" ? "R" : "L") : side];
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
        const rest = REST_TURN[j];
        link.world = this.toModel(rest ? aim.multiply(rest) : aim).multiply(link.restWorld);
      } else if (link.finger && this.curl[link.finger.side] !== 0) {
        // A finger bends toward the palm. As the model was made, arms out and palms to the front, that
        // is a turn about the upright axis; wherever the hand has gone since, the bend goes with it.
        const { hand, side, depth } = link.finger;
        const bend = Quaternion.RotationAxis(UP, (side === "L" ? 1 : -1) * this.curl[side] * depth);
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
