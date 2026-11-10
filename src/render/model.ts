import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Rendering/outlineRenderer";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import sheriffMesh from "../assets/models/sheriff.glb?inline";
import sheriffTexture from "../assets/models/sheriff.jpg?inline";
import type { Joint } from "./poses";
import { ModelSkin } from "./skin";
import { makeToon, makeToonSkin } from "./toon";

// Real character models, made outside the game and prepared by tools/prep-model.mjs.
//
// A model is bundled into the script as two pieces: a mesh with its skeleton, and
// one texture. Both are decoded from memory, so nothing is fetched at run time.

const OUTLINE = Color3.FromHexString("#1a1320");
/** The game's own rig carries its hips this high; a model's legs may be longer or shorter. */
const RIG_HIPS = 0.95;

/** A model loaded once, ready to be copied onto as many fighters as wear it. */
export interface ModelAsset {
  container: AssetContainer;
  texture: DynamicTexture;
}

function bytesOf(dataUrl: string): Uint8Array<ArrayBuffer> {
  const text = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

async function loadModel(scene: Scene, name: string, mesh: string, image: string): Promise<ModelAsset> {
  // Materials are left out of the load: the game dresses the mesh in its own cel shader.
  const container = await LoadAssetContainerAsync(bytesOf(mesh), scene, {
    pluginExtension: ".glb",
    pluginOptions: { gltf: { skipMaterials: true } },
  });
  // The texture is stored large, for close-ups on a desktop. A phone gets it at half size:
  // it cannot show the difference, and it has far less memory to hold it in.
  const small = scene.getEngine().getCaps().maxTextureSize < 8192 || window.matchMedia("(pointer: coarse)").matches;
  const blob = new Blob([bytesOf(image)], { type: "image/jpeg" });
  const whole = await createImageBitmap(blob);
  const picture = small && whole.width > 2048 ? await createImageBitmap(blob, { resizeWidth: whole.width / 2, resizeHeight: whole.height / 2, resizeQuality: "high" }) : whole;
  const texture = new DynamicTexture(`${name}Tex`, { width: picture.width, height: picture.height }, scene, true);
  texture.getContext().drawImage(picture, 0, 0);
  // A model file counts texture rows from the top, so the image goes up as it is.
  texture.update(false);
  picture.close();
  return { container, texture };
}

/** The sheriff: the lawman's body. */
export const loadSheriff = (scene: Scene): Promise<ModelAsset> => loadModel(scene, "sheriff", sheriffMesh, sheriffTexture);

export interface BodyOptions {
  /** How tall the character stands in the game, hat included, in metres. */
  height: number;
  /** Show the model mirrored, left for right. */
  flip?: boolean;
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
  private drawn: Mesh | null = null;
  private holstered: AbstractMesh | null = null;
  /** How far each hand is closed right now, eased toward what the moment calls for. */
  private grip = { L: 0.35, R: 0.35 };
  private parts: AbstractMesh[];

  constructor(scene: Scene, asset: ModelAsset, id: number, opts: BodyOptions) {
    const copy = asset.container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
    const top = copy.rootNodes[0] as TransformNode;
    this.root = new TransformNode(`f${id}-model`, scene);
    top.parent = this.root;
    this.parts = top.getChildMeshes(false);

    // Measure it standing, then size it to the game.
    const { min, max } = top.getHierarchyBoundingVectors(true);
    this.scale = opts.height / Math.max(0.01, max.y - min.y);
    this.root.scaling.set(opts.flip ? -this.scale : this.scale, this.scale, this.scale);

    const mat = makeToonSkin(scene, `f${id}-modelMat`, asset.texture, opts.tint);
    this.mats.push(mat);
    for (const mesh of this.parts) {
      mesh.material = mat;
      mesh.isPickable = false;
      // A skinned mesh moves well outside the box it was measured in; never cull it by that box.
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.renderOutline = true;
      // A finer line than the primitives get: she has detail of her own to carry.
      mesh.outlineWidth = 0.013 / this.scale;
      mesh.outlineColor = OUTLINE;
    }
    this.holstered = this.parts.find((m) => m.name === "gun") ?? null;

    this.skin = new ModelSkin(top, opts.flip);
    this.handR = this.skin.hand("R");
    this.handL = this.skin.hand("L");
    this.drawn = this.makeGun(scene, id);
  }

  /**
   * A revolver for the gun hand, shown when the one on her hip is drawn. It is built
   * where the hand is at rest, lying along the forearm, and then handed to the hand to carry.
   */
  private makeGun(scene: Scene, id: number): Mesh | null {
    const hand = this.handR;
    const forearm = this.skin.bone("elR");
    if (!hand || !forearm) return null;
    this.root.computeWorldMatrix(true);
    for (const node of [forearm, hand]) node.computeWorldMatrix(true);
    const wrist = hand.getAbsolutePosition();
    const along = wrist.subtract(forearm.getAbsolutePosition()).normalize();
    // As she was made, arms out and palms to the front: the thumb is up, and the barrel rides on the thumb side.
    const thumb = new Vector3(0, 1, 0);
    const palm = new Vector3(0, 0, 1);
    // Barrel, drum, frame and a wooden grip: enough to read as a revolver at any distance.
    const steel = makeToon(scene, `f${id}-gunMat`, "#8f8fa0");
    const wood = makeToon(scene, `f${id}-gripMat`, "#6b4326");
    const barrel = CreateCylinder(`f${id}-barrel`, { height: 0.17, diameter: 0.028, tessellation: 8 }, scene);
    barrel.rotation.x = Math.PI / 2;
    barrel.bakeCurrentTransformIntoVertices();
    const piece = (mesh: Mesh, mat: ShaderMaterial, x: number, y: number, z: number): Mesh => {
      mesh.parent = barrel;
      mesh.position.set(x, y, z);
      mesh.material = mat;
      return mesh;
    };
    const drum = piece(CreateCylinder(`f${id}-drum`, { height: 0.06, diameter: 0.058, tessellation: 10 }, scene), steel, 0, -0.008, -0.11);
    drum.rotation.x = Math.PI / 2;
    piece(CreateBox(`f${id}-frame`, { width: 0.026, height: 0.05, depth: 0.1 }, scene), steel, 0, -0.02, -0.13);
    const grip = piece(CreateBox(`f${id}-grip`, { width: 0.032, height: 0.1, depth: 0.045 }, scene), wood, 0, -0.075, -0.185);
    grip.rotation.x = -0.3;
    barrel.material = steel;
    for (const mesh of [barrel, ...barrel.getChildMeshes(false)]) {
      mesh.isPickable = false;
      mesh.renderOutline = true;
      mesh.outlineWidth = 0.008;
      mesh.outlineColor = OUTLINE;
    }
    // The look-rotation points a mesh's back along the direction given, so it is given the way back to the wrist.
    barrel.rotationQuaternion = Quaternion.FromLookDirectionLH(along.scale(-1), thumb);
    // The grip sits in the palm, a little past the wrist; the barrel runs on from the knuckles.
    barrel.position = wrist.add(along.scale(0.27)).add(thumb.scale(0.075)).add(palm.scale(0.035));
    barrel.setParent(hand);
    barrel.setEnabled(false);
    return barrel;
  }

  /**
   * Poses the body from the game's joint angles. `sink` is how far the game's rig has
   * dropped its hips, in metres; it is scaled to this model's legs. `fist` closes the
   * off hand, for a punch or a raised guard. `dt` eases the hands; zero snaps them.
   */
  pose(joints: Record<Joint, readonly [number, number, number]>, spin: readonly [number, number, number], sink: number, holstered: boolean, fist = false, dt = 0): void {
    // The gun hand closes round the grip while the gun is out. The other hangs loose until it is needed.
    const want = { L: fist ? 1.2 : 0.35, R: holstered ? 0.35 : 1.05 };
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
