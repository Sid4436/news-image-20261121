// news-image-20261121 — "The World in One Day"
// Sums up Saturday 21 November 2026 world news in one 1024x1024 PNG.
// Drawn entirely in code: hand-rolled PNG encoder (node:zlib deflate) and
// a hand-defined 5x7 bitmap font. No external libraries, no network,
// no images from the internet. Deterministic: two runs => identical bytes.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 3 + 1);
    raw[rowStart] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), rowStart + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ framebuffer
const fb = new Uint8Array(W * H * 3);
type RGB = [number, number, number];
function fill(r: RGB, x0: number, y0: number, x1: number, y1: number): void {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  for (let y = y0; y < y1; y++) {
    let i = (y * W + x0) * 3;
    for (let x = x0; x < x1; x++, i += 3) {
      fb[i] = r[0]; fb[i + 1] = r[1]; fb[i + 2] = r[2];
    }
  }
}
function px(c: RGB, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
}
function hline(c: RGB, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) px(c, x, y);
}
function vline(c: RGB, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) px(c, x, y);
}
function line(c: RGB, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    px(c, x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}
function thickLine(c: RGB, x0: number, y0: number, x1: number, y1: number, t: number): void {
  const r = Math.floor(t / 2);
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) line(c, x0 + a, y0 + b, x1 + a, y1 + b);
}
function rect(c: RGB, x: number, y: number, w: number, h: number): void {
  fill(c, x, y, x + w, y + h);
}
function frame(c: RGB, x: number, y: number, w: number, h: number, t: number): void {
  fill(c, x, y, x + w, y + t);
  fill(c, x, y + h - t, x + w, y + h);
  fill(c, x, y, x + t, y + h);
  fill(c, x + w - t, y, x + w, y + h);
}
function circle(c: RGB, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    hline(c, cx - half, cx + half, cy + y);
  }
}
function ring(c: RGB, cx: number, cy: number, r: number, t: number): void {
  for (let a = 0; a <= t; a++) {
    const rr = r - a;
    for (let y = -rr; y <= rr; y++) {
      const half = Math.floor(Math.sqrt(rr * rr - y * y));
      px(c, cx - half, cy + y); px(c, cx + half, cy + y);
    }
  }
}
function tri(c: RGB, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
  const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: [number, number, number, number][] = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.floor(Math.min(...xs)), hi = Math.ceil(Math.max(...xs));
      hline(c, lo, hi, y);
    }
  }
}

// ------------------------------------------------------- 5x7 bitmap font
// Each glyph: 7 rows of 5 bits, "1" = ink. Hand-defined in this file.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10001", "10000", "10001", "01110"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11110", "01000", "01000", "01000"],
  g: ["00000", "01111", "10001", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "11110", "10001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "10010", "01100"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "10001", "11110", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["01000", "01000", "11100", "01000", "01000", "01000", "00110"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10101", "10101", "10101", "01010"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
  "<": ["00001", "00010", "00100", "01000", "00100", "00010", "00001"],
  // __APPEND_FONT__
};
// ------------------------------------------------------------ text drawing
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawChar(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] ?? FONT["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "1") fill(c, x + col * scale, y + r * scale, x + (col + 1) * scale, y + (r + 1) * scale);
    }
  }
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  for (let i = 0; i < s.length; i++) drawChar(s[i], x + i * 6 * scale, y, scale, c);
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
// Greedy word wrap. Returns lines that fit maxWidth px.
function wrap(s: string, scale: number, maxWidth: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== "") lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawWrapped(s: string, x: number, y: number, scale: number, c: RGB, maxWidth: number, lineH: number, maxLines: number): number {
  const lines = wrap(s, scale, maxWidth).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(ln, x, y + i * lineH, scale, c));
  return y + lines.length * lineH;
}

// ------------------------------------------------------------------ palette
const PAPER: RGB = [246, 241, 227];
const INK: RGB = [16, 36, 62];
const NAVY: RGB = [16, 36, 62];
const GOLD: RGB = [217, 164, 65];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [179, 38, 30];
const TEAL: RGB = [14, 107, 107];
const BLUE: RGB = [31, 93, 168];
const ORANGE: RGB = [214, 106, 24];
const GREEN: RGB = [46, 125, 50];
const GREY: RGB = [90, 96, 104];
const CARD_LINE: RGB = [200, 192, 172];

