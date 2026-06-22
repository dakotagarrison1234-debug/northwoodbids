/* ───────────────────────────────────────────────────────────
   Auction Arcade — procedural Web Audio SFX (no asset files).
   One lazily-created AudioContext, made on the first user gesture
   (the Start tap) to satisfy browser autoplay rules. All sounds
   are synthesized with oscillators + gain envelopes so there is
   nothing to download. A master gain doubles as the mute switch.
   ─────────────────────────────────────────────────────────── */

const MUTE_KEY = "northwood_arcade_muted";

export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      this._muted = localStorage.getItem(MUTE_KEY) === "1";
    }
  }

  get muted() {
    return this._muted;
  }

  /** Must be called from within a user-gesture handler the first time. */
  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      type WinAudio = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext || (window as WinAudio).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }
    // Browsers may auto-suspend; resume on every gesture-driven sound.
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call once from the Start handler to unlock audio. */
  unlock() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (typeof window !== "undefined") localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.01);
    }
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  /** Low-level helper: a single enveloped oscillator tone. */
  private tone(
    type: OscillatorType,
    freq: number,
    dur: number,
    when = 0,
    peak = 0.6,
    glideTo?: number,
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo != null) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    // quick attack, exponential decay -> "blip" feel
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Gavel "thud" — low square+triangle blip with quick decay. */
  thud() {
    this.tone("square", 130, 0.12, 0, 0.55, 70);
    this.tone("triangle", 80, 0.18, 0, 0.5, 48);
  }

  /** Win "ding" — rising; pitch climbs with the combo. */
  ding(combo: number) {
    const base = 520 + Math.min(combo, 12) * 55;
    this.tone("triangle", base, 0.18, 0, 0.5, base * 1.5);
    this.tone("sine", base * 2, 0.22, 0.02, 0.3, base * 3);
  }

  /** Bullseye — brighter triple sparkle. */
  bullseye(combo: number) {
    const base = 660 + Math.min(combo, 12) * 50;
    this.tone("triangle", base, 0.16, 0, 0.5, base * 1.4);
    this.tone("sine", base * 1.5, 0.2, 0.05, 0.4, base * 2.2);
    this.tone("sine", base * 2.25, 0.24, 0.1, 0.35, base * 3);
  }

  /** Miss "buzz" — detuned saw drop. */
  buzz() {
    this.tone("sawtooth", 200, 0.22, 0, 0.4, 70);
    this.tone("square", 160, 0.22, 0.01, 0.3, 55);
  }

  /** Short descending game-over tune. */
  gameOver() {
    const notes = [392, 330, 262, 196];
    notes.forEach((n, i) => this.tone("triangle", n, 0.28, i * 0.16, 0.45, n * 0.98));
  }

  /** Celebratory little arpeggio for a new personal best. */
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone("triangle", n, 0.3, i * 0.12, 0.45, n * 1.01));
  }

  close() {
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}
