import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import sheriffMesh from "../assets/models/sheriff.glb?inline";
import sheriffTexture from "../assets/models/sheriff.jpg?inline";
import witchMesh from "../assets/models/witch.glb?inline";
import witchTexture from "../assets/models/witch.jpg?inline";
import type { KitId } from "../sim/kits";
import type { Joint } from "./poses";
import { ModelSkin } from "./skin";
import { makeGlow } from "./stage";
import { makeToon, makeToonSkin } from "./toon";

// Real character models, made outside the game and prepared by tools/prep-model.mjs.
//
// A model is bundled into the script as two pieces: a mesh with its skeleton, and
// one texture. Both are decoded from memory, so nothing is fetched at run time.

const OUTLINE = Color3.FromHexString("#1a1320");
/** The game's own rig carries its hips this high; a model's legs may be longer or shorter. */
const RIG_HIPS = 0.95;

/** What the game needs to know about a model to put a class in it. */
interface ModelSpec {
  name: string;
  mesh: string;
  texture: string;
  /** How tall the character stands in the game, hat or hood included, in metres. */
  height: number;
  /** Show the model mirrored, left for right. */
  flip: boolean;
  /** What the right hand carries. A revolver is in the hand when drawn and on the hip when not. */
  held: "revolver" | "staff" | "none";
}

/** The classes that have a model. Every other fighter is drawn from primitives. */
const SPECS: Partial<Record<KitId, ModelSpec>> = {
  // The sheriff. She is shown mirrored, so her brass arm is the brace arm and her gun hand is free.
  hunter: { name: "sheriff", mesh: sheriffMesh, texture: sheriffTexture, height: 2, flip: true, held: "revolver" },
  // The hooded one. Her staff is the game's: she came without.
  witch: { name: "witch", mesh: witchMesh, texture: witchTexture, height: 1.9, flip: false, held: "staff" },
};

/** A model loaded once, ready to be copied onto as many fighters as wear it. */
export interface ModelAsset {
  spec: ModelSpec;
  container: AssetContainer;
  texture: DynamicTexture;
}

