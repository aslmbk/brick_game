import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "./device.js";
import * as E from "./engine.js";

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const device = (prefs = {}) => D.createDevice({ ...D.DEFAULT_PREFS, ...prefs }, rng(1));

function run(dev, ms, dt = 10) {
  for (let t = 0; t < ms; t += dt) D.step(dev, dt);
}

function play(dev) {
  D.press(dev, "start");
  run(dev, 3 * D.COUNT_MS);
  assert.equal(dev.mode, "play");
}

function tap(dev, input, source = input) {
  D.press(dev, input, source);
  D.release(dev, source);
}

function drain(dev) {
  const events = dev.events.slice();
  dev.events.length = 0;
  return events;
}

// An I standing in column 9 above a bottom row that misses only that column.
function readyLine(dev) {
  const g = dev.game;
  g.board.set([1, 1, 1, 1, 1, 1, 1, 1, 1, 0], 19 * E.W);
  g.piece = { type: "I", rot: 1, row: 0, col: 7 };
  g.lowest = 0;
}

test("page load: the title screen, nothing running, record and start level shown", () => {
  const dev = device({ hiScore: 1234, startLevel: 4 });
  assert.equal(dev.mode, "title");
  assert.equal(D.needsTime(dev), false);
  const v = D.view(dev, null);
  assert.equal(v.hiScore, 1234);
  assert.equal(v.level, 4);
  assert.equal(v.score, null);
  assert.equal(v.lines, null);
  assert.ok(v.cells.includes(1), "title picture");
  assert.ok(v.cells.includes(2), "ghost shown because it is on");
});

test("title: left and right pick the start level 1–10, down toggles the ghost", () => {
  const dev = device();
  tap(dev, "left");
  assert.equal(dev.prefs.startLevel, 1);
  assert.deepEqual(drain(dev), [], "no beep when nothing changes");
  for (let i = 0; i < 12; i++) tap(dev, "right");
  assert.equal(dev.prefs.startLevel, 10);
  tap(dev, "down");
  assert.equal(dev.prefs.ghost, false);
  assert.ok(!D.view(dev, null).cells.includes(2));
});

test("countdown: a second per digit on any level, then the first piece", () => {
  for (const startLevel of [1, 10]) {
    const dev = device({ startLevel });
    D.press(dev, "start");
    assert.equal(dev.mode, "countdown");
    assert.deepEqual(drain(dev), ["count"]);
    assert.ok(D.view(dev, null).next.includes(1), "the next piece is shown from the start");
    run(dev, 3 * D.COUNT_MS - 10);
    assert.equal(dev.mode, "countdown");
    assert.deepEqual(drain(dev), ["count", "count"]);
    run(dev, 10);
    assert.equal(dev.mode, "play");
    assert.ok(dev.game.piece);
    assert.equal(dev.game.level, startLevel);
    assert.deepEqual(drain(dev), ["go"]);
  }
});

test("game input is ignored during the countdown", () => {
  const dev = device();
  D.press(dev, "start");
  for (const input of ["left", "right", "down", "drop", "cw", "ccw"]) tap(dev, input, "k" + input);
  assert.equal(dev.mode, "countdown");
  assert.equal(dev.game.piece, null);
  assert.equal(dev.game.score, 0);
});

test("pause and resume; a paused countdown starts over", () => {
  const dev = device();
  D.press(dev, "start");
  run(dev, 1500);
  D.press(dev, "pause");
  assert.equal(dev.mode, "pause");
  assert.equal(D.needsTime(dev), false);
  D.press(dev, "pause");
  assert.equal(dev.mode, "countdown");
  assert.equal(dev.t, 0);
  run(dev, 3 * D.COUNT_MS);
  assert.equal(dev.mode, "play");
  D.press(dev, "start");
  assert.equal(dev.mode, "pause");
  const before = D.view(dev, null);
  run(dev, 5000);
  assert.equal(D.view(dev, before), before, "nothing moves while paused");
  D.press(dev, "start");
  assert.equal(dev.mode, "play");
});

test("pause freezes the line-clear animation", () => {
  const dev = device();
  play(dev);
  readyLine(dev);
  D.press(dev, "drop");
  assert.deepEqual(dev.game.clearRows, [19]);
  run(dev, 200);
  D.press(dev, "pause");
  run(dev, 1000);
  assert.equal(dev.game.clearMs, 200);
  D.press(dev, "pause");
  run(dev, 200);
  assert.equal(dev.game.clearRows, null);
});

