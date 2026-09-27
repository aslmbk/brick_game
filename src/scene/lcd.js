// The device screen drawn into a 2D canvas that becomes the LCD texture.
// Static parts are drawn once; a redraw copies them and adds the lit segments.

export const LCD_W = 540;
export const LCD_H = 660;

const INK = "#15180f";
const LIT = 0.9;
const GHOST = 0.3;
const UNLIT = 0.07;
const FONT = "italic 700 24px Arial, Helvetica, sans-serif";

// matrix: 10×20 cells, 30 px pitch
const MX = 20;
const MY = 30;
const PITCH = 30;

// right column, 7-segment digits 24×42 with an 8 px gap, right-aligned at x = 526
const RIGHT = 526;
const DIGIT_W = 24;
const DIGIT_GAP = 8;
const SMALL_DIGITS = 0.75;
const NEXT_X = 373;
const NEXT_Y = 226;

// segments a–g inside a 24×42 box, stroked 5 px wide
const SEGMENTS = [
  [4, 2.5, 20, 2.5],
  [21.5, 4, 21.5, 19.5],
  [21.5, 22.5, 21.5, 38],
  [4, 39.5, 20, 39.5],
  [2.5, 22.5, 2.5, 38],
  [2.5, 4, 2.5, 19.5],
  [4, 21, 20, 21],
];
const DIGIT_BITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

// y of each number row and its label
const SCORE_Y = 60;
const HI_Y = 142;
const STATS_Y = 400;

export function createLcd(canvas) {
  canvas.width = LCD_W;
  canvas.height = LCD_H;
  const ctx = canvas.getContext("2d");
  const reflector = layer();
  const base = layer();
  const ink = layer();

  drawReflector(reflector.getContext("2d"));
  const b = base.getContext("2d");
  b.drawImage(reflector, 0, 0);
  b.globalAlpha = UNLIT / LIT; // drawSegments multiplies by LIT
  drawSegments(b, allLit());
  b.globalAlpha = 1;

  return function draw(view) {
    if (view.mode === "off") {
      ctx.drawImage(reflector, 0, 0);
      return;
    }
    const i = ink.getContext("2d");
    i.clearRect(0, 0, LCD_W, LCD_H);
    drawSegments(i, view);
    ctx.drawImage(base, 0, 0);
    // lit segments cast a faint shadow onto the reflector behind the liquid crystal
    ctx.globalAlpha = 0.12;
    ctx.drawImage(ink, 2, 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(ink, 0, 0);
  };
}

function layer() {
  const c = document.createElement("canvas");
  c.width = LCD_W;
  c.height = LCD_H;
  return c;
}

// a view with every segment on: the unlit layer and the boot screen
function allLit() {
  return {
    mode: "boot",
    cells: new Uint8Array(200).fill(1),
    next: new Uint8Array(8).fill(1),
    score: 888888,
    hiScore: 888888,
    level: 88,
    lines: 8888,
    sound: true,
  };
}

function drawReflector(c) {
  const bg = c.createRadialGradient(250, 260, 0, 250, 260, 520);
  bg.addColorStop(0, "#bdbe9e");
  bg.addColorStop(0.5, "#b8b898");
  bg.addColorStop(1, "#aaab8b");
  c.fillStyle = bg;
  c.fillRect(0, 0, LCD_W, LCD_H);

  // the walls of the recess shade the edges of the glass
  edge(c, 0, 0, 0, 14, 0.2, 0, 0, LCD_W, 14);
  edge(c, 0, 0, 14, 0, 0.16, 0, 0, 14, LCD_H);
  edge(c, LCD_W, 0, LCD_W - 14, 0, 0.08, LCD_W - 14, 0, 14, LCD_H);
  edge(c, 0, LCD_H, 0, LCD_H - 14, 0.06, 0, LCD_H - 14, LCD_W, 14);

  // printed frame around the playfield
  c.globalAlpha = 0.45;
  c.strokeStyle = INK;
  c.lineWidth = 2;
  c.strokeRect(15, 25, 310, 610);
  c.globalAlpha = 1;
}

function edge(c, x0, y0, x1, y1, alpha, rx, ry, rw, rh) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(rx, ry, rw, rh);
}

