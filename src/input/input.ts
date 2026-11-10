import { blankInput, BUTTONS, type Button, type InputFrame } from "../sim/types";

// Keyboard, gamepad and touch all feed the same InputFrame.
// The camera needs no mouse, so the whole game is playable from the keyboard.
// Movement is relative to the rival: W closes in, S backs off, A and D circle.

const KEYS: Record<string, Button> = {
  KeyJ: "strike",
  KeyK: "shot",
  KeyL: "dash",
  Space: "jump",
  ShiftLeft: "guard",
  ShiftRight: "guard",
  KeyQ: "charge",
  KeyE: "special",
  KeyU: "special",
  KeyR: "ult",
  KeyI: "ult",
  KeyF: "awaken",
  KeyO: "awaken",
};

const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];

/** Standard-mapping gamepad buttons. */
const PAD: [number, Button][] = [
  [2, "strike"],
  [3, "shot"],
  [1, "dash"],
  [0, "jump"],
  [7, "guard"],
  [6, "charge"],
  [5, "special"],
  [4, "ult"],
  [10, "awaken"],
  [11, "awaken"],
];

export class Input {
  private keys = new Set<string>();
  private mouse = { strike: false, shot: false };
  /** Set by the on-screen touch controls. */
  readonly touch = { mx: 0, my: 0, held: new Set<Button>() };
  onPause: () => void = () => {};
  onToggleHelp: () => void = () => {};
  onMute: () => void = () => {};
  /** False while a menu is up, so typing and clicks there do not reach the game. */
  enabled = false;
  private padPause = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" || e.code === "KeyP") {
        if (!e.repeat) this.onPause();
        return;
      }
      if (e.code === "KeyH" && !e.repeat) this.onToggleHelp();
      if (e.code === "KeyM" && !e.repeat) this.onMute();
      if (!this.enabled) return;
      if (KEYS[e.code] || MOVE_KEYS.includes(e.code)) {
        this.keys.add(e.code);
        // Stop Space and the arrows from scrolling the page.
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.release());
    canvas.addEventListener("mousedown", (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouse.strike = true;
      if (e.button === 2) this.mouse.shot = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.strike = false;
      if (e.button === 2) this.mouse.shot = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  release(): void {
    this.keys.clear();
    this.mouse.strike = false;
    this.mouse.shot = false;
    this.touch.held.clear();
    this.touch.mx = 0;
    this.touch.my = 0;
  }

  read(): InputFrame {
    const inp = blankInput();
    if (!this.enabled) return inp;
    const k = this.keys;
    let mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let my = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    for (const code of k) {
      const b = KEYS[code];
      if (b) inp[b] = true;
    }
    if (this.mouse.strike) inp.strike = true;
    if (this.mouse.shot) inp.shot = true;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pause = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.25) {
        mx += ax;
        my -= ay;
      }
      if (pad.buttons[14]?.pressed) mx -= 1;
      if (pad.buttons[15]?.pressed) mx += 1;
      if (pad.buttons[12]?.pressed) my += 1;
      if (pad.buttons[13]?.pressed) my -= 1;
      for (const [index, b] of PAD) if (pad.buttons[index]?.pressed) inp[b] = true;
      if (pad.buttons[9]?.pressed) pause = true;
    }
    if (pause && !this.padPause) this.onPause();
    this.padPause = pause;

    mx += this.touch.mx;
    my += this.touch.my;
    for (const b of BUTTONS) if (this.touch.held.has(b)) inp[b] = true;

    inp.mx = Math.max(-1, Math.min(1, mx));
    inp.my = Math.max(-1, Math.min(1, my));
    inp.tilt = inp.my;
    return inp;
  }
}