test("leaving the tab pauses the game and lets go of held keys", () => {
  const dev = device();
  play(dev);
  D.press(dev, "left", "ArrowLeft");
  assert.equal(dev.game.left, true);
  D.press(dev, "hide");
  assert.equal(dev.mode, "pause");
  assert.equal(dev.holds.size, 0);
  assert.equal(dev.game.left, false);
  const title = device();
  D.press(title, "hide");
  assert.equal(title.mode, "title", "idle screens stay as they are");
});

test("switched off, only ON/OFF works (RESET and S/P used to turn it on)", () => {
  const dev = device();
  D.press(dev, "power");
  assert.equal(dev.mode, "off");
  for (const input of ["start", "reset", "pause", "sound", "ghost", "left", "drop", "cw", "hide"]) {
    tap(dev, input, "x" + input);
  }
  assert.equal(dev.mode, "off");
  assert.deepEqual(dev.prefs, D.DEFAULT_PREFS);
  const v = D.view(dev, null);
  assert.ok(v.cells.every((c) => c === 0));
  assert.equal(v.score, null);
  assert.equal(v.hiScore, null);
  assert.equal(v.sound, false);
});

test("power: off, then boot with every segment lit, then the title; power drops a running game", () => {
  const dev = device();
  play(dev);
  D.press(dev, "power");
  assert.equal(dev.mode, "off");
  assert.equal(dev.game, null);
  drain(dev);
  D.press(dev, "power");
  assert.equal(dev.mode, "boot");
  assert.deepEqual(drain(dev), ["boot"]);
  const v = D.view(dev, null);
  assert.ok(v.cells.every((c) => c === 1));
  assert.equal(v.score, 888888);
  run(dev, D.BOOT_MS);
  assert.equal(dev.mode, "title");
});

test("reset goes back to the title and keeps the settings", () => {
  const dev = device({ startLevel: 5, sound: false });
  play(dev);
  D.press(dev, "reset");
  assert.equal(dev.mode, "title");
  assert.equal(dev.game, null);
  assert.equal(dev.prefs.startLevel, 5);
  assert.equal(dev.prefs.sound, false);
});

test("the record follows the score live and survives reset, power and a new game", () => {
  const dev = device({ hiScore: 50 });
  play(dev);
  dev.game.score = 100;
  dev.game.piece = { type: "T", rot: 0, row: 0, col: 3 };
  D.press(dev, "drop");
  assert.equal(dev.game.score, 136);
  assert.equal(D.view(dev, null).hiScore, 136);
  D.press(dev, "reset");
  D.press(dev, "power");
  D.press(dev, "power");
  run(dev, D.BOOT_MS);
  assert.equal(dev.prefs.hiScore, 136);
  D.press(dev, "start");
  const v = D.view(dev, null);
  assert.equal(v.hiScore, 136);
  assert.equal(v.score, 0);
});

test("game over: the curtain fills and clears in 1.6 s, start waits for it, then a new game", () => {
  const dev = device({ startLevel: 3 });
  play(dev);
  dev.game.board.fill(1, 10, 20); // row 1 full: the piece locks partly above the screen
  dev.game.piece = { type: "T", rot: 0, row: -1, col: 3 };
  D.press(dev, "drop");
  assert.equal(dev.mode, "ending");
  D.press(dev, "start");
  assert.equal(dev.mode, "ending", "start is ignored during the curtain");
  const lit = () => D.view(dev, null).cells.reduce((n, c) => n + (c === 1), 0);
  run(dev, D.ROW_MS * 19);
  assert.equal(lit(), 200, "filled bottom to top");
  run(dev, D.ROW_MS * 6);
  assert.equal(lit(), 140, "clearing from the top");
  run(dev, D.CURTAIN_MS - D.ROW_MS * 25);
  assert.equal(dev.mode, "over");
  const v = D.view(dev, null);
  assert.ok(v.cells.every((c) => c === 0));
  assert.ok(!v.next.includes(1));
  assert.equal(v.level, 3);
  D.press(dev, "start");
  assert.equal(dev.mode, "countdown");
  assert.equal(dev.game.level, 3);
});

test("a hold from several sources lasts until the last one lets go", () => {
  const dev = device();
  play(dev);
  D.press(dev, "down", "ArrowDown");
  assert.equal(dev.game.soft, true);
  D.press(dev, "down", "p1");
  D.release(dev, "ArrowDown");
  assert.equal(dev.game.soft, true);
  D.release(dev, "p1");
  assert.equal(dev.game.soft, false);
  D.press(dev, "left", "ArrowLeft");
  const col = dev.game.piece.col;
  D.press(dev, "left", "ArrowLeft");
  assert.equal(dev.game.piece.col, col, "a repeat from the same key does nothing");
});

