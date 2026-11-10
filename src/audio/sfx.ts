import type { Match, SimEvent } from "../sim/types";

// All sound is synthesised with Web Audio: filtered noise for gunshots and
// impacts, struck tones for the bell and the cylinder, wind for the standoff.
// No audio files.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private lastBeat = -1;
  muted = false;

  /** Must be called from a click or key press; browsers block audio before that. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(comp).connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Wind: always running, silent until a standoff or a verdict.
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.wind = { gain, filter };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass", sweepTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private tone(from: number, to: number, dur: number, gain: number, type: OscillatorType = "sine", delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A gunshot: a crack, a low thump, and a tail. `size` 1 is a pistol; 2 is the shot that ends things. */
  private gun(size: number): void {
    this.burst(0.05 + size * 0.04, 3800, 0.6, 0.45 + size * 0.15, "lowpass", 600);
    this.tone(260 - size * 50, 45, 0.08 + size * 0.07, 0.4 + size * 0.2, "square");
    this.burst(0.25 + size * 0.3, 1400, 0.5, 0.18 + size * 0.12, "lowpass", 180, 0.03);
  }

  /** The whine of a round going wide: the sound every western uses. */
  private ricochet(): void {
    this.tone(2600, 700, 0.45, 0.16, "sine", 0.06);
    this.tone(2640, 690, 0.45, 0.1, "triangle", 0.06);
  }

  /** A small metallic tick: a hammer, a chamber, a cylinder turning. */
  private tick(pitch = 2200, gain = 0.2, delay = 0): void {
    this.tone(pitch, pitch * 0.7, 0.03, gain, "square", delay);
    this.burst(0.02, 5000, 2, gain * 0.6, "highpass", undefined, delay);
  }

  /** A church bell: a few inharmonic partials with a long decay. */
  private bell(): void {
    const partials: [number, number, number][] = [
      [392, 0.5, 2.2],
      [784 * 1.02, 0.28, 1.6],
      [1176 * 0.99, 0.18, 1.1],
      [1568 * 1.05, 0.1, 0.7],
      [196, 0.3, 2.4],
    ];
    for (const [f, g, d] of partials) this.tone(f, f * 0.995, d, g, "sine");
    this.burst(0.04, 3000, 1, 0.3, "bandpass");
  }

  /** One plucked note with a bend: a stand-in for a guitar sting. */
  private twang(freq: number, delay = 0): void {
    this.tone(freq * 1.06, freq, 0.9, 0.2, "sawtooth", delay);
    this.tone(freq * 2.12, freq * 2, 0.5, 0.08, "triangle", delay);
  }

  click(): void {
    this.tick(1800, 0.25);
  }

  onEvent(e: SimEvent): void {
    if (!this.ctx) return;
    switch (e.type) {
      case "hit":
        if (e.blocked) {
          if (e.perfect) {
            this.tone(1400, 2600, 0.22, 0.3, "triangle");
            this.burst(0.2, 5000, 2, 0.3, "highpass");
          } else {
            this.burst(0.09, 2400, 3, 0.3);
            this.tone(300, 180, 0.08, 0.2, "square");
          }
        } else if (e.projectile && e.strength === 1) {
          this.burst(0.07, 1800, 2, 0.28);
        } else {
          // A thump plus a crack; heavier hits go lower and longer.
          const s = e.strength;
          this.tone(190 - s * 30, 45, 0.1 + s * 0.06, 0.5 + s * 0.12);
          this.burst(0.07 + s * 0.05, 1500 - s * 250, 0.8, 0.4 + s * 0.12, "lowpass");
          if (s >= 3) this.burst(0.4, 300, 0.7, 0.5, "lowpass", 60);
        }
        break;
      case "shot":
        if (e.kind === "quick" || e.kind === "coup") {
          this.gun(2);
          this.ricochet();
        } else {
          this.gun(e.kind === "fan" ? 0.6 : 1);
        }
        break;
      case "enderShot":
        this.gun(1.5);
        break;
      case "dryFire":
        this.tick(900, 0.3);
        break;
      case "armBlast":
        // Thunder at arm's length: a deep boom under a crackle.
        this.tone(e.big ? 150 : 130, 26, e.big ? 0.9 : 0.55, e.big ? 1.0 : 0.85);
        this.burst(e.big ? 0.7 : 0.4, 2600, 0.5, 0.6, "lowpass", 90);
        this.burst(0.22, 7000, 1.5, 0.4, "highpass");
        break;
      case "deflect":
        this.tick(3200, 0.3);
        this.tone(2900, 2500, 0.12, 0.2, "triangle");
        if (e.back) this.ricochet();
        break;
      case "armCatch":
        this.tone(520, 500, 0.22, 0.4, "square");
        this.tone(790, 760, 0.18, 0.25, "square");
        this.burst(0.08, 2200, 2, 0.4);
        break;
      case "chamber":
        this.tick(2600, 0.14);
        break;
      case "reloadStart":
        // The cylinder swings out and spins.
        for (let i = 0; i < 5; i++) this.tick(1500 + i * 120, 0.1, i * 0.035);
        break;
      case "reloadEnd":
        if (e.perfect) {
          this.tone(1760, 1760, 0.25, 0.22, "sine");
          this.tone(2640, 2640, 0.3, 0.16, "sine", 0.05);
          this.tick(2400, 0.25);
        } else {
          this.tick(1400, 0.22);
          this.tick(900, 0.25, 0.07);
        }
        break;
      case "reloadFumble":
        this.tone(160, 70, 0.18, 0.4, "square");
        this.tick(700, 0.2, 0.05);
        break;
      case "standoffStart":
        this.twang(147);
        this.twang(110, 0.35);
        break;
      case "standoffBell":
        this.bell();
        break;
      case "standoffFlinch":
        this.tone(220, 110, 0.2, 0.3, "sawtooth");
        break;
      case "standoffEnd":
        if (e.trade) {
          this.tone(3000, 1200, 0.3, 0.3, "triangle");
          this.burst(0.3, 6000, 2, 0.35, "highpass");
        }
        break;
      case "verdictStart":
        this.tone(98, 92, 1.4, 0.3, "sawtooth");
        this.twang(98, 0.2);
        break;
      case "slipOut":
        this.tone(1800, 300, 0.12, 0.28);
        this.burst(0.12, 6000, 1, 0.2, "highpass");
        break;
      case "slipIn":
        this.tone(300, 1500, 0.09, 0.25);
        break;
      case "chase":
        this.burst(0.35, 400, 1.2, 0.5, "bandpass", 3600);
        this.tone(120, 520, 0.3, 0.25, "sawtooth");
        break;
      case "chaseCatch":
        this.tone(900, 500, 0.08, 0.3, "square");
        break;
      case "step":
        this.burst(0.14, 900, 1.5, 0.3, "bandpass", 2600);
        break;
      case "jump":
        this.burst(0.1, e.double ? 1800 : 700, 1.5, 0.2, "bandpass", e.double ? 3200 : 1500);
        break;
      case "land":
        if (e.hard) {
          this.tone(110, 35, 0.25, 0.6);
          this.burst(0.3, 500, 0.7, 0.4, "lowpass", 90);
        } else this.burst(0.06, 400, 1, 0.2, "lowpass");
        break;
      case "groundSlam":
        this.tone(140, 28, 0.55, 0.9);
        this.burst(0.6, 900, 0.6, 0.7, "lowpass", 70);
        break;
      case "wallHit":
        this.tone(2200, 300, 0.35, 0.3, "sawtooth");
        this.burst(0.3, 5000, 2, 0.3, "bandpass", 800);
        break;
      case "propBreak":
        this.burst(0.22, 1200, 0.6, 0.5, "lowpass", 200);
        this.tone(260, 90, 0.12, 0.3, "square");
        break;
      case "guardBreak":
        this.burst(0.45, 6500, 1.5, 0.5, "highpass");
        this.tone(900, 110, 0.4, 0.4, "sawtooth");
        break;
      case "lasso":
        if (e.hit) this.tone(500, 1300, 0.12, 0.3, "triangle");
        else this.burst(0.2, 1400, 4, 0.2, "bandpass", 500);
        break;
      case "awaken":
        this.tone(90, 900, 0.9, 0.55, "sawtooth");
        this.burst(1.0, 300, 0.6, 0.6, "lowpass", 5000);
        break;
      case "ultStart":
        this.tone(1200, 200, 0.5, 0.35, "triangle");
        this.burst(0.5, 4000, 3, 0.3, "bandpass", 600);
        break;
      case "cineHit":
        this.gun(e.final ? 2.4 : 1.4);
        if (e.final) this.ricochet();
        break;
      case "ko":
        if (e.alive) {
          this.burst(0.5, 700, 3, 0.4, "bandpass", 250);
          this.twang(196);
          this.twang(247, 0.25);
        } else {
          this.tone(160, 22, 1.2, 1.0);
          this.burst(1.1, 1600, 0.5, 0.8, "lowpass", 50);
        }
        break;
    }
  }

  /** Continuous sound driven by state rather than events: wind and a heartbeat. */
  update(m: Match): void {
    if (!this.ctx || !this.wind) return;
    const t = this.ctx.currentTime;
    const tense = !!m.standoff || m.phase === "verdict";
    this.wind.gain.gain.setTargetAtTime(tense ? 0.22 : 0, t, 0.25);
    this.wind.filter.frequency.setTargetAtTime(380 + Math.sin(t * 0.7) * 140, t, 0.3);

    // A steady heartbeat under the standoff. It does not speed up, so it gives nothing away.
    if (m.standoff && m.standoff.t < m.standoff.bellAt) {
      const beat = Math.floor(m.standoff.t / 44);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        this.tone(70, 42, 0.14, 0.5);
        this.tone(64, 40, 0.12, 0.35, "sine", 0.16);
      }
    } else this.lastBeat = -1;
  }
}
