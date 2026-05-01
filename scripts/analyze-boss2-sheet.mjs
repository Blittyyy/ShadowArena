import fs from "fs";
import { PNG } from "pngjs";

const buf = fs.readFileSync(new URL("../assets/Boss2.png", import.meta.url));
const png = PNG.sync.read(buf);
const w = png.width;
const h = png.height;
const d = png.data;
const aTh = 28;

function occRow(y) {
  let n = 0;
  for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > aTh) n++;
  }
  return n;
}

const occ = [];
for (let y = 0; y < h; y++) occ[y] = occRow(y);

const sm = occ.slice();
for (let y = 1; y < h - 1; y++) sm[y] = (occ[y - 1] + occ[y] * 2 + occ[y + 1]) / 4;

/** @type {{a:number,b:number,len:number, minV:number}[]} */
const runs = [];
let inG = false;
let runS = 0;
for (let y = 0; y < h; y++) {
  const low = sm[y] < 14;
  if (low && !inG) {
    inG = true;
    runS = y;
  }
  if (!low && inG) {
    let minV = 1e9;
    for (let t = runS; t <= y - 1; t++) minV = Math.min(minV, sm[t]);
    runs.push({ a: runS, b: y - 1, len: y - runS, minV });
    inG = false;
  }
}

runs.sort((a, b) => b.len - a.len);
console.log(`Image ${w}×${h}`);
console.log(
  "Horizontal gutter runs (low sprite occupancy, longest first):",
  runs.filter((r) => r.len >= 3 && r.b < h - 12 && r.a > 4).slice(0, 8)
);

// Column boundaries: vertical lines with low alpha sum
function occCol(x) {
  let n = 0;
  for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3] > aTh) n++;
  return n;
}
const cold = [];
for (let x = 0; x < w; x++) cold[x] = occCol(x);
const colSm = cold.slice();
for (let x = 1; x < w - 1; x++) colSm[x] = (cold[x - 1] + cold[x] * 2 + cold[x + 1]) / 4;

const colRuns = [];
let ic = false,
  cs = 0;
for (let x = 0; x < w; x++) {
  const low = colSm[x] < 35;
  if (low && !ic) {
    ic = true;
    cs = x;
  }
  if (!low && ic) {
    colRuns.push({ a: cs, b: x - 1, len: x - cs });
    ic = false;
  }
}
colRuns.sort((a, b) => b.len - a.len);
console.log(
  "Vertical gutter candidates near 256/512/768:",
  colRuns.filter((r) => r.len >= 4 && r.a > 200 && r.a < 900).slice(0, 12)
);

// Proposed row splits: pick 3 deepest gutters in order top->bottom that partition
const good = runs.filter((r) => r.len >= 3 && r.b < h - 8 && r.a > 6);
good.sort((a, b) => a.a - b.a);
console.log("Sorted gutters for split pick:", good.slice(0, 6));

// Manual: try split Ys at middles of top 3 gutters by minV
const gutters = good
  .filter((r) => r.minV < 25)
  .map((r) => ({ mid: Math.floor((r.a + r.b) / 2), ...r }))
  .sort((a, b) => a.mid - b.mid);
console.log("Tight gutters mid-Y:", gutters);

// Equal 4 bands peak (diagnostic)
for (let r = 0; r < 4; r++) {
  const y0 = Math.floor((r * h) / 4);
  const y1 = Math.floor(((r + 1) * h) / 4);
  let peak = 0;
  for (let y = y0; y < y1; y++) peak = Math.max(peak, sm[y]);
  console.log(`equalRow ${r}: y ${y0}-${y1} peakOcc ${peak}`);
}

// Transparent vertical separators (perfect column gutters)
const zs = [];
for (let x = 0; x < w; x++) if (cold[x] === 0) zs.push(x);
/** @type {[number, number][]} */
const vRuns = [];
if (zs.length) {
  let vs = zs[0];
  let ve = zs[0];
  for (let i = 1; i < zs.length; i++) {
    if (zs[i] === ve + 1) ve = zs[i];
    else {
      vRuns.push([vs, ve]);
      vs = ve = zs[i];
    }
  }
  vRuns.push([vs, ve]);
}
const wideV = vRuns.filter(([a, b]) => b - a >= 2);
console.log("Full-vertical-transparent runs (len>=2):", wideV.slice(0, 40));
const splitters = wideV
  .map(([a, b]) => ({ a, b, mid: (a + b) >> 1 }))
  .filter((g) => g.a >= 220 && g.b <= 820)
  .sort((p, q) => p.mid - q.mid);
console.log("Splitter gutters in interior:", splitters);
if (splitters.length >= 3) {
  const cs = [
    0,
    splitters[0].b + 1,
    splitters[1].b + 1,
    splitters[2].b + 1,
    w,
  ];
  console.log("Derived columnStarts:", cs);
  for (let c = 0; c < 4; c++) console.log(`  col${c} fw=${cs[c + 1] - cs[c]}`);
}