// -------------------------------------------------------------------- icons
// Each icon is drawn inside a 96x88 box at (x, y). All vector shapes.
function iconMissile(x: number, y: number): void {
  // sky + ground
  rect([232, 238, 245], x, y, 96, 88);
  // explosion star behind
  circle(GOLD, x + 66, y + 26, 16);
  circle([255, 214, 120], x + 66, y + 26, 10);
  // missile body, diagonal
  thickLine([120, 120, 124], x + 18, y + 74, x + 52, y + 30, 7);
  tri(RED, x + 52, y + 30, x + 44, y + 20, x + 62, y + 24);
  tri(RED, x + 18, y + 74, x + 26, y + 66, x + 14, y + 62);
  // flame
  tri(ORANGE, x + 18, y + 74, x + 8, y + 84, x + 26, y + 82);
  // ground line
  hline(INK, x + 6, x + 90, y + 80);
  thickLine(INK, x + 6, y + 80, x + 30, y + 66, 3);
  thickLine(INK, x + 40, y + 80, x + 58, y + 70, 3);
}
function iconChart(x: number, y: number): void {
  rect([232, 238, 245], x, y, 96, 88);
  // axes
  thickLine(INK, x + 10, y + 10, x + 10, y + 76, 3);
  thickLine(INK, x + 10, y + 76, x + 88, y + 76, 3);
  // falling line
  thickLine(RED, x + 14, y + 22, x + 34, y + 34, 4);
  thickLine(RED, x + 34, y + 34, x + 54, y + 30, 4);
  thickLine(RED, x + 54, y + 30, x + 84, y + 62, 4);
  // arrow head
  tri(RED, x + 84, y + 62, x + 70, y + 60, x + 82, y + 48);
  // dots
  circle(RED, x + 14, y + 22, 4);
  circle(RED, x + 34, y + 34, 4);
  circle(RED, x + 54, y + 30, 4);
}
function iconScales(x: number, y: number): void {
  rect([232, 238, 245], x, y, 96, 88);
  // pillar + beam
  thickLine(INK, x + 48, y + 12, x + 48, y + 76, 4);
  thickLine(INK, x + 16, y + 20, x + 80, y + 20, 4);
  circle(GOLD, x + 48, y + 12, 5);
  // left pan
  line(INK, x + 18, y + 20, x + 10, y + 44);
  line(INK, x + 18, y + 20, x + 26, y + 44);
  tri(GOLD, x + 6, y + 44, x + 30, y + 44, x + 18, y + 58);
  // right pan
  line(INK, x + 78, y + 20, x + 70, y + 44);
  line(INK, x + 78, y + 20, x + 86, y + 44);
  tri(GOLD, x + 66, y + 44, x + 90, y + 44, x + 78, y + 58);
  // base
  thickLine(INK, x + 34, y + 76, x + 62, y + 76, 4);
}
function iconFlags(x: number, y: number): void {
  rect([232, 238, 245], x, y, 96, 88);
  // poles
  thickLine(INK, x + 22, y + 12, x + 22, y + 78, 3);
  thickLine(INK, x + 70, y + 12, x + 70, y + 78, 3);
  // EU flag: blue field, ring of gold dots
  rect(BLUE, x + 24, y + 14, 34, 24);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circle(GOLD, Math.round(x + 41 + 8 * Math.cos(a)), Math.round(y + 26 + 7 * Math.sin(a)), 2);
  }
  // UK flag: blue field, white + red cross
  rect(BLUE, x + 40, y + 44, 34, 24);
  rect(WHITE, x + 40, y + 52, 34, 8);
  rect(WHITE, x + 52, y + 44, 10, 24);
  rect(RED, x + 40, y + 54, 34, 4);
  rect(RED, x + 54, y + 44, 6, 24);
  // handshake dots below
  circle(GREEN, x + 30, y + 80, 3);
  circle(GREEN, x + 48, y + 80, 3);
  circle(GREEN, x + 66, y + 80, 3);
}
function iconClimate(x: number, y: number): void {
  rect([232, 238, 245], x, y, 96, 88);
  // globe
  circle(TEAL, x + 40, y + 42, 28);
  circle([168, 214, 205], x + 40, y + 42, 28);
  // land blobs (simplified continents)
  circle(GREEN, x + 32, y + 34, 8);
  circle(GREEN, x + 50, y + 50, 9);
  circle(GREEN, x + 46, y + 30, 5);
  // meridian lines
  ring(TEAL, x + 40, y + 42, 28, 2);
  vline(TEAL, x + 40, y + 14, y + 70);
  hline(TEAL, x + 12, x + 68, y + 42);
  // thermometer
  rect(WHITE, x + 76, y + 16, 10, 44);
  frame(RED, x + 76, y + 16, 10, 44, 2);
  rect(RED, x + 78, y + 44, 6, 14);
  circle(RED, x + 81, y + 64, 8);
  // sun
  circle(GOLD, x + 80, y + 12, 0);
}
function iconQuake(x: number, y: number): void {
  rect([232, 238, 245], x, y, 96, 88);
  // buildings
  rect(INK, x + 12, y + 34, 20, 46);
  rect(INK, x + 38, y + 22, 20, 58);
  rect(INK, x + 64, y + 40, 20, 40);
  // windows
  rect(GOLD, x + 17, y + 40, 5, 5);
  rect(GOLD, x + 24, y + 52, 5, 5);
  rect(GOLD, x + 43, y + 28, 5, 5);
  rect(GOLD, x + 50, y + 42, 5, 5);
  rect(GOLD, x + 69, y + 46, 5, 5);
  // crack zigzag through the ground
  thickLine(RED, x + 6, y + 80, x + 24, y + 68, 3);
  thickLine(RED, x + 24, y + 68, x + 40, y + 78, 3);
  thickLine(RED, x + 40, y + 78, x + 58, y + 66, 3);
  thickLine(RED, x + 58, y + 66, x + 76, y + 78, 3);
  thickLine(RED, x + 76, y + 78, x + 90, y + 68, 3);
  // shaking motion marks
  hline(ORANGE, x + 14, x + 30, y + 16);
  hline(ORANGE, x + 40, x + 56, y + 10);
  hline(ORANGE, x + 66, x + 82, y + 18);
}

