// Tetris rules for the Brick Game LCD: a 10×20 board, SRS rotation and a 7-bag.
// Pure and deterministic: no DOM, no clock, no globals. Time comes in as dtMs,
// randomness as g.rng(), and sounds go out as names pushed to g.events.

export const W = 10;
export const H = 20;
export const SPAWN_ROW = -1;
export const SPAWN_COL = 3;
export const DAS_MS = 170;
export const ARR_MS = 50;
export const LOCK_MS = 500;
export const MAX_RESETS = 15;
export const CLEAR_MS = 400;
export const BLINK_MS = 100;
export const SCORE_MAX = 999999;
export const TYPES = "IJLOSTZ";

const POINTS = [0, 100, 300, 500, 800];

export const gravityMs = (level) => 1000 - (level - 1) * 100;
export const softMs = (level) => Math.max(25, gravityMs(level) / 20);

// Rotation 0 as [row, col] inside an n×n box; rows grow downward.
const SPAWN = {
  I: [4, [[1, 0], [1, 1], [1, 2], [1, 3]]],
  J: [3, [[0, 0], [1, 0], [1, 1], [1, 2]]],
  L: [3, [[0, 2], [1, 0], [1, 1], [1, 2]]],
  O: [4, [[0, 1], [0, 2], [1, 1], [1, 2]]],
  S: [3, [[0, 1], [0, 2], [1, 0], [1, 1]]],
  T: [3, [[0, 1], [1, 0], [1, 1], [1, 2]]],
  Z: [3, [[0, 0], [0, 1], [1, 1], [1, 2]]],
};

// States 1–3 are clockwise rotations inside the box; O keeps its only state.
export const SHAPES = {};
for (const [type, [n, cells]] of Object.entries(SPAWN)) {
  const states = [cells];
  for (let i = 1; i < 4; i++) {
    states.push(type === "O" ? cells : states[i - 1].map(([r, c]) => [c, n - 1 - r]));
  }
  SHAPES[type] = states;
}

