import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.js";

// mulberry32: a tiny seeded generator, so every run plays the same pieces
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `rows` are drawn at the bottom of the board, top to bottom, "#" = filled.
function newGame({ seed = 1, level = 1, rows = [] } = {}) {
  const g = E.createGame({ rng: rng(seed), startLevel: level, events: [] });
  rows.forEach((line, i) => {
    const r = E.H - rows.length + i;
    [...line].forEach((ch, c) => {
      if (ch === "#") g.board[r * E.W + c] = 1;
    });
  });
  return g;
}

function put(g, type, rot, row, col) {
  g.piece = { type, rot, row, col };
  g.lowest = row;
  g.fallMs = 0;
  g.lockMs = 0;
  g.resets = 0;
}

function run(g, ms, dt = 1) {
  for (let t = 0; t < ms; t += dt) E.step(g, dt);
}

const norm = (cells) => cells.map(([r, c]) => r * 100 + c).sort((a, b) => a - b);
const cellsOf = (p) => E.SHAPES[p.type][p.rot].map(([r, c]) => [p.row + r, p.col + c]);
const boardRows = (g, from, to) => {
  const out = [];
  for (let r = from; r <= to; r++) out.push([...g.board.subarray(r * E.W, (r + 1) * E.W)].map((v) => (v ? "#" : ".")).join(""));
  return out;
};

test("SRS states match the guideline pictures", () => {
  // "rc" pairs for rotation 0, R, 2, L
  const table = {
    I: ["10 11 12 13", "02 12 22 32", "20 21 22 23", "01 11 21 31"],
    J: ["00 10 11 12", "01 02 11 21", "10 11 12 22", "01 11 20 21"],
    L: ["02 10 11 12", "01 11 21 22", "10 11 12 20", "00 01 11 21"],
    S: ["01 02 10 11", "01 11 12 22", "11 12 20 21", "00 10 11 21"],
    T: ["01 10 11 12", "01 11 12 21", "10 11 12 21", "01 10 11 21"],
    Z: ["00 01 11 12", "02 11 12 21", "10 11 21 22", "01 10 11 20"],
    O: ["01 02 11 12", "01 02 11 12", "01 02 11 12", "01 02 11 12"],
  };
  for (const [type, states] of Object.entries(table)) {
    states.forEach((pairs, rot) => {
      const cells = pairs.split(" ").map((rc) => [+rc[0], +rc[1]]);
      assert.deepEqual(norm(E.SHAPES[type][rot]), norm(cells), `${type} rotation ${rot}`);
    });
  }
});

