/**
 * Emit `public/` for Vercel (Static / Other presets often expect this output folder).
 */
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");

mkdirSync(pub, { recursive: true });

const dirsToCopy = ["css", "js", "assets"];
const filesToCopy = ["index.html", "favicon.ico"];

for (const d of dirsToCopy) {
  cpSync(path.join(root, d), path.join(pub, d), { recursive: true });
}
for (const f of filesToCopy) {
  cpSync(path.join(root, f), path.join(pub, f));
}

// index.html resolves three via ./node_modules/three — must ship with static output root.
const threeSrc = path.join(root, "node_modules", "three");
const threeDst = path.join(pub, "node_modules", "three");
mkdirSync(path.dirname(threeDst), { recursive: true });
cpSync(threeSrc, threeDst, { recursive: true });

console.log("[vercel-static-build] copied site + three -> public/");
