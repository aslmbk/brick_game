// Brick Game beeps: short square-wave notes made with Web Audio, no sound files.

// [frequency Hz, duration s] per note, played back to back.
const SOUNDS = {
  move: [[440, 0.015]],
  rotate: [[660, 0.02]],
  lock: [[220, 0.03]],
  drop: [[165, 0.05]],
  clear: [[660, 0.05], [880, 0.05], [1320, 0.09]],
  tetris: [[660, 0.05], [880, 0.05], [1100, 0.05], [1320, 0.14]],
  level: [[523, 0.07], [659, 0.07], [784, 0.12]],
  over: [[392, 0.13], [330, 0.13], [262, 0.13], [196, 0.3]],
  count: [[660, 0.08]],
  go: [[990, 0.16]],
  pause: [[520, 0.05]],
  select: [[740, 0.025]],
  boot: [[523, 0.06], [1046, 0.12]],
};

let ctx = null;
let out = null;

// Browsers only allow audio after a user gesture, so this runs on every press.
export function unlockAudio() {
  if (!ctx) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    ctx = new Context();
    out = ctx.createGain();
    out.gain.value = 0.07;
    out.connect(ctx.destination);
  }
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}

export function play(name) {
  const notes = SOUNDS[name];
  if (!notes || !ctx || ctx.state !== "running") return;
  let t = ctx.currentTime + 0.005;
  for (const [freq, dur] of notes) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.002);
    env.gain.setValueAtTime(1, t + dur - 0.006);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + dur);
    t += dur;
  }
}
