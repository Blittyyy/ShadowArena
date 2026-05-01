import { CONFIG } from "./config.js?v=2026-04-30-coop-vs-balance-1";

// Dev: quick cache-buster sanity check (remove anytime).
try {
  console.log("[assets] loaded v-2026-04-29-rev-ylock-4");
} catch {
  // ignore
}

/**
 * Default: 4 columns × N equal-height row bands (floor(imageHeight / N)).
 * Optional: `sheetSlice.rowBandStarts` as Y boundaries `[0, y1, …, imageHeight]` (length N+1) and
 * `labelSkipYRows` / `padBottomRows` per row (manual override). Slime uses `autoRowBands` + canvas readback
 * to infer gutters from transparency (no coordinates in the PNG file — we scan pixels after load).
 * Absolute strip: `walkSy` + `walkSh`.
 */
const SHEET_COLS = 4;
const SHEET_ROWS = 5;

const LABEL_SHEET = {
  /** Pixels skipped below row band top (past row title text). Player overrides via CONFIG.PLAYER_SHEET_LABEL_SKIP_Y. */
  labelSkipY: 72,
  padBottom: 8,
};

/** HTMLCanvasElement uses width/height; HTMLImageElement uses naturalWidth/naturalHeight (intrinsic). */
function bitmapSourceW(img) {
  if (!img) return 0;
  const nw = img.naturalWidth;
  if (typeof nw === "number" && nw > 0) return nw;
  const cw = img.width;
  return typeof cw === "number" && cw > 0 ? cw : 0;
}

function bitmapSourceH(img) {
  if (!img) return 0;
  const nh = img.naturalHeight;
  if (typeof nh === "number" && nh > 0) return nh;
  const ch = img.height;
  return typeof ch === "number" && ch > 0 ? ch : 0;
}

function frameWidthFromImage(img, cols = SHEET_COLS) {
  const c = Math.max(1, Math.floor(Number(cols) || SHEET_COLS));
  const w = bitmapSourceW(img);
  if (w < c * 8) return null;
  return Math.floor(w / c);
}

function rowBandHeight(img) {
  return Math.floor(bitmapSourceH(img) / SHEET_ROWS);
}

function rowBandHeightFor(img, rowCount) {
  const rows = rowCount ?? SHEET_ROWS;
  return Math.floor(bitmapSourceH(img) / rows);
}

function clampRowInt(v, lo, hi) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Pixel Y starts for each row band; length must be `rows + 1`, last = image height.
 * When omitted, uses equal bands: [0, h/r, 2h/r, …, h].
 */
function rowBandStartsFor(img, opts) {
  const rows = opts?.rows ?? SHEET_ROWS;
  const H = bitmapSourceH(img);
  const custom = opts?.rowBandStarts;
  if (Array.isArray(custom) && custom.length === rows + 1) {
    const s = custom.map((v) => clampRowInt(v, 0, H));
    s[0] = 0;
    s[s.length - 1] = H;
    for (let i = 1; i < s.length; i++) {
      if (s[i] < s[i - 1]) s[i] = s[i - 1];
    }
    return s;
  }
  const bh = Math.floor(H / rows);
  const s = [0];
  for (let i = 1; i < rows; i++) s.push(i * bh);
  s.push(H);
  return s;
}

function labelSkipForRow(opts, row) {
  const per = opts?.labelSkipYRows;
  if (Array.isArray(per) && row >= 0 && row < per.length && typeof per[row] === "number") {
    return per[row];
  }
  return opts?.labelSkipY ?? LABEL_SHEET.labelSkipY;
}

function padBottomForRow(opts, row) {
  const per = opts?.padBottomRows;
  if (Array.isArray(per) && row >= 0 && row < per.length && typeof per[row] === "number") {
    return per[row];
  }
  return opts?.padBottom ?? LABEL_SHEET.padBottom;
}

const SLIME_SHEET_ROWS = 5;
const SLIME_ALPHA_FLOOR = 14;
const SLIME_MIN_ROW_BAND = 44;
const SLIME_MIN_SLICE_H = 32;

/** @type {{ key: string; layout: { rowBandStarts: number[]; labelSkipYRows: number[] } | null }} */
let slimeAutoLayoutCache = { key: "", layout: null };

export function invalidateSlimeSliceCache() {
  slimeAutoLayoutCache = { key: "", layout: null };
}

/**
 * Boss1.png currently ships with a white background. We key out neutral near-white so the boss doesn't
 * render with a white box and pixel scanning works as expected.
 * @returns {HTMLCanvasElement | null}
 */
