// The handheld around the game: power, title screen, countdown, pause, game over,
// settings and which physical inputs are held. Pure like the engine — time comes in
// as dtMs and storage is passed in — so all of it runs under `node --test`.
import * as engine from "./engine.js";

const { W, H } = engine;
export const BOOT_MS = 1000;
export const COUNT_MS = 1000;
export const ROW_MS = 40;
export const CURTAIN_MS = ROW_MS * H * 2; // fill bottom→top, then clear top→bottom

export const DEFAULT_PREFS = { hiScore: 0, startLevel: 1, sound: true, ghost: true };
export const PREFS_KEY = "brick-game";
export const OLD_KEY = "my-tetris-storage";

// Mesh names in the GLB (three strips "/" from "s/p" and "on/off").
export const BUTTONS = {
  onoff: "power",
  sp: "start",
  sound: "sound",
  reset: "reset",
  left: "left",
  right: "right",
  up: "drop",
  down: "down",
  rotate: "ccw",
};

// By e.code, so the keys work in any keyboard layout.
export const KEYMAP = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowUp: "cw",
  Space: "drop",
  KeyX: "cw",
  KeyZ: "ccw",
  Enter: "start",
  NumpadEnter: "start",
  KeyP: "start",
  Escape: "pause",
  KeyR: "reset",
  KeyM: "sound",
  KeyG: "ghost",
};

const HOLDS = new Set(["left", "right", "down"]);
const IDLE = new Set(["off", "title", "pause", "over"]);

// Title screen: a falling T, its ghost (shown only when the ghost is on) and a stack.
const TITLE = [
  "..........",
  "..........",
  "..........",
  "..........",
  "....#.....",
  "...###....",
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "..........",
  "#...g....#",
  "##.ggg..##",
  "##.###..##",
  "######.###",
  "##.###.###",
];

const DIGITS = {
  3: [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
};

const NO_NEXT = new Uint8Array(8);
const ALL_NEXT = new Uint8Array(8).fill(1);
const scratch = new Uint8Array(W * H);

export function createDevice(prefs = DEFAULT_PREFS, rng = Math.random) {
  return {
    mode: "title",
    t: 0, // ms spent in a timed mode
    game: null,
    resume: null, // the mode a pause returns to
    prefs: { ...prefs }, // replaced on change, never mutated
    holds: new Map(), // source (e.code or "p" + pointerId) → held input
    events: [],
    rng,
  };
}

export function press(dev, input, source = input) {
  if (HOLDS.has(input)) {
    if (dev.holds.has(source)) return; // the same key or finger again
    const already = isHeld(dev, input);
    dev.holds.set(source, input);
    if (already) return; // another source holds it: nothing new happens
  }
  handle(dev, input);
}

export function release(dev, source) {
  const input = dev.holds.get(source);
  if (!input) return;
  dev.holds.delete(source);
  if (!isHeld(dev, input) && dev.game) engine.release(dev.game, input);
}

export function releaseAll(dev) {
  dev.holds.clear();
  if (dev.game) engine.releaseAll(dev.game);
}

export function step(dev, dt) {
  switch (dev.mode) {
    case "boot":
      dev.t += dt;
      if (dev.t >= BOOT_MS) enter(dev, "title");
      return;
    case "countdown": {
      const shown = digit(dev.t);
      dev.t += dt;
      if (dev.t >= 3 * COUNT_MS) {
        dev.mode = "play";
        dev.t = 0;
        engine.spawn(dev.game);
        dev.events.push("go");
      } else if (digit(dev.t) !== shown) {
        dev.events.push("count");
      }
      return;
    }
    case "play":
      engine.step(dev.game, dt);
      afterEngine(dev);
      return;
    case "ending":
      dev.t += dt;
      if (dev.t >= CURTAIN_MS) {
        dev.mode = "over";
        dev.t = 0;
      }
      return;
  }
}

export function needsTime(dev) {
  return dev.mode === "boot" || dev.mode === "countdown" || dev.mode === "play" || dev.mode === "ending";
}

export function isIdle(mode) {
  return IDLE.has(mode);
}

// Everything the screen shows. Returns `prev` itself when nothing visible
// changed, so the screen redraws only on a new object (rev + 1).
export function view(dev, prev) {
  const cells = scratch.fill(0);
  const { mode, game: g, prefs } = dev;
  let next = NO_NEXT;
  let score = null;
  let hiScore = null;
  let level = null;
  let lines = null;
  if (g) {
    score = g.score;
    hiScore = prefs.hiScore;
    level = g.level;
    lines = g.lines;
  }
  switch (mode) {
    case "boot":
      cells.fill(1);
      next = ALL_NEXT;
      score = hiScore = 888888;
      level = 88;
      lines = 8888;
      break;
    case "title":
      paint(cells, TITLE, prefs.ghost);
      hiScore = prefs.hiScore;
      level = prefs.startLevel;
      break;
    case "countdown":
      paint(cells, DIGITS[digit(dev.t)], false, 6, 2);
      next = engine.PREVIEW[g.next];
      break;
    case "play":
    case "pause":
      paintGame(cells, g, prefs.ghost);
      next = engine.PREVIEW[g.next];
      break;
    case "ending":
      paintCurtain(cells, g.board, dev.t);
      break;
  }
  const sound = mode !== "off" && prefs.sound;
  if (
    prev &&
    prev.mode === mode &&
    prev.next === next &&
    prev.score === score &&
    prev.hiScore === hiScore &&
    prev.level === level &&
    prev.lines === lines &&
    prev.sound === sound &&
    sameCells(prev.cells, cells)
  ) {
    return prev;
  }
  return { rev: prev ? prev.rev + 1 : 1, mode, cells: cells.slice(), next, score, hiScore, level, lines, sound };
}

export function loadPrefs(storage) {
  try {
    storage?.removeItem(OLD_KEY); // the old save kept the whole game; its record was always 0
  } catch {
    // ignore: storage may be read-only
  }
  let raw = null;
  try {
    raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? "null");
  } catch {
    // unreadable or blocked: start from defaults
  }
  const p = raw && typeof raw === "object" ? raw : {};
  return {
    hiScore: Number.isInteger(p.hiScore) ? clamp(p.hiScore, 0, engine.SCORE_MAX) : DEFAULT_PREFS.hiScore,
    startLevel: Number.isInteger(p.startLevel) ? clamp(p.startLevel, 1, 10) : DEFAULT_PREFS.startLevel,
    sound: typeof p.sound === "boolean" ? p.sound : DEFAULT_PREFS.sound,
    ghost: typeof p.ghost === "boolean" ? p.ghost : DEFAULT_PREFS.ghost,
  };
}

