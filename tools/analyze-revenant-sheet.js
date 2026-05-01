/**
 * Analyze assets/Revenant.png cell layout + alpha/nonzero content per uniform grid cell.
 * Current sheet is 1254×1254 with ROWS × COLS (see ROWS/COLS below).
 * Run: node tools/analyze-revenant-sheet.js
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const pngPath = path.join(__dirname, "..", "assets", "Revenant.png");
const buf = fs.readFileSync(pngPath);
const png = PNG.sync.read(buf);
const W = png.width;
const H = png.height;
const ROWS = 3;
const COLS = 4;

const cw = Math.floor(W / COLS);
const ch = Math.floor(H / ROWS);

function boundsInCell(cx, cy, cw0, ch0, pred) {
  let minX = cw0,
    maxX = -1,
    minY = ch0,
    maxY = -1;
  for (let y = 0; y < ch0; y++) {
    for (let x = 0; x < cw0; x++) {
      const px = cx + x;
      const py = cy + y;
      const idx = (py * W + px) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      if (pred(r, g, b, a)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { sx: cx + minX, sy: cy + minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}

function countPred(cx, cy, cw0, ch0, pred) {
  let n = 0;
  for (let y = 0; y < ch0; y++) {
    for (let x = 0; x < cw0; x++) {
      const px = cx + x;
      const py = cy + y;
      const idx = (py * W + px) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      if (pred(r, g, b, a)) n++;
    }
  }
  return n;
}

console.log(JSON.stringify({ W, H, cw, ch, grid: `${ROWS}x${COLS}` }, null, 2));

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const cx = col * cw;
    const cy = row * ch;

    const aBounds = boundsInCell(cx, cy, cw, ch, (_, __, ___, a) => a > 8);
    const visibleBounds = boundsInCell(cx, cy, cw, ch, (r, g, b, a) => {
      // Any opaque-ish pixel OR any dark body pixel that's still drawable in canvas even if alpha 0 bug
      if (a > 8) return true;
      const mx = Math.max(r, g, b);
      return mx > 14;
    });

    const aPixels = countPred(cx, cy, cw, ch, (_, __, ___, a) => a > 8);
    const rgbPixels = countPred(cx, cy, cw, ch, (r, g, b, a) => {
      const mx = Math.max(r, g, b);
      return mx > 14;
    });

    console.log(
      `row=${row} col=${col} cx=${cx} cy=${cy} aPx=${aPixels} rgbPx=${rgbPixels} alphaCrop=${JSON.stringify(aBounds)} visible-ish=${JSON.stringify(visibleBounds)}`
    );
  }
}