test("kick tables equal the official SRS offset definition (240 cases)", () => {
  // Offsets per state and test, published with +y up. A kick is rotating about the
  // piece's pivot, then shifting by offset[from] − offset[to].
  const OFFSETS = {
    JLSTZ: [
      [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
      [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
      [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
      [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    ],
    I: [
      [[0, 0], [-1, 0], [2, 0], [-1, 0], [2, 0]],
      [[-1, 0], [0, 0], [0, 0], [0, 1], [0, -2]],
      [[-1, 1], [1, 1], [-2, 1], [1, 0], [-2, 0]],
      [[0, 1], [0, 1], [0, 1], [0, -1], [0, 2]],
    ],
  };
  const PIVOT = { JLSTZ: [[1, 1], [1, 1], [1, 1], [1, 1]], I: [[1, 1], [1, 2], [2, 2], [2, 1]] };
  let cases = 0;
  for (const type of "IJLSTZ") {
    const kind = type === "I" ? "I" : "JLSTZ";
    for (let from = 0; from < 4; from++) {
      for (const dir of [1, -1]) {
        const to = (from + dir + 4) % 4;
        const [pr, pc] = PIVOT[kind][from];
        const turned = E.SHAPES[type][from].map(([r, c]) => {
          const [dr, dc] = [r - pr, c - pc];
          return dir === 1 ? [pr + dc, pc - dr] : [pr - dc, pc + dr];
        });
        for (let n = 0; n < 5; n++) {
          const [ox, oy] = [OFFSETS[kind][from][n][0] - OFFSETS[kind][to][n][0], OFFSETS[kind][from][n][1] - OFFSETS[kind][to][n][1]];
          const truth = turned.map(([r, c]) => [r - oy, c + ox]);
          const [kc, kr] = E.KICKS[kind][`${from}>${to}`][n];
          const table = E.SHAPES[type][to].map(([r, c]) => [r + kr, c + kc]);
          assert.deepEqual(norm(table), norm(truth), `${type} ${from}>${to} test ${n + 1}`);
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 240);
});

test("kicks back and forth are exact opposites", () => {
  for (const kind of ["JLSTZ", "I"]) {
    for (const [key, tests] of Object.entries(E.KICKS[kind])) {
      const back = E.KICKS[kind][key.split(">").reverse().join(">")];
      tests.forEach(([c, r], n) => assert.deepEqual([-c, -r].map((v) => v + 0), back[n], `${kind} ${key}`));
    }
  }
});

test("7-bag: every group of seven is a full set, from the first piece on", () => {
  const g = newGame({ seed: 7 });
  const seq = [];
  for (let i = 0; i < 700; i++) {
    seq.push(g.next);
    E.spawn(g);
  }
  for (let i = 0; i < 700; i += 7) assert.equal(new Set(seq.slice(i, i + 7)).size, 7);
});

test("the same seed deals the same pieces", () => {
  const deal = (seed) => {
    const g = newGame({ seed });
    return Array.from({ length: 50 }, () => {
      const type = g.next;
      E.spawn(g);
      return type;
    }).join("");
  };
  assert.equal(deal(3), deal(3));
  assert.notEqual(deal(3), deal(4));
});

test("spawn: the piece is on screen at once, at the guideline position", () => {
  const expected = {
    I: [[0, 3], [0, 4], [0, 5], [0, 6]],
    O: [[-1, 4], [-1, 5], [0, 4], [0, 5]],
    T: [[-1, 4], [0, 3], [0, 4], [0, 5]],
  };
  for (const type of E.TYPES) {
    const g = newGame();
    g.next = type;
    E.spawn(g);
    assert.equal(g.piece.type, type, "O comes out of the queue like any other piece");
    const cells = cellsOf(g.piece);
    assert.ok(cells.some(([r]) => r === 0), `${type} is visible right away`);
    if (expected[type]) assert.deepEqual(norm(cells), norm(expected[type]));
  }
});

test("block-out ends the game and leaves the board as it was", () => {
  const g = newGame();
  g.board.fill(1, 3, 7);
  const before = g.board.slice();
  g.next = "T";
  E.spawn(g);
  assert.equal(g.over, true);
  assert.equal(g.piece, null);
  assert.deepEqual(g.board, before);
  assert.deepEqual(g.events, ["over"]);
});

test("lock-out: locking with a cell above the screen ends the game", () => {
  const g = newGame();
  g.board.fill(1, 10, 20); // row 1 full: the T at spawn cannot fall
  g.next = "T";
  E.spawn(g);
  run(g, E.LOCK_MS);
  assert.equal(g.over, true);
  assert.deepEqual(g.events, ["over"]);
});

test("a piece may never hide completely above the screen", () => {
  const board = new Uint8Array(E.W * E.H);
  assert.equal(E.collide(board, "S", 0, -2, 3), true);
  assert.equal(E.collide(board, "S", 0, -1, 3), false);
});

test("gravity: one row per interval on levels 1, 5 and 10", () => {
  for (const level of [1, 5, 10]) {
    const g = newGame({ level });
    put(g, "T", 0, 0, 3);
    const every = E.gravityMs(level);
    run(g, every - 1);
    assert.equal(g.piece.row, 0);
    run(g, 1);
    assert.equal(g.piece.row, 1);
    run(g, 2 * every);
    assert.equal(g.piece.row, 3);
  }
});

test("a long frame moves several rows at once", () => {
  const g = newGame({ level: 10 });
  put(g, "T", 0, 0, 3);
  E.press(g, "down");
  assert.equal(g.piece.row, 1);
  E.step(g, 100); // soft drop on level 10 is a row per 25 ms
  assert.equal(g.piece.row, 5);
  assert.equal(g.score, 5);
});

test("soft drop: a tap is one row and 1 point, holding keeps going, releasing stops", () => {
  const g = newGame();
  put(g, "T", 0, 0, 3);
  E.press(g, "down");
  assert.equal(g.piece.row, 1);
  assert.equal(g.score, 1);
  run(g, 3 * E.softMs(1));
  assert.equal(g.piece.row, 4);
  assert.equal(g.score, 4);
  E.release(g, "down");
  run(g, 999);
  assert.equal(g.piece.row, 4, "no burst after release");
  run(g, 1);
  assert.equal(g.piece.row, 5);
  assert.equal(g.score, 4, "gravity rows are free");
});

test("soft drop onto the stack still waits for the lock delay", () => {
  const g = newGame();
  put(g, "O", 0, 17, 3);
  E.press(g, "down");
  assert.equal(g.piece.row, 18);
  run(g, E.LOCK_MS - 1);
  assert.equal(g.piece.row, 18);
  run(g, 1);
  assert.equal(g.board[19 * E.W + 4], 1);
  assert.equal(g.piece.row, E.SPAWN_ROW);
});

test("hard drop lands on the ghost row, scores 2 per row and locks at once", () => {
  const g = newGame();
  put(g, "T", 0, 0, 3);
  const next = g.next;
  assert.equal(E.ghostRow(g), 18);
  E.press(g, "drop");
  assert.equal(g.score, 36);
  assert.deepEqual(boardRows(g, 18, 19), ["....#.....", "...###...."]);
  assert.equal(g.piece.type, next, "the next piece is already on screen");
  assert.equal(g.piece.row, E.SPAWN_ROW);
  assert.deepEqual(g.events, ["drop"]);
});

test("a hard drop that fills a line starts the clear at once and the row goes after 400 ms", () => {
  const g = newGame({ rows: ["###....###"] });
  put(g, "I", 0, -1, 3);
  E.press(g, "drop");
  assert.deepEqual(g.clearRows, [19]);
  assert.equal(g.piece, null);
  assert.equal(g.score, 100 + 2 * 19);
  assert.deepEqual(g.events, ["clear"]);
  run(g, E.CLEAR_MS - 1);
  assert.deepEqual(g.clearRows, [19]);
  run(g, 1);
  assert.equal(g.clearRows, null);
  assert.ok(g.piece);
  assert.ok(g.board.every((v) => v === 0));
});

test("a tap moves one cell; walls and blocks stop it without a sound", () => {
  const g = newGame();
  put(g, "T", 0, 5, 3);
  E.press(g, "left");
  E.release(g, "left");
  assert.equal(g.piece.col, 2);
  assert.deepEqual(g.events, ["move"]);
  g.events.length = 0;
  put(g, "T", 0, 5, 0);
  E.press(g, "left");
  E.release(g, "left");
  assert.equal(g.piece.col, 0);
  g.board[6 * E.W + 3] = 1; // T cells (5,1) (6,0..2): a block right of the flat side
  E.press(g, "right");
  E.release(g, "right");
  assert.equal(g.piece.col, 0);
  assert.deepEqual(g.events, []);
});

test("auto-shift: moves at 0, 170, 220 and 270 ms", () => {
  const g = newGame();
  put(g, "T", 0, 5, 0);
  const times = [];
  let col = g.piece.col;
  E.press(g, "right");
  for (let t = 0; t <= 300; t++) {
    if (t) E.step(g, 1);
    if (g.piece.col !== col) {
      times.push(t);
      col = g.piece.col;
    }
  }
  assert.deepEqual(times, [0, 170, 220, 270]);
});

test("left and right together: the last one wins, releasing it hands back with a fresh delay", () => {
  const g = newGame();
  put(g, "T", 0, 5, 4);
  E.press(g, "left");
  E.press(g, "right");
  assert.equal(g.piece.col, 4);
  assert.equal(g.dir, 1);
  E.release(g, "right");
  assert.equal(g.dir, -1);
  run(g, E.DAS_MS - 1);
  assert.equal(g.piece.col, 4);
  run(g, 1);
  assert.equal(g.piece.col, 3);
});

test("auto-shift stays charged at a wall and carries into the next piece", () => {
  const g = newGame();
  put(g, "O", 0, 5, 3);
  E.press(g, "left");
  run(g, 400);
  assert.equal(g.piece.col, -1);
  assert.equal(g.dasMs, E.DAS_MS);
  E.press(g, "drop");
  assert.equal(g.piece.col, E.SPAWN_COL);
  E.step(g, 1);
  assert.equal(g.piece.col, E.SPAWN_COL - 1);
});

test("lock delay: an idle piece locks exactly 500 ms after touching down", () => {
  const g = newGame();
  put(g, "O", 0, 18, 3);
  run(g, E.LOCK_MS - 1);
  assert.equal(g.piece.row, 18);
  run(g, 1);
  assert.equal(g.board[19 * E.W + 4], 1);
  assert.deepEqual(g.events, ["lock"]);
});

test("moving a grounded piece restarts the delay, 15 times at most", () => {
  const g = newGame();
  put(g, "O", 0, 18, 3);
  for (let i = 0; i < E.MAX_RESETS; i++) {
    run(g, 400);
    const key = i % 2 ? "right" : "left";
    E.press(g, key);
    E.release(g, key);
  }
  assert.equal(g.resets, E.MAX_RESETS);
  assert.equal(g.piece.row, 18);
  E.step(g, 1);
  assert.notEqual(g.piece.row, 18, "the next grounded step locks");
  assert.equal(g.events.at(-1), "lock");
});

test("reaching a new lowest row restores the reset budget", () => {
  const g = newGame({ rows: ["....##....", ".........."] });
  put(g, "O", 0, 16, 3); // resting on the ledge
  run(g, 100);
  E.press(g, "right");
  E.release(g, "right");
  run(g, 100);
  E.press(g, "right");
  E.release(g, "right"); // off the ledge
  assert.equal(g.resets, 2);
  run(g, 1000);
  assert.equal(g.piece.row, 17);
  assert.equal(g.resets, 0);
});

test("failed moves and rotations do not restart the delay", () => {
  const g = newGame();
  put(g, "O", 0, 18, -1);
  run(g, 300);
  E.press(g, "left");
  E.release(g, "left");
  E.press(g, "cw");
  assert.equal(g.lockMs, 300);
  assert.equal(g.resets, 0);
  run(g, 200);
  assert.equal(g.board[19 * E.W], 1);
});

test("rotation: cw turns clockwise on screen, ccw (the ROTATE button) the other way", () => {
  const g = newGame();
  put(g, "T", 0, 5, 3);
  E.press(g, "cw");
  assert.equal(g.piece.rot, 1);
  assert.ok(norm(cellsOf(g.piece)).includes(6 * 100 + 5), "the nub points right");
  E.press(g, "ccw");
  E.press(g, "ccw");
  assert.equal(g.piece.rot, 3);
  assert.ok(norm(cellsOf(g.piece)).includes(6 * 100 + 3), "the nub points left");
  E.press(g, "cw");
  for (let i = 0; i < 4; i++) E.press(g, "cw");
  assert.deepEqual(g.piece, { type: "T", rot: 0, row: 5, col: 3 });
});

test("O does not rotate: nothing changes, no sound", () => {
  const g = newGame();
  put(g, "O", 0, 5, 3);
  E.press(g, "cw");
  E.press(g, "ccw");
  assert.deepEqual(g.piece, { type: "O", rot: 0, row: 5, col: 3 });
  assert.deepEqual(g.events, []);
});

test("wall kicks: the I rotates off either wall", () => {
  const g = newGame();
  put(g, "I", 1, 10, -2); // vertical in column 0
  E.press(g, "ccw");
  assert.deepEqual(g.piece, { type: "I", rot: 0, row: 10, col: 0 }, "second test");
  put(g, "I", 3, 10, 8); // vertical in column 9
  E.press(g, "cw");
  assert.deepEqual(g.piece, { type: "I", rot: 0, row: 10, col: 6 }, "third test");
});

test("floor kick: a T lying on the floor rotates up one row", () => {
  const g = newGame();
  put(g, "T", 0, 18, 3);
  E.press(g, "cw");
  assert.deepEqual(g.piece, { type: "T", rot: 1, row: 17, col: 2 });
});

test("when every kick is blocked nothing changes", () => {
  const g = newGame({ rows: Array(6).fill("##########") });
  put(g, "T", 0, 17, 3);
  for (const [r, c] of cellsOf(g.piece)) g.board[r * E.W + c] = 0;
  E.press(g, "cw");
  E.press(g, "ccw");
  assert.deepEqual(g.piece, { type: "T", rot: 0, row: 17, col: 3 });
  assert.deepEqual(g.events, []);
});

test("a piece can rotate right after spawning (the old I could not)", () => {
  const g = newGame();
  g.next = "I";
  E.spawn(g);
  E.press(g, "cw");
  assert.deepEqual(g.piece, { type: "I", rot: 1, row: E.SPAWN_ROW, col: E.SPAWN_COL });
});

test("lines score 100, 300, 500 and 800 times the level", () => {
  for (const [n, points] of [[1, 100], [2, 300], [3, 500], [4, 800]]) {
    const rows = [0, 1, 2, 3].map((i) => (i >= 4 - n ? "#########." : ".........."));
    const g = newGame({ level: 3, rows });
    put(g, "I", 1, 0, 7); // vertical in column 9
    E.press(g, "drop");
    assert.equal(g.score, points * 3 + 2 * 16);
    assert.equal(g.lines, n);
    assert.deepEqual(g.events, [n === 4 ? "tetris" : "clear"]);
  }
});

test("lines that are not next to each other clear correctly", () => {
  const g = newGame({ rows: ["##.######.", "#########.", "#.#######.", "#########."] });
  put(g, "I", 1, 0, 7);
  E.press(g, "drop");
  assert.deepEqual(g.clearRows, [17, 19]);
  run(g, E.CLEAR_MS);
  assert.deepEqual(boardRows(g, 16, 19), ["..........", "..........", "##.#######", "#.########"]);
});

test("during the clear animation input waits and the next piece comes after 400 ms", () => {
  const g = newGame({ rows: ["#########."] });
  put(g, "I", 1, 0, 7);
  E.press(g, "drop");
  g.events.length = 0;
  for (const input of ["left", "cw", "drop", "down"]) E.press(g, input);
  run(g, E.CLEAR_MS - 1);
  assert.equal(g.piece, null);
  assert.deepEqual(g.events, []);
  run(g, 1);
  assert.ok(g.piece);
});

test("the level rises every 10 lines from the start level, up to 10; pieces alone never raise it", () => {
  const g = newGame({ level: 2, rows: ["#########."] });
  for (let i = 0; i < 30; i++) E.spawn(g);
  assert.equal(g.level, 2);
  g.lines = 9;
  put(g, "I", 1, 0, 7);
  E.press(g, "drop");
  assert.equal(g.level, 3);
  assert.deepEqual(g.events, ["clear", "level"]);
  const top = newGame({ level: 10, rows: ["#########."] });
  top.lines = 99;
  put(top, "I", 1, 0, 7);
  E.press(top, "drop");
  assert.equal(top.level, 10);
  assert.deepEqual(top.events, ["clear"]);
});

test("the score stops at 999 999", () => {
  const g = newGame({ rows: ["#########."] });
  g.score = E.SCORE_MAX - 10;
  put(g, "I", 1, 0, 7);
  E.press(g, "drop");
  assert.equal(g.score, E.SCORE_MAX);
});

// A simple placing bot for the fuzz: best spot by lines, holes and height.
function bestSpot(g) {
  const p = g.piece;
  let best = null;
  for (let rot = 0; rot < 4; rot++) {
    for (let col = -2; col < E.W; col++) {
      if (E.collide(g.board, p.type, rot, p.row, col)) continue;
      let row = p.row;
      while (!E.collide(g.board, p.type, rot, row + 1, col)) row += 1;
      const b = g.board.slice();
      for (const [r, c] of E.SHAPES[p.type][rot]) if (row + r >= 0) b[(row + r) * E.W + col + c] = 1;
      let score = 0;
      for (let c = 0; c < E.W; c++) {
        let top = -1;
        for (let r = 0; r < E.H; r++) {
          if (b[r * E.W + c]) top = top < 0 ? r : top;
          else if (top >= 0) score -= 4; // a hole
        }
        if (top >= 0) score -= (E.H - top) * 0.5;
      }
      for (let r = 0; r < E.H; r++) if (b.subarray(r * E.W, (r + 1) * E.W).every(Boolean)) score += 10;
      if (!best || score > best.score) best = { rot, col, score };
    }
  }
  return best;
}

test("fuzz: 400 seeded games (random input and a placing bot) keep every invariant", () => {
  const inputs = ["left", "right", "down", "drop", "cw", "ccw"];
  const count = (board) => board.reduce((n, v) => n + v, 0);
  let lines = 0;
  let overs = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const bot = seed > 200;
    const r = rng(seed * 7919);
    const g = newGame({ seed, level: 1 + (seed % 10) });
    E.spawn(g);
    let locks = 0;
    let target = null;
    let piece = null;
    for (let n = 0; !g.over && locks < 300; n++) {
      assert.ok(n < 200000, `game ${seed} ends`);
      if (bot && g.piece && g.piece !== piece) {
        piece = g.piece;
        target = bestSpot(g);
      }
      const x = r();
      if (bot && g.piece && x < 0.4) {
        // one action toward the target: turn, then slide, then drop
        if (g.piece.rot !== target.rot) E.press(g, "cw");
        else if (g.piece.col !== target.col) {
          const key = g.piece.col < target.col ? "right" : "left";
          const col = g.piece.col;
          E.press(g, key);
          E.release(g, key);
          if (g.piece && g.piece.col === col) E.press(g, "drop"); // blocked: give up on the spot
        } else E.press(g, "drop");
      } else if (!bot && x < 0.3) E.press(g, inputs[Math.floor(r() * inputs.length)]);
      else if (x < 0.5) E.release(g, inputs[Math.floor(r() * 3)]);
      E.step(g, 1 + r() * 40);
      locks += g.events.filter((e) => e === "lock" || e === "drop" || e === "clear" || e === "tetris").length;
      g.events.length = 0;
      if (g.over) break;
      const p = g.piece;
      if (p) assert.equal(E.collide(g.board, p.type, p.rot, p.row, p.col), false, "no overlap, never hidden");
      const removed = g.lines - (g.clearRows ? g.clearRows.length : 0);
      assert.equal(count(g.board), 4 * locks - 10 * removed, "cells are conserved");
      assert.equal(g.level, Math.min(10, g.startLevel + Math.floor(g.lines / 10)));
    }
    lines += g.lines;
    overs += g.over ? 1 : 0;
  }
  assert.ok(lines > 1000, `line clears are exercised (${lines})`);
  assert.ok(overs >= 200, "every random game ends");
});
