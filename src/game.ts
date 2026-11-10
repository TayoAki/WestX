import { Sfx } from "./audio/sfx";
import { Input } from "./input/input";
import { CameraRig } from "./render/cameraRig";
import { Fx } from "./render/fx";
import { PropsView } from "./render/propsView";
import { KIT_PALETTE, Rig } from "./render/rig";
import { createStage, type Stage } from "./render/stage";
import { AI, type Difficulty } from "./sim/ai";
import type { KitId } from "./sim/kits";
import { createMatch, stepMatch } from "./sim/match";
import { C, MOVES } from "./sim/moves";
import type { InputFrame, Match, SimEvent } from "./sim/types";
import { clone, type V3 } from "./sim/vec";
import { CLASSES, PLAYABLE } from "./ui/classes";
import { Hud } from "./ui/hud";

// Ties the simulation to the screen. The sim advances in fixed 1/60 s ticks;
// rendering runs at the display's rate and interpolates between ticks.

export type Mode = "attract" | "duel" | "training";

export class Game {
  readonly stage: Stage;
  rigs: [Rig, Rig];
  readonly fx: Fx;
  readonly props: PropsView;
  readonly cam: CameraRig;
  readonly hud: Hud;
  readonly input: Input;
  readonly sfx = new Sfx();

  match!: Match;
  mode: Mode = "attract";
  difficulty: Difficulty = "normal";
  /** The class the player picked. */
  kit: KitId = "hunter";
  paused = false;
  /** Test hook: when set, replaces the player's input. */
  inputOverride: InputFrame | null = null;

  private ais: [AI | null, AI | null] = [null, null];
  private acc = 0;
  private timeScale = 1;
  private slowT = 0;
  private prev: [V3, V3] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  private slashDone = [false, false];
  private stats = { bestCombo: 0, fightTicks: 0 };

