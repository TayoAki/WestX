import type { Match, SimEvent } from "../sim/types";

// All sound is synthesised with Web Audio: filtered noise for impacts and
// gunshots, swept tones for dashes and energy. No audio files.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
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

    // A hum that rises with the meter while charging.
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 80;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    osc.connect(lp).connect(gain).connect(this.master);
    osc.start();
    this.hum = { osc, gain };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass", sweepTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
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

  private tone(from: number, to: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
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

  click(): void {
    this.tone(660, 440, 0.07, 0.18, "square");
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
        if (e.heavy) {
          this.tone(420, 50, 0.4, 0.6, "sawtooth");
          this.burst(0.35, 2600, 0.6, 0.6, "lowpass", 200);
        } else {
          this.burst(0.11, 3200, 0.7, 0.42, "lowpass", 500);
          this.tone(900, 120, 0.07, 0.25, "square");
        }
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
        this.burst(e.final ? 0.6 : 0.14, 3000, 0.7, e.final ? 0.9 : 0.55, "lowpass", e.final ? 80 : 400);
        this.tone(e.final ? 300 : 800, 40, e.final ? 0.6 : 0.09, e.final ? 0.8 : 0.3, "square");
        break;
      case "clashStart":
        this.tone(200, 700, 0.5, 0.4, "sawtooth");
        break;
      case "clashEnd":
        this.tone(700, 30, 0.8, 0.9, "sawtooth");
        this.burst(0.8, 2000, 0.5, 0.8, "lowpass", 60);
        break;
      case "ko":
        this.tone(160, 22, 1.2, 1.0);
        this.burst(1.1, 1600, 0.5, 0.8, "lowpass", 50);
        break;
      case "phase":
        if (e.phase === "fight") this.tone(520, 1040, 0.18, 0.3, "square");
        break;
    }
  }

  /** Continuous sounds driven by state rather than events. */
  update(m: Match, view: number): void {
    if (!this.ctx || !this.hum) return;
    const f = m.fighters[view];
    const t = this.ctx.currentTime;
    const charging = f.state === "charge" || f.shotHold >= 12;
    const level = charging ? 0.16 : m.clash ? 0.22 : 0;
    const pitch = m.clash ? 140 + (m.clash.t % 20) * 6 : 70 + f.meter * 2.2 + f.shotHold * 3;
    this.hum.gain.gain.setTargetAtTime(level, t, 0.04);
    this.hum.osc.frequency.setTargetAtTime(pitch, t, 0.05);
  }
}
