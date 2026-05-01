/**
 * Browser WebSocket client for `server/relay.mjs`.
 * Does not integrate with Game yet — use this from main.js once you serialize host state
 * (snapshots / deltas) and apply them on peers.
 */

/**
 * Optional: derive ws/wss URL from an HTTP origins string (env or config page).
 */
export function relayUrlFromHttp(httpUrl) {
  try {
    const u = new URL(httpUrl, typeof location !== "undefined" ? location.href : undefined);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString().replace(/\/?$/, "/");
  } catch {
    return httpUrl;
  }
}

export class GameRelay {
  /** @type {WebSocket | null} */
  #ws = null;

  /** @type {(payload: unknown) => void} | null */
  onGameMessage = null;
  /** @type {(evt: { role: 'host' | 'peer'; room: string }) => void} | null */
  onJoined = null;
  /** @type {(evt: { reason?: string }) => void} | null */
  onRoomClosed = null;
  /** @type {(() => void) | null} */
  onDisconnected = null;

  /**
   * @param {{
   *   url: string;
   *   room: string;
   * }} cfg
   */
  constructor(cfg) {
    this.url = cfg.url;
    this.room = cfg.room;
  }

  get connected() {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  /** @returns {Promise<void>} */
  connect() {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === "undefined") {
        reject(new Error("WebSocket not available"));
        return;
      }

      let settled = false;
      const finishErr = (e) => {
        if (settled) return;
        settled = true;
        reject(e);
      };
      const finishOk = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      try {
        this.#ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      this.#ws.addEventListener("open", () => {
        try {
          this.#ws.send(JSON.stringify({ type: "join", room: this.room }));
        } catch (e) {
          finishErr(e);
        }
      });

      this.#ws.addEventListener("error", () => finishErr(new Error("WebSocket failed to connect")));

      this.#ws.addEventListener("message", (evt) => {
        let raw;
        try {
          raw = JSON.parse(evt.data);
        } catch {
          return;
        }
        const t = raw?.type;

        if (t === "joined") {
          finishOk();
          this.onJoined?.({ role: raw.role, room: raw.room });
          return;
        }

        if (t === "roomClosed") {
          this.onRoomClosed?.({ reason: raw.reason });
          return;
        }

        this.onGameMessage?.(raw);
      });

      this.#ws.addEventListener("close", () => {
        if (!settled) finishErr(new Error("Connection closed before join"));
        this.onDisconnected?.();
      });
    });
  }

  /** Send an arbitrary payload to relay (forwarded according to role). */
  sendPayload(payload) {
    if (!this.connected || !this.#ws) return;
    try {
      this.#ws.send(JSON.stringify({ type: "relay", payload }));
    } catch {
      //
    }
  }

  disconnect() {
    try {
      this.#ws?.close();
    } catch {
      //
    }
    this.#ws = null;
  }
}