function buildBossChromaKeyedCanvas(img) {
  if (typeof document === "undefined") return null;
  const w = bitmapSourceW(img);
  const h = bitmapSourceH(img);
  if (w < 8 || h < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const d = imageData.data;
  const minRgb = 246;
  const maxDelta = 18;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (a < 12) continue;
    if (r < minRgb || g < minRgb || b < minRgb) continue;
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    if (hi - lo <= maxDelta) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Canva / flat #fff-style sheets: opaque white reads as “solid slime” to row heuristics and can fail
 * `isEnemySpriteReady` (nothing draws). Copy to canvas and clear neutral near-white to transparent.
 * @returns {HTMLCanvasElement | null}
 */
function buildSlimeChromaKeyedCanvas(img) {
  if (typeof document === "undefined") return null;
  const w = bitmapSourceW(img);
  const h = bitmapSourceH(img);
  if (w < 8 || h < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const minRgb =
    typeof CONFIG.SLIME_KEY_WHITE_MIN_RGB === "number" ? CONFIG.SLIME_KEY_WHITE_MIN_RGB : 248;
  const maxDelta =
    typeof CONFIG.SLIME_KEY_WHITE_MAX_CHANNEL_DELTA === "number"
      ? CONFIG.SLIME_KEY_WHITE_MAX_CHANNEL_DELTA
      : 14;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (a < 12) continue;
    if (g > r + 10 && g > b + 6) continue;
    if (r < minRgb || g < minRgb || b < minRgb) continue;
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    if (hi - lo <= maxDelta) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Whip.png currently ships with an opaque black background. Copy to canvas and clear near-black pixels
 * to transparent so tinting/afterimages don't show as colored rectangles.
 * @returns {HTMLCanvasElement | null}
 */
function buildWhipChromaKeyedCanvas(img) {
  if (typeof document === "undefined") return null;
  const w = bitmapSourceW(img);
  const h = bitmapSourceH(img);
  if (w < 8 || h < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const maxRgb =
    typeof CONFIG.WHIP_KEY_BLACK_MAX_RGB === "number" ? CONFIG.WHIP_KEY_BLACK_MAX_RGB : 20;
  const maxDelta =
    typeof CONFIG.WHIP_KEY_BLACK_MAX_CHANNEL_DELTA === "number"
      ? CONFIG.WHIP_KEY_BLACK_MAX_CHANNEL_DELTA
      : 22;
  const d = imageData.data;
  const nPix = w * h;
  const visited = new Uint8Array(nPix);
  /** @type {number[]} */
  const q = [];
  let qi = 0;

  const rgbaAt = (idx) => {
    const off = idx * 4;
    return { r: d[off], g: d[off + 1], b: d[off + 2], a: d[off + 3], off };
  };

  const isNeutralDark = (r, g, b) => {
    if (r > maxRgb || g > maxRgb || b > maxRgb) return false;
    const lo = Math.min(r, g, b);
    const hi = Math.max(r, g, b);
    return hi - lo <= maxDelta;
  };

  const isWalkable = (idx) => {
    const { r, g, b, a } = rgbaAt(idx);
    // Transparent pixels are "air" — walk through them from the border to reach interior background.
    if (a < 12) return true;
    // Don't walk through bright pixels (likely part of the whip / highlights / glow).
    if (Math.max(r, g, b) > Math.max(maxRgb + 18, 140)) return false;
    // Walk through dark-ish pixels (background + dark chain links), but avoid walking through very bright areas.
    return true;
  };

  const isClearTarget = (idx) => {
    const { r, g, b, a } = rgbaAt(idx);
    if (a < 12) return false; // already transparent
    // Only clear neutral-ish dark pixels (typical flat export background).
    return isNeutralDark(r, g, b);
  };

  const enqueue = (idx) => {
    if (idx < 0 || idx >= nPix) return;
    if (visited[idx]) return;
    if (!isWalkable(idx)) return;
    visited[idx] = 1;
    q.push(idx);
  };

  // Seed BFS from the entire border.
  for (let x = 0; x < w; x++) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueue(y * w);
    enqueue(y * w + (w - 1));
  }

  while (qi < q.length) {
    const idx = q[qi++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) enqueue(idx - 1);
    if (x + 1 < w) enqueue(idx + 1);
    if (y > 0) enqueue(idx - w);
    if (y + 1 < h) enqueue(idx + w);
  }

  // Clear only visited pixels that look like flat background (not already transparent).
  let cleared = 0;
  for (let idx = 0; idx < nPix; idx++) {
    if (!visited[idx]) continue;
    if (!isClearTarget(idx)) continue;
    const off = idx * 4;
    d[off + 3] = 0;
    cleared++;
  }
  ctx.putImageData(imageData, 0, 0);
  // Dev visibility: confirms whether keying ran + roughly how much background was cleared.
  try {
    console.log(`[assets] whip key-out: ${w}x${h}, cleared ${cleared} px (maxRgb=${maxRgb}, maxDelta=${maxDelta})`);
  } catch {
    // ignore
  }
  return canvas;
}

/**
 * Compute per-frame pixel offsets so sprites don't "zoetrope" (shift) between frames due to inconsistent
 * centering / foot placement inside the source cells. Offsets are in SOURCE pixels and should be
 * multiplied by draw scale at render time.
 *
 * @param {CanvasImageSource} img
 * @param {{
 *   sy: number;
 *   sh: number;
 *   cols: number;
 *   frameCols: number[];
 *   alphaThreshold?: number;
 *   padTop?: number;
 *   padBottom?: number;
 * }} strip
 * @returns {{ dx: number; dy: number }[]}
 */
function computeFrameOffsetsForStrip(img, strip) {
  if (typeof document === "undefined") return [];
  const w = bitmapSourceW(img);
  const h = bitmapSourceH(img);
  const cols = Math.max(1, Math.floor(strip.cols ?? 8));
  const fw = Math.floor(w / cols);
  const sy = Math.max(0, Math.min(h - 1, Math.trunc(strip.sy ?? 0)));
  const sh = Math.max(1, Math.min(h - sy, Math.trunc(strip.sh ?? (h - sy))));
  const alphaT = typeof strip.alphaThreshold === "number" ? strip.alphaThreshold : 22;
  const padTop = typeof strip.padTop === "number" ? Math.max(0, Math.trunc(strip.padTop)) : 0;
  const padBottom = typeof strip.padBottom === "number" ? Math.max(0, Math.trunc(strip.padBottom)) : 0;
  const frameCols = Array.isArray(strip.frameCols) ? strip.frameCols : [];
  if (!fw || frameCols.length === 0) return [];

  const c = document.createElement("canvas");
  c.width = w;
  c.height = sy + sh;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  let id;
  try {
    id = ctx.getImageData(0, sy, w, sh);
  } catch {
    return [];
  }
  const data = id.data;

  /** @type {{ cx: number; footY: number }[]} */
  const stats = [];
  for (const col of frameCols) {
    const x0 = Math.max(0, Math.min(w - 1, Math.trunc(col) * fw));
    const x1 = Math.max(0, Math.min(w, x0 + fw));
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const yStart = Math.max(0, Math.min(sh - 1, padTop));
    const yEnd = Math.max(yStart + 1, Math.min(sh, sh - padBottom));
    for (let y = yStart; y < yEnd; y++) {
      const rowOff = y * w * 4;
      for (let x = x0; x < x1; x++) {
        const a = data[rowOff + x * 4 + 3];
        if (a > alphaT) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!Number.isFinite(minX) || maxX < 0 || maxY < 0) {
      // If a frame is empty (shouldn't happen), default to center + bottom of strip.
      stats.push({ cx: x0 + fw * 0.5, footY: sh - 1 });
    } else {
      stats.push({ cx: (minX + maxX) * 0.5, footY: maxY });
    }
  }

  const cxs = stats.map((s) => s.cx).sort((a, b) => a - b);
  const commonCx = cxs.length ? cxs[Math.floor(cxs.length / 2)] : fw * 0.5;
  let commonFoot = 0;
  for (const s of stats) commonFoot = Math.max(commonFoot, s.footY);

  return stats.map((s) => ({
    dx: commonCx - s.cx,
    dy: commonFoot - s.footY,
  }));
}

/**
 * Compute per-frame offsets for a grid-sliced enemy animation (uses `sliceForCell` + `enemySliceOpts`).
 * This stabilizes "bobbing" / horizontal staggering from inconsistent art pivots within frames.
 *
 * Offsets are returned in SLICE-LOCAL pixels and should be multiplied by draw scale.
 *
 * @param {string} typeId
 * @param {string} animKey
 * @returns {{ dx: number; dy: number }[]}
 */
function computeFrameOffsetsForGridAnim(typeId, animKey) {
  if (typeof document === "undefined") return [];
  const spec = SPRITES[typeId];
  const anim = spec?.animations?.[animKey];
  if (!spec || !anim) return [];
  const aid = enemyAssetTypeId(typeId);
  const img = images[aid];
  if (!img || bitmapSourceW(img) <= 0 || bitmapSourceH(img) <= 0) return [];

  const frames = Math.max(1, Math.floor(anim.frames ?? 1));
  const sliceOpts = enemySliceOpts(typeId, animKey);
  const fw = frameWidthFromImage(img, sliceOpts?.cols);
  if (!fw) return [];

  const alphaT = 22;
  /** @type {{ cx: number; footY: number }[]} */
  const stats = [];

  // Use a 1-frame canvas reused for speed.
  const c = document.createElement("canvas");
  const cctx = c.getContext("2d", { willReadFrequently: true });
  if (!cctx) return [];

  for (let col = 0; col < frames; col++) {
    const slice = sliceForCell(img, col, anim.row, fw, sliceOpts);
    if (!slice) {
      stats.push({ cx: fw * 0.5, footY: 0 });
      continue;
    }
    const sw = Math.max(1, Math.floor(slice.sw));
    const sh = Math.max(1, Math.floor(slice.sh));
    c.width = sw;
    c.height = sh;
    cctx.imageSmoothingEnabled = false;
    cctx.clearRect(0, 0, sw, sh);
    cctx.drawImage(img, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, sw, sh);
    let id;
    try {
      id = cctx.getImageData(0, 0, sw, sh);
    } catch {
      stats.push({ cx: sw * 0.5, footY: sh - 1 });
      continue;
    }
    const d = id.data;
    let minX = sw;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const a = d[(y * sw + x) * 4 + 3];
        if (a > alphaT) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY < 0) {
      stats.push({ cx: sw * 0.5, footY: sh - 1 });
    } else {
      stats.push({ cx: (minX + maxX) * 0.5, footY: maxY });
    }
  }

  const cxs = stats.map((s) => s.cx).sort((a, b) => a - b);
  const commonCx = cxs[Math.floor(cxs.length / 2)];
  let commonFoot = 0;
  for (const s of stats) commonFoot = Math.max(commonFoot, s.footY);
  return stats.map((s) => ({ dx: commonCx - s.cx, dy: commonFoot - s.footY }));
}

/**
 * Crop a canvas/image down to the tight bounds of visible pixels (alpha > threshold).
 * This is important for weapons like `Whip.png` that live on a huge sheet with lots of empty padding:
 * otherwise scaling uses the full bitmap bounds and VFX reads as giant squares.
 * @param {HTMLCanvasElement | HTMLImageElement} src
 * @param {number} [alphaThreshold]
 * @param {number} [padPx]
 * @returns {HTMLCanvasElement | null}
 */
function alphaCropToCanvas(src, alphaThreshold = 12, padPx = 2) {
  if (typeof document === "undefined") return null;
  const w = bitmapSourceW(src);
  const h = bitmapSourceH(src);
  if (w < 2 || h < 2) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);

  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = data[row + x * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const pad = Math.max(0, Math.floor(padPx));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw < 2 || ch < 2) return null;

  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

/**
 * Quantize alpha to remove faint halos that tint into huge shapes when layered.
 * @param {HTMLCanvasElement} canvas
 * @param {number} threshold — pixels with a <= threshold become 0; otherwise become 255
 * @returns {HTMLCanvasElement | null}
 */
function hardenAlphaCanvas(canvas, threshold = 28) {
  if (typeof document === "undefined") return null;
  if (!canvas) return null;
  const w = canvas.width | 0;
  const h = canvas.height | 0;
  if (w < 2 || h < 2) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const d = data.data;
  const t = Math.max(0, Math.min(255, Math.floor(threshold)));
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    d[i + 3] = a <= t ? 0 : 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function equalRowStarts(h, rows) {
  const bh = Math.floor(h / rows);
  const s = [0];
  for (let i = 1; i < rows; i++) s.push(i * bh);
  s.push(h);
  return s;
}

/**
 * @returns {{ sm: Float32Array; mx: number; h: number; w: number; data: Uint8ClampedArray } | null}
 */
function slimeRasterAndHistogram(img) {
  const w = bitmapSourceW(img);
  const h = bitmapSourceH(img);
  if (w < 16 || h < 40 || typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  const raw = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > SLIME_ALPHA_FLOOR) c++;
    }
    raw[y] = c / w;
  }

  const sm = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    let k = 0;
    for (let t = -3; t <= 3; t++) {
      const yy = y + t;
      if (yy >= 0 && yy < h) {
        s += raw[yy];
        k++;
      }
    }
    sm[y] = k ? s / k : 0;
  }

  let mx = 0;
  for (let y = 0; y < h; y++) if (sm[y] > mx) mx = sm[y];
  return { sm, mx, h, w, data };
}

function slimeOpacityHistogram(img) {
  const r = slimeRasterAndHistogram(img);
  if (!r) return null;
  return { sm: r.sm, mx: r.mx, h: r.h };
}

function slimeRowStartsPassMinHeight(starts, minH) {
  for (let i = 0; i < starts.length - 1; i++) {
    if (starts[i + 1] - starts[i] < minH) return false;
  }
  return true;
}

/** Horizontal cut in [lo, hi] where opacity density is lowest (sheet gutter). */
function slimeMinDensityY(sm, lo, hi) {
  const a = Math.max(0, Math.min(lo, hi));
  const b = Math.max(0, Math.max(lo, hi));
  let best = Math.floor((a + b) / 2);
  let bestV = Infinity;
  for (let y = a; y <= b; y++) {
    if (sm[y] < bestV) {
      bestV = sm[y];
      best = y;
    }
  }
  return best;
}

/**
 * Row bands from the union of each row’s four cells: scan each nominal row’s columns with extra vertical
 * padding so a “high” jump frame stays in the same band as its row; place cuts in low-density overlap gaps.
 */
function slimeRowStartsFromColumnUnion(data, w, h, sm, rows) {
  const fw = Math.floor(w / SHEET_COLS);
  const bh = Math.floor(h / rows);
  if (fw < 8 || bh < 24) return null;

  const up = Math.min(220, Math.floor(bh * 0.75));
  const dn = Math.min(200, Math.floor(bh * 0.65));
  /** @type {number[]} */
  const ymin = [];
  /** @type {number[]} */
  const ymax = [];

  for (let r = 0; r < rows; r++) {
    let yMin = h;
    let yMax = -1;
    const yTop = Math.max(0, r * bh - up);
    const yBot = Math.min(h, (r + 1) * bh + dn);
    for (let col = 0; col < SHEET_COLS; col++) {
      const xa = col * fw;
      const xb = Math.min(w, (col + 1) * fw);
      for (let y = yTop; y < yBot; y++) {
        const rowOff = y * w * 4;
        for (let x = xa; x < xb; x++) {
          if (data[rowOff + x * 4 + 3] > SLIME_ALPHA_FLOOR) {
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
          }
        }
      }
    }
    if (yMax < yMin) {
      yMin = r * bh;
      yMax = Math.min(h - 1, (r + 1) * bh - 1);
    }
    ymin.push(yMin);
    ymax.push(yMax);
  }

  /** @type {number[]} */
  const starts = [0];
  for (let r = 0; r < rows - 1; r++) {
    const botCur = ymax[r];
    const topNext = ymin[r + 1];
    let cut;
    if (topNext > botCur + 4) {
      cut = Math.floor((botCur + topNext) / 2);
    } else {
      cut = slimeMinDensityY(sm, topNext, botCur);
    }
    const prev = starts[starts.length - 1];
    const minTail = (rows - 1 - r) * SLIME_MIN_ROW_BAND;
    cut = Math.max(cut, prev + SLIME_MIN_ROW_BAND);
    cut = Math.min(cut, h - minTail);
    starts.push(cut);
  }
  starts.push(h);

  for (let i = 1; i < starts.length - 1; i++) {
    if (starts[i] <= starts[i - 1]) starts[i] = starts[i - 1] + SLIME_MIN_ROW_BAND;
  }
  starts[starts.length - 1] = h;
  for (let i = starts.length - 2; i >= 1; i--) {
    if (starts[i + 1] - starts[i] < SLIME_MIN_ROW_BAND) {
      starts[i] = starts[i + 1] - SLIME_MIN_ROW_BAND;
    }
  }
  if (starts[1] < SLIME_MIN_ROW_BAND) return null;

  return starts;
}

function validateSlimeLayout(layout) {
  const { rowBandStarts: starts, labelSkipYRows: skips } = layout;
  const rows = starts.length - 1;
  if (rows !== SLIME_SHEET_ROWS || skips.length !== rows) return false;
  if (!slimeRowStartsPassMinHeight(starts, SLIME_MIN_ROW_BAND)) return false;
  for (let r = 0; r < rows; r++) {
    const inner = starts[r + 1] - starts[r] - skips[r];
    if (inner < SLIME_MIN_SLICE_H) return false;
  }
  return true;
}

/**
 * Reads Slime.png pixels: prefers row bands from each row’s four cells (handles jump frames that sit
 * higher than idle in the same row), then transparent gutters between rows; falls back to equal-height rows.
 * Optional CONFIG.SLIME_ROW_BAND_STARTS (length 6) overrides all inference.
 */
function computeSlimeLayoutFromPixels(img) {
  const h = bitmapSourceH(img);
  const cfg = CONFIG.SLIME_ROW_BAND_STARTS;
  if (Array.isArray(cfg) && cfg.length === SLIME_SHEET_ROWS + 1) {
    const starts = rowBandStartsFor(img, { rows: SLIME_SHEET_ROWS, rowBandStarts: cfg });
    const hist = slimeOpacityHistogram(img);
    const sm = hist?.sm ?? new Float32Array(h);
    const mx = hist?.mx ?? 0.02;
    const layout = finalizeSlimeLayout(starts, sm, mx);
    if (validateSlimeLayout(layout)) return layout;
  }

  const raster = slimeRasterAndHistogram(img);
  if (!raster) {
    return finalizeSlimeLayout(equalRowStarts(h, SLIME_SHEET_ROWS), new Float32Array(h), 0.02);
  }
  const { sm, mx, w, data } = raster;

  if (mx < 1e-5) {
    return finalizeSlimeLayout(equalRowStarts(h, SLIME_SHEET_ROWS), sm, mx);
  }

  const unionStarts = slimeRowStartsFromColumnUnion(data, w, h, sm, SLIME_SHEET_ROWS);
  if (unionStarts) {
    const layoutU = finalizeSlimeLayout(unionStarts, sm, mx);
    if (validateSlimeLayout(layoutU)) return layoutU;
  }

  const lowGutter = Math.max(0.002, mx * 0.04);
  const minGutterH = Math.max(6, Math.floor(h * 0.006));

  /** @type {{ a: number; b: number; mid: number; len: number; depth: number }[]} */
  const gutters = [];
  let y = 0;
  while (y < h) {
    while (y < h && sm[y] >= lowGutter) y++;
    const a = y;
    while (y < h && sm[y] < lowGutter) y++;
    const b = y;
    const len = b - a;
    if (len >= minGutterH) {
      let peak = lowGutter;
      for (let t = Math.max(0, a - 3); t < Math.min(h, b + 3); t++) peak = Math.max(peak, sm[t]);
      let trough = 1;
      for (let t = a; t < b; t++) trough = Math.min(trough, sm[t]);
      gutters.push({ a, b, mid: (a + b) >> 1, len, depth: peak - trough });
    }
  }

  let starts = equalRowStarts(h, SLIME_SHEET_ROWS);

  if (gutters.length >= SLIME_SHEET_ROWS - 1) {
    gutters.sort((p, q) => p.mid - q.mid);
    const n = gutters.length;
    const pick = [];
    for (let i = 0; i < SLIME_SHEET_ROWS - 1; i++) {
      const gi = Math.min(n - 1, Math.floor(((i + 0.5) * n) / (SLIME_SHEET_ROWS - 1)));
      pick.push(gutters[gi].mid);
    }
    let mids = [...new Set(pick)].sort((a, b) => a - b);
    mids = mids.filter((v, i, a) => i === 0 || v - a[i - 1] >= 24);
    if (mids.length === SLIME_SHEET_ROWS - 1) {
      const gutterStarts = [0];
      for (const m of mids) {
        if (m > gutterStarts[gutterStarts.length - 1] + 16 && m < h - 16) gutterStarts.push(m);
      }
      gutterStarts.push(h);
      if (
        gutterStarts.length === SLIME_SHEET_ROWS + 1 &&
        slimeRowStartsPassMinHeight(gutterStarts, SLIME_MIN_ROW_BAND)
      ) {
        starts = gutterStarts;
      }
    }
  }

  let layout = finalizeSlimeLayout(starts, sm, mx);
  if (!validateSlimeLayout(layout)) {
    layout = finalizeSlimeLayout(equalRowStarts(h, SLIME_SHEET_ROWS), sm, mx);
  }
  return layout;
}

function finalizeSlimeLayout(starts, sm, mx) {
  const rows = starts.length - 1;
  const labelSkipYRows = [];
  for (let r = 0; r < rows; r++) {
    const y0 = starts[r];
    const y1 = starts[r + 1];
    const bandH = y1 - y0;

    let peak = 0;
    for (let yy = y0; yy < y1; yy++) peak = Math.max(peak, sm[yy]);
    const t = Math.max(0.0035, peak * 0.22, mx * 0.035);

    let skip = 0;
    for (let yy = y0; yy < y1; yy++) {
      if (sm[yy] > t) {
        skip = yy - y0;
        break;
      }
    }

    const maxSkip = Math.max(0, bandH - SLIME_MIN_SLICE_H - 2);
    skip = Math.min(skip, maxSkip);
    let inner = bandH - skip;
    if (inner < SLIME_MIN_SLICE_H) {
      skip = Math.max(0, bandH - SLIME_MIN_SLICE_H);
    }
    labelSkipYRows.push(skip);
  }
  return { rowBandStarts: starts, labelSkipYRows };
}

function getSlimeAutoLayout(img) {
  const cfg = CONFIG.SLIME_ROW_BAND_STARTS;
  const cfgKey = Array.isArray(cfg) ? cfg.join(",") : "";
  const key = `${bitmapSourceW(img)}x${bitmapSourceH(img)}v4:${cfgKey}`;
  if (slimeAutoLayoutCache.key === key && slimeAutoLayoutCache.layout) {
    return slimeAutoLayoutCache.layout;
  }
  const out = computeSlimeLayoutFromPixels(img);
  slimeAutoLayoutCache = { key, layout: out };
  return out;
}

/**
 * @param {{
 *   labelSkipY?: number;
 *   padBottom?: number;
 *   rows?: number;
 *   walkSy?: number;
 *   walkSh?: number;
 *   rowBandStarts?: number[];
 *   labelSkipYRows?: number[];
 *   padBottomRows?: number[];
 *   insetX?: number; insetY?: number;
 * }} [opts]
 * — walkSy/walkSh: one horizontal strip shared by all columns (sx = col*fw).
 * — insetX/insetY: trim that many source pixels from each side of the cell (stops grid gutter bleed).
 */
function applyCellSourceInset(sx, sy, sw, sh, maxW, maxH, opts) {
  const ix = Math.max(0, Math.min(4, Math.floor(opts?.insetX ?? 0)));
  const iy = Math.max(0, Math.min(4, Math.floor(opts?.insetY ?? 0)));
  if (ix === 0 && iy === 0) return { sx, sy, sw, sh };
  const nx = sx + ix;
  const ny = sy + iy;
  const nw = sw - 2 * ix;
  const nh = sh - 2 * iy;
  if (nw < 8 || nh < 8) return { sx, sy, sw, sh };
  if (nx < 0 || ny < 0 || nx + nw > maxW || ny + nh > maxH) return { sx, sy, sw, sh };
  return { sx: nx, sy: ny, sw: nw, sh: nh };
}

function sliceForCell(img, col, row, fw, opts) {
  const maxW = bitmapSourceW(img);
  const maxH = bitmapSourceH(img);
  if (
    Number.isFinite(opts?.walkSy) &&
    Number.isFinite(opts?.walkSh) &&
    opts.walkSh > 0
  ) {
    const sx = col * fw;
    const sy = opts.walkSy;
    const sw = fw;
    const sh = opts.walkSh;
    if (sx + sw > maxW || sy + sh > maxH) return null;
    const t = applyCellSourceInset(sx, sy, sw, sh, maxW, maxH, opts);
    return t;
  }
  const rows = opts?.rows ?? SHEET_ROWS;
  const starts = rowBandStartsFor(img, opts);
  if (row < 0 || row >= rows || row + 1 >= starts.length) return null;
  const bandTop = starts[row];
  const bandBot = starts[row + 1];
  const bandH = bandBot - bandTop;
  const skip = labelSkipForRow(opts, row);
  const padB = padBottomForRow(opts, row);
  const sx = col * fw;
  const sy = bandTop + skip;
  const sw = fw;
  const sh = Math.max(8, bandH - skip - padB);
  if (sx + sw > maxW || sy + sh > maxH) return null;
  return applyCellSourceInset(sx, sy, sw, sh, maxW, maxH, opts);
}

function isLabelledSheetOk(img) {
  const fw = frameWidthFromImage(img);
  if (!fw) return false;
  const band = rowBandHeight(img);
  return band > LABEL_SHEET.labelSkipY + 16;
}

/** Slime small uses the same bitmap + row layout as `slime`. */
function enemyAssetTypeId(typeId) {
  return typeId === "slimeSmall" ? "slime" : typeId;
}

function enemyLabelSkipY(typeId) {
  const spec = SPRITES[enemyAssetTypeId(typeId)];
  return spec?.sheetSlice?.labelSkipY ?? LABEL_SHEET.labelSkipY;
}

function enemySliceOpts(typeId, animKey) {
  const aid = enemyAssetTypeId(typeId);
  const sl = SPRITES[aid]?.sheetSlice;
  const exploderPad =
    typeId === "exploder" && Number.isFinite(CONFIG.EXPLODER_SHEET_PAD_BOTTOM)
      ? CONFIG.EXPLODER_SHEET_PAD_BOTTOM
      : null;
  const o = {
    labelSkipY: enemyLabelSkipY(typeId),
    padBottom:
      exploderPad != null
        ? exploderPad
        : sl?.padBottom ?? LABEL_SHEET.padBottom,
    rows: sl?.rows ?? SHEET_ROWS,
    cols: sl?.cols ?? SHEET_COLS,
  };
  if (Array.isArray(sl?.rowBandStarts)) o.rowBandStarts = sl.rowBandStarts;
  if (Array.isArray(sl?.labelSkipYRows)) o.labelSkipYRows = sl.labelSkipYRows;
  if (Array.isArray(sl?.padBottomRows)) o.padBottomRows = sl.padBottomRows;
  if (Number.isFinite(sl?.insetX) && sl.insetX > 0) o.insetX = sl.insetX;
  if (Number.isFinite(sl?.insetY) && sl.insetY > 0) o.insetY = sl.insetY;
  const strip =
    animKey && sl?.animStrips && typeof sl.animStrips === "object" ? sl.animStrips[animKey] : null;
  const stripSy = strip && Number.isFinite(strip.sy) ? strip.sy : null;
  const stripSh = strip && Number.isFinite(strip.sh) ? strip.sh : null;
  if (stripSy != null && stripSh != null && stripSh > 0) {
    o.walkSy = stripSy;
    o.walkSh = stripSh;
    if (Number.isFinite(strip?.cols) && strip.cols > 0) {
      o.cols = strip.cols;
    }
  } else if (Number.isFinite(sl?.walkSy) && Number.isFinite(sl?.walkSh) && sl.walkSh > 0) {
    o.walkSy = sl.walkSy;
    o.walkSh = sl.walkSh;
  }
  if (
    aid === "slime" &&
    Number.isFinite(CONFIG.SLIME_WALK_SY) &&
    Number.isFinite(CONFIG.SLIME_WALK_SH) &&
    CONFIG.SLIME_WALK_SH > 0
  ) {
    o.walkSy = CONFIG.SLIME_WALK_SY;
    o.walkSh = CONFIG.SLIME_WALK_SH;
  }
  if (
    aid === "slime" &&
    sl?.autoRowBands !== false &&
    loaded.slime &&
    bitmapSourceH(images.slime) > 0
  ) {
    const lay = getSlimeAutoLayout(images.slime);
    o.rowBandStarts = lay.rowBandStarts;
    o.labelSkipYRows = lay.labelSkipYRows;
    o.labelSkipY = 0;
    o.padBottom = 0;
    o.rows = sl?.rows ?? SLIME_SHEET_ROWS;
  }
  return o;
}

export const SPRITES = {
  player: {
    src: "assets/Player.png",
    animations: {
      // New Player.png layout (Mage): all frames face RIGHT.
      // Flip horizontally in code for facing LEFT.
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      hit: { row: 2, frames: 2 },
      attack: { row: 3, frames: 4 },
    },
    /** Set false to freeze on walk frame 0 (only bob). True cycles walkDown/side frames from game.js. */
    animateWalk: true,
    // Mage (Player.png): match Archer on-screen size.
    drawScale: 0.28,
    sheetSlice: { rows: 4, cols: 4, labelSkipY: 0, padBottom: 0 },
    drawAnchorY: 0.9,
    disableWalkBob: true,
    stabilizeX: true,
  },
  revenant: {
    src: "assets/Revenant.png",
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      hit: { row: 2, frames: 2 },
    },
    /**
     * Current sheet layout: 4 columns × 3 rows (idle/walk/hit only).
     * Runtime slicing stays grid-based (no per-frame crop hacks).
     */
    animateWalk: true,
    drawScale: 0.3,
    drawAnchorY: 0.9,
    disableWalkBob: true,
    stabilizeX: true,
  },
  berserker: {
    src: "assets/Berserk.png",
    /**
     * Berserk.png is now 1024×1024 on a true 4×4 grid (256×256).
     * Layout:
     * - row 0: idle (4)
     * - row 1: walk cycle (4, like Mage row-2 setup)
     * - row 3: hit (2, cols0-1)
     */
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      hit: { row: 2, frames: 2 },
    },
    frameRects: {
      idle: [
        { sx: 0, sy: 0, sw: 256, sh: 256 },
        { sx: 256, sy: 0, sw: 256, sh: 256 },
        { sx: 512, sy: 0, sw: 256, sh: 256 },
        { sx: 768, sy: 0, sw: 256, sh: 256 },
      ],
      walk: [
        { sx: 0, sy: 256, sw: 256, sh: 256 },
        { sx: 256, sy: 256, sw: 256, sh: 256 },
        { sx: 512, sy: 256, sw: 256, sh: 256 },
        { sx: 768, sy: 256, sw: 256, sh: 256 },
      ],
      hit: [
        { sx: 0, sy: 768, sw: 256, sh: 256 },
        { sx: 256, sy: 768, sw: 256, sh: 256 },
      ],
    },
    animateWalk: true,
    /** Frame remap to soften stride snap in current row-2 walk art. */
    walkFrameOrder: [0, 1, 2, 1],
    drawScale: 0.26,
    drawAnchorY: 0.9,
    disableWalkBob: true,
    stabilizeX: true,
  },
  archer: {
    src: "assets/Archer.png",
    /**
     * Archer.png is 1024×1024 and not a clean 4×4. We use manual `frameRects` for perfect slices.
     * Rows (detected by alpha bands):
     * - idle: 4 frames
     * - walk: 4 frames
     * - hit: 2 frames
     * - attack: 4 frames
     */
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      hit: { row: 2, frames: 2 },
      attack: { row: 3, frames: 4 },
    },
    frameRects: {
      idle: [
        { sx: 93, sy: 57, sw: 130, sh: 183 },
        { sx: 328, sy: 63, sw: 127, sh: 177 },
        { sx: 560, sy: 60, sw: 128, sh: 179 },
        { sx: 797, sy: 63, sw: 128, sh: 177 },
      ],
      walk: [
        { sx: 82, sy: 302, sw: 145, sh: 170 },
        { sx: 301, sy: 302, sw: 152, sh: 174 },
        { sx: 551, sy: 302, sw: 140, sh: 175 },
        { sx: 761, sy: 302, sw: 161, sh: 175 },
      ],
      hit: [
        { sx: 111, sy: 549, sw: 134, sh: 152 },
        { sx: 341, sy: 555, sw: 138, sh: 147 },
      ],
      attack: [
        { sx: 87, sy: 761, sw: 165, sh: 182 },
        { sx: 303, sy: 761, sw: 169, sh: 182 },
        { sx: 533, sy: 776, sw: 256, sh: 167 },
        { sx: 816, sy: 775, sw: 140, sh: 168 },
      ],
    },
    animateWalk: true,
    drawScale: 0.25,
    drawAnchorY: 0.9,
  },
  orb: {
    src: "assets/Orb.png",
  },
  skeleton: {
    src: "assets/Skeleton.png",
    animations: {
      walk: { row: 0, frames: 4 },
    },
    animateWalk: true,
    // Skeleton sheet cells are ~201px wide (804/4), much smaller than goblin (~456px wide),
    // so we need a larger drawScale to match on-screen size.
    drawScale: 0.3,
    sheetSlice: { rows: 5, labelSkipY: 0, padBottom: 0 },
    /** Feet on ground — 0.5 centers the frame and sinks legs into the tile art. */
    drawAnchorY: 0.9,
  },
  goblin: {
    src: "assets/Goblin.png",
    animations: {
      walk: { row: 0, frames: 4 },
    },
    animateWalk: true,
    drawScale: 0.13,
    /** Row 0 label (“Attack Down” / etc.) is taller than other sheets — extra skip so text isn’t drawn. */
    sheetSlice: { labelSkipY: 118 },
    drawAnchorY: 0.9,
  },
  brute: {
    src: "assets/Ogre.png",
    animations: {
      idle: { row: 0, frames: 4 },
      // Ogre.png: walk is on row 2 (1-indexed) → row 1 (0-indexed) in our code.
      walk: { row: 1, frames: 4 },
    },
    animateWalk: true,
    // Slightly larger than player (player drawScale is 0.17).
    drawScale: 0.54,
    drawAnchorY: 0.88,
    // Updated Ogre.png (804×1024) has non-uniform row gutters; slice by explicit bands + per-row trims.
    sheetSlice: {
      rows: 5,
      cols: 4,
      labelSkipY: 0,
      padBottom: 0,
      // Horizontal gutters detected at ~[0..72], [198..267], [395..455], [587..639], [775..874], [1009..1023]
      // → 5 content bands start at: 73, 268, 456, 640, 875
      rowBandStarts: [0, 198, 395, 587, 775, 1024],
      labelSkipYRows: [73, 70, 61, 53, 100],
      padBottomRows: [1, 1, 1, 1, 15],
    },
    walkAnimRateMult: 0.75,
  },
  beast: {
    src: "assets/Beast.png",
    /**
     * 1024×559 sheet: not a uniform grid. Frames have irregular gutters and some extra FX art.
     * We use hand-authored (auto-extracted) `frameRects` so no neighbor frames bleed.
     */
    animations: {
      walk: { row: 0, frames: 4 },
      dash: { row: 1, frames: 4 },
    },
    frameRects: {
      // Extracted from alpha bounding boxes (thresholded) on Beast.png.
      walk: [
        { sx: 44, sy: 56, sw: 129, sh: 89 },
        { sx: 198, sy: 56, sw: 129, sh: 91 },
        { sx: 352, sy: 56, sw: 129, sh: 89 },
        { sx: 513, sy: 56, sw: 129, sh: 88 },
      ],
      // Use the main “run” row (6 frames exist; we take the first 4 for a tight loop).
      dash: [
        { sx: 42, sy: 176, sw: 163, sh: 84 },
        { sx: 256, sy: 180, sw: 160, sh: 87 },
        { sx: 468, sy: 181, sw: 162, sh: 85 },
        { sx: 659, sy: 178, sw: 164, sh: 83 },
      ],
    },
    animateWalk: true,
    drawScale: 0.34,
    drawAnchorY: 0.92,
    walkAnimRateMult: 0.8,
  },
  exploder: {
    src: "assets/Exploder.png",
    /**
     * Row 0: front / “down screen” walk (4). Row 1: side profile walk (4), flip when vx < 0.
     * Rows 2–3: idle / explode poses (not used for chase walk).
     * Sheet 739×1024 → 4 cols ×184px (3px remainder); row bands floor(h/4). If rows include title text, raise labelSkipY.
     */
    animations: {
      walk: { row: 0, frames: 4 },
    },
    animateWalk: true,
    drawScale: 0.28,
    sheetSlice: { labelSkipY: 0, padBottom: 0, rows: 4 },
    drawAnchorY: 1.05,
    /**
     * Multiplier on CONFIG.ENEMY_WALK_ANIM_RATE for this type only (<1 = slower, clearer stride).
     */
    /** <1 slows walk vs other enemies; optional walkColumnOrder: [0,2,1,3] if sheet columns are permuted. */
    walkAnimRateMult: 0.55,
  },
  boss1: {
    src: "assets/Boss1.png",
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 0, frames: 4 },
      charge: { row: 0, frames: 5 },
    },
    animateWalk: true,
    drawScale: 0.36,
    drawAnchorY: 0.95,
    sheetSlice: {
      // Boss sheet is not a clean equal-row grid; we slice by explicit horizontal strips.
      cols: 5,
      rows: 1,
      labelSkipY: 0,
      padBottom: 0,
      animStrips: {
        // Rows 1–2 are 4 frames wide on a 1024 sheet; row 3 is 5 frames.
        idle: { sy: 0, sh: 300, cols: 4 },
        walk: { sy: 260, sh: 320, cols: 4 },
        charge: { sy: 640, sh: 340, cols: 5 },
      },
    },
  },
  /**
   * Arcane Sentinel — 1024×559 PNG. Rows are uneven (horizontal gutters separate bands); columns align
   * on transparent gutters (~26–144, ~191–311, …) with strip art past x≈668 on charge row omitted from rects.
   * Bottom row band only authored 2 cells; gameplay uses charge frames [2],[3] for attack indices 2–3 (burst/readability).
   */
  boss2: {
    src: "assets/Boss2.png",
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      charge: { row: 2, frames: 4 },
      attack: { row: 3, frames: 4 },
    },
    frameRects: {
      /** +sx trims left bleed / neighbor frame; wider sw restores clipped pauldrums (still clamped inside 1024×559). */
      idle: [
        { sx: 32, sy: 17, sw: 128, sh: 112 },
        { sx: 197, sy: 16, sw: 128, sh: 113 },
        { sx: 363, sy: 18, sw: 128, sh: 111 },
        { sx: 531, sy: 18, sw: 128, sh: 111 },
      ],
      walk: [
        { sx: 38, sy: 160, sw: 122, sh: 105 },
        { sx: 205, sy: 157, sw: 122, sh: 106 },
        { sx: 370, sy: 159, sw: 124, sh: 104 },
        { sx: 551, sy: 157, sw: 128, sh: 105 },
      ],
      charge: [
        { sx: 32, sy: 295, sw: 128, sh: 109 },
        { sx: 200, sy: 294, sw: 128, sh: 110 },
        { sx: 370, sy: 294, sw: 128, sh: 110 },
        { sx: 538, sy: 294, sw: 128, sh: 110 },
      ],
      attack: [
        { sx: 32, sy: 436, sw: 128, sh: 104 },
        { sx: 207, sy: 437, sw: 122, sh: 107 },
        { sx: 370, sy: 294, sw: 128, sh: 110 },
        { sx: 538, sy: 294, sw: 128, sh: 110 },
      ],
    },
    animateWalk: true,
    /** Frame cells (~128×110px) are much smaller strips than Boss1; ~2× brute/golem feel on screen vs old 0.34. */
    drawScale: 0.67,
    /** Feet-style anchor — float reads correct at larger scale without crowding the HUD. */
    drawAnchorY: 0.9,
    drawScreenOffsetY: 6,
    sheetSlice: { cols: 4, rows: 1, labelSkipY: 0, padBottom: 0 },
  },
  /**
   * Slime.png (1024×1024 Canva): auto row bands were collapsing slice height to a sliver. Walk uses a
   * fixed horizontal strip (4× floor(w/4) columns); tweak walkSy/walkSh or CONFIG.SLIME_WALK_SY / SH if art moves.
   */
  slime: {
    src: "assets/Slime.png",
    animations: {
      walk: { row: 1, frames: 4 },
    },
    animateWalk: true,
    drawScale: 0.2,
    sheetSlice: {
      rows: 5,
      autoRowBands: false,
      labelSkipY: 0,
      padBottom: 0,
      /** One strip shared by walk columns — bypasses row bands entirely for walk. */
      walkSy: 300,
      walkSh: 220,
    },
    drawAnchorY: 0.9,
    walkAnimRateMult: 1.05,
  },
  slimeSmall: {
    src: "assets/Slime.png",
    animations: {
      walk: { row: 1, frames: 4 },
    },
    animateWalk: true,
    drawScale: 0.125,
    sheetSlice: {
      rows: 5,
      autoRowBands: false,
      labelSkipY: 0,
      padBottom: 0,
      walkSy: 300,
      walkSh: 220,
    },
    drawAnchorY: 0.9,
    walkAnimRateMult: 1.1,
  },
  /**
   * Bat: 3×4 sheet — row 0 idle (4), rows 1–2 = 6-frame fly loop wrapped (4+2).
   * `walkFrameCells` lists [col, row] per animation step (see `drawEnemySprite`).
   */
  bat: {
    src: "assets/Bat.png",
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 6 },
    },
    /** 6 steps: row1 cols0–3, then row2 cols0–1 */
    walkFrameCells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [0, 2],
      [1, 2],
    ],
    animateWalk: true,
    drawScale: 0.168,
    sheetSlice: { rows: 3, labelSkipY: 0, padBottom: 0 },
    drawAnchorY: 0.5,
    walkAnimRateMult: 1.35,
  },
  /**
   * Golem: 4×3 sheet — row 0 idle (4), row 1 walk (4), row 2 death/damage (3; last cell empty).
   * Chase uses walk row only; death row reserved for a future kill anim.
   */
  golem: {
    src: "assets/Golem.png",
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      death: { row: 2, frames: 3 },
    },
    animateWalk: true,
    /**
     * Must read larger than the player (player 0.17) — golem cells are wide + modestly tall, so this
     * needs to stay well above brute (0.19) and boss strip scale (~0.36) to sell “walking wall.”
     */
    drawScale: 0.54,
    sheetSlice: { rows: 3, cols: 4, labelSkipY: 0, padBottom: 0 },
    drawAnchorY: 0.9,
    walkAnimRateMult: 0.42,
  },
  /**
   * 1024×559 sheet: not equal row thirds — PNG has top padding + transparent gutters (~173–182, ~368–389).
   * Per your spec the sheet is effectively 8 columns:
   * - Row 1: idle (cols 0–3), alert (col 4)
   * - Row 2: walk (cols 0–3), summon (cols 4–7)
   * - Row 3: hit (cols 0–2), death/heavy-stun (cols 3–5)
   *
   * We slice by explicit horizontal strips (like boss) so gutters/padding don't break alignment.
   */
  necromancer: {
    src: "assets/Necromancer.png",
    animations: {
      idle: { row: 0, frames: 4 },
      walk: { row: 1, frames: 4 },
      summon: { row: 1, frames: 4 },
    },
    animCells: {
      // Action row cols 4–7 (frames 5–8), using the summon strip below.
      summon: [
        [4, 1],
        [5, 1],
        [6, 1],
        [7, 1],
      ],
    },
    /**
     * Fully manual per-frame rectangles (sprite-editor style). The shipped PNG is not a uniform grid;
     * frames are separated by variable-width transparent gutters, so col-based slicing will always tear.
     *
     * Rects were derived by scanning for vertical zero-alpha runs inside each row band.
     */
    frameRects: {
      // Row 1 (idle): 4 frames
      idle: [
        { sx: 45, sy: 31, sw: 108, sh: 142 },
        { sx: 190, sy: 31, sw: 107, sh: 142 },
        { sx: 326, sy: 31, sw: 108, sh: 142 },
        { sx: 459, sy: 31, sw: 105, sh: 142 },
      ],
      // Row 2 (walk): 4 frames
      walk: [
        { sx: 41, sy: 184, sw: 121, sh: 185 },
        { sx: 186, sy: 184, sw: 118, sh: 185 },
        { sx: 322, sy: 184, sw: 122, sh: 185 },
        { sx: 450, sy: 184, sw: 114, sh: 185 },
      ],
      // Row 2 (summon): 4 frames (only 3 unique frames in PNG; last repeats for smooth loop)
      summon: [
        { sx: 592, sy: 184, sw: 107, sh: 185 },
        { sx: 730, sy: 184, sw: 112, sh: 185 },
        { sx: 872, sy: 184, sw: 120, sh: 185 },
        { sx: 872, sy: 184, sw: 120, sh: 185 },
      ],
    },
    animateWalk: true,
    // Slightly larger than skeleton (0.30) for support presence.
    drawScale: 0.32,
    // The sheet's frame silhouettes vary horizontally (staff swing + cape), so auto-centering causes lateral drift.
    // Keep only Y/feet stabilization.
    applyFrameOffsetX: false,
    // Disable Y stabilization too (it can "hunt" on tall VFX like the green rune).
    applyFrameOffsetY: false,
    sheetSlice: {
      rows: 3,
      cols: 8,
      labelSkipY: 0,
      padBottom: 0,
    },
    drawAnchorY: 0.9,
    walkAnimRateMult: 1.02,
  },
};

