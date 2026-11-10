import { Sfx } from "./audio/sfx";
import { Input } from "./input/input";
import { CameraRig } from "./render/cameraRig";
import { Fx } from "./render/fx";
import { loadSheriff, ModelBody, type ModelAsset } from "./render/model";
import { PropsView } from "./render/propsView";
import { crewPalette, KIT_PALETTE, Rig } from "./render/rig";
import { createStage, type Stage } from "./render/stage";
import { AI, Rabble, type Difficulty } from "./sim/ai";
import type { KitId } from "./sim/kits";
import { createMatch, isUp, stepMatch } from "./sim/match";
import { C, MOVES } from "./sim/moves";
import type { InputFrame, Match, SimEvent } from "./sim/types";
import { clone, type V3 } from "./sim/vec";
import { CLASSES, PLAYABLE } from "./ui/classes";
import { Hud } from "./ui/hud";

// Ties the simulation to the screen. The sim advances in fixed 1/60 s ticks;
// rendering runs at the display's rate and interpolates between ticks.

/**
 * `duel` and `training` are the arena: one rival, one formal fight.
 * `roam` is open country: gangs camped about, and a fight wherever you meet one.
 * `attract` is the duel that plays behind the menu.
 */
export type Mode = "attract" | "duel" | "training" | "roam";

export class Game {
  readonly stage: Stage;
  rigs: Rig[] = [];
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

  /** The sheriff's model, once it has loaded. Until then, and if it never does, the lawman is drawn from primitives. */
  private sheriff: ModelAsset | null = null;
  /** One mind per fighter. The player's own is null. */
  ais: (AI | Rabble | null)[] = [];
  private acc = 0;
  private timeScale = 1;
  private slowT = 0;
  private prev: V3[] = [];
  private slashDone: boolean[] = [];
  private stats = { bestCombo: 0, fightTicks: 0 };

  constructor(app: HTMLElement, canvas: HTMLCanvasElement) {
    const params = new URLSearchParams(location.search);
    this.stage = createStage(canvas, params.has("lowres"));
    const scene = this.stage.scene;
    this.fx = new Fx(scene, this.stage);
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
    loadSheriff(scene).then(
      (asset) => {
        this.sheriff = asset;
        this.dress();
      },
      (e) => console.warn("The sheriff's model did not load; the lawman stays as drawn.", e),
    );
  }

  /** Puts the sheriff's model on every lawman who is not wearing it yet. */
  private dress(): void {
    if (!this.sheriff) return;
    for (const f of this.match.fighters) {
      const rig = this.rigs[f.id];
      if (f.kit !== "hunter" || f.rank === "rabble" || rig.body) continue;
      // She is shown mirrored, so her brass arm is the brace arm and her gun hand is free.
      // A lawman on the other side wears the same model in a colder light.
      rig.wear(new ModelBody(this.stage.scene, this.sheriff, f.id, { height: 2, flip: true, tint: f.id === 0 ? undefined : "#c9b4d8" }));
    }
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
    const m = createMatch(seed, { training: mode === "training", kits, mode: mode === "roam" ? "roam" : "duel" });
    this.match = m;

    // A new cast means new bodies. A crew wears its leader's colours.
    for (const rig of this.rigs) rig.dispose();
    const scene = this.stage.scene;
    this.rigs = m.fighters.map((f) => {
      if (f.rank !== "rabble") return new Rig(scene, f.id, KIT_PALETTE[f.kit], f.kit);
      const leader = m.fighters.find((g) => g.gang === f.gang && g.rank === "named");
      return new Rig(scene, f.id, crewPalette(f.kit, KIT_PALETTE[leader ? leader.kit : "outlaw"]), f.kit, true);
    });
    this.dress();
    this.fx.setRigs(
      this.rigs,
      m.fighters.filter((f) => f.rank !== "rabble").map((f) => f.id),
    );
    this.ais = m.fighters.map((f) => {
      if (f.rank === "rabble") return new Rabble(f.id, seed + 7 * f.id);
      if (f.id === 0) return mode === "attract" ? AI.create(0, "normal", seed + 1) : null;
      return AI.create(f.id, mode === "attract" ? "hard" : mode === "training" ? "dummy" : this.difficulty, seed + 2 + f.id);
    });
    this.stage.setBounds(m.radius);
    this.props.build(m);
    this.fx.reset();
    this.fx.setPropKinds(m.props.map((p) => p.kind));
    this.prev = m.fighters.map((f) => clone(f.pos));
    this.slashDone = m.fighters.map(() => false);
    this.acc = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.paused = false;
    this.stats = { bestCombo: 0, fightTicks: 0 };
    // Behind the menu the demo fight picks its own classes; the menu goes on describing yours.
    this.hud.reset(0, mode === "attract" ? this.kit : kits[0]);
    this.hud.setNames(CLASSES[kits[0]].title, mode === "training" ? "training" : mode === "roam" ? `open country · ${this.difficulty}` : this.difficulty);
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
    const m = this.match;
    const alive = m.outcome === "alive";
    const leaders = m.fighters.filter((f) => f.rank === "named" && f.team !== m.fighters[0].team);
    this.hud.showResult({
      won: isUp(m.fighters[0]),
      alive,
      bounty: m.bounty,
      seconds: this.stats.fightTicks / 60,
      bestCombo: this.stats.bestCombo,
      roam:
        this.mode === "roam"
          ? { leaders: leaders.filter((f) => !isUp(f)).length, of: leaders.length, runDown: m.winner >= 0 && m.fighters[m.winner].rank === "rabble" }
          : undefined,
    });
    this.hud.setScreen("result", true);
  }

  private step(): void {
    const m = this.match;
    const inputs: InputFrame[] = [];
    for (const f of m.fighters) {
      this.prev[f.id] = clone(f.pos);
      const ai = this.ais[f.id];
      if (ai) inputs[f.id] = ai.think(m);
    }
    if (!this.ais[0]) {
      // With nobody to face, the player runs where the camera points.
      const own = this.inputOverride ?? this.input.read();
      inputs[0] = this.inputOverride ? own : { ...own, yaw: this.cam.heading };
    }
    if (m.phase === "fight") this.stats.fightTicks++;
    for (const e of stepMatch(m, inputs)) this.handle(e);

    // Draw the sweep of each strike once, as it becomes active.
    for (const f of m.fighters) {
      const i = f.id;
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
    for (let i = 0; i < cur.fighters.length; i++) {
      const f = cur.fighters[i];
      const p = this.prev[i];
      // A jump of many metres in one tick is a teleport, not motion: do not smear it.
      const far = Math.hypot(f.pos.x - p.x, f.pos.y - p.y, f.pos.z - p.z) > 6;
      const a = far ? 1 : alpha;
      const x = p.x + (f.pos.x - p.x) * a;
      const y = p.y + (f.pos.y - p.y) * a;
      const z = p.z + (f.pos.z - p.z) * a;
      this.rigs[i].update(f, cur, sdt, x, y, z);
    }
    this.fx.update(sdt, cur, alpha);
    this.cam.update(dt, cur, this.rigs, this.fx.shake, 0);
    this.hud.update(cur, this.playing, this.cam.heading);
    if (this.playing) this.sfx.update(cur);
    this.stage.update(dt);
    this.stage.scene.render();
  }

  run(): void {
    this.stage.engine.runRenderLoop(() => this.frame());
  }
}