test("the view stays the same object until something visible changes", () => {
  const dev = device();
  play(dev);
  const v1 = D.view(dev, null);
  D.step(dev, 10);
  const v2 = D.view(dev, v1);
  assert.equal(v2, v1, "timers alone do not redraw");
  run(dev, E.gravityMs(1));
  const v3 = D.view(dev, v2);
  assert.notEqual(v3, v2);
  assert.equal(v3.rev, v2.rev + 1);
});

test("screen cells: the ghost lies under the piece, the piece covers it, the ghost can be off", () => {
  const dev = device();
  play(dev);
  dev.game.piece = { type: "O", rot: 0, row: 0, col: 3 };
  let v = D.view(dev, null);
  assert.equal(v.cells[0 * E.W + 4], 1);
  assert.equal(v.cells[19 * E.W + 4], 2);
  dev.game.piece.row = 17; // the ghost (rows 18–19) overlaps the piece (rows 17–18)
  v = D.view(dev, v);
  assert.equal(v.cells[18 * E.W + 4], 1);
  assert.equal(v.cells[19 * E.W + 4], 2);
  D.press(dev, "ghost");
  v = D.view(dev, v);
  assert.equal(v.cells[19 * E.W + 4], 0);
});

test("cleared rows blink before they go", () => {
  const dev = device();
  play(dev);
  readyLine(dev);
  D.press(dev, "drop");
  const cell = () => D.view(dev, null).cells[19 * E.W];
  assert.equal(cell(), 1);
  run(dev, E.BLINK_MS);
  assert.equal(cell(), 0);
  run(dev, E.BLINK_MS);
  assert.equal(cell(), 1);
  run(dev, E.BLINK_MS);
  assert.equal(cell(), 0);
});

test("the next-piece preview works for all seven pieces, O included", () => {
  for (const type of E.TYPES) {
    const dev = device();
    play(dev);
    dev.game.next = type;
    const v = D.view(dev, null);
    assert.equal(v.next, E.PREVIEW[type]);
    assert.ok(v.next.includes(1), type);
  }
});

test("sound and ghost switch in every powered mode", () => {
  const dev = device();
  const flip = () => {
    const { sound, ghost } = dev.prefs;
    D.press(dev, "sound");
    D.press(dev, "ghost");
    assert.equal(dev.prefs.sound, !sound, dev.mode);
    assert.equal(dev.prefs.ghost, !ghost, dev.mode);
  };
  flip(); // title
  D.press(dev, "start");
  flip(); // countdown
  run(dev, 3 * D.COUNT_MS);
  flip(); // play
  D.press(dev, "pause");
  flip(); // pause
});

test("settings: checked on load, the old save removed, five fields saved, broken storage never throws", () => {
  const memory = (init) => {
    const m = new Map(Object.entries(init));
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };
  const s = memory({
    [D.OLD_KEY]: JSON.stringify({ state: { grid: [], gameOver: true }, version: 0 }),
    [D.PREFS_KEY]: JSON.stringify({ hiScore: -5, startLevel: 42, sound: "yes", ghost: false, extra: 1 }),
  });
  assert.deepEqual(D.loadPrefs(s), { hiScore: 0, startLevel: 10, sound: true, ghost: false });
  assert.equal(s.m.has(D.OLD_KEY), false);
  D.savePrefs(s, { hiScore: 7, startLevel: 2, sound: false, ghost: true, junk: 1 });
  assert.deepEqual(JSON.parse(s.m.get(D.PREFS_KEY)), { v: 1, hiScore: 7, startLevel: 2, sound: false, ghost: true });
  assert.deepEqual(D.loadPrefs(memory({ [D.PREFS_KEY]: "not json" })), D.DEFAULT_PREFS);
  assert.deepEqual(D.loadPrefs(null), D.DEFAULT_PREFS);
  const fail = () => {
    throw new Error("blocked");
  };
  const broken = { getItem: fail, setItem: fail, removeItem: fail };
  assert.deepEqual(D.loadPrefs(broken), D.DEFAULT_PREFS);
  assert.doesNotThrow(() => D.savePrefs(broken, D.DEFAULT_PREFS));
});

test("keys go by e.code and every button on the model does something", () => {
  assert.equal(D.KEYMAP.KeyZ, "ccw");
  assert.equal(D.KEYMAP.ArrowUp, "cw");
  assert.equal(D.KEYMAP.Space, "drop");
  assert.equal(D.KEYMAP.Enter, "start");
  assert.deepEqual(Object.keys(D.BUTTONS).sort(), ["down", "left", "onoff", "reset", "right", "rotate", "sound", "sp", "up"]);
  assert.equal(D.BUTTONS.rotate, "ccw", "ROTATE keeps its old direction");
  assert.equal(D.BUTTONS.up, "drop");
  assert.equal(D.BUTTONS.down, "down");
});