/**
 * Sheet column for an enemy walk frame (supports walkAnimRateMult + walkColumnOrder on SPRITES[typeId]).
 */
export function enemyWalkColumn(typeId, animTick, animPhase = 0) {
  const spec = SPRITES[typeId];
  const walk = spec?.animations?.walk;
  if (!walk) return 0;
  const cells = spec.walkFrameCells;
  const frames = Array.isArray(cells) && cells.length > 0
    ? cells.length
    : Math.max(1, walk.frames ?? 4);
  const baseRate = CONFIG.ENEMY_WALK_ANIM_RATE ?? 4;
  const mult = spec.walkAnimRateMult ?? 1;
  const wRate = baseRate * mult;
  let step = Math.floor((animTick + animPhase) * wRate) % frames;
  step = ((step % frames) + frames) % frames;
  const ord = spec.walkColumnOrder;
  if (Array.isArray(ord) && ord.length === frames && !cells?.length) {
    const col = ord[step];
    if (typeof col === "number" && col >= 0 && col < frames) return col;
  }
  return step;
}

/**
 * Exploder sheet: row 0 = front walk, row 1 = side profile (flip when towardX < 0).
 * By default CONFIG.EXPLODER_USE_SIDE_WALK_ROW is not true → always front row (no side feet).
 * When side is enabled: side row only if |dx| > |dy| * hysteresis.
 * @param {number} towardX
 * @param {number} towardY
 * @param {number} [hysteresis]
 * @returns {{ row: number; flipX: boolean }}
 */
