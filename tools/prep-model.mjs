// Turns a character model from a generator into what the game loads: one mesh
// and one texture, as small as they will go.
//
// A generated character arrives as dozens of separate parts, each with its own
// texture and bump map. Drawn that way it costs dozens of draw calls and many
// megabytes. This packs every part's colour texture into a single image, moves
// the parts' texture coordinates to match, welds the parts into one skinned
// mesh, drops the bump maps (cel shading does not use them), and compresses
// what is left.
//
// usage: node tools/prep-model.mjs <in.glb> <out-base> [--keep part=name] [--stiffen part=0.8] [--atlas 2048] [--cell 1024]
//   writes <out-base>.glb and <out-base>.jpg
//   --keep leaves a part as its own mesh, so the game can show and hide it (a holstered gun).
//   --stiffen is for a long coat or a skirt. A generator ties such a part to the legs, and where it
//     meets the rest of the coat at the waist a wide stance tears the two apart. This hands the legs'
//     pull on the part over to the hips: all of it at the waist, so the seam holds, easing down to the
//     share given at the hem, so the hem still swings with the stride. 1 makes the whole part hang rigid.
//     It also takes the arms' hold off anything below the waist: an automatic rig will sometimes tie
//     a coat's skirt to a forearm, and then every punch drags the coat across the body.
import { writeFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { prune, quantize } from "@gltf-transform/functions";
import sharp from "sharp";

const args = process.argv.slice(2);
const [src, outBase] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const keep = new Map(args.flatMap((a, i) => (a === "--keep" ? [args[i + 1].split("=")] : [])));
const stiffen = new Map(args.flatMap((a, i) => (a === "--stiffen" ? [[args[i + 1].split("=")[0], +args[i + 1].split("=")[1]]] : [])));
const ATLAS = +opt("atlas", 2048);
const CELL = +opt("cell", 1024);
const PAD = 4;
if (!src || !outBase) {
  console.error("usage: node tools/prep-model.mjs <in.glb> <out-base> [--keep part=name] [--atlas 2048] [--cell 1024]");
  process.exit(1);
}

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const doc = await io.read(src);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];

// ---------------------------------------------------------------- one image for every part

const materials = root.listMaterials();
const cells = [];
for (const mat of materials) {
  const tex = mat.getBaseColorTexture();
  if (tex) {
    const [w, h] = tex.getSize() ?? [256, 256];
    cells.push({ mat, image: Buffer.from(tex.getImage()), w, h });
  } else {
    // No texture: a swatch of the part's flat colour.
    const [r, g, b] = mat.getBaseColorFactor();
    const flat = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: r * 255, g: g * 255, b: b * 255 } } }).png().toBuffer();
    cells.push({ mat, image: flat, w: 32, h: 32 });
  }
}

/** Lays the cells out in rows, tallest first. Returns false if they do not fit. */
function pack(scale) {
  const boxes = cells
    .map((c) => ({ c, w: Math.max(16, Math.round(Math.min(c.w, CELL) * scale)), h: Math.max(16, Math.round(Math.min(c.h, CELL) * scale)) }))
    .sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0;
  let y = 0;
  let row = 0;
  for (const b of boxes) {
    if (x + b.w > ATLAS) {
      x = 0;
      y += row;
      row = 0;
    }
    if (y + b.h > ATLAS) return false;
    Object.assign(b.c, { x, y, pw: b.w, ph: b.h });
    x += b.w;
    row = Math.max(row, b.h);
  }
  return true;
}
let scale = 1;
while (!pack(scale)) scale *= 0.9;

const layers = [];
for (const c of cells) {
  // Each cell is ringed with copies of its own edge, so neighbours never bleed into it when the image is shrunk.
  const input = await sharp(c.image)
    .resize(c.pw - PAD * 2, c.ph - PAD * 2, { fit: "fill" })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: "copy" })
    .png()
    .toBuffer();
  layers.push({ input, left: c.x, top: c.y });
}
const atlas = await sharp({ create: { width: ATLAS, height: ATLAS, channels: 3, background: { r: 60, g: 50, b: 60 } } })
  .composite(layers)
  .jpeg({ quality: 84, mozjpeg: true })
  .toBuffer();
writeFileSync(`${outBase}.jpg`, atlas);

// ---------------------------------------------------------------- one mesh for every part

const cellOf = new Map(cells.map((c) => [c.mat, c]));
const groups = new Map();
let parent = null;
let skin = null;
let outside = 0;
const partNodes = root.listNodes().filter((n) => n.getMesh());
const bones = (partNodes[0]?.getSkin()?.listJoints() ?? []).map((j) => j.getName());
const hipsBone = bones.findIndex((n) => /^(Hips|mixamorig:Hips|pelvis)$/.test(n));
const waist = hipsBone >= 0 ? partNodes[0].getSkin().listJoints()[hipsBone].getWorldTranslation()[1] : 0;
const legBones = new Set(bones.flatMap((n, i) => (/UpperLeg|LowerLeg|UpLeg|(Left|Right)Leg|Foot|Toe|thigh|calf/i.test(n) ? [i] : [])));
const armBones = new Set(bones.flatMap((n, i) => (/Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Pinky|clavicle/i.test(n) ? [i] : [])));

/**
 * Moves a share of the legs' hold on a vertex, and all of the arms' if `noArms`, to the hips.
 * Returns the four strongest bones and their weights.
 */
