/** Default Socket.IO bind from `server/index.mjs` when `PORT` is unset */
const DEFAULT_DEV_SOCKET_PORT = 8787;

function isPrivateLanHost(hostname) {
  if (!hostname) return false;
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function devFallbackSocketBase() {
  try {
    if (typeof window !== "undefined" && window.MULTIPLAYER_NO_DEV_DEFAULT === true) return "";
    if (typeof location === "undefined") return "";
    // Avoid mixed-content: http-only dev server cannot be inferred from https pages.
    if (location.protocol === "https:") return "";

    const hostname = location.hostname;
    const port =
      typeof window !== "undefined" && Number(window.MULTIPLAYER_SERVER_PORT) > 0
        ? Math.floor(Number(window.MULTIPLAYER_SERVER_PORT))
        : DEFAULT_DEV_SOCKET_PORT;

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
      return `http://127.0.0.1:${port}`;
    }
    if (hostname && location.protocol === "http:" && isPrivateLanHost(hostname)) {
      return `http://${hostname}:${port}`;
    }
  } catch {
    //
  }
  return "";
}

/**
 * Deployed Socket.IO URL. Order: ?server=, window.MULTIPLAYER_SERVER_URL, then local dev inference
 * (http localhost / LAN IP + port 8787) so `npm run dev` + `npm run online-server` work without config.
 */
export function resolveMultiplayerServerUrl() {
  try {
    const q = new URLSearchParams(window.location.search).get("server");
    if (q && /^https?:\/\//i.test(q)) return q.trim().replace(/\/$/, "");
  } catch {
    //
  }
  const w = typeof window !== "undefined" ? window.MULTIPLAYER_SERVER_URL : "";
  if (typeof w === "string") {
    const t = w.trim();
    if (/^https?:\/\//i.test(t)) return t.replace(/\/$/, "");
  }
  const dev = devFallbackSocketBase();
  return dev.replace(/\/$/, "");
}