export function exploderWalkRowFlip(towardX, towardY, hysteresis = 1.35) {
  if (CONFIG.EXPLODER_USE_SIDE_WALK_ROW !== true) {
    return { row: 0, flipX: false };
  }
  const ax = Math.abs(towardX);
  const ay = Math.abs(towardY);
  const h = hysteresis;
  if (ax < 1e-5 && ay < 1e-5) return { row: 0, flipX: false };
  if (ax > ay * h) return { row: 1, flipX: towardX < 0 };
  return { row: 0, flipX: false };
}

export const GROUND_TILE_SRC = {
  grass: "assets/Grass.png",
  dirt: "assets/Dirt.png",
  patchy: "assets/Hybrid.png",
};

const groundImages = {
  grass: new Image(),
  dirt: new Image(),
  patchy: new Image(),
};

const groundLoaded = {
  grass: false,
  dirt: false,
  patchy: false,
};

const loaded = {
  player: false,
  revenant: false,
  berserker: false,
  archer: false,
  archerProjectile: false,
  orbBlue: false,
  orbRed: false,
  pickups: false,
  dagger: false,
  runes: false,
  throwingAxe: false,
  boomerang: false,
  grenade: false,
  grenadeExplosion: false,
  orb: false,
  skeleton: false,
  goblin: false,
  brute: false,
  beast: false,
  exploder: false,
  slime: false,
  slimeSmall: false,
  boss1: false,
  boss2: false,
  bat: false,
  golem: false,
  necromancer: false,
  arenaBg: false,
  arenaCollision: false,
  hammer: false,
  whip: false,
  whipSlash: false,
  berserkerSlash: false,
  soulRipProjectile: false,
};

const images = {
  player: new Image(),
  revenant: new Image(),
  berserker: new Image(),
  archer: new Image(),
  archerProjectile: new Image(),
  orbBlue: new Image(),
  orbRed: new Image(),
  pickups: new Image(),
  dagger: new Image(),
  runes: new Image(),
  throwingAxe: new Image(),
  boomerang: new Image(),
  grenade: new Image(),
  grenadeExplosion: new Image(),
  orb: new Image(),
  skeleton: new Image(),
  goblin: new Image(),
  brute: new Image(),
  beast: new Image(),
  exploder: new Image(),
  slime: new Image(),
  slimeSmall: new Image(),
  boss1: new Image(),
  boss2: new Image(),
  bat: new Image(),
  golem: new Image(),
  necromancer: new Image(),
  arenaBg: new Image(),
  hammer: new Image(),
  whip: new Image(),
  whipSlash: new Image(),
  berserkerSlash: new Image(),
  soulRipProjectile: new Image(),
  arenaCollision: new Image(),
};

/** @type {{ w: number; h: number; blocked: Uint8Array } | null} */
let collisionRaster = null;

function loadImage(img, src) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    if (img.complete && img.naturalWidth > 0) finish(true);
  });
}

/**
 * Rasterize collision PNG into a binary blocked[] grid, then erode obstacles inward so
 * shadow fringes / antialiasing don’t extend “invisible” walls beyond visible stone.
 * @returns {{ w: number; h: number; blocked: Uint8Array } | null}
 */
function buildCollisionRasterFromImage(img) {
  if (typeof document === "undefined") return null;
  const w = bitmapSourceW(img);
  const h = bitmapSourceH(img);
  if (w < 2 || h < 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  const minA =
    typeof CONFIG.COLLISION_MIN_ALPHA === "number" ? CONFIG.COLLISION_MIN_ALPHA : 12;
  const maxRgb =
    typeof CONFIG.COLLISION_BLOCK_MAX_RGB === "number"
      ? CONFIG.COLLISION_BLOCK_MAX_RGB
      : 46;
  const n = w * h;
  /** @type {Uint8Array} */
  let blocked = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < minA) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const mx = Math.max(r, g, b);
    if (mx <= maxRgb) blocked[i] = 1;
  }
  const passes =
    typeof CONFIG.COLLISION_MASK_ERODE_PASSES === "number"
      ? Math.max(0, Math.min(8, Math.floor(CONFIG.COLLISION_MASK_ERODE_PASSES)))
      : 0;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(blocked);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (!blocked[i]) continue;
        let touchesWalkable = false;
        if (x > 0 && !blocked[i - 1]) touchesWalkable = true;
        else if (x < w - 1 && !blocked[i + 1]) touchesWalkable = true;
        else if (y > 0 && !blocked[i - w]) touchesWalkable = true;
        else if (y < h - 1 && !blocked[i + w]) touchesWalkable = true;
        if (touchesWalkable) next[i] = 0;
      }
    }
    blocked = next;
  }
  return { w, h, blocked };
}

export function isArenaCollisionReady() {
  return collisionRaster != null && collisionRaster.w > 0 && collisionRaster.h > 0;
}

function collisionWorldPixelBlocked(wx, wy) {
  if (!collisionRaster) return false;
  if (wx < 0 || wy < 0 || wx > CONFIG.WORLD_W || wy > CONFIG.WORLD_H) return true;
  const { w, h, blocked } = collisionRaster;
  const px = Math.min(w - 1, Math.max(0, Math.floor((wx / CONFIG.WORLD_W) * w)));
  const py = Math.min(h - 1, Math.max(0, Math.floor((wy / CONFIG.WORLD_H) * h)));
  return blocked[py * w + px] === 1;
}

/**
 * True if a circle at world (wx,wy) with given radius overlaps blocked pixels in the arena mask.
 */
export function worldCircleBlockedByArena(wx, wy, radiusWorld) {
  if (CONFIG.ARENA_COLLISION_ENABLED === false) return false;
  if (!collisionRaster) return false;
  const mult =
    typeof CONFIG.COLLISION_SAMPLE_RADIUS_MULT === "number"
      ? CONFIG.COLLISION_SAMPLE_RADIUS_MULT
      : 0.92;
  const r = Math.max(0, radiusWorld) * mult;
  if (collisionWorldPixelBlocked(wx, wy)) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = wx + Math.cos(a) * r;
    const sy = wy + Math.sin(a) * r;
    if (collisionWorldPixelBlocked(sx, sy)) return true;
  }
  return false;
}

export async function loadAssets() {
  const p = loadImage(images.player, SPRITES.player.src);
  const rv = loadImage(images.revenant, SPRITES.revenant.src);
  const bz = loadImage(images.berserker, SPRITES.berserker.src);
  const ar = loadImage(images.archer, SPRITES.archer.src);
  const ap = loadImage(images.archerProjectile, "assets/Archer-projectile.png");
  const gr = loadImage(images.grenade, "assets/Grenade.png");
  const gx = loadImage(images.grenadeExplosion, "assets/Grenade-explosion.png");
  const o = loadImage(images.orb, SPRITES.orb.src);
  const ob = loadImage(images.orbBlue, "assets/Orb-blue.png");
  const or = loadImage(images.orbRed, "assets/Orb-red.png");
  const pu = loadImage(images.pickups, "assets/Pickups.png");
  const dg = loadImage(images.dagger, "assets/Knife.png");
  const rn = loadImage(images.runes, "assets/Runes.png");
  const ta = loadImage(images.throwingAxe, "assets/Tomahawk.png");
  const brg = loadImage(images.boomerang, "assets/Boomerang.png");
  const sk = loadImage(images.skeleton, SPRITES.skeleton.src);
  const gb = loadImage(images.goblin, SPRITES.goblin.src);
  const br = loadImage(images.brute, SPRITES.brute.src);
  const be = loadImage(images.beast, SPRITES.beast.src);
  const ex = loadImage(images.exploder, SPRITES.exploder.src);
  const sl = loadImage(images.slime, SPRITES.slime.src);
  const b1 = loadImage(images.boss1, SPRITES.boss1.src);
  const b2 = loadImage(images.boss2, SPRITES.boss2.src);
  const bt = loadImage(images.bat, SPRITES.bat.src);
  const gm = loadImage(images.golem, SPRITES.golem.src);
  const nc = loadImage(images.necromancer, SPRITES.necromancer.src);
  const tg = loadImage(groundImages.grass, GROUND_TILE_SRC.grass);
  const td = loadImage(groundImages.dirt, GROUND_TILE_SRC.dirt);
  const tp = loadImage(groundImages.patchy, GROUND_TILE_SRC.patchy);
  const ab = loadImage(images.arenaBg, CONFIG.ARENA_BACKGROUND_SRC);
  const hm = loadImage(images.hammer, CONFIG.HAMMER_ASSET_SRC);
  const wp = loadImage(images.whip, CONFIG.WHIP_ASSET_SRC);
  const ws = CONFIG.WHIP_SLASH_ASSET_SRC
    ? loadImage(images.whipSlash, CONFIG.WHIP_SLASH_ASSET_SRC)
    : Promise.resolve(false);
  const bsz = CONFIG.BERSERKER_SLASH_ASSET_SRC
    ? loadImage(images.berserkerSlash, CONFIG.BERSERKER_SLASH_ASSET_SRC)
    : Promise.resolve(false);
  const srp = CONFIG.SOUL_RIP_PROJECTILE_ASSET_SRC
    ? loadImage(images.soulRipProjectile, CONFIG.SOUL_RIP_PROJECTILE_ASSET_SRC)
    : Promise.resolve(false);
  const col =
    CONFIG.ARENA_COLLISION_SRC
      ? loadImage(images.arenaCollision, CONFIG.ARENA_COLLISION_SRC)
      : Promise.resolve(false);

  const [okP, okRv, okBz, okAr, okAp, okGr, okGx, okO, okOb, okOr, okPu, okDg, okRn, okTa, okBrg, okSk, okGb, okBr, okBe, okEx, okSl, okB1, okB2, okBt, okGm, okNc, okG, okD, okPch, okAb, okHm, okWp, okWs, okBsz, okSrp, okCol] =
    await Promise.all([
    p,
    rv,
    bz,
    ar,
    ap,
    gr,
    gx,
    o,
    ob,
    or,
    pu,
    dg,
    rn,
    ta,
    brg,
    sk,
    gb,
    br,
    be,
    ex,
    sl,
    b1,
    b2,
    bt,
    gm,
    nc,
    tg,
    td,
    tp,
    ab,
    hm,
      wp,
      ws,
      bsz,
      srp,
      col,
  ]);
  loaded.player = okP;
  loaded.revenant = okRv;
  loaded.berserker = okBz;
  loaded.archer = okAr;
  loaded.archerProjectile = okAp;
  loaded.grenade = okGr;
  loaded.grenadeExplosion = okGx;
  loaded.orb = okO;
  loaded.orbBlue = okOb;
  loaded.orbRed = okOr;
  loaded.pickups = okPu;
  loaded.dagger = okDg;
  loaded.runes = okRn;
  loaded.throwingAxe = okTa;
  loaded.boomerang = okBrg;
  loaded.skeleton = okSk;
  loaded.goblin = okGb;
  loaded.brute = okBr;
  loaded.beast = okBe;
  loaded.exploder = okEx;
  loaded.slime = okSl;
  loaded.slimeSmall = okSl;
  loaded.boss1 = okB1;
  loaded.boss2 = okB2;
  loaded.bat = okBt;
  loaded.golem = okGm;
  loaded.necromancer = okNc;
  images.slimeSmall = images.slime;
  if (okRv && typeof document !== "undefined") {
    // Revenant art can have soft alpha edges; harden alpha so downscaling reads crisp (less "blurry halo").
    const iw = bitmapSourceW(images.revenant);
    const ih = bitmapSourceH(images.revenant);
    if (iw > 0 && ih > 0) {
      const c = document.createElement("canvas");
      c.width = iw;
      c.height = ih;
      const cctx = c.getContext("2d", { willReadFrequently: true });
      if (cctx) {
        cctx.imageSmoothingEnabled = false;
        cctx.drawImage(images.revenant, 0, 0);
        hardenAlphaCanvas(c, 22);
        images.revenant = c;
      }
    }
  }
  if (okSk) {
    // Stabilize Skeleton walk (fix staggered pivots in source PNG).
    SPRITES.skeleton.frameOffsets = {
      ...(SPRITES.skeleton.frameOffsets ?? {}),
      walk: computeFrameOffsetsForGridAnim("skeleton", "walk"),
    };
  }
  if (okGb) {
    // Stabilize Goblin walk (row label skip already applied; this fixes remaining per-frame wobble).
    SPRITES.goblin.frameOffsets = {
      ...(SPRITES.goblin.frameOffsets ?? {}),
      walk: computeFrameOffsetsForGridAnim("goblin", "walk"),
    };
  }
  if (okBr) {
    // Stabilize Brute (Ogre) animations: source frames have shifting pivots that read as a side-to-side bob.
    SPRITES.brute.frameOffsets = {
      ...(SPRITES.brute.frameOffsets ?? {}),
      idle: computeFrameOffsetsForGridAnim("brute", "idle"),
      walk: computeFrameOffsetsForGridAnim("brute", "walk"),
    };
  }
  if (okSl && CONFIG.SLIME_KEY_WHITE_BACKGROUND === true) {
    const keyed = buildSlimeChromaKeyedCanvas(images.slime);
    if (keyed) {
      images.slime = keyed;
      images.slimeSmall = keyed;
    }
  }
  invalidateSlimeSliceCache();
  if (okB1) {
    const keyed = buildBossChromaKeyedCanvas(images.boss1);
    if (keyed) images.boss1 = keyed;
  }
  if (okB2 && CONFIG.BOSS2_KEY_WHITE_BACKGROUND === true) {
    const keyed = buildSlimeChromaKeyedCanvas(images.boss2);
    if (keyed) images.boss2 = keyed;
  }
  if (okBt && CONFIG.BAT_KEY_WHITE_BACKGROUND === true) {
    const keyed = buildSlimeChromaKeyedCanvas(images.bat);
    if (keyed) images.bat = keyed;
  }
  if (okGm && CONFIG.GOLEM_KEY_WHITE_BACKGROUND === true) {
    const keyed = buildSlimeChromaKeyedCanvas(images.golem);
    if (keyed) images.golem = keyed;
  }
  if (okNc && CONFIG.NECRO_KEY_WHITE_BACKGROUND === true) {
    const keyed = buildSlimeChromaKeyedCanvas(images.necromancer);
    if (keyed) images.necromancer = keyed;
  }
  if (okNc) {
    // Auto-pivot so the necromancer doesn't "zoetrope" between frames.
    const spec = SPRITES.necromancer;
    const strips = spec?.sheetSlice?.animStrips;
    if (strips && typeof strips === "object") {
      const idle = strips.idle;
      const action = strips.walk; // walk + summon share the same horizontal strip per spec
      if (idle && action) {
        const cols = Number.isFinite(action.cols) ? action.cols : (spec.sheetSlice?.cols ?? 8);
        const idleCols = [0, 1, 2, 3];
        const walkCols = [0, 1, 2, 3];
        const summonCols = [4, 5, 6, 7];
        spec.frameOffsets = {
          idle: computeFrameOffsetsForStrip(images.necromancer, {
            sy: idle.sy,
            sh: idle.sh,
            cols,
            frameCols: idleCols,
            padTop: 42,
          }),
          walk: computeFrameOffsetsForStrip(images.necromancer, {
            sy: action.sy,
            sh: action.sh,
            cols,
            frameCols: walkCols,
            padTop: 42,
          }),
          summon: computeFrameOffsetsForStrip(images.necromancer, {
            sy: action.sy,
            sh: action.sh,
            cols,
            frameCols: summonCols,
            padTop: 42,
          }),
        };
      }
    }
  }
  if (okWp && CONFIG.WHIP_KEY_BLACK_BACKGROUND === true) {
    const keyed = buildWhipChromaKeyedCanvas(images.whip);
    if (keyed) {
      // Tight-crop away huge transparent padding so sweep VFX doesn't scale like a billboard.
      const packed = alphaCropToCanvas(
        keyed,
        typeof CONFIG.WHIP_CROP_ALPHA_THRESHOLD === "number"
          ? CONFIG.WHIP_CROP_ALPHA_THRESHOLD
          : 12,
        typeof CONFIG.WHIP_CROP_PAD_PX === "number" ? CONFIG.WHIP_CROP_PAD_PX : 2
      );
      images.whip = packed ?? keyed;
      if (images.whip instanceof HTMLCanvasElement) {
        hardenAlphaCanvas(
          images.whip,
          typeof CONFIG.WHIP_ALPHA_HARD_THRESHOLD === "number" ? CONFIG.WHIP_ALPHA_HARD_THRESHOLD : 28
        );
      }
      try {
        const iw0 = bitmapSourceW(keyed);
        const ih0 = bitmapSourceH(keyed);
        const iw1 = bitmapSourceW(images.whip);
        const ih1 = bitmapSourceH(images.whip);
        console.log(`[assets] whip packed: ${iw0}x${ih0} -> ${iw1}x${ih1}`);
      } catch {
        // ignore
      }
    }
  }
  groundLoaded.grass = okG;
  groundLoaded.dirt = okD;
  groundLoaded.patchy = okPch;
  loaded.arenaBg = okAb;
  loaded.hammer = okHm;
  loaded.whip = okWp;
  loaded.whipSlash = okWs;
  loaded.berserkerSlash = okBsz;
  loaded.soulRipProjectile = okSrp;
  loaded.arenaCollision = okCol;
  collisionRaster = okCol ? buildCollisionRasterFromImage(images.arenaCollision) : null;
  if (okCol && !collisionRaster) {
    try {
      console.warn("[assets] arena collision image loaded but raster failed (getImageData?)");
    } catch {
      // ignore
    }
  } else if (okCol && collisionRaster) {
    try {
      let solid = 0;
      for (let i = 0; i < collisionRaster.blocked.length; i++) if (collisionRaster.blocked[i]) solid++;
      console.log(
        `[assets] arena collision: ${collisionRaster.w}x${collisionRaster.h} (world ${CONFIG.WORLD_W}×${CONFIG.WORLD_H}), solid ${solid}px`
      );
    } catch {
      // ignore
    }
  }
  return {
    player: okP,
    grenade: okGr,
    grenadeExplosion: okGx,
    orb: okO,
    orbBlue: okOb,
    orbRed: okOr,
    pickups: okPu,
    dagger: okDg,
    skeleton: okSk,
    goblin: okGb,
    brute: okBr,
    exploder: okEx,
    slime: okSl,
    slimeSmall: okSl,
    boss1: okB1,
    boss2: okB2,
    bat: okBt,
    golem: okGm,
    necromancer: okNc,
    ground: { grass: okG, dirt: okD, patchy: okPch },
    arenaBackground: okAb,
    arenaCollision: okCol && !!collisionRaster,
    hammer: okHm,
    whip: okWp,
    whipSlash: okWs,
    berserkerSlash: okBsz,
    soulRipProjectile: okSrp,
  };
}

