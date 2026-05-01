const keys = new Set();

/** @type {number | null} — guest client: only this seat reads WASD. */
let onlineGuestSeat = null;

/** Host: seat index that uses local keyboard; others use `hostRemoteAxes`. */
let onlineHostLocalSeat = null;
/** @type {{ x: number; y: number }[]} */
const hostRemoteAxes = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];

export function setOnlineGuestSeat(seat) {
  onlineGuestSeat = seat == null ? null : Math.max(0, Math.min(3, Math.floor(seat)));
}

export function clearOnlineInputBridge() {
  onlineGuestSeat = null;
  onlineHostLocalSeat = null;
  for (let i = 0; i < 4; i++) {
    hostRemoteAxes[i].x = 0;
    hostRemoteAxes[i].y = 0;
  }
}

/** @param {number | null} localSeat Host's own seat (uses keyboard map for that seat). */
export function setOnlineHostBridge(localSeat) {
  onlineHostLocalSeat = localSeat == null ? null : Math.max(0, Math.min(3, Math.floor(localSeat)));
}

export function setHostRemoteMovement(seat, ax, ay) {
  const i = Math.max(0, Math.min(3, Math.floor(seat ?? 0)));
  hostRemoteAxes[i].x = Number.isFinite(ax) ? ax : 0;
  hostRemoteAxes[i].y = Number.isFinite(ay) ? ay : 0;
}

export function setupInput() {
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
    }
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });
  window.addEventListener("blur", () => keys.clear());
}

function movementFromKeyMap(map) {
  let x = 0;
  let y = 0;
  if (keys.has(map.left)) x -= 1;
  if (keys.has(map.right)) x += 1;
  if (keys.has(map.up)) y -= 1;
  if (keys.has(map.down)) y += 1;
  const len = Math.hypot(x, y);
  if (len > 0) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

function keyMapForSeat(i) {
  return i === 0
    ? { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS" }
    : i === 1
      ? { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" }
      : i === 2
        ? { left: "KeyJ", right: "KeyL", up: "KeyI", down: "KeyK" }
        : { left: "KeyF", right: "KeyH", up: "KeyT", down: "KeyG" };
}

/** Seat-local interact codes (do not collide with seat movement keys TFGH / IJKL / arrows / WASD). */
const INTERACT_CODES = ["KeyE", "Comma", "Semicolon", "Quote"];

export function interactHeldForSeat(playerIndex = 0) {
  const i = Math.max(0, Math.min(3, Math.floor(playerIndex ?? 0)));
  return keys.has(INTERACT_CODES[i] ?? "KeyE");
}

export function interactKeyHintForSeat(playerIndex = 0) {
  const i = Math.max(0, Math.min(3, Math.floor(playerIndex ?? 0)));
  const sym = ["E", ",", ";", "'"][i];
  return sym ?? "E";
}

export function getMovement(playerIndex = 0) {
  const i = Math.max(0, Math.min(3, Math.floor(playerIndex ?? 0)));

  if (onlineGuestSeat != null) {
    if (i !== onlineGuestSeat) return { x: 0, y: 0 };
    return movementFromKeyMap(keyMapForSeat(0));
  }

  if (onlineHostLocalSeat != null) {
    if (i === onlineHostLocalSeat) return movementFromKeyMap(keyMapForSeat(i));
    const r = hostRemoteAxes[i];
    const len = Math.hypot(r.x, r.y);
    if (len > 1e-6) return { x: r.x / len, y: r.y / len };
    return { x: 0, y: 0 };
  }

  return movementFromKeyMap(keyMapForSeat(i));
}
