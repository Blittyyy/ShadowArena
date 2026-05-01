export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function angle(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function randRange(a, b) {
  return a + Math.random() * (b - a);
}