export function isArenaBackgroundReady() {
  return loaded.arenaBg && images.arenaBg.naturalWidth > 0;
}

export function isHammerReady() {
  return loaded.hammer && images.hammer.naturalWidth > 0;
}

export function isWhipReady() {
  return loaded.whip && bitmapSourceW(images.whip) > 0;
}

export function isWhipSlashReady() {
  return loaded.whipSlash && bitmapSourceW(images.whipSlash) > 0;
}

export function isBerserkerSlashReady() {
  return loaded.berserkerSlash && bitmapSourceW(images.berserkerSlash) > 0;
}

export function isSoulRipProjectileReady() {
  return loaded.soulRipProjectile && bitmapSourceW(images.soulRipProjectile) > 0;
}

export function isBerserkerReady() {
  return loaded.berserker && bitmapSourceW(images.berserker) > 0;
}

export function isArcherReady() {
  return loaded.archer && bitmapSourceW(images.archer) > 0;
}

export function isRevenantReady() {
  return loaded.revenant && bitmapSourceW(images.revenant) > 0;
}

export function isArcherProjectileReady() {
  return loaded.archerProjectile && images.archerProjectile.naturalWidth > 0;
}

let archerProjectileTrim = null;
function computeAlphaTrimRect(img, alphaThreshold = 8) {
  try {
    const iw = img?.naturalWidth ?? 0;
    const ih = img?.naturalHeight ?? 0;
    if (iw <= 0 || ih <= 0) return null;
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, iw, ih);
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, iw, ih);
    let minX = iw, minY = ih, maxX = -1, maxY = -1;
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const a = data[(y * iw + x) * 4 + 3];
        if (a > alphaThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const sw = Math.max(1, maxX - minX + 1);
    const sh = Math.max(1, maxY - minY + 1);
    return { sx: minX, sy: minY, sw, sh };
  } catch {
    return null;
  }
}

export function isGrenadeReady() {
  return loaded.grenade && images.grenade.naturalWidth > 0;
}

export function isGrenadeExplosionReady() {
  return loaded.grenadeExplosion && images.grenadeExplosion.naturalWidth > 0;
}

export function drawArcherProjectile(ctx, screenX, screenY, ang, sizePx, alpha = 1) {
  if (!isArcherProjectileReady()) return false;
  const img = images.archerProjectile;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  if (!archerProjectileTrim) {
    // This PNG has lots of empty padding; trim once so the visible art scales up.
    archerProjectileTrim = computeAlphaTrimRect(img, 6) ?? { sx: 0, sy: 0, sw: iw, sh: ih };
  }
  const tr = archerProjectileTrim ?? { sx: 0, sy: 0, sw: iw, sh: ih };
  const s = Math.max(1, sizePx);
  const scale = s / Math.max(tr.sw, tr.sh);
  const dw = tr.sw * scale;
  const dh = tr.sh * scale;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ang);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  // Pivot: image points to the right, so anchor near left-center.
  const ax = 0.2;
  const ay = 0.5;
  ctx.drawImage(img, tr.sx, tr.sy, tr.sw, tr.sh, -dw * ax, -dh * ay, dw, dh);
  ctx.restore();
  return true;
}

export function drawGrenadeSprite(ctx, screenX, screenY, ang, sizePx, alpha = 1) {
  if (!isGrenadeReady()) return false;
  const img = images.grenade;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const s = Math.max(1, sizePx);
  const scale = s / Math.max(iw, ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ang);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/**
 * 4-frame sprite sheet: 2×2 grid.
 * Frame order: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
 */
export function drawGrenadeExplosionFrame(ctx, screenX, screenY, frameIdx, sizePx, scaleMult = 1, alpha = 1) {
  if (!isGrenadeExplosionReady()) return false;
  const img = images.grenadeExplosion;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const fw = Math.floor(iw / 2);
  const fh = Math.floor(ih / 2);
  if (fw <= 0 || fh <= 0) return false;
  const fi = Math.max(0, Math.min(3, Math.trunc(frameIdx)));
  const sx = (fi % 2) * fw;
  const sy = Math.floor(fi / 2) * fh;

  const s = Math.max(1, sizePx) * (Number.isFinite(scaleMult) ? Math.max(0.1, scaleMult) : 1);
  const k = s / Math.max(fw, fh);
  const dw = fw * k;
  const dh = fh * k;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, fw, fh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/**
 * Hammer image rotated in code. Optional CONFIG.HAMMER_SHEET_CELL slices one cell from a sheet.
 */
export function drawHammerSprite(ctx, screenX, screenY, spinAngle, sizePx) {
  if (!isHammerReady()) return;
  const img = images.hammer;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return;
  const cell = CONFIG.HAMMER_SHEET_CELL;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (
    cell &&
    typeof cell.cols === "number" &&
    typeof cell.rows === "number" &&
    cell.cols > 0 &&
    cell.rows > 0
  ) {
    sw = Math.floor(iw / cell.cols);
    sh = Math.floor(ih / cell.rows);
    sx = (cell.col ?? 0) * sw;
    sy = (cell.row ?? 0) * sh;
  }
  const scale = sizePx / Math.max(sw, sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(spinAngle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/**
 * Draws the whip sprite rotated toward `angle`. Anchor is within [0..1] of source bitmap.
 */
export function drawWhipSprite(ctx, screenX, screenY, angle, sizePx) {
  if (!isWhipReady()) return;
  const img = images.whip;
  const iw = bitmapSourceW(img);
  const ih = bitmapSourceH(img);
  if (iw <= 0 || ih <= 0) return;

  const scale = sizePx / Math.max(iw, ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ax =
    typeof CONFIG.WHIP_ANCHOR_X === "number"
      ? Math.max(0, Math.min(1, CONFIG.WHIP_ANCHOR_X))
      : 0.16;
  const ay =
    typeof CONFIG.WHIP_ANCHOR_Y === "number"
      ? Math.max(0, Math.min(1, CONFIG.WHIP_ANCHOR_Y))
      : 0.52;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw * ax, -dh * ay, dw, dh);
  ctx.restore();
}

/**
 * Same as `drawWhipSprite`, but applies a solid tint overlay (source-atop) for stylized attacks.
 * @param {string} tint CSS color (e.g. "#c9a8ff")
 * @param {number} alpha 0..1
 */
export function drawWhipSpriteTinted(ctx, screenX, screenY, angle, sizePx, tint, alpha = 0.65) {
  if (!isWhipReady()) return;
  const img = images.whip;
  const iw = bitmapSourceW(img);
  const ih = bitmapSourceH(img);
  if (iw <= 0 || ih <= 0) return;

  const scale = sizePx / Math.max(iw, ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ax =
    typeof CONFIG.WHIP_ANCHOR_X === "number"
      ? Math.max(0, Math.min(1, CONFIG.WHIP_ANCHOR_X))
      : 0.16;
  const ay =
    typeof CONFIG.WHIP_ANCHOR_Y === "number"
      ? Math.max(0, Math.min(1, CONFIG.WHIP_ANCHOR_Y))
      : 0.52;

  const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.65;
  const color = typeof tint === "string" && tint.length ? tint : "#c9a8ff";

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw * ax, -dh * ay, dw, dh);
  ctx.globalAlpha *= a;
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(-dw * ax, -dh * ay, dw, dh);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

function whipTintRgb(hex) {
  const h = (typeof hex === "string" ? hex : "#c9a8ff").replace("#", "");
  if (h.length === 3) {
    const a = h.split("");
    return {
      r: parseInt(a[0] + a[0], 16),
      g: parseInt(a[1] + a[1], 16),
      b: parseInt(a[2] + a[2], 16),
    };
  }
  if (h.length === 6) {
    const n = parseInt(h, 16);
    if (Number.isFinite(n)) {
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
  }
  return { r: 201, g: 168, b: 255 };
}

/**
 * Single-frame slash VFX: full length, no sweep animation; `alpha` is caller-controlled (fade out).
 * After rotate(atan2(fy, fx)), local +X is facing. Anchor (ax, ay) pins that point on the sprite to the player;
 * art should extend along +X (wide near anchor, tip forward). Flipping X after rotate mirrors along facing and
 * draws behind the player — leave WHIP_SLASH_FLIP_X false for standard wide-left / narrow-right slash art.
 * When cos(angle) is negative, rotate(π) flips the arc vertically; optional scale(1,-1) fixes that (see config).
 */
export function drawWhipSlashAttackVfx(
  ctx,
  screenX,
  screenY,
  angleRad,
  lenPx,
  alpha
) {
  if (!isWhipSlashReady()) return;
  const img = images.whipSlash;
  const iw = bitmapSourceW(img);
  const ih = bitmapSourceH(img);
  if (iw <= 0 || ih <= 0) return;

  const L = lenPx;
  if (L < 4) return;
  const lenScale =
    typeof CONFIG.WHIP_SLASH_LENGTH_SCALE === "number" ? CONFIG.WHIP_SLASH_LENGTH_SCALE : 1.08;
  const scale = L / Math.max(iw, ih);
  const dw = iw * scale * lenScale;
  const dh = ih * scale;
  const ax =
    typeof CONFIG.WHIP_SLASH_ANCHOR_X === "number"
      ? Math.max(0, Math.min(1, CONFIG.WHIP_SLASH_ANCHOR_X))
      : 0.06;
  const ay =
    typeof CONFIG.WHIP_SLASH_ANCHOR_Y === "number"
      ? Math.max(0, Math.min(1, CONFIG.WHIP_SLASH_ANCHOR_Y))
      : 0.5;
  const flipX = CONFIG.WHIP_SLASH_FLIP_X === true;
  const drawAx = flipX ? 1 - ax : ax;
  const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angleRad);
  if (flipX) ctx.scale(-1, 1);
  if (CONFIG.WHIP_SLASH_FLIP_Y_WHEN_FACING_LEFT !== false && Math.cos(angleRad) < 0) {
    ctx.scale(1, -1);
  }
  ctx.globalAlpha = a;
  const slashCrisp = CONFIG.WHIP_SLASH_PIXEL_CRISP === true;
  ctx.imageSmoothingEnabled = !slashCrisp;
  if ("imageSmoothingQuality" in ctx && !slashCrisp) ctx.imageSmoothingQuality = "low";
  ctx.drawImage(img, -dw * drawAx, -dh * ay, dw, dh);
  ctx.restore();
}

/**
 * Berserker Red Slash: single-frame sprite, no frame animation.
 * Rotated once per slash (constant ang) so it can go diagonal.
 */
export function drawBerserkerSlashVfx(ctx, screenX, screenY, angleRad, alpha = 1) {
  if (!isBerserkerSlashReady()) return;
  const img = images.berserkerSlash;
  const iw = bitmapSourceW(img);
  const ih = bitmapSourceH(img);
  if (iw <= 0 || ih <= 0) return;
  const sizePx = Math.max(8, CONFIG.BERSERKER_SLASH_DRAW_SIZE_PX ?? 180);
  const s = sizePx / Math.max(iw, ih);
  const dw = iw * s;
  const dh = ih * s;
  const ax = Math.max(0, Math.min(1, CONFIG.BERSERKER_SLASH_ANCHOR_X ?? 0.52));
  const ay = Math.max(0, Math.min(1, CONFIG.BERSERKER_SLASH_ANCHOR_Y ?? 0.52));
  const a = Math.max(0, Math.min(1, alpha));
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angleRad ?? 0);
  // Keep crescent orientation consistent when aiming leftward.
  if (CONFIG.BERSERKER_SLASH_FLIP_Y_WHEN_AIMING_LEFT !== false && Math.cos(angleRad ?? 0) < 0) {
    ctx.scale(1, -1);
  }
  ctx.globalAlpha = a;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw * ax, -dh * ay, dw, dh);
  ctx.restore();
}

/**
 * Soul Rip projectile: fixed frame from a strip/sheet, no animation, no rotation.
 */
export function drawSoulRipProjectile(ctx, screenX, screenY, sizePx, alpha = 1, angleRad = 0) {
  if (!isSoulRipProjectileReady()) return;
  const img = images.soulRipProjectile;
  const iw = bitmapSourceW(img);
  const ih = bitmapSourceH(img);
  if (iw <= 0 || ih <= 0) return;
  const cols = Math.max(1, Math.floor(CONFIG.SOUL_RIP_PROJECTILE_FRAME_COLS ?? 4));
  const rows = Math.max(1, Math.floor(CONFIG.SOUL_RIP_PROJECTILE_FRAME_ROWS ?? 1));
  const fw = Math.max(1, Math.floor(iw / cols));
  const fh = Math.max(1, Math.floor(ih / rows));
  const idx = Math.max(0, Math.floor(CONFIG.SOUL_RIP_PROJECTILE_FRAME_INDEX ?? 1));
  const col = idx % cols;
  const row = Math.min(rows - 1, Math.floor(idx / cols));
  const sx = col * fw;
  const sy = row * fh;
  const sw = col === cols - 1 ? iw - sx : fw;
  const sh = row === rows - 1 ? ih - sy : fh;
  const s = Math.max(6, sizePx ?? (CONFIG.SOUL_RIP_PROJECTILE_DRAW_SIZE ?? 68));
  const k = s / Math.max(sw, sh);
  const dw = sw * k;
  const dh = sh * k;
  ctx.save();
  ctx.translate(Math.round(screenX), Math.round(screenY));
  if (Number.isFinite(angleRad) && Math.abs(angleRad) > 1e-4) ctx.rotate(angleRad);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, -dw * 0.5, -dh * 0.5, dw, dh);
  ctx.restore();
}

/**
 * VS-like whip: thin elliptical arc (crescent), not a broad sword wedge.
 * (Unused by main attack VFX; kept as a fallback for debugging.)
 */
export function drawWhipSweepVsStyle(ctx, screenX, screenY, angleRad, lenPx, sweepU, tintHex, ghost = 0) {
  const { r, g, b } = whipTintRgb(tintHex);
  const gidx = ghost | 0;
  const ug = Math.max(0, Math.min(1, sweepU - gidx * 0.055));
  const fade = 1 - ug;
  const baseA = (0.22 + 0.52 * fade) * (0.94 - gidx * 0.3);

  const L = lenPx;
  if (L < 4) return;
  const rxM = typeof CONFIG.WHIP_ARC_RX_MULT === "number" ? CONFIG.WHIP_ARC_RX_MULT : 0.5;
  const ryM = typeof CONFIG.WHIP_ARC_RY_MULT === "number" ? CONFIG.WHIP_ARC_RY_MULT : 0.038;
  const t0 = Math.PI * (typeof CONFIG.WHIP_ARC_T0 === "number" ? CONFIG.WHIP_ARC_T0 : 1.07);
  const t1 = Math.PI * (typeof CONFIG.WHIP_ARC_T1 === "number" ? CONFIG.WHIP_ARC_T1 : 1.93);
  const rx = L * rxM;
  const ry = L * ryM;
  const cx = rx;
  const cy = 0;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angleRad);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "low";

  const glowW =
    typeof CONFIG.WHIP_ARC_GLOW_LINE === "number" ? CONFIG.WHIP_ARC_GLOW_LINE : 10;
  const coreW =
    typeof CONFIG.WHIP_ARC_CORE_LINE === "number" ? CONFIG.WHIP_ARC_CORE_LINE : 2.5;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, t0, t1, false);
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.14 * baseA})`;
  ctx.lineWidth = glowW + coreW * 2;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, t0, t1, false);
  ctx.strokeStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 35)},${255},${0.42 * baseA})`;
  ctx.lineWidth = coreW;
  ctx.stroke();

  ctx.restore();
}

function pickArenaBackgroundImage() {
  if (loaded.arenaBg && images.arenaBg.naturalWidth > 0) return images.arenaBg;
  if (
    CONFIG.USE_ARENA_GRASS_AS_FALLBACK &&
    groundLoaded.grass &&
    groundImages.grass.naturalWidth > 0
  ) {
    return groundImages.grass;
  }
  return null;
}