// -------------------------------------------------------------------- cards
interface Story {
  tag: string;
  color: RGB;
  headline: string;
  body: string;
  icon: (x: number, y: number) => void;
}
// Six stories, every fact verified against at least two news sources
// reporting on 21 November 2026 (see README for the source list).
const STORIES: Story[] = [
  {
    tag: "WAR IN EUROPE",
    color: RED,
    headline: "RUSSIA STRIKES UKRAINE; MISSILES LAND IN POLAND",
    body: "Over 400 drones and 110 missiles hit Ukraine; at least eight killed in Kyiv. Poland called the landings a deliberate provocation.",
    icon: iconMissile,
  },
  {
    tag: "MARKETS",
    color: BLUE,
    headline: "AI SELL-OFF DRAGS S&P 500 INTO CORRECTION",
    body: "US stocks fell sharply on Friday. The S&P 500 dropped 3.7% as AI and chip shares plunged; the Nasdaq erased its 2026 gains.",
    icon: iconChart,
  },
  {
    tag: "JUSTICE",
    color: TEAL,
    headline: "COURT: MYANMAR GUILTY OF ROHINGYA GENOCIDE",
    body: "The International Court of Justice found Myanmar responsible for genocide against the Rohingya. Myanmar called the ruling biased.",
    icon: iconScales,
  },
  {
    tag: "EUROPE",
    color: GREEN,
    headline: "UK AND EU SIGN BIGGEST POST-BREXIT DEALS",
    body: "Three deals on food trade, carbon markets and youth mobility - the biggest step toward the EU since Brexit - were signed in Brussels.",
    icon: iconFlags,
  },
  {
    tag: "CLIMATE",
    color: ORANGE,
    headline: "COP31 TALKS DEADLOCK OVER FOSSIL FUELS",
    body: "The UN climate summit in Antalya ran past its deadline as nearly 200 nations failed to agree on fossil fuels.",
    icon: iconClimate,
  },
  {
    tag: "DISASTER",
    color: [122, 63, 140],
    headline: "6.8 QUAKE SHAKES PERU; LIMA FLEES OUTDOORS",
    body: "A magnitude 6.8 earthquake struck central Peru. Lima residents rushed outdoors and lawmakers left Congress; no deaths were reported.",
    icon: iconQuake,
  },
];

function drawCard(s: Story, x: number, y: number, w: number, h: number): void {
  rect(WHITE, x, y, w, h);
  frame(CARD_LINE, x, y, w, h, 2);
  rect(s.color, x, y, w, 10);
  // tag
  drawText(s.tag, x + 16, y + 22, 2, s.color);
  // icon box
  s.icon(x + 16, y + 48);
  frame(CARD_LINE, x + 16, y + 48, 96, 88, 2);
  // headline + body, right of the icon
  const tx = x + 128;
  const tw = w - 128 - 16;
  drawWrapped(s.headline, tx, y + 46, 3, INK, tw, 26, 3);
  drawWrapped(s.body, tx, y + 132, 2, [52, 58, 66], tw, 19, 5);
}

// --------------------------------------------------------------------- main
function main(): void {
  fill(PAPER, 0, 0, W, H);

  // Masthead
  rect(NAVY, 0, 0, W, 152);
  rect(GOLD, 0, 152, W, 6);
  drawTextCentered("THE WORLD IN ONE DAY", W / 2, 16, 5, WHITE);
  drawTextCentered("SATURDAY, 21 NOVEMBER 2026", W / 2, 66, 4, GOLD);
  drawTextCentered("SIX STORIES FROM AROUND THE GLOBE", W / 2, 112, 2, [190, 200, 214]);

  // Cards: 2 columns x 3 rows
  const gx = 24, gy = 176;
  const cw = 480, ch = 252, gapX = 16, gapY = 14;
  STORIES.forEach((s, i) => {
    const cx = gx + (i % 2) * (cw + gapX);
    const cy = gy + Math.floor(i / 2) * (ch + gapY);
    drawCard(s, cx, cy, cw, ch);
  });

  // Footer
  const fy = 952;
  hline(CARD_LINE, 24, W - 24, fy);
  drawTextCentered("SOURCES: REUTERS - BBC - THE GUARDIAN - FRANCE 24 - AL JAZEERA", W / 2, fy + 12, 2, GREY);
  drawTextCentered("ALL EVENTS OF SATURDAY, 21 NOVEMBER 2026", W / 2, fy + 36, 2, INK);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG(fb, W, H));
}

main();
