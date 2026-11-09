// Original hip hop beats, synthesised live with the Web Audio API: drums
// (kick, snare, hats), a bassline, electric-piano jazz chords and a little
// vinyl crackle, with a swung groove. Nothing is downloaded or licensed.

export interface BeatPreset {
  id: string;
  title: string;
  bpm: number;
  /** Swing for the off 16ths, 0.5 = straight. */
  swing: number;
  /** Chords, one per bar: MIDI notes (bass root first). */
  chords: number[][];
  /** 16-step patterns (1 = hit, 2 = accent). */
  kick: number[];
  snare: number[];
  hat: number[];
  /** Brighter, harder drums for boom bap; softer for lo-fi. */
  punch: number;
}

// Voicings: root in the bass octave, then a rootless 9th/7th voicing around middle C.
export const PRESETS: BeatPreset[] = [
  {
    id: 'beat-late-night',
    title: 'Late Night Film Room',
    bpm: 84,
    swing: 0.6,
    chords: [
      [41, 56, 60, 63, 67], // Fm9
      [46, 56, 61, 65, 68], // Bbm9
      [39, 55, 58, 62, 65], // Eb9
      [44, 55, 60, 63, 67], // Abmaj9
    ],
    kick: [2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1],
    hat: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0],
    punch: 0.6,
  },
  {
    id: 'beat-boom-bap',
    title: 'Boom Bap Tip-off',
    bpm: 92,
    swing: 0.58,
    chords: [
      [38, 53, 57, 60, 64], // Dm9
      [43, 53, 58, 62, 65], // G9 (rootless)
      [36, 52, 55, 58, 62], // C9
      [41, 52, 57, 60, 64], // Fmaj9
    ],
    kick: [2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 1, 0, 0],
    snare: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
    hat: [2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 1],
    punch: 1,
  },
  {
    id: 'beat-courtside',
    title: 'Courtside',
    bpm: 88,
    swing: 0.56,
    chords: [
      [45, 55, 60, 64, 67], // Am9
      [40, 55, 59, 62, 66], // Em9-ish
      [41, 57, 60, 64, 67], // Fmaj7
      [43, 57, 59, 62, 65], // G13sus
    ],
    kick: [2, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0],
    hat: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
    punch: 0.8,
  },
  {
    id: 'beat-after-hours',
    title: 'After Hours',
    bpm: 78,
    swing: 0.62,
    chords: [
      [36, 51, 55, 58, 62], // Cm9
      [44, 55, 60, 63, 67], // Abmaj9
      [46, 56, 58, 62, 65], // Bb13sus
      [43, 53, 58, 62, 65], // Gm7(11)
    ],
    kick: [2, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    punch: 0.5,
  },
];

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** One running beat. Call stop() to end it. */
export class BeatPlayer {
  private ctx: AudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private timer: number | null = null;
  private step = 0;
  private next = 0;
  private bar = 0;

