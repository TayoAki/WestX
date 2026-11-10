import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

// Cel shading: three flat tones, a cool shadow tint, a rim light and distance haze.
// One small shader covers fighters, props and rock.

/** Direction the sunlight travels (from the low sun toward the arena). */
export const LIGHT_DIR = new Vector3(-0.55, -0.42, 0.72).normalize();
export const HAZE = Color3.FromHexString("#f0a878");

ShaderStore.ShadersStore["westxToonVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 viewProjection;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 w = world * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(world) * normal);
  gl_Position = viewProjection * w;
}`;

ShaderStore.ShadersStore["westxToonFragmentShader"] = `
precision highp float;
varying vec3 vN;
varying vec3 vW;
uniform vec3 cameraPosition;
uniform vec3 uColor;
uniform vec3 uShade;
uniform vec3 uLightDir;
uniform vec3 uHaze;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform float uStrata;
void main() {
  vec3 n = normalize(vN);
  float d = dot(n, -uLightDir);
  float band = smoothstep(-0.02, 0.03, d) * 0.6 + smoothstep(0.5, 0.55, d) * 0.4;
  vec3 col = mix(uShade, uColor, band);
  if (uStrata > 0.0) {
    float s = fract(vW.y * uStrata);
    col *= mix(0.82, 1.0, step(0.45, s));
  }
  vec3 v = normalize(cameraPosition - vW);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += rim * 0.22 * smoothstep(-0.3, 0.3, d);
  col = mix(col, uFlashColor, uFlash);
  float haze = clamp((length(cameraPosition - vW) - 70.0) / 300.0, 0.0, 0.8);
  col = mix(col, uHaze, haze);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface ToonOptions {
  /** Horizontal rock bands per metre of height. 0 turns them off. */
  strata?: number;
  /** Overrides the automatic shadow tone. */
  shade?: string;
}

export function makeToon(scene: Scene, name: string, hex: string, opts: ToonOptions = {}): ShaderMaterial {
  const mat = new ShaderMaterial(
    name,
    scene,
    { vertex: "westxToon", fragment: "westxToon" },
    {
      attributes: ["position", "normal"],
      uniforms: ["world", "viewProjection", "cameraPosition", "uColor", "uShade", "uLightDir", "uHaze", "uFlashColor", "uFlash", "uStrata"],
    },
  );
  const color = Color3.FromHexString(hex);
  // Shadows lean violet, the way dusk light does.
  const shade = opts.shade
    ? Color3.FromHexString(opts.shade)
    : new Color3(color.r * 0.5 + 0.03, color.g * 0.42 + 0.02, color.b * 0.6 + 0.08);
  mat.setColor3("uColor", color);
  mat.setColor3("uShade", shade);
  mat.setVector3("uLightDir", LIGHT_DIR);
  mat.setColor3("uHaze", HAZE);
  mat.setColor3("uFlashColor", new Color3(1, 1, 1));
  mat.setFloat("uFlash", 0);
  mat.setFloat("uStrata", opts.strata ?? 0);
  return mat;
}
