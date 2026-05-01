/**
 * Vibe Jam 2026 webring: URL capture, return-via-ref storage, and hub redirects.
 * Kept free of game engine imports for safe bundling.
 */

const STORAGE_RETURN = "shadowArenaJamReturnHref";
const STORAGE_FORWARD = "shadowArenaJamForwardBag";

const FORWARD_KEYS = new Set([
  "username",
  "color",
  "speed",
  "avatar_url",
  "team",
  "hp",
  "speed_x",
  "speed_y",
  "speed_z",
  "rotation_x",
  "rotation_y",
  "rotation_z",
]);

const HUB = "https://vibejam.cc/portal/2026";

let beforeNavigate = () => {};

/** @param {() => void} fn */
export function configureJamRedirectHooks(fn) {
  beforeNavigate = typeof fn === "function" ? fn : () => {};
}

export function runBeforeJamNavigation() {
  try {
    beforeNavigate();
  } catch {
    //
  }
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function safeHttpUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * @param {URLSearchParams} sp
 * @returns {Record<string, string>}
 */
export function collectForwardParamBag(sp) {
  /** @type {Record<string, string>} */
  const bag = {};
  for (const [k, v] of sp.entries()) {
    const lk = k.toLowerCase();
    if (lk === "portal" || lk === "ref") continue;
    if (!FORWARD_KEYS.has(lk)) continue;
    if (v.length > 512) continue;
    bag[k] = v;
  }
  return bag;
}

export function loadForwardBagFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_FORWARD);
    if (!raw) return {};
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const k of Object.keys(o)) {
      if (FORWARD_KEYS.has(k.toLowerCase()) && typeof o[k] === "string") out[k] = o[k];
    }
    return out;
  } catch {
    return {};
  }
}

function saveForwardBag(bag) {
  try {
    sessionStorage.setItem(STORAGE_FORWARD, JSON.stringify(bag));
  } catch {
    //
  }
}

function mergeForwardBags(a, b) {
  return { ...a, ...b };
}

export function getJamReturnTargetHref() {
  try {
    const s = sessionStorage.getItem(STORAGE_RETURN);
    return s ? safeHttpUrl(s) : null;
  } catch {
    return null;
  }
}

export function hasJamReturnTarget() {
  return getJamReturnTargetHref() != null;
}

/**
 * Call on every page load; stores return ref + forward bag when ?portal=true.
 * @returns {{ instantPlay: boolean; usernameHint: string }}
 */
export function ingestJamInboundUrl() {
  let instantPlay = false;
  let usernameHint = "";
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("portal") !== "true") {
      return { instantPlay: false, usernameHint: "" };
    }
    instantPlay = true;
    const refEnc = sp.get("ref");
    if (refEnc) {
      let dec = refEnc;
      try {
        dec = decodeURIComponent(refEnc);
      } catch {
        //
      }
      const safe = safeHttpUrl(dec);
      if (safe) {
        try {
          sessionStorage.setItem(STORAGE_RETURN, safe);
        } catch {
          //
        }
      }
    }
    const incoming = collectForwardParamBag(sp);
    if (Object.keys(incoming).length) {
      const prev = loadForwardBagFromStorage();
      saveForwardBag(mergeForwardBags(prev, incoming));
    }
    usernameHint = sp.get("username")?.trim() || "";
  } catch {
    //
  }
  return { instantPlay, usernameHint };
}

/**
 * @param {string} baseName
 * @param {string} colorGuess
 * @param {Record<string, string | number | undefined>} extra
 */
export function redirectToVibeJamHub(baseName, colorGuess, extra = {}) {
  runBeforeJamNavigation();
  const u = new URL(HUB);
  const name = String(baseName || "ShadowArenaPlayer").slice(0, 64);
  u.searchParams.set("username", name);
  u.searchParams.set("color", String(colorGuess || "purple").slice(0, 32));
  u.searchParams.set("ref", window.location.origin);
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  window.location.href = u.toString();
}

export function redirectJamReturn() {
  const target = getJamReturnTargetHref();
  if (!target) return;
  runBeforeJamNavigation();
  let u;
  try {
    u = new URL(target);
  } catch {
    return;
  }
  u.searchParams.set("portal", "true");
  const bag = loadForwardBagFromStorage();
  for (const [k, v] of Object.entries(bag)) {
    if (!FORWARD_KEYS.has(k.toLowerCase())) continue;
    if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  }
  window.location.href = u.toString();
}

/** @typedef {{ kind: string; label: string; x: number; y: number; r: number }} JamPortalSpot */

/** @param {number} worldW
 * @param {number} worldH
 * @returns {JamPortalSpot}
 */
export function computeExitPortal(worldW, worldH) {
  const w = Math.max(256, worldW);
  const h = Math.max(256, worldH);
  return {
    kind: "exit",
    label: "Vibe Jam Portal",
    x: w - 280,
    y: h - 300,
    r: 118,
  };
}

/** @param {number} worldW
 * @param {number} worldH
 * @returns {JamPortalSpot}
 */
export function computeReturnPortal(worldW, worldH) {
  const cx = worldW * 0.5;
  const cy = worldH * 0.5;
  return {
    kind: "return",
    label: "Return Portal",
    x: cx + 380,
    y: cy - 160,
    r: 100,
  };
}
