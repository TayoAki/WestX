import type { Input } from "../input/input";
import type { Difficulty } from "../sim/ai";
import { KITS, type KitId } from "../sim/kits";
import { C } from "../sim/moves";
import { STATUSES, type Button, type Match, type SimEvent } from "../sim/types";
import { CLASSES, PLAYABLE } from "./classes";
import "./hud.css";

// The HUD is plain HTML over the canvas: crisp text at any resolution and easy to restyle.

export type Screen = "menu" | "fight" | "pause" | "result";

export interface ResultStats {
  won: boolean;
  /** The loser was roped rather than shot. */
  alive: boolean;
  bounty: number;
  seconds: number;
  bestCombo: number;
}

/** Controls every class shares, shown under each class's own list. */
const SHARED_MOVES = `<li><kbd>W A S D</kbd> Move. W closes in, A and D circle</li><li><kbd>Space</kbd> Jump <kbd>R</kbd> Ultimate <kbd>F</kbd> Awaken</li>`;
const SHARED_NOTES = `<p class="fine"><b>The standoff.</b> Every duel opens with one. Wait for the bell, then shoot first.</p>`;
const SHARED_LEGEND = `<span><kbd>Space</kbd>jump</span><span><kbd>R</kbd>ultimate</span><span><kbd>F</kbd>awaken</span><span><kbd>H</kbd>hide</span>`;

const money = (n: number): string => `$${n.toLocaleString("en-US")}`;

interface SideEls {
  hp: HTMLElement;
  trail: HTMLElement;
  hpTrack: HTMLElement;
  meter: HTMLElement;
  meterTrack: HTMLElement;
  awaken: HTMLElement;
  ready: HTMLElement;
  pips: HTMLElement[];
  dashes: HTMLElement[];
  cyl: HTMLElement;
  chambers: HTMLElement[];
  tags: HTMLElement[];
  combo: HTMLElement;
  comboN: HTMLElement;
  comboD: HTMLElement;
  lastHits: number;
}

export class Hud {
  onStart: (mode: "duel" | "training", difficulty: Difficulty, kit: KitId) => void = () => {};
  onResume: () => void = () => {};
  onRematch: () => void = () => {};
  onMenu: () => void = () => {};
  onPause: () => void = () => {};
  onMute: () => boolean = () => false;

  private root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private sides: SideEls[] = [];
  private announceTimer = 0;
  private legendOn = true;
  private view = 0;
  /** The class picked on the menu. */
  private kit: KitId = "hunter";
  private screen: Screen = "menu";

