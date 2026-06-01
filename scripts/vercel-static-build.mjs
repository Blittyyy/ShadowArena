/**
 * Emit `public/` for Vercel (Static / Other presets often expect this output folder).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");

/** Must match your Render web service URL (https://<service-name>.onrender.com). */
const DEFAULT_PRODUCTION_MULTIPLAYER_URL = "https://shadowarena.onrender.com";
const MP_PLACEHOLDER = "__PRODUCTION_MULTIPLAYER_SERVER_URL__";

function productionMultiplayerUrl() {
  const fromEnv = String(process.env.MULTIPLAYER_SERVER_URL ?? "").trim().replace(/\/$/, "");
  if (/^https:\/\//i.test(fromEnv)) return fromEnv;
  return DEFAULT_PRODUCTION_MULTIPLAYER_URL;
}

function writeProductionIndexHtml() {
  const src = path.join(root, "index.html");
  const dst = path.join(pub, "index.html");
  let html = readFileSync(src, "utf8");
  if (!html.includes(MP_PLACEHOLDER)) {
    throw new Error(`[vercel-static-build] index.html missing ${MP_PLACEHOLDER}`);
  }
  html = html.replaceAll(MP_PLACEHOLDER, productionMultiplayerUrl());
  writeFileSync(dst, html, "utf8");
}

mkdirSync(pub, { recursive: true });

const dirsToCopy = ["css", "js", "assets"];
const filesToCopy = ["favicon.ico"];

for (const d of dirsToCopy) {
  cpSync(path.join(root, d), path.join(pub, d), { recursive: true });
}
writeProductionIndexHtml();
for (const f of filesToCopy) {
  cpSync(path.join(root, f), path.join(pub, f));
}

// index.html resolves three via ./node_modules/three — must ship with static output root.
const threeSrc = path.join(root, "node_modules", "three");
const threeDst = path.join(pub, "node_modules", "three");
mkdirSync(path.dirname(threeDst), { recursive: true });
cpSync(threeSrc, threeDst, { recursive: true });

console.log("[vercel-static-build] copied site + three -> public/");