/**
 * Draws the visible portion of a single image mapped to the whole world
 * (any image size; stretched to match world in UV space).
 * @param viewW view frustum width in world units
 * @param viewH view frustum height in world units
 * @param destW destination logical canvas width (e.g. CONFIG.CANVAS_W)
 * @param destH destination logical canvas height
 */
export function drawArenaBackground(
  ctx,
  camX,
  camY,
  worldW,
  worldH,
  viewW,
  viewH,
  destW,
  destH
) {
  const img = pickArenaBackgroundImage();
  if (!img) return false;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const sx = (camX / worldW) * iw;
  const sy = (camY / worldH) * ih;
  const sw = (viewW / worldW) * iw;
  const sh = (viewH / worldH) * ih;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, destW, destH);
  ctx.restore();
  return true;
}

export function hasGroundTilesLoaded() {
  return groundLoaded.grass || groundLoaded.dirt || groundLoaded.patchy;
}

function hashTile(ix, iy) {
  let n = ix * 48271 + iy * 65521;
  n ^= n >>> 16;
  n = Math.imul(n, 2246822519);
  n ^= n >>> 13;
  n = Math.imul(n, 3266489917);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Prefer grass > patchy > dirt mix; skip types that failed to load. */
function pickGroundKey(ix, iy) {
  const r = hashTile(ix, iy) % 100;
  const g = groundLoaded.grass;
  const p = groundLoaded.patchy;
  const d = groundLoaded.dirt;
  if (g && p && d) {
    if (r < 40) return "grass";
    if (r < 75) return "patchy";
    return "dirt";
  }
  if (g && p) return r < 55 ? "grass" : "patchy";
  if (g && d) return r < 60 ? "grass" : "dirt";
  if (p && d) return r < 50 ? "patchy" : "dirt";
  if (g) return "grass";
  if (p) return "patchy";
  return "dirt";
}

function groundImageForKey(key) {
  const order = [key, "grass", "patchy", "dirt"];
  for (const k of order) {
    if (groundLoaded[k] && groundImages[k].naturalWidth > 0) return groundImages[k];
  }
  return null;
}

/**
 * @param {(wx: number, wy: number) => { x: number; y: number }} worldToScreen
 * @param {boolean} [grassOnly] — only tile Grass.png (see CONFIG.GROUND_GRASS_ONLY)
 * @returns {boolean} true if any tile drew (else caller can use procedural fallback)
 */
export function drawTiledGround(
  ctx,
  tileSize,
  camX,
  camY,
  viewW,
  viewH,
  worldToScreen,
  grassOnly = false
) {
  if (grassOnly) {
    if (!groundLoaded.grass || groundImages.grass.naturalWidth <= 0) return false;
  } else if (!hasGroundTilesLoaded()) {
    return false;
  }
  const x0 = Math.floor(camX / tileSize) * tileSize;
  const y0 = Math.floor(camY / tileSize) * tileSize;
  const cellWorld = tileSize + 1;
  const zoom = CONFIG.VIEW_WORLD_SCALE ?? 1;
  const cellPx = cellWorld / zoom;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (let tx = x0; tx < camX + viewW + tileSize; tx += tileSize) {
    for (let ty = y0; ty < camY + viewH + tileSize; ty += tileSize) {
      const img = grassOnly
        ? groundImages.grass
        : groundImageForKey(pickGroundKey(Math.floor(tx / tileSize), Math.floor(ty / tileSize)));
      if (!img) continue;
      const p = worldToScreen(tx, ty);
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      ctx.drawImage(img, 0, 0, iw, ih, p.x, p.y, cellPx, cellPx);
    }
  }
  ctx.restore();
  return true;
}

export function isPlayerSpriteReady() {
  return loaded.player && isLabelledSheetOk(images.player);
}

export function isOrbSpriteReady() {
  return loaded.orb && images.orb.naturalWidth > 0;
}

export function isOrbBlueReady() {
  return loaded.orbBlue && images.orbBlue.naturalWidth > 0;
}

export function isOrbRedReady() {
  return loaded.orbRed && images.orbRed.naturalWidth > 0;
}

export function isPickupsReady() {
  return loaded.pickups && images.pickups.naturalWidth > 0;
}

export function isDaggerReady() {
  return loaded.dagger && images.dagger.naturalWidth > 0;
}

export function isRunesReady() {
  return loaded.runes && images.runes.naturalWidth > 0;
}

export function isThrowingAxeReady() {
  return loaded.throwingAxe && images.throwingAxe.naturalWidth > 0;
}

export function isBoomerangReady() {
  return loaded.boomerang && images.boomerang.naturalWidth > 0;
}

export function isEnemySpriteReady(typeId) {
  const aid = enemyAssetTypeId(typeId);
  const img = images[aid];
  if (!img || !loaded[typeId]) return false;
  const spec = SPRITES[typeId];
  if (spec?.frameRects && typeof spec.frameRects === "object") {
    return bitmapSourceW(img) > 0 && bitmapSourceH(img) > 0;
  }
  const sliceOpts = enemySliceOpts(typeId);
  const fw = frameWidthFromImage(img, sliceOpts?.cols);
  if (!fw) return false;
  if (
    Number.isFinite(sliceOpts?.walkSy) &&
    Number.isFinite(sliceOpts?.walkSh) &&
    sliceOpts.walkSh > 0
  ) {
    return sliceOpts.walkSh > (LABEL_SHEET.labelSkipY + 16);
  }
  const rows = sliceOpts.rows ?? SHEET_ROWS;
  const starts = rowBandStartsFor(img, sliceOpts);
  let minInner = Infinity;
  for (let r = 0; r < rows; r++) {
    const skip = labelSkipForRow(sliceOpts, r);
    const padB = padBottomForRow(sliceOpts, r);
    const inner = starts[r + 1] - starts[r] - skip - padB;
    minInner = Math.min(minInner, inner);
  }
  return minInner > 16;
}

/**
 * Draw a single pre-cropped atlas rect (e.g. SPRITES.x.frameRects[animKey][i]).
 * We use the same flip method as other sprites: translate to center, scale(-1,1), then draw.
 * @param {{ sx: number; sy: number; sw: number; sh: number }} r
 */
function drawSpriteSourceRect(
  ctx,
  img,
  r,
  x,
  y,
  scale,
  flipX,
  anchorY = 0.5
) {
  if (!r || r.sw < 1 || r.sh < 1) return;
  const dw = r.sw * scale;
  const dh = r.sh * scale;
  const ay = Number.isFinite(anchorY)
    ? Math.max(0, Math.min(1.55, anchorY))
    : 0.5;
  const destW = Math.max(1, Math.round(dw));
  const destH = Math.max(1, Math.round(dh));
  const top = -Math.round(destH * ay);
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.save();
  ctx.translate(rx, ry);
  if (flipX) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -Math.floor(destW * 0.5), top, destW, destH);
  ctx.restore();
}

function drawSpriteSourceRectTintOverlay(ctx, x, y, r, scale, flipX, anchorY, rgba) {
  if (!r || r.sw < 1 || r.sh < 1) return;
  const dw = r.sw * scale;
  const dh = r.sh * scale;
  const ay = Number.isFinite(anchorY) ? Math.max(0, Math.min(1.55, anchorY)) : 0.5;
  const destW = Math.max(1, Math.round(dw));
  const destH = Math.max(1, Math.round(dh));
  const top = -Math.round(destH * ay);
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.save();
  ctx.translate(rx, ry);
  if (flipX) ctx.scale(-1, 1);
  // Circular aura instead of a harsh rectangle (avoids the "red square" look).
  ctx.globalCompositeOperation = "source-atop";
  const cx = 0;
  const cy = top + destH * 0.52;
  const rad = Math.max(destW, destH) * 0.55;
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  rg.addColorStop(0, rgba);
  rg.addColorStop(1, "rgba(255,60,60,0)");
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * @param {number} [anchorY=0.5] — 0.5 = center on (x,y); 1 = bottom edge at (x,y); >1 shifts sprite up (feet above anchor) for ground alignment.
 */
function drawLabelledFrame(
  ctx,
  img,
  col,
  row,
  x,
  y,
  scale,
  flipX,
  sliceOpts,
  anchorY = 0.5
) {
  const fw = frameWidthFromImage(img, sliceOpts?.cols);
  if (!fw) return;
  const slice = sliceForCell(img, col, row, fw, sliceOpts);
  if (!slice) return;
  const { sx, sy, sw, sh } = slice;
  drawSpriteSourceRect(
    ctx,
    img,
    { sx, sy, sw, sh },
    x,
    y,
    scale,
    flipX,
    anchorY
  );
}

export const HIT_ANIM_DURATION = 0.32;

const REVENANT_GRID_COLS = 4;
/** Must match authored Revenant.png: three horizontal bands (idle/walk/hit). */
const REVENANT_GRID_ROWS = 3;

/**
 * Vertical X boundaries between columns (length cols+1). `1254×1254` matches Berserk-style bands:
 * 315 + 313 + 313 + 313 — **not** equal floor(W/4), which caused horizontal neighbor bleed (ghost FX).
 */
function revenantColumnBandStarts(W) {
  if (W === 1254) {
    return [0, 315, 628, 941, 1254];
  }
  const fw = Math.floor(W / REVENANT_GRID_COLS);
  const s = [0];
  for (let c = 1; c < REVENANT_GRID_COLS; c++) s.push(c * fw);
  s.push(W);
  return s;
}

/**
 * Row boundaries for Revenant (length rows+1). Current 1306×1204 sheet has visible bands at:
 * idle: y 0..318, walk: y 319..581, hit: y 582..1203.
 */
function revenantRowBandStarts(H) {
  if (H === 1204) {
    return [0, 319, 582, 1204];
  }
  const bh = Math.floor(H / REVENANT_GRID_ROWS);
  return [0, bh, bh * 2, H];
}

/**
 * Reference cell size for UI/debug (col0 width × row0 height when using band tables).
 */
export function revenantGridFrameSize(img) {
  const W = bitmapSourceW(img);
  const H = bitmapSourceH(img);
  const colStarts = revenantColumnBandStarts(W);
  const rowStarts = revenantRowBandStarts(H);
  const cw0 = colStarts[1] - colStarts[0];
  const ch0 = rowStarts[1] - rowStarts[0];
  return {
    naturalWidth: W,
    naturalHeight: H,
    frameWidth: cw0,
    frameHeight: ch0,
  };
}

/** One atlas cell: column from `revenantColumnBandStarts`, row from equal-height bands (last row absorbs remainder). */
export function revenantAtlasSourceRect(img, col, row) {
  const W = bitmapSourceW(img);
  const H = bitmapSourceH(img);
  const colStarts = revenantColumnBandStarts(W);
  const rowStarts = revenantRowBandStarts(H);
  const c = Math.max(0, Math.min(REVENANT_GRID_COLS - 1, Math.floor(col)));
  const r = Math.max(0, Math.min(REVENANT_GRID_ROWS - 1, Math.floor(row)));
  const sx = colStarts[c];
  const sw = colStarts[c + 1] - sx;
  const sy = rowStarts[r];
  const sh = rowStarts[r + 1] - sy;
  return {
    sx,
    sy,
    sw,
    sh,
    frameWidth: sw,
    frameHeight: sh,
    naturalWidth: W,
    naturalHeight: H,
  };
}

/**
 * Which row/col/hit-/attack-timing → single source rect (`drawSpriteSourceRect`).
 * @returns {{sx:number;sy:number;sw:number;sh:number;frameWidth:number;frameHeight:number;naturalWidth:number;naturalHeight:number;rowIndex:number;frameIndex:number}}
 */
export function resolveRevenantFrameRect(img, state, attackTimerMax) {
  const anims = SPRITES.revenant.animations;
  let rowIndex = 0;
  let frameIndex = 0;

  if ((state.hitTimer ?? 0) > 0 && anims.hit) {
    const hit = anims.hit;
    const t = 1 - (state.hitTimer ?? 0) / HIT_ANIM_DURATION;
    rowIndex = hit.row ?? 2;
    const frames = Math.max(1, hit.frames ?? 2);
    frameIndex = Math.min(frames - 1, Math.floor(t * frames));
  } else {
    const moving = state.moving === true;
    if (moving && anims.walk) {
      rowIndex = anims.walk.row ?? 1;
      const wf = Math.max(0, anims.walk.frames ?? 4);
      frameIndex = ((state.walkFrame ?? 0) % wf + wf) % wf;
    } else if (anims.idle) {
      rowIndex = anims.idle.row ?? 0;
      frameIndex = 0;
    }
  }

  const base = revenantAtlasSourceRect(img, frameIndex, rowIndex);
  return {
    ...base,
    rowIndex,
    frameIndex,
  };
}

/** Debug overlay around drawn dest rect + monospace labels (CONFIG.DEBUG_REVENANT_SPRITE_SLICE). */
function drawRevenantSliceDebug(ctx, cx, cy, r, scale, anchorY = 0.9) {
  const ay = Number.isFinite(anchorY) ? Math.max(0, Math.min(1.55, anchorY)) : 0.9;
  const dw = r.sw * scale;
  const dh = r.sh * scale;
  const destW = Math.max(1, Math.round(dw));
  const destH = Math.max(1, Math.round(dh));
  const top = -Math.round(destH * ay);
  const left = Math.round(cx - destW * 0.5);
  ctx.save();
  ctx.strokeStyle = "rgba(0,255,100,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, Math.round(cy + top), destW, destH);
  ctx.font = "11px monospace";
  ctx.fillStyle = "rgba(0,255,100,0.95)";
  const lines = [
    "character=revenant",
    `rowIndex=${r.rowIndex}`,
    `frameIndex=${r.frameIndex}`,
    `sourceX=${r.sx}`,
    `sourceY=${r.sy}`,
    `frameWidth=${r.frameWidth}`,
    `frameHeight=${r.frameHeight}`,
  ];
  let ty = cy + top - 10;
  for (let i = lines.length - 1; i >= 0; i--) {
    ty -= 14;
    ctx.fillText(lines[i], left - 4, ty);
  }
  ctx.restore();
}

function playerSliceOpts() {
  const skip =
    CONFIG.PLAYER_SHEET_LABEL_SKIP_Y != null
      ? CONFIG.PLAYER_SHEET_LABEL_SKIP_Y
      : LABEL_SHEET.labelSkipY;
  const padB =
    CONFIG.PLAYER_SHEET_PAD_BOTTOM != null
      ? CONFIG.PLAYER_SHEET_PAD_BOTTOM
      : LABEL_SHEET.padBottom;
  return { labelSkipY: skip, padBottom: padB };
}

/**
 * Mage Player.png hit row: col0 artwork starts ~x≈121; slicing full 256px cells pulls stray pixels left of the robe.
 * sx/sw are authored for current sheet; sy/sh derive from atlas height + PLAYER_SHEET_* config.
 */
function mageHitSourceRects(img) {
  const H = Math.max(128, bitmapSourceH(img) || 1024);
  const rows = Math.max(
    1,
    Math.floor(Number(SPRITES.player?.sheetSlice?.rows ?? 4))
  );
  const bh = Math.floor(H / rows);
  const skip =
    typeof CONFIG.PLAYER_SHEET_LABEL_SKIP_Y === "number"
      ? CONFIG.PLAYER_SHEET_LABEL_SKIP_Y
      : LABEL_SHEET.labelSkipY;
  const padB =
    typeof CONFIG.PLAYER_SHEET_PAD_BOTTOM === "number"
      ? CONFIG.PLAYER_SHEET_PAD_BOTTOM
      : LABEL_SHEET.padBottom ?? 0;
  const sy0 = bh * (SPRITES.player?.animations?.hit?.row ?? 2) + skip;
  const shHit = Math.max(8, bh - skip - padB);
  return [
    { sx: 121, sy: sy0, sw: 135, sh: shHit },
    { sx: 256, sy: sy0, sw: 247, sh: shHit },
  ];
}

// Cache visible (non-transparent) bounds per player frame to avoid using padded cell width for UI.
// Key: `${col},${row}` → { minX, maxX, minY, maxY } in slice-local pixels.
const _playerVisibleBounds = new Map();

function playerVisibleBoundsForSlice(img, slice) {
  if (!img || !slice) return null;
  // Include bitmap dims so different spritesheets never collide in cache.
  const key = `${bitmapSourceW(img)}x${bitmapSourceH(img)}:${slice.sx},${slice.sy},${slice.sw},${slice.sh}`;
  const cached = _playerVisibleBounds.get(key);
  if (cached) return cached;

  const sw = Math.max(1, Math.floor(slice.sw));
  const sh = Math.max(1, Math.floor(slice.sh));
  // Draw the slice into an offscreen canvas, then scan alpha.
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const cctx = c.getContext("2d", { willReadFrequently: true });
  if (!cctx) return null;
  cctx.imageSmoothingEnabled = false;
  cctx.clearRect(0, 0, sw, sh);
  cctx.drawImage(img, slice.sx, slice.sy, slice.sw, slice.sh, 0, 0, sw, sh);
  const data = cctx.getImageData(0, 0, sw, sh).data;

  let minX = sw;
  let maxX = -1;
  // For Y bounds, ignore single-pixel dust by requiring a minimum pixel count on the row.
  const rowCounts = new Uint16Array(sh);
  const aThresh = 12; // small threshold to ignore faint halos
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const a = data[(y * sw + x) * 4 + 3];
      if (a > aThresh) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        rowCounts[y] += 1;
      }
    }
  }
  const minRowPix = 6; // tune: higher = ignores more noise; lower = more sensitive
  let minY = 0;
  let maxY = sh - 1;
  for (let y = 0; y < sh; y++) {
    if (rowCounts[y] >= minRowPix) {
      minY = y;
      break;
    }
  }
  for (let y = sh - 1; y >= 0; y--) {
    if (rowCounts[y] >= minRowPix) {
      maxY = y;
      break;
    }
  }
  if (maxX < 0) {
    // Fully transparent (shouldn't happen); fall back to full width.
    minX = 0;
    maxX = sw - 1;
    minY = 0;
    maxY = sh - 1;
  }
  const out = { minX, maxX, minY, maxY };
  _playerVisibleBounds.set(key, out);
  return out;
}