export function savePrefs(storage, prefs) {
  try {
    const { hiScore, startLevel, sound, ghost } = prefs;
    storage?.setItem(PREFS_KEY, JSON.stringify({ v: 1, hiScore, startLevel, sound, ghost }));
  } catch {
    // full or blocked: the game goes on, settings just aren't kept
  }
}

function handle(dev, input) {
  const { mode } = dev;
  if (input === "power") {
    enter(dev, mode === "off" ? "boot" : "off");
    return;
  }
  if (mode === "off") return;
  if (input === "hide") {
    releaseAll(dev);
    if (mode === "play" || mode === "countdown") pause(dev);
    return;
  }
  if (input === "sound" || input === "ghost") {
    setPref(dev, input, !dev.prefs[input]);
    return;
  }
  if (input === "reset") {
    if (mode !== "title") enter(dev, "title");
    return;
  }
  switch (mode) {
    case "title":
      if (input === "start" || input === "drop") startGame(dev);
      else if (input === "left" || input === "right") {
        setPref(dev, "startLevel", clamp(dev.prefs.startLevel + (input === "left" ? -1 : 1), 1, 10));
      } else if (input === "down") setPref(dev, "ghost", !dev.prefs.ghost);
      return;
    case "countdown":
      if (input === "start" || input === "pause") pause(dev);
      return;
    case "play":
      if (input === "start" || input === "pause") {
        pause(dev);
        return;
      }
      engine.press(dev.game, input);
      afterEngine(dev);
      return;
    case "pause":
      if (input === "start" || input === "pause") resume(dev);
      return;
    case "over":
      if (input === "start") startGame(dev);
      return;
  }
}

function enter(dev, mode) {
  releaseAll(dev);
  dev.mode = mode;
  dev.t = 0;
  dev.resume = null;
  if (mode === "off" || mode === "title") dev.game = null;
  if (mode === "boot") dev.events.push("boot");
}

function startGame(dev) {
  releaseAll(dev);
  dev.game = engine.createGame({ rng: dev.rng, startLevel: dev.prefs.startLevel, events: dev.events });
  dev.mode = "countdown";
  dev.t = 0;
  dev.resume = null;
  dev.events.push("count");
}

function pause(dev) {
  releaseAll(dev);
  dev.resume = dev.mode;
  dev.mode = "pause";
  dev.events.push("pause");
}

function resume(dev) {
  dev.mode = dev.resume;
  dev.resume = null;
  if (dev.mode === "countdown") {
    dev.t = 0; // a paused countdown starts over
    dev.events.push("count");
  } else {
    dev.events.push("pause");
  }
}

function afterEngine(dev) {
  const g = dev.game;
  if (g.score > dev.prefs.hiScore) dev.prefs = { ...dev.prefs, hiScore: g.score };
  if (g.over) {
    releaseAll(dev);
    dev.mode = "ending";
    dev.t = 0;
  }
}

function setPref(dev, key, value) {
  if (dev.prefs[key] === value) return;
  dev.prefs = { ...dev.prefs, [key]: value };
  dev.events.push("select");
}

function isHeld(dev, input) {
  for (const held of dev.holds.values()) if (held === input) return true;
  return false;
}

function digit(t) {
  return 3 - Math.floor(t / COUNT_MS);
}

function paint(cells, rows, ghost, top = 0, left = 0) {
  rows.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      if (line[c] === "#") cells[(top + r) * W + left + c] = 1;
      else if (line[c] === "g" && ghost) cells[(top + r) * W + left + c] = 2;
    }
  });
}

function paintGame(cells, g, ghost) {
  cells.set(g.board);
  if (g.clearRows && Math.floor(g.clearMs / engine.BLINK_MS) % 2 === 1) {
    for (const row of g.clearRows) cells.fill(0, row * W, (row + 1) * W);
  }
  const p = g.piece;
  if (!p) return;
  if (ghost) {
    const row = engine.ghostRow(g);
    if (row > p.row) stamp(cells, p, row, 2);
  }
  stamp(cells, p, p.row, 1);
}

function stamp(cells, p, row, value) {
  for (const [r, c] of engine.SHAPES[p.type][p.rot]) {
    if (row + r >= 0) cells[(row + r) * W + p.col + c] = value;
  }
}

function paintCurtain(cells, board, t) {
  const k = Math.floor(t / ROW_MS);
  if (k < H) {
    cells.set(board);
    cells.fill(1, (H - 1 - k) * W);
  } else {
    cells.fill(1, (k - H + 1) * W);
  }
}

function sameCells(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
