// Tiny Web Audio synth. The AudioContext is created on the first tap/click
// (browsers block sound before a user gesture). Mute is saved.

let ctx = null;
let master = null;
let muted = localStorage.getItem('staticBloom.muted') === '1';
let lastShot = 0;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.35;
  master.connect(ctx.destination);
}

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('staticBloom.muted', muted ? '1' : '0');
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

function tone(type, f0, f1, dur, vol) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  shoot() {
    if (!ctx) return;
    if (ctx.currentTime - lastShot < 0.06) return; // rate-limit to keep nodes low
    lastShot = ctx.currentTime;
    tone('square', 880, 440, 0.05, 0.05);
  },
  hit() { tone('triangle', 300, 120, 0.08, 0.12); },
  kill() { tone('sawtooth', 220, 50, 0.18, 0.15); },
  hurt() { tone('sawtooth', 140, 40, 0.3, 0.3); },
  pickup() { tone('sine', 520, 1200, 0.15, 0.2); },
  boss() { tone('sawtooth', 80, 30, 0.8, 0.35); },
  wave() { tone('triangle', 330, 660, 0.3, 0.2); },
  block() { tone('square', 1500, 1200, 0.03, 0.05); },
};
