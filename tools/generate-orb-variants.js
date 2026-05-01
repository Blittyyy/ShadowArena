/* eslint-disable no-console */
// Generates hue-shifted Orb PNG variants while preserving shading/highlights.
// Output: assets/Orb-blue.png, Orb-red.png (small XP uses the original Orb.png)

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

function meanOrbHueDegrees(png) {
  let sumX = 0;
  let sumY = 0;
  let wSum = 0;
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a < 0.05) continue;
    const { h, s, l } = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.10) continue; // keep highlights/speculars from skewing the hue
    // Weight toward more "colorful" pixels; keep lightness in play a bit.
    const w = a * (0.35 + 0.65 * clamp01(s)) * (0.5 + 0.5 * clamp01(1 - Math.abs(l - 0.5) * 2));
    const rad = (h * Math.PI) / 180;
    sumX += Math.cos(rad) * w;
    sumY += Math.sin(rad) * w;
    wSum += w;
  }
  if (wSum < 1e-6) return 0;
  const ang = Math.atan2(sumY, sumX);
  const deg = (ang * 180) / Math.PI;
  return (deg + 360) % 360;
}

function hueRotatePng(srcPng, deltaDeg) {
  const out = new PNG({ width: srcPng.width, height: srcPng.height });
  const s = srcPng.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3];
    d[i + 3] = a;
    if (a === 0) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      continue;
    }
    const { h, s: sat, l } = rgbToHsl(s[i], s[i + 1], s[i + 2]);
    const { r, g, b } = hslToRgb(h + deltaDeg, sat, l);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  return out;
}

function readPng(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on("parsed", function () {
        resolve(this);
      })
      .on("error", reject);
  });
}

function writePng(filePath, png) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    png
      .pack()
      .pipe(stream)
      .on("finish", resolve)
      .on("error", reject);
  });
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const assetsDir = path.join(repoRoot, "assets");
  const srcPath = path.join(assetsDir, "Orb.png");
  if (!fs.existsSync(srcPath)) {
    console.error(`[orb-variants] Missing source PNG: ${srcPath}`);
    process.exit(1);
  }

  const src = await readPng(srcPath);
  const baseHue = meanOrbHueDegrees(src);
  console.log(`[orb-variants] Orb.png ${src.width}x${src.height}, meanHue=${baseHue.toFixed(1)}°`);

  const variants = [
    { name: "blue", targetHue: 210 },
    { name: "red", targetHue: 0 },
  ];

  for (const v of variants) {
    const delta = ((v.targetHue - baseHue + 540) % 360) - 180; // shortest rotation
    const out = hueRotatePng(src, delta);
    const outPath = path.join(assetsDir, `Orb-${v.name}.png`);
    await writePng(outPath, out);
    console.log(`[orb-variants] wrote ${path.relative(repoRoot, outPath)} (Δh=${delta.toFixed(1)}°)`);
  }
}

main().catch((err) => {
  console.error("[orb-variants] failed", err);
  process.exit(1);
});

