// Arena sounds for the live 2D game, synthesized with Web Audio (no audio
// files): swish, rim, buzzer, whistle and crowd. Off when muted.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
const KEY = 'nba-manager:sfx';

export function sfxOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSfx(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* private mode */
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function burst(c: AudioContext, { at = 0, dur, type, freq, q = 1, gain, attack = 0.01 }: { at?: number; dur: number; type: BiquadFilterType; freq: number; q?: number; gain: number; attack?: number }) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(c: AudioContext, { at = 0, dur, freq, type = 'sine', gain }: { at?: number; dur: number; freq: number; type?: OscillatorType; gain: number }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  const t = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export type Sfx = 'swish' | 'rim' | 'buzzer' | 'whistle' | 'cheer' | 'roar' | 'groan';

export function play(sound: Sfx) {
  if (!sfxOn()) return;
  const c = audio();
  if (!c || !noise) return;
  switch (sound) {
    case 'swish':
      burst(c, { dur: 0.28, type: 'highpass', freq: 3500, gain: 0.18, attack: 0.04 });
      break;
    case 'rim':
      tone(c, { dur: 0.18, freq: 420, type: 'triangle', gain: 0.12 });
      tone(c, { dur: 0.25, freq: 1130, gain: 0.05 });
      break;
    case 'buzzer':
      tone(c, { dur: 1.1, freq: 196, type: 'square', gain: 0.06 });
      tone(c, { dur: 1.1, freq: 233, type: 'square', gain: 0.04 });
      break;
    case 'whistle':
      tone(c, { dur: 0.35, freq: 2900, gain: 0.07 });
      tone(c, { dur: 0.35, freq: 3050, gain: 0.04 });
      break;
    case 'cheer':
      burst(c, { dur: 1.4, type: 'bandpass', freq: 900, q: 0.6, gain: 0.12, attack: 0.15 });
      break;
    case 'roar':
      burst(c, { dur: 2.4, type: 'bandpass', freq: 700, q: 0.5, gain: 0.22, attack: 0.2 });
      burst(c, { at: 0.1, dur: 2, type: 'bandpass', freq: 1600, q: 0.8, gain: 0.08, attack: 0.3 });
      break;
    case 'groan':
      burst(c, { dur: 1, type: 'lowpass', freq: 400, gain: 0.1, attack: 0.1 });
      break;
  }
}

/** Spoken commentary with the browser's voice; skipped if it would fall behind. */
export function say(text: string, rate = 1.1) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const s = window.speechSynthesis;
  if (s.speaking && s.pending) return;
  const u = new SpeechSynthesisUtterance(text.replace(/[!…]/g, '.').replace(/\(([^)]*)\)/g, ', $1,'));
  u.rate = rate;
  u.lang = 'en-US';
  s.speak(u);
}

export function hush() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
