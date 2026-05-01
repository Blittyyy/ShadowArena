const keys = new Set();

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

export function getMovement(playerIndex = 0) {
  const i = Math.max(0, Math.min(3, Math.floor(playerIndex ?? 0)));
  const map =
    i === 0
      ? { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS" }
      : i === 1
        ? { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown" }
        : i === 2
          ? { left: "KeyJ", right: "KeyL", up: "KeyI", down: "KeyK" }
          : { left: "KeyF", right: "KeyH", up: "KeyT", down: "KeyG" };
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