// Revenant: cache a single "foot reference" in *screen-space offset from drawY*.
// Must include anchor math because rows can have different heights (sh), which affects the rendered top.
const _revenantFootRef = new Map();
function revenantFootRefPos(img, scale, anchorY) {
  if (!img) return null;
  const s = Number(scale);
  const ay = Number(anchorY);
  if (!Number.isFinite(s) || !Number.isFinite(ay) || s <= 0) return null;
  const key = `${bitmapSourceW(img)}x${bitmapSourceH(img)}:revFootRef:${s.toFixed(4)}:${ay.toFixed(4)}`;
  const cached = _revenantFootRef.get(key);
  if (cached != null) return cached;
  const anims = SPRITES.revenant?.animations ?? {};
  let best = null;
  const sampleAnim = (a) => {
    if (!a) return;
    const row = Math.max(0, Math.floor(a.row ?? 0));
    const frames = Math.max(1, Math.floor(a.frames ?? 1));
    for (let fi = 0; fi < frames; fi++) {
      const r = revenantAtlasSourceRect(img, fi, row);
      const b = playerVisibleBoundsForSlice(img, r);
      const maxY = b?.maxY ?? Math.max(0, r.sh - 1);
      const destH = Math.max(1, Math.round(r.sh * s));
      const footPos = -Math.round(destH * ay) + maxY * s;
      if (Number.isFinite(footPos)) best = best == null ? footPos : Math.max(best, footPos);
    }
  };
  sampleAnim(anims.idle);
  sampleAnim(anims.walk);
  sampleAnim(anims.hit);
  if (best == null) best = 0;
  _revenantFootRef.set(key, best);
  return best;
}

/**
 * Screen-space width/height of the current player frame and vertical bob (matches drawPlayer).
 * @param {object} state — same shape as drawPlayer `state`
 * @returns {{ dw: number; dh: number; bob: number; visW: number; visCenterDx: number }}
 */
function playerFrameMetrics(state) {
  const characterId = state?.characterId ?? "mage";
  const isRevenant = characterId === "revenant";
  const spec = isRevenant ? SPRITES.revenant : SPRITES.player;
  const anims = spec.animations;
  const baseScale = spec.drawScale;
  const sideBob =
    state.walkKind === "side"
      ? (CONFIG.PLAYER_WALK_SIDE_BOB_MULT ?? 1)
      : 1;
  const bobAmp = (spec.animateWalk !== false ? 0.45 : 1) * sideBob;
  const bob =
    spec.disableWalkBob === true
      ? 0
      : (state.moving && state.hitTimer <= 0
          ? Math.sin(performance.now() / 140) * 2.2 * bobAmp
          : 0);

  if (isRevenant ? !isRevenantReady() : !isPlayerSpriteReady()) {
    return { dw: 44, dh: 56, bob };
  }

  // Revenant: 4×5 grid rects from image size; visible width from alpha within the current cell.
  if (isRevenant && isRevenantReady()) {
    const img = images.revenant;
    const atkMax =
      typeof state.attackTimerMax === "number"
        ? state.attackTimerMax
        : (CONFIG.SOUL_RIP_DURATION ?? 0.42);
    const r = resolveRevenantFrameRect(img, state, atkMax);
    const bounds = playerVisibleBoundsForSlice(img, r);
    const minX = bounds?.minX ?? 0;
    const maxX = bounds?.maxX ?? Math.max(0, r.sw - 1);
    const visW = Math.max(1, maxX - minX + 1) * baseScale;
    const centerSliceX = (minX + maxX) * 0.5;
    const visCenterDx = (centerSliceX - r.sw * 0.5) * baseScale;
    return { dw: r.sw * baseScale, dh: r.sh * baseScale, bob, visW, visCenterDx };
  }

  const img = isRevenant ? images.revenant : images.player;
  const sliceOpts = spec.sheetSlice ?? playerSliceOpts();
  const fw = frameWidthFromImage(img, sliceOpts?.cols);
  if (!fw) return { dw: 44, dh: 56, bob, visW: 44, visCenterDx: 0 };

  let row;
  let col;
  let scale;
  if (state.hitTimer > 0) {
    const hit = anims.hit;
    const t = 1 - state.hitTimer / HIT_ANIM_DURATION;
    const frames = Math.max(1, Math.floor(hit?.frames ?? 2));
    const frame = Math.min(frames - 1, Math.floor(t * frames));
    const hitRect =
      characterId === "mage" ? mageHitSourceRects(img)[frame] : undefined;
    if (characterId === "mage" && hitRect) {
      const bounds = playerVisibleBoundsForSlice(img, hitRect);
      const minX = bounds?.minX ?? 0;
      const maxX = bounds?.maxX ?? Math.max(0, hitRect.sw - 1);
      const visW = Math.max(1, maxX - minX + 1) * baseScale;
      const centerSliceX = (minX + maxX) * 0.5;
      const visCenterDx = (centerSliceX - hitRect.sw * 0.5) * baseScale;
      return {
        dw: hitRect.sw * baseScale,
        dh: hitRect.sh * baseScale,
        bob,
        visW,
        visCenterDx,
      };
    }
    row = hit?.row ?? 0;
    col = frame;
    scale = baseScale;
  } else {
    // Mage sheet now uses idle/walk only (all right-facing; flip handled in drawPlayer).
    // For frame metrics we just pick a representative frame from idle/walk.
    const key = state.moving ? "walk" : "idle";
    const anim = anims[key] ?? anims.idle ?? anims.walk;
    const frames = Math.max(1, Math.floor(anim?.frames ?? 4));
    const rate = state.moving ? 7.0 : 3.5;
    const cycle =
      spec.animateWalk !== false && state.moving
        ? Math.floor((performance.now() / 1000) * rate) % frames
        : 0;
    scale = baseScale;
    row = anim?.row ?? 0;
    col = cycle;
  }

  const slice = sliceForCell(img, col, row, fw, sliceOpts);
  if (!slice) return { dw: 44, dh: 56, bob, visW: 44, visCenterDx: 0 };

  const bounds = playerVisibleBoundsForSlice(img, slice);
  const minX = bounds?.minX ?? 0;
  const maxX = bounds?.maxX ?? Math.max(0, slice.sw - 1);
  const visW = Math.max(1, maxX - minX + 1) * scale;
  const centerSliceX = (minX + maxX) * 0.5;
  const visCenterDx = (centerSliceX - slice.sw * 0.5) * scale;

  return {
    dw: slice.sw * scale,
    dh: slice.sh * scale,
    bob,
    visW,
    visCenterDx,
  };
}

/**
 * Thin HP bar at the player's feet (below the sprite), width matches the drawn sprite frame.
 * @param {number} hpFrac — hp / maxHp (0..1)
 */
export function drawPlayerHeadHealthBar(ctx, x, y, hpFrac, state) {
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  const h =
    typeof CONFIG.PLAYER_HEAD_HEALTHBAR_HEIGHT_PX === "number"
      ? CONFIG.PLAYER_HEAD_HEALTHBAR_HEIGHT_PX
      : 4;
  const gap =
    typeof CONFIG.PLAYER_HEAD_HEALTHBAR_GAP_PX === "number"
      ? CONFIG.PLAYER_HEAD_HEALTHBAR_GAP_PX
      : 6;
  const characterId = state?.characterId ?? "mage";
  // Keep bar placement stable for ALL classes by measuring a fixed idle reference frame.
  // (Avoid per-frame walk offsets causing the bar to "swim".)
  const metricState = { ...state, moving: false, hitTimer: 0, attackTimer: 0, walkFrame: 0 };
  const m = playerFrameMetrics(metricState);
  const dh = finite(m?.dh) ? m.dh : 64;
  const visW = finite(m?.visW) ? m.visW : 64;
  const visCenterDx = finite(m?.visCenterDx) ? m.visCenterDx : 0;
  const spec = characterId === "revenant" ? SPRITES.revenant : SPRITES.player;
  const anchorY = typeof spec?.drawAnchorY === "number" ? spec.drawAnchorY : 0.5;
  const wMult =
    typeof CONFIG.PLAYER_HEAD_HEALTHBAR_WIDTH_MULT === "number"
      ? CONFIG.PLAYER_HEAD_HEALTHBAR_WIDTH_MULT
      : 0.72;
  const barW = Math.max(10, visW * Math.max(0.2, Math.min(1, wMult)));
  const frac = Math.max(0, Math.min(1, finite(hpFrac) ? hpFrac : 0));
  // Static placement: do NOT include `bob` so the bar doesn't move with walk animation.
  const topY = y - dh * anchorY;
  const barY = topY - gap - h;
  // Always keep the bar centered on the player's world position `x`.
  // (Using visCenterDx can shift by animation frame for some sheets.)
  const barX = x - barW * 0.5;

  if (!finite(barX) || !finite(barY) || !finite(barW) || !finite(frac)) return;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(barX - 1, barY - 1, barW + 2, h + 2);
  ctx.fillStyle = "rgba(20,12,28,0.95)";
  ctx.fillRect(barX, barY, barW, h);
  const g = ctx.createLinearGradient(barX, 0, barX + barW * frac, 0);
  g.addColorStop(0, "#7a1f35");
  g.addColorStop(0.55, "#c43e5c");
  g.addColorStop(1, "#ff88a0");
  ctx.fillStyle = g;
  ctx.fillRect(barX, barY, barW * frac, h);
  ctx.restore();
}

/**
 * @param {object} state
 * @param {number} state.hitTimer - remaining hit animation time (sec); >0 plays hit row
 * @param {'up'|'down'|'side'} state.walkKind - which walk row to use for walk/idle
 * @param {boolean} state.facingRight - horizontal flip (side walk + idle)
 * @param {number} state.walkFrame - 0..3 walk frame index
 * @param {boolean} state.moving
 */
