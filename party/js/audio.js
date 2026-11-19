// procedural WebAudio sounds
let ctx = null, master = null, noiseBuf = null;
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
function burst({ dur = 0.15, freq = 1200, q = 0.8, vol = 0.6, type = 'lowpass', low = 0, lowF = 90 }) {
  if (!ctx) return; const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t + dur); f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
  if (low) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(lowF * 1.6, t); o.frequency.exponentialRampToValueAtTime(lowF * 0.5, t + dur); const og = ctx.createGain(); og.gain.setValueAtTime(low * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(og); og.connect(master); o.start(t); o.stop(t + dur + 0.02); }
}
function tone(f0, f1, dur, vol, type = 'square') {
  if (!ctx) return; const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  shot(weapon, vol = 1) {
    if (weapon === 'sniper') burst({ dur: 0.45, freq: 2400, vol: 0.9 * vol, low: 1.2, lowF: 70 });
    else if (weapon === 'pistol') burst({ dur: 0.12, freq: 2600, vol: 0.55 * vol, low: 0.5, lowF: 140 });
    else if (weapon === 'knife') burst({ dur: 0.1, freq: 3500, vol: 0.25 * vol, type: 'highpass' });
    else burst({ dur: 0.14, freq: 1800, vol: 0.6 * vol, low: 0.7, lowF: 100 });
  },
  hit() { tone(1400, 900, 0.06, 0.18, 'triangle'); },
  head() { tone(2200, 1800, 0.09, 0.22, 'triangle'); },
  kill() { tone(700, 1400, 0.15, 0.2, 'triangle'); },
  hurt() { burst({ dur: 0.12, freq: 500, vol: 0.4 }); },
  reload() { tone(300, 200, 0.05, 0.15); setTimeout(() => tone(500, 420, 0.05, 0.15), 260); },
  empty() { tone(900, 900, 0.03, 0.12); },
  // 弓箭: no gunshot, just the string
  twang(vol = 1) { tone(220, 95, 0.18, 0.22 * vol, 'triangle'); burst({ dur: 0.06, freq: 2800, vol: 0.12 * vol, type: 'highpass' }); },
  draw() { burst({ dur: 0.35, freq: 420, q: 4, vol: 0.08, type: 'bandpass' }); },
  thunk(vol = 1) { tone(160, 70, 0.08, 0.25 * vol, 'sine'); burst({ dur: 0.05, freq: 900, vol: 0.15 * vol }); },
  step() { burst({ dur: 0.05, freq: 600, vol: 0.06 }); },
};