  constructor(
    private app: HTMLElement,
    input: Input,
  ) {
    const root = document.createElement("div");
    root.id = "ui";
    const chambers = Array.from({ length: C.AMMO }, (_, i) => `<b style="--i:${i}"></b>`).join("");
    const side = (i: number, name: string) => `
      <div class="side p${i}">
        <div class="nameplate"><span data-name="${i}">${name}</span><small data-sub="${i}"></small><small class="ready" data-ready="${i}" hidden>Awaken ready</small></div>
        <div class="track hp" data-hptrack="${i}"><i class="trail" data-trail="${i}"></i><i class="fill" data-hp="${i}"></i></div>
        <div class="row">
          <div class="cyl" data-cyl="${i}" title="Rounds in the cylinder">${chambers}</div>
          <div class="track meter" data-metertrack="${i}" title="Nerve"><i class="fill" data-meter="${i}"></i></div>
          <div class="pips" data-pips="${i}" title="Escapes from a combo">${"<b></b>".repeat(4)}</div>
          <div class="dashes" data-dashes="${i}" title="Dashes">${"<b></b>".repeat(3)}</div>
        </div>
        <div class="track awaken"><i class="fill" data-awaken="${i}"></i></div>
        <div class="tags" data-tags="${i}">${STATUSES.map((k) => `<span class="tag ${k}" hidden>${k}</span>`).join("")}</div>
      </div>`;
    root.innerHTML = `
      <div class="letterbox top"></div>
      <div class="letterbox bottom"></div>
      <div class="speedlines"></div>
      <div class="awakened-tint"></div>
      <div class="whiteout" data-el="whiteout"></div>
      <div class="bars" data-el="bars" hidden>${side(0, "Hunter")}${side(1, "Rival")}</div>
      <div class="stagearea">
        <button class="pausebtn" data-el="pausebtn" aria-label="Pause" hidden>II</button>
        <div class="combo p0" data-combo="0" hidden><b></b><span>hits</span><em></em></div>
        <div class="combo p1" data-combo="1" hidden><b></b><span>hits</span><em></em></div>
        <div class="announce" data-el="announce" hidden></div>
        <div class="prompt" data-el="prompt" hidden></div>
        <div class="reload" data-el="reload" hidden>
          <p>Reload: press <kbd>K</kbd> in the gold</p>
          <div class="gauge"><i class="zone" data-el="reloadZone"></i><i class="mark" data-el="reloadMark"></i></div>
        </div>
        <div class="verdict" data-el="verdict" hidden>
          <p>Dead or alive?</p>
          <div class="options">
            <button data-b="shot"><kbd>K</kbd> Dead <b>${money(C.BOUNTY_DEAD)}</b></button>
            <button data-b="special"><kbd>E</kbd> Alive <b>${money(C.BOUNTY_ALIVE)}</b></button>
          </div>
          <div class="timer"><i data-el="verdictTimer"></i></div>
        </div>
        <div class="legend" data-el="legend" hidden></div>
      </div>
      <div class="touch" data-el="touch" hidden>
        <div class="stickzone" data-el="stickzone"><div class="stick" data-el="stick" hidden><i data-el="knob"></i></div></div>
        <div class="pad">
          <button class="small" data-b="steady" data-pad="steady">Steady</button>
          <button class="small" data-b="special" data-pad="special">Lariat</button>
          <button class="small" data-b="ult">Ult</button>
          <button class="small" data-b="awaken">Awaken</button>
          <button data-b="guard" data-pad="guard">Brace</button>
          <button data-b="dash" data-pad="dash">Charge</button>
          <button class="big" data-b="strike">Strike</button>
          <button data-b="shot">Shot</button>
          <button data-b="jump">Jump</button>
        </div>
      </div>
      <div class="screen" data-el="menu">
        <div class="poster split">
          <div class="col">
            <p class="eyebrow">Combat prototype · placeholder art</p>
            <h1>WestX<small>Duel Box</small></h1>
            <div class="choices">
              <span class="label">Play as</span>
              ${PLAYABLE.map((k) => `<button class="pick" data-kit="${k}" aria-pressed="false"><b>${CLASSES[k].title}</b><span>${CLASSES[k].pitch}</span></button>`).join("")}
            </div>
            <div class="choices">
              <span class="label">Duel a rival</span>
              <button class="btn" data-start="easy">Easy</button>
              <button class="btn" data-start="normal">Normal</button>
              <button class="btn" data-start="hard">Hard</button>
            </div>
            <div class="choices">
              <button class="btn quiet" data-start="training">Training: rival stands still</button>
            </div>
          </div>
          <div class="col">
            <div class="rule"></div>
            <ul class="moves" data-el="menuMoves"></ul>
            <div data-el="menuNotes"></div>
            <p class="fine">A gamepad works too, and touch controls appear on phones. <button class="btn quiet" data-el="mute" style="flex:none;min-height:0;padding:2px 10px;font-size:14px">Sound: on</button></p>
          </div>
        </div>
      </div>
      <div class="screen" data-el="pause" hidden>
        <div class="poster split">
          <div class="col">
            <h2>Paused</h2>
            <div class="choices">
              <button class="btn" data-el="resume">Resume</button>
              <button class="btn" data-el="restart">Restart</button>
              <button class="btn quiet" data-el="quit">Menu</button>
            </div>
          </div>
          <div class="col">
            <div class="rule"></div>
            <ul class="moves" data-el="pauseMoves"></ul>
            <div data-el="pauseNotes"></div>
          </div>
        </div>
      </div>
      <div class="screen" data-el="result" hidden>
        <div class="poster narrow">
          <p class="eyebrow" data-el="resultEyebrow"></p>
          <h2 data-el="resultTitle"></h2>
          <div class="stats">
            <div><b data-el="statBounty"></b>bounty</div>
            <div><b data-el="statTime"></b>duel</div>
            <div><b data-el="statCombo"></b>best combo</div>
          </div>
          <div class="choices">
            <button class="btn" data-el="rematch">Rematch</button>
            <button class="btn quiet" data-el="tomenu">Menu</button>
          </div>
        </div>
      </div>`;
    app.appendChild(root);
    this.root = root;

    root.querySelectorAll<HTMLElement>("[data-el]").forEach((n) => (this.el[n.dataset.el!] = n));
    const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
    for (let i = 0; i < 2; i++) {
      const combo = q(`[data-combo="${i}"]`);
      const cyl = q(`[data-cyl="${i}"]`);
      this.sides.push({
        hp: q(`[data-hp="${i}"]`),
        trail: q(`[data-trail="${i}"]`),
        hpTrack: q(`[data-hptrack="${i}"]`),
        meter: q(`[data-meter="${i}"]`),
        meterTrack: q(`[data-metertrack="${i}"]`),
        awaken: q(`[data-awaken="${i}"]`),
        ready: q(`[data-ready="${i}"]`),
        pips: [...q(`[data-pips="${i}"]`).children] as HTMLElement[],
        dashes: [...q(`[data-dashes="${i}"]`).children] as HTMLElement[],
        cyl,
        chambers: [...cyl.children] as HTMLElement[],
        tags: [...q(`[data-tags="${i}"]`).children] as HTMLElement[],
        combo,
        comboN: combo.querySelector("b")!,
        comboD: combo.querySelector("em")!,
        lastHits: 0,
      });
    }

    root.querySelectorAll<HTMLElement>("[data-start]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.start!;
        if (v === "training") this.onStart("training", "dummy", this.kit);
        else this.onStart("duel", v as Difficulty, this.kit);
      }),
    );
    root.querySelectorAll<HTMLElement>("[data-kit]").forEach((b) => b.addEventListener("click", () => this.pick(b.dataset.kit as KitId)));
    this.pick(this.kit);
    this.el.resume.addEventListener("click", () => this.onResume());
    this.el.restart.addEventListener("click", () => this.onRematch());
    this.el.quit.addEventListener("click", () => this.onMenu());
    this.el.rematch.addEventListener("click", () => this.onRematch());
    this.el.tomenu.addEventListener("click", () => this.onMenu());
    this.el.pausebtn.addEventListener("click", () => this.onPause());
    this.el.mute.addEventListener("click", () => this.setMuteLabel(this.onMute()));

    this.setupTouch(input);
  }

  setMuteLabel(muted: boolean): void {
    this.el.mute.textContent = muted ? "Sound: off" : "Sound: on";
  }

  private setupTouch(input: Input): void {
    const show = () => {
      this.el.touch.dataset.on = "1";
      this.refreshTouch();
    };
    if (window.matchMedia("(pointer: coarse)").matches) show();
    window.addEventListener("touchstart", show, { once: true, passive: true });

    // Every element tagged with a button name feeds that button: the touch pad and the verdict choices.
    this.root.querySelectorAll<HTMLElement>("[data-b]").forEach((btn) => {
      const b = btn.dataset.b as Button;
      const down = (e: PointerEvent) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        input.touch.held.add(b);
        btn.classList.add("down");
      };
      const up = () => {
        input.touch.held.delete(b);
        btn.classList.remove("down");
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
    });

    const zone = this.el.stickzone;
    const stick = this.el.stick;
    const knob = this.el.knob;
    let id = -1;
    let ox = 0;
    let oy = 0;
    const R = 46;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx *= R / l;
        dy *= R / l;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.touch.mx = dx / R;
      input.touch.my = -dy / R;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      stick.hidden = true;
      input.touch.mx = 0;
      input.touch.my = 0;
    };
    zone.addEventListener("pointerdown", (e) => {
      if (id !== -1) return;
      e.preventDefault();
      id = e.pointerId;
      zone.setPointerCapture(id);
      const rect = zone.getBoundingClientRect();
      ox = e.clientX;
      oy = e.clientY;
      stick.style.left = `${ox - rect.left}px`;
      stick.style.top = `${oy - rect.top}px`;
      knob.style.transform = "";
      stick.hidden = false;
    });
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  private refreshTouch(): void {
    this.el.touch.hidden = !(this.el.touch.dataset.on === "1" && this.screen === "fight");
  }

  setScreen(screen: Screen, playing: boolean): void {
    this.screen = screen;
    this.el.menu.hidden = screen !== "menu";
    this.el.pause.hidden = screen !== "pause";
    this.el.result.hidden = screen !== "result";
    // In attract mode the bars stay off so the menu reads cleanly over the fight.
    this.el.bars.hidden = !playing;
    this.el.pausebtn.hidden = screen !== "fight";
    this.el.legend.hidden = !(screen === "fight" && this.legendOn);
    if (!playing) {
      for (const s of this.sides) s.combo.hidden = true;
      for (const key of ["announce", "prompt", "reload", "verdict"]) this.el[key].hidden = true;
    }
    this.refreshTouch();
    // Move focus to the first choice so the keyboard works straight away.
    const active = screen === "menu" ? this.el.menu : screen === "pause" ? this.el.pause : screen === "result" ? this.el.result : null;
    active?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }

  toggleLegend(): void {
    this.legendOn = !this.legendOn;
    this.el.legend.hidden = !(this.screen === "fight" && this.legendOn);
  }

  /** Selects a class on the menu and shows what its buttons do. */
  private pick(kit: KitId): void {
    this.kit = kit;
    this.root.querySelectorAll<HTMLElement>("[data-kit]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kit === kit)));
    this.showClass(kit);
  }

  /** Fills every place that describes the player's class: the lists, the legend, the touch labels. */
  private showClass(kit: KitId): void {
    const c = CLASSES[kit];
    for (const where of ["menuMoves", "pauseMoves"]) this.el[where].innerHTML = c.moves + SHARED_MOVES;
    for (const where of ["menuNotes", "pauseNotes"]) this.el[where].innerHTML = c.notes + SHARED_NOTES;
    this.el.legend.innerHTML = c.legend + SHARED_LEGEND;
    this.root.querySelectorAll<HTMLElement>("[data-pad]").forEach((b) => {
      b.textContent = c.touch[b.dataset.pad as keyof typeof c.touch];
    });
  }

  setNames(player: string, rival: string, sub: string): void {
    this.root.querySelector('[data-name="0"]')!.textContent = player;
    this.root.querySelector('[data-name="1"]')!.textContent = rival;
    this.root.querySelector('[data-sub="1"]')!.textContent = sub;
  }

  /** Call when a new match starts so bars snap to full with no trailing animation. */
  reset(view: number, kit: KitId): void {
    this.view = view;
    this.showClass(kit);
    for (const s of this.sides) {
      s.lastHits = 0;
      s.combo.hidden = true;
      s.trail.style.transition = "none";
      s.trail.style.transform = "scaleX(1)";
      void s.trail.offsetWidth;
      s.trail.style.transition = "";
    }
    for (const key of ["announce", "prompt", "reload", "verdict"]) this.el[key].hidden = true;
    this.app.classList.remove("cine", "fast", "awake-0", "awake-1");
  }

  announce(text: string, kind = "", ms = 900): void {
    const a = this.el.announce;
    a.textContent = text;
    a.className = `announce ${kind}`;
    a.hidden = false;
    void a.offsetWidth;
    a.classList.add("show");
    window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => (a.hidden = true), ms);
  }

  showResult(stats: ResultStats): void {
    this.el.resultEyebrow.textContent = stats.won ? "Bounty collected" : "Bounty lost";
    this.el.resultTitle.textContent = stats.won
      ? stats.alive
        ? "Brought in alive"
        : "Brought in dead"
      : stats.alive
        ? "You were roped"
        : "You were shot down";
    this.el.statBounty.textContent = stats.won ? money(stats.bounty) : "$0";
    const s = Math.round(stats.seconds);
    this.el.statTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    this.el.statCombo.textContent = `${stats.bestCombo}`;
  }

  /** Flashes a short state on the player's cylinder, such as a perfect reload. */
  private pulse(side: number, cls: string): void {
    const c = this.sides[side].cyl;
    c.classList.remove("perfect", "fumble");
    void c.offsetWidth;
    c.classList.add(cls);
  }

  onEvent(e: SimEvent, m: Match, playing: boolean): void {
    if (e.type === "standoffBell") this.flash();
    if (!playing) return;
    const mine = (id: number) => id === this.view;
    switch (e.type) {
      case "phase":
        if (e.phase === "fight" && m.opts.training) this.announce("Training", "small", 900);
        break;
      case "standoffStart":
        if (!e.opening) this.announce("Standoff", "small", 1100);
        break;
      case "standoffBell":
        this.announce("Draw!", "ember", 700);
        break;
      case "standoffFlinch":
        if (mine(e.id)) this.announce("Too soon", "small ember", 800);
        break;
      case "standoffEnd":
        if (e.trade) this.announce("Dead heat", "small", 900);
        else if (e.winner >= 0) this.announce(mine(e.winner) ? "Clean shot" : "Outdrawn", mine(e.winner) ? "small fulgur" : "small ember", 1000);
        break;
      case "reloadEnd":
        if (e.perfect) this.pulse(e.id, "perfect");
        break;
      case "reloadFumble":
        this.pulse(e.id, "fumble");
        break;
      case "hit":
        if (e.perfect) this.announce("Perfect guard", "small fulgur", 700);
        break;
      case "deflect":
        if (e.back) this.announce(mine(e.id) ? "Sent back" : "Deflected", "small fulgur", 700);
        break;
      case "armCatch":
        this.announce(mine(e.id) ? "Caught" : "Caught you", mine(e.id) ? "small fulgur" : "small ember", 700);
        break;
      case "guardBreak":
        this.announce("Guard break", "small ember", 800);
        break;
      case "awaken":
        this.announce(mine(e.id) ? CLASSES[m.fighters[e.id].kit].awakening : "Rival awakens", "fulgur", 1000);
        break;
      case "cineStart":
        this.announce(CLASSES[m.fighters[e.att].kit].ultimate, "", 1300);
        break;
      case "overload":
        this.announce("Overload", "small ember", 800);
        this.flash();
        break;
      case "cineHit":
        if (e.final) this.flash();
        break;
      case "verdictStart":
        if (!mine(e.winner)) this.announce("Beaten", "small ember", 1400);
        break;
      case "ko":
        this.announce(e.alive ? "Brought in alive" : "Brought in dead", e.alive ? "small fulgur" : "small ember", 2400);
        if (!e.alive) this.flash();
        break;
      case "comboEnd": {
        const s = this.sides[e.att];
        if (e.hits >= 2) {
          s.comboN.textContent = `${e.hits}`;
          s.comboD.textContent = `${e.damage} damage`;
          s.combo.hidden = false;
          s.combo.classList.remove("done");
          void s.combo.offsetWidth;
          s.combo.classList.add("done");
        } else s.combo.hidden = true;
        s.lastHits = 0;
        break;
      }
    }
  }

  flash(): void {
    const w = this.el.whiteout;
    w.classList.remove("go");
    void w.offsetWidth;
    w.classList.add("go");
  }

  /** Per-frame refresh of bars and state-driven overlays. */
  update(m: Match, playing: boolean): void {
    const app = this.app;
    const me = m.fighters[this.view];
    app.classList.toggle("fast", playing && (me.state === "chase" || me.state === "zip"));
    app.classList.toggle("awake-0", m.fighters[0].awakened > 0);
    app.classList.toggle("awake-1", m.fighters[1].awakened > 0);
    // Black bars for anything staged: the ultimate, a standoff, the verdict.
    app.classList.toggle("cine", !!m.cine || !!m.standoff || m.phase === "verdict");
    if (!playing) return;

    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const s = this.sides[i];
      const kit = KITS[f.kit];
      const hp = Math.max(0, f.hp / f.maxHp);
      s.hp.style.transform = `scaleX(${hp})`;
      s.trail.style.transform = `scaleX(${hp})`;
      s.hpTrack.classList.toggle("low", hp < 0.3);
      s.meter.style.transform = `scaleX(${f.meter / C.METER})`;
      s.meterTrack.classList.toggle("full", f.meter >= C.METER);
      const aw = f.awakened > 0 ? f.awakened / C.AWAKEN_T : f.awaken / 100;
      s.awaken.style.transform = `scaleX(${aw})`;
      s.ready.hidden = !(f.awaken >= 100 && f.awakened === 0);
      for (let p = 0; p < s.pips.length; p++) {
        s.pips[p].hidden = p >= kit.pips;
        s.pips[p].classList.toggle("on", p < f.pips);
      }
      for (let d = 0; d < s.dashes.length; d++) {
        s.dashes[d].hidden = d >= kit.dashes;
        s.dashes[d].classList.toggle("on", d < f.dashes);
      }

      for (let t = 0; t < s.tags.length; t++) s.tags[t].hidden = f.status[STATUSES[t]] <= 0;
      // The witch has no gun, so no cylinder.
      s.cyl.hidden = kit.gun === "none";
      // The cylinder turns one chamber for every round spent.
      s.cyl.style.transform = `rotate(${(C.AMMO - f.ammo) * (360 / C.AMMO)}deg)`;
      s.cyl.classList.toggle("open", f.reload > 0);
      for (let a = 0; a < s.chambers.length; a++) {
        const loaded = a >= C.AMMO - f.ammo;
        s.chambers[a].classList.toggle("on", loaded);
        s.chambers[a].classList.toggle("hot", loaded && a - (C.AMMO - f.ammo) < f.hot);
      }

      // Live combo counter.
      const hits = f.combo.hits;
      if (hits >= 2 && hits !== s.lastHits) {
        s.comboN.textContent = `${hits}`;
        s.comboD.textContent = `${Math.round(f.combo.damage)} damage`;
        s.combo.hidden = false;
        s.combo.classList.remove("done", "pop");
        void s.combo.offsetWidth;
        s.combo.classList.add("pop");
      }
      s.lastHits = hits;
    }

    // The reload gauge: a marker sweeping toward a gold zone.
    const reloading = me.reload > 0 && m.phase === "fight" && !m.standoff && !m.cine;
    this.el.reload.hidden = !reloading;
    if (reloading) {
      const total = me.reloadT + me.reload;
      this.el.reloadMark.style.left = `${(me.reloadT / total) * 100}%`;
      this.el.reloadZone.style.left = `${(C.RELOAD_PERFECT_FROM / total) * 100}%`;
      this.el.reloadZone.style.width = `${((C.RELOAD_PERFECT_TO - C.RELOAD_PERFECT_FROM + 1) / total) * 100}%`;
      this.el.reload.classList.toggle("tried", me.reloadTried);
    }

    // Standoff instructions, until the bell.
    const s = m.standoff;
    const waiting = !!s && s.t < s.bellAt;
    this.el.prompt.hidden = !waiting;
    if (waiting && s) {
      this.el.prompt.textContent = s.lock[this.view] > 0 ? "You flinched. Your hand will be slow." : "Wait for the bell. Then shoot.";
    }

    // Dead or alive: only the winner chooses.
    const v = m.verdict;
    const choosing = m.phase === "verdict" && !!v && v.choice === null && m.winner === this.view;
    this.el.verdict.hidden = !choosing;
    if (choosing && v) this.el.verdictTimer.style.transform = `scaleX(${Math.max(0, 1 - v.t / C.VERDICT_T)})`;
  }
}