  constructor(
    private preset: BeatPreset,
    volume: number,
  ) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    // Master chain: gentle low-pass for the lo-fi warmth, then a compressor to glue it.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200 + preset.punch * 3000;
    this.out = this.ctx.createGain();
    this.out.gain.value = volume;
    this.out.connect(tone).connect(comp).connect(this.ctx.destination);
    // White noise for snares, hats and crackle.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  async start() {
    await this.ctx.resume();
    this.next = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.crackle();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.15);
    window.setTimeout(() => void this.ctx.close(), 800);
  }

  setVolume(v: number) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Schedule the 16th notes due in the next 120 ms. */
  private schedule() {
    const p = this.preset;
    const sixteenth = 60 / p.bpm / 4;
    while (this.next < this.ctx.currentTime + 0.12) {
      const s = this.step % 16;
      // Swing: delay every off 16th.
      const t = this.next + (s % 2 === 1 ? (p.swing - 0.5) * 2 * sixteenth : 0);
      const chord = p.chords[this.bar % p.chords.length]!;
      if (p.kick[s]) this.kick(t, p.kick[s] === 2 ? 1 : 0.75);
      if (p.snare[s]) this.snare(t, p.snare[s] === 2 ? 1 : 0.35);
      if (p.hat[s]) this.hat(t, (p.hat[s] === 2 ? 0.55 : 0.32) * (0.85 + Math.random() * 0.3), s === 15 && this.bar % 2 === 1);
      // Bass on the downbeat and the kick pushes; chords on beat 1 (and a re-hit on the "and" of 3 every other bar).
      if (s === 0 || (p.kick[s] && s >= 6)) this.bass(t, chord[0]!, s === 0 ? sixteenth * 6 : sixteenth * 3);
      if (s === 0) this.keys(t, chord.slice(1), sixteenth * 14);
      if (s === 10 && this.bar % 2 === 1) this.keys(t, chord.slice(1), sixteenth * 5, 0.6);
      this.next += sixteenth;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number, vel: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140 + 30 * this.preset.punch, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    this.env(g, t, 0.95 * vel, 0.004, 0.42);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.5);
    // Click for punch.
    const c = this.ctx.createBufferSource();
    c.buffer = this.noise;
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 3000;
    const cg = this.ctx.createGain();
    this.env(cg, t, 0.12 * this.preset.punch * vel, 0.001, 0.015);
    c.connect(cf).connect(cg).connect(this.out);
    c.start(t);
    c.stop(t + 0.03);
  }

  private snare(t: number, vel: number) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    this.env(g, t, 0.55 * vel * (0.7 + 0.3 * this.preset.punch), 0.002, 0.18);
    n.connect(bp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + 0.25);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    this.env(og, t, 0.35 * vel, 0.002, 0.09);
    o.connect(og).connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, vel: number, open: boolean) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = this.ctx.createGain();
    this.env(g, t, 0.22 * vel, 0.001, open ? 0.22 : 0.035);
    n.connect(hp).connect(g).connect(this.out);
    n.start(t);
    n.stop(t + (open ? 0.3 : 0.06));
  }

  private bass(t: number, midi: number, len: number) {
    const o = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq(midi);
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.setTargetAtTime(0.32, t + 0.05, 0.1);
    g.gain.setTargetAtTime(0.0001, t + len, 0.06);
    o.connect(lp).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len + 0.4);
  }

  /** Electric piano: sine + soft triangle partial, slow attack, tremolo, a touch of detune. */
  private keys(t: number, notes: number[], len: number, vel = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.03);
    g.gain.setTargetAtTime(0.05 * vel, t + 0.1, 0.4);
    g.gain.setTargetAtTime(0.0001, t + len, 0.25);
    const trem = this.ctx.createOscillator();
    const tremGain = this.ctx.createGain();
    trem.frequency.value = 4.2;
    tremGain.gain.value = 0.018 * vel;
    trem.connect(tremGain).connect(g.gain);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    g.connect(lp).connect(this.out);
    trem.start(t);
    trem.stop(t + len + 1.5);
    notes.forEach((m, i) => {
      for (const [type, detune, level] of [['sine', -4, 1], ['triangle', 5, 0.35]] as const) {
        const o = this.ctx.createOscillator();
        const og = this.ctx.createGain();
        o.type = type;
        o.frequency.value = freq(m);
        o.detune.value = detune;
        og.gain.value = level;
        o.connect(og).connect(g);
        // Strum the voicing slightly, like a player's hand.
        o.start(t + i * 0.012);
        o.stop(t + len + 1.5);
      }
    });
  }

  /** Vinyl crackle: sparse soft clicks, rescheduled while playing. */
  private crackle() {
    if (this.timer === null) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = now + Math.random() * 0.5;
      const n = this.ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500 + Math.random() * 3000;
      const g = this.ctx.createGain();
      this.env(g, t, 0.02 + Math.random() * 0.025, 0.0005, 0.006);
      n.connect(bp).connect(g).connect(this.out);
      n.start(t, Math.random() * 0.9);
      n.stop(t + 0.01);
    }
    window.setTimeout(() => this.crackle(), 500);
  }
}