function bytesOf(dataUrl: string): Uint8Array<ArrayBuffer> {
  const text = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

async function loadModel(scene: Scene, spec: ModelSpec): Promise<ModelAsset> {
  // Materials are left out of the load: the game dresses the mesh in its own cel shader.
  const container = await LoadAssetContainerAsync(bytesOf(spec.mesh), scene, {
    pluginExtension: ".glb",
    pluginOptions: { gltf: { skipMaterials: true } },
  });
  // The texture is stored large, for close-ups on a desktop. A phone gets it at half size:
  // it cannot show the difference, and it has far less memory to hold it in.
  const small = scene.getEngine().getCaps().maxTextureSize < 8192 || window.matchMedia("(pointer: coarse)").matches;
  const blob = new Blob([bytesOf(spec.texture)], { type: "image/jpeg" });
  const whole = await createImageBitmap(blob);
  const picture = small && whole.width > 2048 ? await createImageBitmap(blob, { resizeWidth: whole.width / 2, resizeHeight: whole.height / 2, resizeQuality: "high" }) : whole;
  const texture = new DynamicTexture(`${spec.name}Tex`, { width: picture.width, height: picture.height }, scene, true);
  texture.getContext().drawImage(picture, 0, 0);
  // A model file counts texture rows from the top, so the image goes up as it is.
  texture.update(false);
  picture.close();
  return { spec, container, texture };
}

/**
 * Loads every character model there is. Each arrives on its own, and `ready` is called as it
 * does. One that fails is reported and skipped: its class goes on being drawn from primitives.
 */
export function loadModels(scene: Scene, ready: (kit: KitId, asset: ModelAsset) => void): void {
  for (const [kit, spec] of Object.entries(SPECS) as [KitId, ModelSpec][]) {
    loadModel(scene, spec).then(
      (asset) => ready(kit, asset),
      (e) => console.warn(`The ${spec.name}'s model did not load; that class stays as drawn.`, e),
    );
  }
}

export interface BodyOptions {
  /** The wearer's colour, for anything the game adds that glows. */
  aura: string;
  /** Multiplies the texture, to tell two wearers of the same model apart. */
  tint?: string;
}

/** One fighter's copy of a model: its own skeleton and materials, posed from the game's joints. */
export class ModelBody {
  /** Parent this to the fighter. It stands at the fighter's feet, facing the way the fighter faces. */
  readonly root: TransformNode;
  readonly mats: ShaderMaterial[] = [];
  /** The hands as shown: the gun hand is on the right, the brace on the left. */
  readonly handR: TransformNode | null;
  readonly handL: TransformNode | null;
  private skin: ModelSkin;
  private scale: number;
  private held: ModelSpec["held"];
  /** The revolver in the hand, and the one on the hip. Only one of the two is ever shown. */
  private drawn: Mesh | null = null;
  private holstered: AbstractMesh | null = null;
  /** How far each hand is closed right now, eased toward what the moment calls for. */
  private grip = { L: 0.35, R: 0.35 };

  constructor(scene: Scene, asset: ModelAsset, id: number, opts: BodyOptions) {
    const spec = asset.spec;
    this.held = spec.held;
    const copy = asset.container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
    const top = copy.rootNodes[0] as TransformNode;
    this.root = new TransformNode(`f${id}-model`, scene);
    top.parent = this.root;
    const parts = top.getChildMeshes(false);

    // Measure it standing, then size it to the game.
    const { min, max } = top.getHierarchyBoundingVectors(true);
    this.scale = spec.height / Math.max(0.01, max.y - min.y);
    this.root.scaling.set(spec.flip ? -this.scale : this.scale, this.scale, this.scale);

    const mat = makeToonSkin(scene, `f${id}-modelMat`, asset.texture, opts.tint);
    this.mats.push(mat);
    for (const mesh of parts) {
      mesh.material = mat;
      mesh.isPickable = false;
      // A skinned mesh moves well outside the box it was measured in; never cull it by that box.
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.renderOutline = true;
      // A finer line than the primitives get: a model has detail of its own to carry.
      mesh.outlineWidth = 0.013 / this.scale;
      mesh.outlineColor = OUTLINE;
    }
    this.holstered = parts.find((m) => m.name === "gun") ?? null;

    this.root.computeWorldMatrix(true);
    this.skin = new ModelSkin(top, spec.flip);
    this.handR = this.skin.hand("R");
    this.handL = this.skin.hand("L");
    if (spec.held === "revolver") this.drawn = this.makeGun(scene, id);
    else if (spec.held === "staff") this.makeStaff(scene, id, opts.aura);
  }

  /** Outlines a piece the game has built, and hands it to the right hand to carry from where it lies now. */
  private give(meshes: Mesh[], hand: TransformNode, width: number): void {
    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.renderOutline = true;
      mesh.outlineWidth = width;
      mesh.outlineColor = OUTLINE;
    }
    meshes[0].setParent(hand);
  }

  /**
   * A revolver for the gun hand, shown when the one on her hip is drawn. It is built where the
   * hand lies at rest: grip in the palm, barrel running on from the knuckles on the thumb side.
   */
  private makeGun(scene: Scene, id: number): Mesh | null {
    const hand = this.handR;
    const hold = this.skin.holds.R;
    if (!hand || !hold) return null;
    const steel = makeToon(scene, `f${id}-gunMat`, "#8f8fa0");
    const wood = makeToon(scene, `f${id}-gripMat`, "#6b4326");
    const barrel = CreateCylinder(`f${id}-barrel`, { height: 0.17, diameter: 0.028, tessellation: 8 }, scene);
    barrel.rotation.x = Math.PI / 2;
    barrel.bakeCurrentTransformIntoVertices();
    barrel.material = steel;
    const piece = (mesh: Mesh, mat: ShaderMaterial, x: number, y: number, z: number): Mesh => {
      mesh.parent = barrel;
      mesh.position.set(x, y, z);
      mesh.material = mat;
      return mesh;
    };
    const drum = piece(CreateCylinder(`f${id}-drum`, { height: 0.06, diameter: 0.058, tessellation: 10 }, scene), steel, 0, -0.008, -0.11);
    drum.rotation.x = Math.PI / 2;
    const frame = piece(CreateBox(`f${id}-frame`, { width: 0.026, height: 0.05, depth: 0.1 }, scene), steel, 0, -0.02, -0.13);
    const grip = piece(CreateBox(`f${id}-grip`, { width: 0.032, height: 0.1, depth: 0.045 }, scene), wood, 0, -0.075, -0.185);
    grip.rotation.x = -0.3;
    // The look-rotation points a mesh's back along the direction given, so it is given the way back to the wrist.
    barrel.rotationQuaternion = Quaternion.FromLookDirectionLH(hold.along.scale(-1), hold.thumb);
    barrel.position = hold.wrist.add(hold.along.scale(0.27)).add(hold.thumb.scale(0.075)).add(hold.palm.scale(0.035));
    this.give([barrel, drum, frame, grip], hand, 0.008);
    barrel.setEnabled(false);
    return barrel;
  }

  /**
   * The witch's staff, with a hex-light at its head. It runs on from her forearm, on the thumb
   * side, most of it past her fist: so the light is at the far end, where she points, and
   * overhead when she raises her arms.
   */
  private makeStaff(scene: Scene, id: number, aura: string): void {
    const hand = this.handR;
    const hold = this.skin.holds.R;
    if (!hand || !hold) return;
    const staff = CreateCylinder(`f${id}-staff`, { height: 1.4, diameter: 0.05, tessellation: 7 }, scene);
    staff.rotation.x = Math.PI / 2;
    staff.bakeCurrentTransformIntoVertices();
    staff.material = makeToon(scene, `f${id}-staffMat`, "#4a3528");
    const orb = CreateSphere(`f${id}-orb`, { diameter: 0.2, segments: 8 }, scene);
    orb.parent = staff;
    orb.position.set(0, 0, 0.74);
    orb.material = makeGlow(scene, `f${id}-orbMat`, aura);
    orb.isPickable = false;
    staff.rotationQuaternion = Quaternion.FromLookDirectionLH(hold.along.scale(-1), hold.thumb);
    staff.position = hold.wrist.add(hold.along.scale(0.27)).add(hold.thumb.scale(0.07)).add(hold.palm.scale(0.03));
    this.give([staff], hand, 0.012);
  }

  /**
   * Poses the body from the game's joint angles. `sink` is how far the game's rig has
   * dropped its hips, in metres; it is scaled to this model's legs. `fist` closes the
   * off hand, for a punch or a raised guard. `dt` eases the hands; zero snaps them.
   */
  pose(joints: Record<Joint, readonly [number, number, number]>, spin: readonly [number, number, number], sink: number, holstered: boolean, fist = false, dt = 0): void {
    // The right hand closes round whatever it is holding. The other hangs loose until it is needed.
    const holding = this.held === "staff" || (this.held === "revolver" && !holstered);
    const want = { L: fist ? 1.2 : 0.35, R: holding ? 1.05 : 0.35 };
    const k = dt > 0 ? 1 - Math.exp(-18 * dt) : 1;
    for (const side of ["L", "R"] as const) {
      this.grip[side] += (want[side] - this.grip[side]) * k;
      this.skin.curl[side] = this.grip[side];
    }
    this.skin.apply(joints, spin, (sink / RIG_HIPS) * this.skin.hipsY);
    this.drawn?.setEnabled(!holstered);
    this.holstered?.setEnabled(holstered);
  }

  dispose(): void {
    // The texture is shared with every other copy; only this copy's materials go.
    for (const mesh of this.root.getChildMeshes(false)) {
      const own = mesh.material;
      mesh.material = null;
      if (own && !this.mats.includes(own as ShaderMaterial)) own.dispose(true, false);
    }
    for (const mat of this.mats) mat.dispose(true, false);
    this.root.dispose(false, false);
  }
}
