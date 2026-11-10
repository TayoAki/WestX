import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { makeRng } from "../sim/rng";
import type { Match } from "../sim/types";
import { makeToon } from "./toon";

// Breakable set dressing: crates, barrels, cactus and rock spires.

const OUTLINE = Color3.FromHexString("#1a1320");

export class PropsView {
  private nodes: TransformNode[] = [];
  private mats: Record<string, ShaderMaterial>;

  constructor(private scene: Scene) {
    this.mats = {
      wood: makeToon(scene, "propWood", "#b07840"),
      woodDark: makeToon(scene, "propWoodDark", "#7a4a2a"),
      barrel: makeToon(scene, "propBarrel", "#8a4f2e"),
      iron: makeToon(scene, "propIron", "#4a4352"),
      cactus: makeToon(scene, "propCactus", "#5f9a4d"),
      rock: makeToon(scene, "propRock", "#b8674a", { strata: 1.1 }),
    };
  }

  /** Rebuilds the prop meshes for a new match. */
  build(m: Match): void {
    for (const n of this.nodes) n.dispose(false, false);
    this.nodes = [];
    const rng = makeRng(m.props.length * 977 + 13);
    const outlined = (mesh: Mesh, mat: ShaderMaterial, parent: TransformNode, width = 0.03): Mesh => {
      mesh.material = mat;
      mesh.parent = parent;
      mesh.isPickable = false;
      mesh.renderOutline = true;
      mesh.outlineWidth = width;
      mesh.outlineColor = OUTLINE;
      return mesh;
    };
    m.props.forEach((p, i) => {
      const node = new TransformNode(`prop${i}`, this.scene);
      node.position.set(p.pos.x, 0, p.pos.z);
      node.rotation.y = rng.range(0, Math.PI * 2);
      const s = this.scene;
      switch (p.kind) {
        case "crate": {
          const size = p.radius * 1.75;
          outlined(CreateBox(`crate${i}`, { size }, s), this.mats.wood, node).position.y = size / 2;
          const slat = outlined(CreateBox(`slat${i}`, { width: size * 1.04, height: size * 0.16, depth: size * 1.04 }, s), this.mats.woodDark, node, 0);
          slat.position.y = size / 2;
          break;
        }
        case "barrel": {
          outlined(CreateCylinder(`barrel${i}`, { height: p.height, diameter: p.radius * 1.9, tessellation: 12 }, s), this.mats.barrel, node).position.y = p.height / 2;
          for (const y of [0.25, 0.75]) {
            const hoop = outlined(CreateCylinder(`hoop${i}`, { height: 0.08, diameter: p.radius * 1.98, tessellation: 12 }, s), this.mats.iron, node, 0);
            hoop.position.y = p.height * y;
          }
          break;
        }
        case "cactus": {
          outlined(CreateCapsule(`cactus${i}`, { height: p.height, radius: 0.3, tessellation: 9 }, s), this.mats.cactus, node).position.y = p.height / 2;
          for (const side of [-1, 1]) {
            const out = outlined(CreateCapsule(`armA${i}`, { height: 0.75, radius: 0.17, tessellation: 8 }, s), this.mats.cactus, node, 0);
            out.rotation.z = Math.PI / 2;
            out.position.set(side * 0.45, p.height * (side < 0 ? 0.5 : 0.62), 0);
            const up = outlined(CreateCapsule(`armB${i}`, { height: 0.9, radius: 0.17, tessellation: 8 }, s), this.mats.cactus, node);
            up.position.set(side * 0.72, p.height * (side < 0 ? 0.5 : 0.62) + 0.35, 0);
          }
          break;
        }
        case "rock": {
          outlined(
            CreateCylinder(`rock${i}`, { height: p.height, diameterTop: p.radius * 1.1, diameterBottom: p.radius * 2.1, tessellation: 6 }, s),
            this.mats.rock,
            node,
            0.045,
          ).position.y = p.height / 2;
          break;
        }
      }
      node.setEnabled(!p.broken);
      this.nodes.push(node);
    });
  }

  onBreak(index: number): void {
    this.nodes[index]?.setEnabled(false);
  }
}