function drawSegments(c, v) {
  c.fillStyle = INK;
  c.strokeStyle = INK;
  const alpha = c.globalAlpha;
  const on = (a) => {
    c.globalAlpha = alpha * a;
  };

  for (let i = 0; i < 200; i++) {
    const cell = v.cells[i];
    if (!cell) continue;
    on(cell === 2 ? GHOST : LIT);
    drawCell(c, MX + (i % 10) * PITCH, MY + Math.floor(i / 10) * PITCH);
  }

  on(LIT);
  c.font = FONT;
  c.textBaseline = "top";
  if (v.score !== null) c.fillText("SCORE", 340, 30);
  if (v.hiScore !== null) c.fillText("HI-SCORE", 340, 112);
  if (v.next.some(Boolean)) c.fillText("NEXT", 340, 196);
  if (v.level !== null) c.fillText("LEVEL", 340, 370);
  if (v.lines !== null) {
    c.textAlign = "right";
    c.fillText("LINES", RIGHT, 370);
    c.textAlign = "left";
  }

  number(c, v.score, 6, RIGHT, SCORE_Y);
  number(c, v.hiScore, 6, RIGHT, HI_Y);
  // smaller digits leave a clear gap between the two numbers
  number(c, v.level, 2, 382, STATS_Y, SMALL_DIGITS);
  number(c, v.lines, 4, RIGHT, STATS_Y, SMALL_DIGITS);

  for (let i = 0; i < 8; i++) {
    // the 2×4 preview sits in the middle rows of a 4×4 box
    if (v.next[i]) drawCell(c, NEXT_X + (i % 4) * PITCH, NEXT_Y + (1 + (i >> 2)) * PITCH);
  }

  const boot = v.mode === "boot";
  if (v.sound) speaker(c, 342, 474);
  if (boot || v.mode === "title" || v.mode === "over") c.fillText("START", 398, 476);
  if (boot || v.mode === "pause") {
    roundRect(c, 342, 520, 7, 22, 1.5);
    roundRect(c, 354, 520, 7, 22, 1.5);
    c.fillText("PAUSE", 370, 522);
  }
  if (boot || v.mode === "over") {
    c.font = FONT.replace("24px", "26px");
    c.fillText("GAME OVER", 342, 572);
  }
  c.globalAlpha = alpha;
}

// port of the old GridCell sprite: a rounded frame with a square inside
function drawCell(c, x, y) {
  c.lineWidth = 2.5;
  roundRect(c, x + 2.25, y + 2.25, 25.5, 25.5, 3, true);
  roundRect(c, x + 6.25, y + 6.25, 17.5, 17.5, 1.75);
}

// numbers are right-aligned; leading zeros stay dark like on the real device
function number(c, value, width, right, y, scale = 1) {
  if (value === null) return;
  const text = String(value);
  for (let k = 0; k < width && k < text.length; k++) {
    digit(c, DIGIT_BITS[+text[text.length - 1 - k]], right - ((k + 1) * DIGIT_W + k * DIGIT_GAP) * scale, y, scale);
  }
}

function digit(c, bits, x, y, scale) {
  c.save();
  c.translate(x, y);
  c.transform(scale, 0, -0.07 * scale, scale, 0, 0); // slight italic like LCD digits
  c.lineWidth = 5;
  c.lineCap = "round";
  c.beginPath();
  for (let s = 0; s < 7; s++) {
    if (!(bits & (1 << s))) continue;
    const [x0, y0, x1, y1] = SEGMENTS[s];
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
  }
  c.stroke();
  c.restore();
}

function speaker(c, x, y) {
  c.beginPath();
  c.moveTo(x, y + 7);
  c.lineTo(x + 7, y + 7);
  c.lineTo(x + 15, y);
  c.lineTo(x + 15, y + 24);
  c.lineTo(x + 7, y + 17);
  c.lineTo(x, y + 17);
  c.closePath();
  c.fill();
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(x + 17, y + 12, 7, -0.9, 0.9);
  c.stroke();
  c.beginPath();
  c.arc(x + 17, y + 12, 13, -0.9, 0.9);
  c.stroke();
}

// CanvasRenderingContext2D.roundRect is missing before iOS 16
function roundRect(c, x, y, w, h, r, stroke = false) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  if (stroke) c.stroke();
  else c.fill();
}