  constructor(app: HTMLElement, canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.stage = createStage(canvas, params.has("lowres"));
    const scene = this.stage.scene;
    this.rigs = [new Rig(scene, 0, KIT_PALETTE.hunter, "hunter"), new Rig(scene, 1, KIT_PALETTE.outlaw, "outlaw")];
    this.fx = new Fx(scene, this.stage, this.rigs);
    this.props = new PropsView(scene);
    this.cam = new CameraRig(this.stage.camera);
    this.input = new Input(canvas);
    this.hud = new Hud(app, this.input);

    this.hud.onStart = (mode, difficulty, kit) => {
      this.sfx.unlock();
      this.sfx.click();
      this.difficulty = difficulty;
      this.kit = kit;
      this.start(mode);
    };
    this.hud.onResume = () => this.setPaused(false);
    this.hud.onRematch = () => {
      this.sfx.click();
      this.start(this.mode === "attract" ? "duel" : this.mode);
    };
    this.hud.onMenu = () => {
      this.sfx.click();
      this.start("attract");
    };
    this.hud.onPause = () => this.togglePause();
    this.hud.onMute = () => this.toggleMute();
    this.input.onPause = () => this.togglePause();
    this.input.onToggleHelp = () => this.hud.toggleLegend();
    this.input.onMute = () => this.hud.setMuteLabel(this.toggleMute());

    const resize = () => {
      this.stage.engine.resize();
      this.cam.resize(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    };
    window.addEventListener("resize", resize);
    resize();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.mode !== "attract" && !this.paused && this.match.phase !== "done") this.setPaused(true);
    });

    this.start("attract");
  }

  private toggleMute(): boolean {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    return this.sfx.muted;
  }

  get playing(): boolean {
    return this.mode !== "attract";
  }

  start(mode: Mode): void {
    this.mode = mode;
    const seed = (Math.random() * 1e9) | 0;
    // The rival is always a different class from you. Behind the menu, any two classes fight.
    const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    const first: KitId = mode === "attract" ? pick(PLAYABLE) : this.kit;
    const others: KitId[] = [...PLAYABLE.filter((k) => k !== first), ...(mode === "attract" ? [] : (["outlaw"] as KitId[]))];
    const kits: [KitId, KitId] = [first, mode === "training" ? "outlaw" : pick(others)];
    const m = createMatch(seed, { training: mode === "training", kits });
    this.match = m;
    // New classes mean new bodies.
    for (const rig of this.rigs) rig.dispose();
    const scene = this.stage.scene;
    this.rigs = [new Rig(scene, 0, KIT_PALETTE[kits[0]], kits[0]), new Rig(scene, 1, KIT_PALETTE[kits[1]], kits[1])];
    this.fx.setRigs(this.rigs);
    this.ais =
      mode === "attract"
        ? [AI.create(0, "normal", seed + 1), AI.create(1, "hard", seed + 2)]
        : [null, AI.create(1, mode === "training" ? "dummy" : this.difficulty, seed + 2)];
    this.props.build(m);
    this.fx.reset();
    this.fx.setPropKinds(m.props.map((p) => p.kind));
    this.prev = [clone(m.fighters[0].pos), clone(m.fighters[1].pos)];
    this.acc = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.paused = false;
    this.stats = { bestCombo: 0, fightTicks: 0 };
    this.hud.reset(0, kits[0]);
    this.hud.setNames(CLASSES[kits[0]].title, CLASSES[kits[1]].title, mode === "training" ? "training" : this.difficulty);
    this.cam.mode = mode === "attract" ? "attract" : "duel";
    if (mode !== "attract") this.cam.establish();
    this.input.release();
    this.input.enabled = mode !== "attract";
    this.hud.setScreen(mode === "attract" ? "menu" : "fight", this.playing);
    if (mode !== "attract") this.stage.engine.getRenderingCanvas()?.focus();
  }

  togglePause(): void {
    if (this.mode === "attract" || this.match.phase === "done") return;
    this.setPaused(!this.paused);
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.input.release();
    this.input.enabled = !p;
    this.hud.setScreen(p ? "pause" : "fight", true);
    if (!p) this.stage.engine.getRenderingCanvas()?.focus();
  }

  private slow(scale: number, seconds: number): void {
    this.timeScale = scale;
    this.slowT = seconds;
  }

  private handle(e: SimEvent): void {
    this.fx.onEvent(e);
    if (this.playing) this.sfx.onEvent(e);
    this.hud.onEvent(e, this.match, this.playing);
    switch (e.type) {
      case "propBreak":
        this.props.onBreak(e.index);
        break;
      case "hit":
        if (e.perfect) this.slow(0.35, 0.22);
        break;
      case "cineHit":
        if (e.final) this.slow(0.3, 0.6);
        break;
      case "standoffEnd":
        // The moment after the draw hangs in the air.
        if (e.winner >= 0) this.slow(0.2, 0.6);
        else if (e.trade) this.slow(0.3, 0.4);
        break;
      case "ko":
        this.slow(e.alive ? 0.45 : 0.22, e.alive ? 0.8 : 1.5);
        break;
      case "comboEnd":
        if (e.att === 0) this.stats.bestCombo = Math.max(this.stats.bestCombo, e.hits);
        break;
      case "phase":
        if (e.phase === "done") this.finish();
        break;
    }
  }

  private finish(): void {
    if (this.mode === "attract") {
      this.start("attract");
      return;
    }
    this.input.enabled = false;
    const alive = this.match.outcome === "alive";
    this.hud.showResult({
      won: this.match.winner === 0,
      alive,
      bounty: alive ? C.BOUNTY_ALIVE : C.BOUNTY_DEAD,
      seconds: this.stats.fightTicks / 60,
      bestCombo: this.stats.bestCombo,
    });
    this.hud.setScreen("result", true);
  }

  private step(): void {
    const m = this.match;
    this.prev[0] = clone(m.fighters[0].pos);
    this.prev[1] = clone(m.fighters[1].pos);
    const in0 = this.ais[0] ? this.ais[0].think(m) : (this.inputOverride ?? this.input.read());
    const in1 = this.ais[1]!.think(m);
    if (m.phase === "fight") this.stats.fightTicks++;
    for (const e of stepMatch(m, [in0, in1])) this.handle(e);

    // Draw the sweep of each strike once, as it becomes active.
    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const mv = f.state === "attack" && f.move ? MOVES[f.move] : null;
      if (!mv || mv.hits.length === 0 || f.mf < mv.hits[0].from) {
        this.slashDone[i] = false;
        continue;
      }
      if (this.slashDone[i]) continue;
      this.slashDone[i] = true;
      const kind = f.move === "enderLaunch" ? "up" : f.move === "enderSlam" ? "down" : f.move === "s3" ? "spin" : "side";
      this.fx.slash(this.rigs[i], f.yaw, kind);
    }
  }

  private frame(): void {
    const dt = Math.min(0.1, this.stage.engine.getDeltaTime() / 1000);

    if (!this.paused) {
      if (this.slowT > 0) {
        this.slowT -= dt;
        if (this.slowT <= 0) this.timeScale = 1;
      }
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= C.DT && steps < 5) {
        this.step();
        this.acc -= C.DT;
        steps++;
      }
      // Too far behind (a hidden tab, a slow device): drop the backlog rather than fast-forward.
      if (steps === 5) this.acc = 0;
    }

    const alpha = this.paused ? 1 : Math.min(1, this.acc / C.DT);
    const sdt = this.paused ? 0 : dt * this.timeScale;
    const cur = this.match;
    for (let i = 0; i < 2; i++) {
      const f = cur.fighters[i];
      const p = this.prev[i];
      // A jump of many metres in one tick is a teleport, not motion: do not smear it.
      const far = Math.hypot(f.pos.x - p.x, f.pos.y - p.y, f.pos.z - p.z) > 6;
      const a = far ? 1 : alpha;
      const x = p.x + (f.pos.x - p.x) * a;
      const y = p.y + (f.pos.y - p.y) * a;
      const z = p.z + (f.pos.z - p.z) * a;
      this.rigs[i].update(f, cur, sdt, x, y, z);
      this.stage.setShadow(i, x, y, z, f.state === "slip" ? 0 : 1);
    }
    this.fx.update(sdt, cur, alpha);
    this.cam.update(dt, cur, this.rigs, this.fx.shake, 0);
    this.hud.update(cur, this.playing);
    if (this.playing) this.sfx.update(cur);
    this.stage.update(dt);
    this.stage.scene.render();
  }

  run(): void {
    this.stage.engine.runRenderLoop(() => this.frame());
  }
}