export function drawPlayer(ctx, x, y, state) {
  const characterId = state?.characterId ?? "mage";
  const useBerserk = characterId === "berserker";
  const useArcher = characterId === "archer";
  const useRevenant = characterId === "revenant";
  if (useBerserk) {
    if (!isBerserkerReady()) {
      drawMagePlaceholder(ctx, x, y, state.facingRight, state.moving ? 0 : 0, 2);
      return;
    }
  } else if (useArcher) {
    if (!isArcherReady()) {
      drawMagePlaceholder(ctx, x, y, state.facingRight, state.moving ? 0 : 0, 2);
      return;
    }
  } else if (useRevenant) {
    if (!isRevenantReady()) {
      drawMagePlaceholder(ctx, x, y, state.facingRight, state.moving ? 0 : 0, 2);
      return;
    }
  } else {
    if (!isPlayerSpriteReady()) {
      drawMagePlaceholder(ctx, x, y, state.facingRight, state.moving ? 0 : 0, 2);
      return;
    }
  }

  const spec = useBerserk
    ? SPRITES.berserker
    : useArcher
      ? SPRITES.archer
      : useRevenant
        ? SPRITES.revenant
        : SPRITES.player;
  const anims = spec.animations;
  const baseScale = spec.drawScale;
  const sideBob =
    state.walkKind === "side"
      ? (CONFIG.PLAYER_WALK_SIDE_BOB_MULT ?? 1)
      : 1;
  const bobAmp = (spec.animateWalk !== false ? 0.45 : 1) * sideBob;
  const bob =
    spec.disableWalkBob === true
      ? 0
      : (state.moving && state.hitTimer <= 0
          ? Math.sin(performance.now() / 140) * 2.2 * bobAmp
          : 0);
  const drawY = y + bob;

  if (useRevenant && isRevenantReady()) {
    const img = images.revenant;
    const flip = !state.facingRight;
    const manAy = typeof spec.drawAnchorY === "number" ? spec.drawAnchorY : 0.9;
    const atkMax =
      typeof state.attackTimerMax === "number"
        ? state.attackTimerMax
        : (CONFIG.SOUL_RIP_DURATION ?? 0.42);
    const r = resolveRevenantFrameRect(img, state, atkMax);
    const manX =
      x + (typeof spec.drawScreenOffsetX === "number" ? spec.drawScreenOffsetX : 0);
    // Foot-lock: keep visible bottom aligned across rows/frames (prevents hit frames popping upward).
    // Reference uses the lowest on-screen foot position across idle/walk/hit frames (includes anchor math).
    let footDy = 0;
    try {
      const bCur = playerVisibleBoundsForSlice(img, r);
      const curMaxY = bCur?.maxY ?? Math.max(0, r.sh - 1);
      const destH = Math.max(1, Math.round(r.sh * baseScale));
      const curFootPos = -Math.round(destH * manAy) + curMaxY * baseScale;
      const refFootPos = revenantFootRefPos(img, baseScale, manAy);
      if (Number.isFinite(refFootPos) && Number.isFinite(curFootPos)) {
        footDy = refFootPos - curFootPos;
      }
    } catch {
      // ignore
    }
    if (spec.stabilizeX === true) {
      const b = playerVisibleBoundsForSlice(img, r);
      const minX = b?.minX ?? 0;
      const maxX = b?.maxX ?? Math.max(0, r.sw - 1);
      const centerSliceX = (minX + maxX) * 0.5;
      let dx = (centerSliceX - r.sw * 0.5) * baseScale;
      if (flip) dx = -dx;
      drawSpriteSourceRect(ctx, img, r, manX - dx, drawY + footDy, baseScale, flip, manAy);
    } else {
      drawSpriteSourceRect(ctx, img, r, manX, drawY + footDy, baseScale, flip, manAy);
    }
    if (CONFIG.DEBUG_REVENANT_SPRITE_SLICE === true) {
      drawRevenantSliceDebug(ctx, manX, drawY + footDy, r, baseScale, manAy);
    }
    return;
  }

  const useManual = (useBerserk || useArcher) && spec?.frameRects;
  const manAy =
    useManual && typeof spec.drawAnchorY === "number" ? spec.drawAnchorY : 0.5;
  const manFr = useManual ? spec.frameRects : null;
  const manImg = useBerserk ? images.berserker : useArcher ? images.archer : null;
  const manX =
    x +
    (useManual && typeof spec.drawScreenOffsetX === "number"
      ? spec.drawScreenOffsetX
      : 0);

  if (useManual && manFr && manImg) {
    const flip = !state.facingRight;
    if (state.hitTimer > 0) {
      const hit = anims.hit;
      const t = 1 - state.hitTimer / HIT_ANIM_DURATION;
      const frame = Math.min(hit.frames - 1, Math.floor(t * hit.frames));
      const r = manFr.hit?.[frame];
      if (r) {
        if (spec.stabilizeX === true) {
          const b = playerVisibleBoundsForSlice(manImg, r);
          const minX = b?.minX ?? 0;
          const maxX = b?.maxX ?? Math.max(0, r.sw - 1);
          const centerSliceX = (minX + maxX) * 0.5;
          let dx = (centerSliceX - r.sw * 0.5) * baseScale;
          if (flip) dx = -dx;
          drawSpriteSourceRect(ctx, manImg, r, manX - dx, drawY, baseScale, flip, manAy);
        } else {
          drawSpriteSourceRect(ctx, manImg, r, manX, drawY, baseScale, flip, manAy);
        }
      }
      return;
    }
    if (useArcher && (state.attackTimer ?? 0) > 0 && manFr.attack) {
      const atk = anims.attack;
      const dur = Math.max(
        0.12,
        state.attackTimerMax ??
          (CONFIG.BERSERKER_ATTACK_ANIM_DURATION ?? 0.3)
      );
      const u = 1 - (state.attackTimer ?? 0) / dur;
      const frame = Math.max(0, Math.min(atk.frames - 1, Math.floor(u * atk.frames)));
      const r = manFr.attack?.[frame];
      if (r) {
        if (spec.stabilizeX === true) {
          const b = playerVisibleBoundsForSlice(manImg, r);
          const minX = b?.minX ?? 0;
          const maxX = b?.maxX ?? Math.max(0, r.sw - 1);
          const centerSliceX = (minX + maxX) * 0.5;
          let dx = (centerSliceX - r.sw * 0.5) * baseScale;
          if (flip) dx = -dx;
          drawSpriteSourceRect(ctx, manImg, r, manX - dx, drawY, baseScale, flip, manAy);
        } else {
          drawSpriteSourceRect(ctx, manImg, r, manX, drawY, baseScale, flip, manAy);
        }
      }
      return;
    }
    const legKey = state.moving ? "walk" : "idle";
    const useLegKey =
      legKey === "idle" && !anims.idle && anims.walk ? "walk" : legKey;
    const leg = anims[useLegKey];
    const rects = manFr[useLegKey];
    if (Array.isArray(rects) && rects.length > 0 && leg) {
      const cycle =
        spec.animateWalk !== false && state.moving
          ? (state.walkFrame ?? 0) % Math.max(1, leg.frames ?? rects.length)
          : 0;
      let idx = ((cycle % rects.length) + rects.length) % rects.length;
      if (useLegKey === "walk" && Array.isArray(spec.walkFrameOrder) && spec.walkFrameOrder.length > 0) {
        const ord = spec.walkFrameOrder;
        const oi = ((cycle % ord.length) + ord.length) % ord.length;
        const mapped = Math.trunc(ord[oi]);
        if (Number.isFinite(mapped)) idx = ((mapped % rects.length) + rects.length) % rects.length;
      }
      const r = rects[idx];
      if (r) {
        if (spec.stabilizeX === true) {
          const b = playerVisibleBoundsForSlice(manImg, r);
          const minX = b?.minX ?? 0;
          const maxX = b?.maxX ?? Math.max(0, r.sw - 1);
          const centerSliceX = (minX + maxX) * 0.5;
          let dx = (centerSliceX - r.sw * 0.5) * baseScale;
          if (flip) dx = -dx;
          drawSpriteSourceRect(ctx, manImg, r, manX - dx, drawY, baseScale, flip, manAy);
          if (useBerserk && state?.bloodRageActive === true) {
            const a =
              typeof CONFIG.BERSERKER_BLOOD_RAGE_TINT_ALPHA === "number"
                ? CONFIG.BERSERKER_BLOOD_RAGE_TINT_ALPHA
                : 0.18;
            if (a > 1e-4) {
              drawSpriteSourceRectTintOverlay(
                ctx,
                manX - dx,
                drawY,
                r,
                baseScale,
                flip,
                manAy,
                `rgba(255,60,60,${Math.max(0, Math.min(0.35, a))})`
              );
            }
          }
        } else {
          drawSpriteSourceRect(ctx, manImg, r, manX, drawY, baseScale, flip, manAy);
          if (useBerserk && state?.bloodRageActive === true) {
            const a =
              typeof CONFIG.BERSERKER_BLOOD_RAGE_TINT_ALPHA === "number"
                ? CONFIG.BERSERKER_BLOOD_RAGE_TINT_ALPHA
                : 0.18;
            if (a > 1e-4) {
              drawSpriteSourceRectTintOverlay(
                ctx,
                manX,
                drawY,
                r,
                baseScale,
                flip,
                manAy,
                `rgba(255,60,60,${Math.max(0, Math.min(0.35, a))})`
              );
            }
          }
        }
      }
    }
    return;
  }

  // Mage (Player.png): 4×4 grid with right-facing frames (flip for left).
  if (!useBerserk && !useArcher) {
    const img = images.player;
    const flip = !state.facingRight;
    const anchorY = typeof spec.drawAnchorY === "number" ? spec.drawAnchorY : 0.9;
    const sliceOpts = spec.sheetSlice ?? { rows: 4, cols: 4, labelSkipY: 0, padBottom: 0 };
    const moving = state.moving === true;
    const hitT = state.hitTimer ?? 0;

    if (hitT > 0) {
      const hit = anims.hit;
      const t = 1 - hitT / HIT_ANIM_DURATION;
      const frames = Math.max(1, Math.floor(hit.frames ?? 2));
      const frame = Math.min(frames - 1, Math.floor(t * frames));
      const hitR = mageHitSourceRects(img)[frame] ?? null;
      if (hitR) {
        if (spec.stabilizeX === true) {
          const b = playerVisibleBoundsForSlice(img, hitR);
          const minX = b?.minX ?? 0;
          const maxX = b?.maxX ?? Math.max(0, hitR.sw - 1);
          const centerSliceX = (minX + maxX) * 0.5;
          let dx = (centerSliceX - hitR.sw * 0.5) * baseScale;
          if (flip) dx = -dx;
          drawSpriteSourceRect(ctx, img, hitR, x - dx, drawY, baseScale, flip, anchorY);
        } else {
          drawSpriteSourceRect(ctx, img, hitR, x, drawY, baseScale, flip, anchorY);
        }
        return;
      }
      if (spec.stabilizeX === true) {
        const fw = frameWidthFromImage(img, sliceOpts?.cols);
        const slice = fw ? sliceForCell(img, frame, hit.row, fw, sliceOpts) : null;
        if (slice) {
          const b = playerVisibleBoundsForSlice(img, slice);
          const minX = b?.minX ?? 0;
          const maxX = b?.maxX ?? Math.max(0, slice.sw - 1);
          const centerSliceX = (minX + maxX) * 0.5;
          let dx = (centerSliceX - slice.sw * 0.5) * baseScale;
          if (flip) dx = -dx;
          drawSpriteSourceRect(ctx, img, slice, x - dx, drawY, baseScale, flip, anchorY);
          return;
        }
      }
      drawLabelledFrame(ctx, img, frame, hit.row, x, drawY, baseScale, flip, sliceOpts, anchorY);
      return;
    }

    const key = moving ? "walk" : "idle";
    const anim = anims[key] ?? anims.idle;
    const frames = Math.max(1, Math.floor(anim.frames ?? 4));
    const rate = moving ? 7.0 : 3.5;
    const step =
      spec.animateWalk !== false && moving
        ? Math.floor((performance.now() / 1000) * rate) % frames
        : 0;
    if (spec.stabilizeX === true) {
      const fw = frameWidthFromImage(img, sliceOpts?.cols);
      const slice = fw ? sliceForCell(img, step, anim.row, fw, sliceOpts) : null;
      if (slice) {
        const b = playerVisibleBoundsForSlice(img, slice);
        const minX = b?.minX ?? 0;
        const maxX = b?.maxX ?? Math.max(0, slice.sw - 1);
        const centerSliceX = (minX + maxX) * 0.5;
        let dx = (centerSliceX - slice.sw * 0.5) * baseScale;
        if (flip) dx = -dx;
        drawSpriteSourceRect(ctx, img, slice, x - dx, drawY, baseScale, flip, anchorY);
        return;
      }
    }
    drawLabelledFrame(ctx, img, step, anim.row, x, drawY, baseScale, flip, sliceOpts, anchorY);
    return;
  }

  if (state.hitTimer > 0) {
    const hit = anims.hit;
    const t = 1 - state.hitTimer / HIT_ANIM_DURATION;
    const frame = Math.min(hit.frames - 1, Math.floor(t * hit.frames));
    drawLabelledFrame(
      ctx,
      images.player,
      frame,
      hit.row,
      x,
      drawY,
      baseScale,
      !state.facingRight,
      playerSliceOpts(),
      0.5
    );
    return;
  }

  const walkKey = state.walkKind === "side" ? "walkSide" : state.walkKind === "up" ? "walkUp" : "walkDown";
  const walk = anims[walkKey];
  let cycle =
    spec.animateWalk !== false && state.moving ? state.walkFrame % walk.frames : 0;
  const sideTimeFps = CONFIG.PLAYER_WALK_SIDE_TIME_FPS ?? 0;
  if (
    !useBerserk &&
    walkKey === "walkSide" &&
    sideTimeFps > 0 &&
    state.moving &&
    state.hitTimer <= 0
  ) {
    cycle = Math.floor((performance.now() / 1000) * sideTimeFps) % walk.frames;
  }
  if (!useBerserk && walkKey === "walkSide") {
    const ord = CONFIG.PLAYER_WALK_SIDE_COLUMN_ORDER;
    if (Array.isArray(ord) && ord.length === walk.frames) {
      const step = ((cycle % walk.frames) + walk.frames) % walk.frames;
      const col = ord[step];
      if (typeof col === "number" && col >= 0 && col < walk.frames) {
        cycle = col;
      }
    }
  }
  const flip = walkKey === "walkSide" ? !state.facingRight : false;
  const scale =
    baseScale *
    (walkKey === "walkSide" ? (CONFIG.PLAYER_DRAW_SCALE_SIDE_MULT ?? 1) : 1);
  drawLabelledFrame(
    ctx,
    images.player,
    cycle,
    walk.row,
    x,
    drawY,
    scale,
    flip,
    playerSliceOpts(),
    0.5
  );
}

/**
 * @param {'small'|'med'|'large'} [tier]
 */
export function drawXpOrb(ctx, x, y, screenRadius, tier = "small") {
  const t = tier === "large" ? "large" : tier === "med" ? "med" : "small";
  const img =
    t === "large"
      ? (isOrbRedReady() ? images.orbRed : images.orb)
      : t === "med"
        ? (isOrbBlueReady() ? images.orbBlue : images.orb)
        : images.orb;
  if (!img || img.naturalWidth <= 0) return false;
  const scale = (screenRadius * 2.2) / Math.max(img.naturalWidth, img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = "rgba(168, 85, 247, 0.9)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/**
 * Pickups sheet (Pickups.png) is a loose atlas. We use hand-picked source rects for:
 * - heart
 * - magnet
 * - bomb
 */
export function drawPickupIcon(ctx, screenX, screenY, kind, sizePx, alpha = 1) {
  if (!isPickupsReady()) return false;
  const img = images.pickups;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;

  const rects = {
    // Pickups.png heart alpha-bounds (tight): x[852..917], y[80..140]
    heart: { sx: 852, sy: 80, sw: 66, sh: 61 },
    // Pickups.png magnet alpha-bounds (includes faint bottom pixels): x[596..694], y[229..330]
    magnet: { sx: 596, sy: 229, sw: 99, sh: 102 },
    // Pickups.png bomb alpha-bounds (tight-ish; includes fuse): x[845..924], y[110..320]
    bomb: { sx: 845, sy: 110, sw: 80, sh: 211 },
  };
  const r = rects[kind] ?? rects.heart;
  const s = Math.max(1, sizePx);
  const k = s / Math.max(r.sw, r.sh);
  const dw = r.sw * k;
  const dh = r.sh * k;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/**
 * Drawing for removed assets is intentionally absent.
 */

export function drawDaggerSprite(ctx, screenX, screenY, ang, sizePx, alpha = 1) {
  if (!isDaggerReady()) return false;
  const img = images.dagger;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const s = Math.max(1, sizePx);
  const k = s / Math.max(iw, ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ang);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  // Knife.png points to the right; anchor at center.
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

export function drawRuneSprite(ctx, screenX, screenY, ang, sizePx, alpha = 1) {
  if (!isRunesReady()) return false;
  const img = images.runes;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const s = Math.max(1, sizePx);
  const k = s / Math.max(iw, ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ang ?? 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

export function drawThrowingAxeSprite(ctx, screenX, screenY, ang, sizePx, alpha = 1) {
  if (!isThrowingAxeReady()) return false;
  const img = images.throwingAxe;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const s = Math.max(1, sizePx);
  const k = s / Math.max(iw, ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ang ?? 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

export function drawBoomerangSprite(ctx, screenX, screenY, ang, sizePx, alpha = 1) {
  if (!isBoomerangReady()) return false;
  const img = images.boomerang;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw <= 0 || ih <= 0) return false;
  const s = Math.max(1, sizePx);
  const k = s / Math.max(iw, ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(ang ?? 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/**
 * @param {{
 *   walkRow?: number;
 *   flipX?: boolean;
 *   walkFrames?: number;
 *   animKey?: string;
 *   animFrame?: number;
 *   extraScale?: number;
 *   squashY?: number;
 * }} [walkOpts] — row/flip override; extraScale/squashY for slime split pop / organic stretch
 */
export function drawEnemySprite(ctx, typeId, x, y, walkFrame, whiteFlash, walkOpts) {
  if (!isEnemySpriteReady(typeId)) return false;
  const spec = SPRITES[typeId];
  const aid = enemyAssetTypeId(typeId);
  const img = images[aid];
  const animKey = typeof walkOpts?.animKey === "string" ? walkOpts.animKey : "walk";
  const anim = spec.animations?.[animKey] ?? spec.animations.walk;
  const rects = spec?.frameRects?.[animKey];
  const cellsFromAnim =
    spec.animCells && typeof animKey === "string" && spec.animCells[animKey]
      ? spec.animCells[animKey]
      : null;
  const cells = Array.isArray(cellsFromAnim) && cellsFromAnim.length > 0 ? cellsFromAnim : spec.walkFrameCells;
  const cellCount = Array.isArray(cells) ? cells.length : 0;
  const frames = Math.max(
    1,
    Array.isArray(rects) && rects.length > 0
      ? rects.length
      : cellCount > 0
      ? cellCount
      : typeof walkOpts?.walkFrames === "number"
        ? walkOpts.walkFrames
        : anim.frames
  );
  let frame = 0;
  if (Number.isFinite(walkOpts?.animFrame)) {
    const f = Math.trunc(walkOpts.animFrame);
    frame = ((f % frames) + frames) % frames;
  } else if (spec.animateWalk !== false) {
    frame = ((Math.trunc(walkFrame) % frames) + frames) % frames;
  }
  const scale = spec.drawScale * (typeof walkOpts?.extraScale === "number" ? walkOpts.extraScale : 1);
  let sliceCol = frame;
  let sliceRow =
    typeof walkOpts?.walkRow === "number" ? walkOpts.walkRow : anim.row;
  if (cellCount > 0) {
    const c = cells[((frame % cellCount) + cellCount) % cellCount];
    if (Array.isArray(c) && c.length >= 2) {
      sliceCol = c[0];
      sliceRow = c[1];
    } else if (c && typeof c === "object") {
      sliceCol = c.col ?? c.c ?? 0;
      sliceRow = c.row ?? c.r ?? 0;
    }
  }
  const flipX = walkOpts?.flipX === true;
  const squashY = typeof walkOpts?.squashY === "number" ? walkOpts.squashY : 1;
  const fo = spec?.frameOffsets?.[animKey];
  const foff =
    Array.isArray(fo) && fo.length > 0
      ? fo[Math.max(0, Math.min(fo.length - 1, frame))]
      : null;

  const anchorY =
    typeof spec.drawAnchorY === "number"
      ? spec.drawAnchorY
      : 0.5;
  ctx.save();
  if (whiteFlash) ctx.filter = "brightness(2.6) saturate(0.35)";
  // Offsets are computed in source frame space; mirror X offset when we mirror the sprite.
  const allowX = spec?.applyFrameOffsetX !== false;
  const ox =
    allowX && foff && Number.isFinite(foff.dx)
      ? foff.dx * scale * (flipX ? -1 : 1)
      : 0;
  const allowY = spec?.applyFrameOffsetY !== false;
  const oy =
    allowY && foff && Number.isFinite(foff.dy)
      ? foff.dy * scale
      : 0;
  const drawY = y + (spec.drawScreenOffsetY ?? 0) + oy;
  if (flipX || squashY !== 1) {
    ctx.translate(x + ox, drawY);
    if (flipX) ctx.scale(-1, 1);
    if (squashY !== 1) ctx.scale(1, squashY);
    if (Array.isArray(rects) && rects.length > 0) {
      const r = rects[Math.max(0, Math.min(rects.length - 1, frame))];
      const dw = r.sw * scale;
      const dh = r.sh * scale;
      const ay = Number.isFinite(anchorY) ? Math.max(0, Math.min(1.55, anchorY)) : 0.5;
      const top = -dh * ay;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -dw / 2, top, dw, dh);
    } else {
      drawLabelledFrame(
        ctx,
        img,
        sliceCol,
        sliceRow,
        0,
        0,
        scale,
        false,
        enemySliceOpts(typeId, animKey),
        anchorY
      );
    }
  } else {
    if (Array.isArray(rects) && rects.length > 0) {
      const r = rects[Math.max(0, Math.min(rects.length - 1, frame))];
      const dw = r.sw * scale;
      const dh = r.sh * scale;
      const ay = Number.isFinite(anchorY) ? Math.max(0, Math.min(1.55, anchorY)) : 0.5;
      const top = -dh * ay;
      ctx.save();
      ctx.translate(x + ox, drawY);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -dw / 2, top, dw, dh);
      ctx.restore();
    } else {
      drawLabelledFrame(
        ctx,
        img,
        sliceCol,
        sliceRow,
        x + ox,
        drawY,
        scale,
        false,
        enemySliceOpts(typeId, animKey),
        anchorY
      );
    }
  }
  ctx.restore();
  return true;
}

function drawMagePlaceholder(ctx, x, y, facingRight, moving, scale) {
  ctx.save();
  ctx.translate(x, y);
  if (!facingRight) ctx.scale(-1, 1);
  const bob = moving ? Math.sin(performance.now() / 120) * 1.5 : 0;
  ctx.translate(0, bob);

  const g = ctx.createRadialGradient(0, -4, 2, 0, 0, 22 * scale);
  g.addColorStop(0, "rgba(180, 120, 255, 0.35)");
  g.addColorStop(1, "rgba(100, 40, 180, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -2, 20 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1a1228";
  ctx.strokeStyle = "#4a3868";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -18 * scale);
  ctx.quadraticCurveTo(14 * scale, -8 * scale, 12 * scale, 10 * scale);
  ctx.lineTo(-12 * scale, 10 * scale);
  ctx.quadraticCurveTo(-14 * scale, -8 * scale, 0, -18 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2a1f3d";
  ctx.beginPath();
  ctx.ellipse(0, 4 * scale, 10 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c9a8ff";
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-4 * scale, -8 * scale, 2 * scale, 2 * scale);
  ctx.fillRect(2 * scale, -8 * scale, 2 * scale, 2 * scale);
  ctx.globalAlpha = 1;

  ctx.restore();
}
