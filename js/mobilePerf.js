/** Cached: true for primary touch phones/tablets (no precise hover cursor). Desktop stays false. */

let cached = /** @type {boolean | null} */ (null);

export function detectMobilePerfProfile() {
  if (cached !== null) return cached;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    cached = false;
    return cached;
  }
  try {
    cached =
      window.matchMedia("(pointer: coarse)").matches &&
      window.matchMedia("(hover: none)").matches;
    return cached;
  } catch {
    cached = false;
    return cached;
  }
}