// SRS wall kicks as [dCol, dRow]. The published tables use +y up, so dRow = −y.
export const KICKS = {
  JLSTZ: {
    "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  },
  I: {
    "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  },
};

// Next-piece preview: the spawn footprint, 2 rows × 4 columns (board cols 3–6).
export const PREVIEW = {};
for (const type of TYPES) {
  const cells = new Uint8Array(8);
  for (const [r, c] of SHAPES[type][0]) cells[r * 4 + c] = 1;
  PREVIEW[type] = cells;
}

export function createGame({ rng = Math.random, startLevel = 1, events = [] } = {}) {
  const g = {
    board: new Uint8Array(W * H), // locked cells only, index = row * W + col
    piece: null, // { type, rot, row, col } — row/col of the box's top-left corner
    next: null,
    bag: [],
    rng,
    events,
    score: 0,
    lines: 0,
    level: startLevel,
    startLevel,
    fallMs: 0,
    lockMs: 0,
    resets: 0,
    lowest: SPAWN_ROW,
    left: false,
    right: false,
    soft: false,
    dir: 0,
    dasMs: 0,
    clearRows: null,
    clearMs: 0,
    over: false,
  };
  g.next = take(g);
  return g;
}

// Rows above the screen (row < 0) are free space, but a piece may not hide
// there completely — otherwise an upward kick could leave it invisible.
export function collide(board, type, rot, row, col) {
  let visible = false;
  for (const [r, c] of SHAPES[type][rot]) {
    const R = row + r;
    const C = col + c;
    if (C < 0 || C >= W || R >= H || (R >= 0 && board[R * W + C])) return true;
    if (R >= 0) visible = true;
  }
  return !visible;
}

export function spawn(g) {
  const type = g.next;
  g.next = take(g);
  g.fallMs = 0;
  g.lockMs = 0;
  g.resets = 0;
  g.lowest = SPAWN_ROW;
  if (collide(g.board, type, 0, SPAWN_ROW, SPAWN_COL)) {
    g.over = true; // block-out: the board stays as it was
    g.events.push("over");
    return;
  }
  g.piece = { type, rot: 0, row: SPAWN_ROW, col: SPAWN_COL };
}

export function step(g, dt) {
  if (g.over) return;
  if (!g.piece) {
    // Line-clear animation: input waits, auto-shift keeps charging.
    if (g.dir) g.dasMs = Math.min(DAS_MS, g.dasMs + dt);
    if (g.clearRows && (g.clearMs += dt) >= CLEAR_MS) {
      removeRows(g);
      spawn(g);
    }
    return;
  }
  if (g.dir) {
    g.dasMs += dt;
    while (g.dasMs >= DAS_MS) {
      if (!shift(g, g.dir)) {
        g.dasMs = DAS_MS; // stay charged against a wall
        break;
      }
      g.dasMs -= ARR_MS;
    }
  }
  const every = g.soft ? softMs(g.level) : gravityMs(g.level);
  g.fallMs += dt;
  while (g.fallMs >= every) {
    g.fallMs -= every;
    if (!fall(g)) {
      g.fallMs = 0;
      break;
    }
    if (g.soft) addScore(g, 1);
  }
  const p = g.piece;
  if (!collide(g.board, p.type, p.rot, p.row + 1, p.col)) {
    g.lockMs = 0;
    return;
  }
  g.lockMs += dt;
  if (g.lockMs >= LOCK_MS || g.resets >= MAX_RESETS) lock(g, "lock");
}

export function press(g, input) {
  if (g.over) return;
  if (input === "left" || input === "right") {
    const d = input === "left" ? -1 : 1;
    g[input] = true;
    g.dir = d;
    g.dasMs = 0;
    if (g.piece) shift(g, d);
  } else if (input === "down") {
    if (g.soft) return;
    g.soft = true;
    g.fallMs = 0;
    if (g.piece && fall(g)) addScore(g, 1);
  } else if (input === "drop") {
    const p = g.piece;
    if (!p) return;
    const rows = ghostRow(g) - p.row;
    p.row += rows;
    addScore(g, 2 * rows);
    lock(g, "drop");
  } else if (input === "cw" || input === "ccw") {
    rotate(g, input === "cw" ? 1 : -1);
  }
}

export function release(g, input) {
  if (input === "down") {
    if (!g.soft) return;
    g.soft = false;
    g.fallMs = 0;
    return;
  }
  if ((input !== "left" && input !== "right") || !g[input]) return;
  const d = input === "left" ? -1 : 1;
  g[input] = false;
  if (g.dir === d) {
    g.dir = g[input === "left" ? "right" : "left"] ? -d : 0; // hand over to the other key
    g.dasMs = 0;
  }
}

export function releaseAll(g) {
  g.left = false;
  g.right = false;
  g.soft = false;
  g.dir = 0;
  g.dasMs = 0;
}

export function ghostRow(g) {
  const p = g.piece;
  let row = p.row;
  while (!collide(g.board, p.type, p.rot, row + 1, p.col)) row += 1;
  return row;
}

function take(g) {
  if (!g.bag.length) {
    const bag = [...TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(g.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    g.bag = bag;
  }
  return g.bag.pop();
}

function shift(g, d) {
  const p = g.piece;
  if (!p || collide(g.board, p.type, p.rot, p.row, p.col + d)) return false;
  p.col += d;
  moved(g);
  g.events.push("move");
  return true;
}

function fall(g) {
  const p = g.piece;
  if (collide(g.board, p.type, p.rot, p.row + 1, p.col)) return false;
  p.row += 1;
  moved(g);
  return true;
}

function rotate(g, dir) {
  const p = g.piece;
  if (!p || p.type === "O") return;
  const to = (p.rot + dir + 4) % 4;
  const kicks = KICKS[p.type === "I" ? "I" : "JLSTZ"][`${p.rot}>${to}`];
  for (const [dc, dr] of kicks) {
    if (!collide(g.board, p.type, to, p.row + dr, p.col + dc)) {
      p.rot = to;
      p.row += dr;
      p.col += dc;
      moved(g);
      g.events.push("rotate");
      return;
    }
  }
}

// Lock delay: reaching a new lowest row restores the reset budget; any other
// successful move while grounded restarts the timer and spends one reset.
function moved(g) {
  if (g.piece.row > g.lowest) {
    g.lowest = g.piece.row;
    g.resets = 0;
    g.lockMs = 0;
  } else if (g.lockMs > 0) {
    g.resets += 1;
    g.lockMs = 0;
  }
}

function lock(g, event) {
  const p = g.piece;
  const rows = [];
  let out = false;
  for (const [r, c] of SHAPES[p.type][p.rot]) {
    const row = p.row + r;
    if (row < 0) {
      out = true;
      continue;
    }
    g.board[row * W + p.col + c] = 1;
    if (!rows.includes(row)) rows.push(row);
  }
  g.piece = null;
  if (out) {
    g.over = true; // lock-out: part of the piece is above the screen
    g.events.push("over");
    return;
  }
  const full = rows.filter((row) => isFull(g.board, row)).sort((a, b) => a - b);
  if (!full.length) {
    g.events.push(event);
    spawn(g);
    return;
  }
  addScore(g, POINTS[full.length] * g.level);
  g.lines += full.length;
  g.events.push(full.length === 4 ? "tetris" : "clear");
  const level = Math.min(10, g.startLevel + Math.floor(g.lines / 10));
  if (level > g.level) {
    g.level = level;
    g.events.push("level");
  }
  g.clearRows = full;
  g.clearMs = 0;
}

function isFull(board, row) {
  for (let c = 0; c < W; c++) if (!board[row * W + c]) return false;
  return true;
}

// Rows go in ascending order, so removing one never moves the next one.
function removeRows(g) {
  for (const row of g.clearRows) {
    g.board.copyWithin(W, 0, row * W);
    g.board.fill(0, 0, W);
  }
  g.clearRows = null;
}

function addScore(g, n) {
  g.score = Math.min(SCORE_MAX, g.score + n);
}
