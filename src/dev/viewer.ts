import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import { loadModels, ModelBody } from "../render/model";
import { choosePose, JOINTS, type Pose, type RigClock } from "../render/poses";
import { ModelSkin } from "../render/skin";
import { createMatch } from "../sim/match";
import type { FState, MoveId } from "../sim/types";

// A bare page for looking at a character model, in any of the game's poses.
//
//   viewer.html                 the prepared sheriff, shaded and posed as the game does it
//   viewer.html?model=witch     the prepared witch, the same way
//   viewer.html?file=some.glb   a model exactly as it came from the generator (a path the dev server can serve)
//
// Run `npm run dev` and open it there. It is not part of the built game.
const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.62, 0.6, 0.66, 1);
const cam = new TargetCamera("cam", new Vector3(0, 1, -3), scene);
cam.minZ = 0.01;
cam.fov = 0.6;
const light = new HemisphericLight("sun", new Vector3(0.4, 1, -0.6), scene);
light.intensity = 1.6;
light.groundColor = new Color3(0.35, 0.3, 0.4);

const params = new URLSearchParams(location.search);
const file = params.get("file");
/** A raw model stands about one unit tall; the game's stands two metres. */
const unit = file ? 1 : 2;
const api = { ready: false, meshes: [] as AbstractMesh[], scene, error: "", view, paint, info, pose, hand, missing: [] as string[] };
(window as unknown as { __v: typeof api }).__v = api;
let skin: ModelSkin | null = null;
let body: ModelBody | null = null;

/** Looks at the model from `deg` degrees round it (0 is the front). Sizes are in body heights. */
function view(deg: number, height = 0.5, span = 1.15, lift = 0, side = 0): void {
  const a = (deg * Math.PI) / 180;
  const d = (span * unit) / Math.tan(cam.fov / 2) / 1.6;
  cam.position.set(Math.sin(a) * d + side * unit, (height + lift) * unit, Math.cos(a) * d);
  cam.setTarget(new Vector3(side * unit, height * unit, 0));
}

/** Looks closely at one of the prepared model's hands, from `deg` degrees round it. */
function hand(side: "L" | "R", deg: number, dist = 0.7): void {
  const node = side === "L" ? body?.handL : body?.handR;
  if (!node) return;
  scene.render();
  const at = node.getAbsolutePosition();
  const a = (deg * Math.PI) / 180;
  cam.position.set(at.x + Math.sin(a) * dist, at.y + dist * 0.25, at.z + Math.cos(a) * dist);
  cam.setTarget(at.clone());
}

/** Gives every part of a raw model its own flat colour, or one colour for all. */
function paint(mode: "parts" | "clay"): string[] {
  const legend: string[] = [];
  api.meshes.forEach((mesh, i) => {
    const mat = new StandardMaterial(`paint${i}`, scene);
    const c = mode === "clay" ? new Color3(0.78, 0.74, 0.7) : Color3.FromHSV((i * 137.5) % 360, 0.55 + (0.4 * ((i * 7) % 3)) / 2, 0.95 - (0.3 * ((i * 5) % 3)) / 2);
    mat.diffuseColor = c;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
    legend.push(`${mesh.name} ${c.toHexString()}`);
  });
  return legend;
}

function info(): unknown {
  const b = scene.getWorldExtends((m) => api.meshes.includes(m));
  return {
    parts: api.meshes.length,
    min: b.min.asArray().map((v) => +v.toFixed(3)),
    max: b.max.asArray().map((v) => +v.toFixed(3)),
    bones: scene.skeletons.map((s) => s.bones.length),
  };
}

/** Puts the model into one of the game's poses, by name, through the same code the game uses. */
function pose(name: string): void {
  const m = createMatch(1, { kits: [params.get("model") === "witch" ? "witch" : "hunter", "outlaw"], opening: false });
  m.phase = "fight";
  const f = m.fighters[0];
  const clock: RigClock = { phase: 0, time: 1, tumble: 0, recoil: 0, brace: 0 };
  let speed = 0;
  const attack = (move: MoveId, mf: number): void => {
    f.state = "attack";
    f.move = move;
    f.mf = mf;
  };
  const state = (st: FState): void => {
    f.state = st;
  };
  if (name === "run1") (speed = 6.5), (clock.phase = 1.2);
  else if (name === "run2") (speed = 6.5), (clock.phase = 4.3);
  else if (name === "side1") (speed = 6), (clock.phase = 1.2), (f.vel.x = 6);
  else if (name === "side2") (speed = 6), (clock.phase = 3.1), (f.vel.x = 6);
  else if (name === "side3") (speed = 6), (clock.phase = 3.1), (f.vel.x = -6);
  else if (name === "back1") (speed = 5), (clock.phase = 1.4), (f.vel.z = -5);
  else if (name === "back2") (speed = 5), (clock.phase = 4.5), (f.vel.z = -5);
  else if (name === "whip") attack("w1", 7);
  else if (name === "pulse") attack("h1", 8);
  else if (name === "circle") attack("circle", 4);
  else if (name === "chant") state("steady");
  else if (name === "backhand") attack("a2", 9);
  else if (name === "blast") attack("armBlast", 13);
  else if (name === "clap") attack("thunderclap", 20);
  else if (name === "lariat") attack("lariat", 12);
  else if (name === "guard") state("guard");
  else if (name === "steady") state("steady");
  else if (name === "shoot") f.shotPose = 14;
  else if (name === "hit") state("hitstun");
  else if (name === "blasted") state("blasted"), (clock.tumble = 0.6);
  else if (name === "down") state("knockdown");
  else if (name === "knees") state("downed");
  else if (name === "jump") (f.grounded = false), (f.vel.y = 6);
  const res = choosePose(f, m, clock, speed);
  const zero = { y: 0 } as Pose;
  for (const j of JOINTS) zero[j] = [0, 0, 0];
  const p = name === "rest" ? zero : res.pose;
  const spin = name === "rest" ? ([0, 0, 0] as const) : res.spin;
  if (body) body.pose(p, spin, p.y, name === "rest" || res.holstered, f.state === "attack" || f.state === "guard");
  else if (skin) skin.apply(p, spin, p.y / 2);
}

async function start(): Promise<void> {
  if (file) {
    const res = await SceneLoader.ImportMeshAsync("", "/", file, scene);
    api.meshes = res.meshes.filter((m) => m.getTotalVertices() > 0);
    skin = new ModelSkin(res.meshes[0] as unknown as TransformNode);
    api.missing = skin.missing;
  } else {
    const kit = params.get("model") === "witch" ? "witch" : "hunter";
    const asset = await new Promise<Parameters<Parameters<typeof loadModels>[1]>[1]>((done) => loadModels(scene, (k, a) => k === kit && done(a)));
    body = new ModelBody(scene, asset, 0, { aura: kit === "witch" ? "#c77dff" : "#ffd24a" });
    api.meshes = body.root.getChildMeshes(false);
    (api as unknown as { body: ModelBody }).body = body;
  }
  view(0);
  api.ready = true;
}
start().catch((e) => {
  api.error = String(e);
});
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