function hang(joints, weights, share, noArms) {
  const pull = new Map();
  let moved = 0;
  joints.forEach((j, k) => {
    if (weights[k] <= 0) return;
    const give = legBones.has(j) ? weights[k] * share : noArms && armBones.has(j) ? weights[k] : 0;
    moved += give;
    pull.set(j, (pull.get(j) ?? 0) + weights[k] - give);
  });
  if (moved > 0) pull.set(hipsBone, (pull.get(hipsBone) ?? 0) + moved);
  const top = [...pull].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((t, [, w]) => t + w, 0) || 1;
  while (top.length < 4) top.push([0, 0]);
  return [top.map(([j]) => j), top.map(([, w]) => w / sum)];
}
for (const node of partNodes) {
  const name = keep.get(node.getName()) ?? "body";
  if (!groups.has(name)) groups.set(name, { position: [], normal: [], uv: [], joints: [], weights: [], indices: [], count: 0 });
  const g = groups.get(name);
  parent ??= node.getParentNode();
  skin ??= node.getSkin();
  if (node.getSkin() !== skin) throw new Error(`${node.getName()} is on a different skeleton`);
  if (node.getMatrix().some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-6)) throw new Error(`${node.getName()} is moved from its skeleton; that is not handled`);
  for (const prim of node.getMesh().listPrimitives()) {
    const c = cellOf.get(prim.getMaterial());
    const pos = prim.getAttribute("POSITION");
    const nor = prim.getAttribute("NORMAL");
    const uv = prim.getAttribute("TEXCOORD_0");
    const jnt = prim.getAttribute("JOINTS_0");
    const wgt = prim.getAttribute("WEIGHTS_0");
    if (!pos || !nor || !jnt || !wgt) throw new Error(`${node.getName()} is missing positions, normals or skin weights`);
    const n = pos.getCount();
    const low = pos.getMin([])[1];
    for (let i = 0; i < n; i++) {
      g.position.push(...pos.getElement(i, []));
      g.normal.push(...nor.getElement(i, []));
      let joints = jnt.getElement(i, []);
      let weights = wgt.getElement(i, []);
      const hem = stiffen.get(node.getName());
      if (hem !== undefined && hipsBone >= 0) {
        // All of the legs' pull goes to the hips at the waist; less and less of it toward the hem.
        const y = pos.getElement(i, [])[1];
        const up = Math.min(1, Math.max(0, (y - low) / Math.max(1e-6, waist - low)));
        [joints, weights] = hang(joints, weights, hem + (1 - hem) * up, y < waist);
      }
      g.joints.push(...joints);
      g.weights.push(...weights);
      // Move the texture coordinate from the part's own image to its cell in the shared one.
      let [u, v] = uv ? uv.getElement(i, []) : [0.5, 0.5];
      if (u < -0.001 || u > 1.001 || v < -0.001 || v > 1.001) outside++;
      u = Math.min(1, Math.max(0, u));
      v = Math.min(1, Math.max(0, v));
      g.uv.push((c.x + PAD + u * (c.pw - PAD * 2)) / ATLAS, (c.y + PAD + v * (c.ph - PAD * 2)) / ATLAS);
    }
    const idx = prim.getIndices();
    if (idx) for (let i = 0; i < idx.getCount(); i++) g.indices.push(idx.getScalar(i) + g.count);
    else for (let i = 0; i < n; i++) g.indices.push(i + g.count);
    g.count += n;
  }
}

const shared = doc.createMaterial("body").setDoubleSided(true);
for (const [name, g] of groups) {
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setMaterial(shared)
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(g.position)))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(g.normal)))
    .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(g.uv)))
    .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(g.joints)))
    .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(g.weights)))
    .setIndices(accessor("SCALAR", g.count < 65536 ? new Uint16Array(g.indices) : new Uint32Array(g.indices)));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setSkin(skin);
  parent.addChild(node);
}
for (const node of partNodes) {
  node.getMesh().dispose();
  node.dispose();
}
for (const mat of materials) mat.dispose();
for (const tex of root.listTextures()) tex.dispose();

// The texture lives outside the file, so nothing in it says the texture coordinates are used. They are.
// Positions are left alone: squeezing them would give each mesh its own copy of the skeleton, in its own units.
await doc.transform(
  prune({ keepAttributes: true }),
  quantize({ pattern: /^(NORMAL|TEXCOORD|WEIGHTS)(_\d+)?$/, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
);
const glb = await io.writeBinary(doc);
writeFileSync(`${outBase}.glb`, glb);

const tris = [...groups.values()].reduce((sum, g) => sum + g.indices.length / 3, 0);
console.log(`parts ${partNodes.length} -> meshes ${groups.size} (${[...groups.keys()].join(", ")})`);
console.log(`triangles ${tris}, vertices ${[...groups.values()].reduce((s, g) => s + g.count, 0)}, bones ${root.listSkins()[0]?.listJoints().length ?? 0}`);
console.log(`texture ${ATLAS}x${ATLAS} from ${cells.length} images at ${Math.round(scale * 100)}% : ${(atlas.length / 1e6).toFixed(2)} MB`);
console.log(`mesh ${(glb.length / 1e6).toFixed(2)} MB`);
if (outside) console.log(`warning: ${outside} texture coordinates were outside their image and were pulled in`);
