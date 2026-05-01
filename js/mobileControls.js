/**
 * Touch UI: movement stick + pause + interact hold (portals etc.).
 */
import {
  setVirtualStick,
  setMobileInteractPressed,
} from "./input.js";

/**
 * True for touch-first UIs (phones/tablets). False for typical desktop/laptop mice,
 * even if a touchscreen is present (those usually expose `pointer: fine` + `hover: hover`
 * alongside coarse — we require `hover: none` so gameplay FAB/stick stays off PC).
 */
export function prefersMobileGameChrome() {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(hover: none)").matches
    );
  } catch {
    return false;
  }
}

/** Keep CSS / dynamic UI in sync with {@link prefersMobileGameChrome}. */
export function syncTouchGameChromeDomClass() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("is-touch-game-chrome", prefersMobileGameChrome());
}

function installTouchGameChromeClassHooks() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const recalc = () => syncTouchGameChromeDomClass();
  recalc();
  try {
    for (const q of ["(pointer: coarse)", "(hover: none)", "(pointer: fine)"]) {
      window.matchMedia(q).addEventListener("change", recalc);
    }
  } catch {
    //
  }
}

installTouchGameChromeClassHooks();

/** @typedef {{ screen: string; game: object | null }} Runtime */

/**
 * @param {object} opts
 * @param {() => Runtime} opts.getRuntime
 * @param {() => boolean} opts.isPortalHudActive Optional — show interact FAB when Jam portal HUD is up.
 */
export function initMobileGameControls(opts) {
  const getRuntime = opts.getRuntime;
  const isPortalHudActive =
    typeof opts.isPortalHudActive === "function" ? opts.isPortalHudActive : () => false;

  const root = document.getElementById("mobile-game-controls");
  const stick = document.getElementById("mobile-stick");
  const knob = document.getElementById("mobile-stick-knob");
  const btnPause = document.getElementById("mobile-btn-pause");
  const btnInteract = document.getElementById("mobile-btn-interact");
  if (!root || !stick || !(knob instanceof HTMLElement)) return () => {};

  let activePointerId = /** @type {number | null} */ (null);
  /** @type {{ cx: number; cy: number; maxR: number; deadR: number }} */
  let geom = { cx: 0, cy: 0, maxR: 1, deadR: 0.12 };

  const measure = () => {
    const r = stick.getBoundingClientRect();
    geom.cx = r.left + r.width * 0.5;
    geom.cy = r.top + r.height * 0.5;
    geom.maxR = Math.min(r.width, r.height) * 0.38;
    geom.deadR = Math.min(r.width, r.height) * 0.09;
  };

  const normalizeStick = (clientX, clientY) => {
    let dx = clientX - geom.cx;
    let dy = clientY - geom.cy;
    const len = Math.hypot(dx, dy);
    if (len < geom.deadR) {
      return { x: 0, y: 0, kx: 0, ky: 0 };
    }
    const capped = Math.min(len, geom.maxR);
    const nx = dx / Math.max(len, 1e-6);
    const ny = dy / Math.max(len, 1e-6);
    const kLen = capped / geom.maxR;
    return { x: nx * kLen, y: ny * kLen, kx: nx * capped, ky: ny * capped };
  };

  const applyKnob = (kx, ky) => {
    knob.style.transform = `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
  };

  const endStick = () => {
    activePointerId = null;
    setVirtualStick(0, 0);
    applyKnob(0, 0);
  };

  stick.addEventListener(
    "pointerdown",
    (e) => {
      if (!root.classList.contains("is-active")) return;
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      activePointerId = e.pointerId;
      measure();
      const o = normalizeStick(e.clientX, e.clientY);
      setVirtualStick(o.x, o.y);
      applyKnob(o.kx, o.ky);
    },
    { passive: false }
  );

  stick.addEventListener(
    "pointermove",
    (e) => {
      if (activePointerId !== e.pointerId) return;
      const o = normalizeStick(e.clientX, e.clientY);
      setVirtualStick(o.x, o.y);
      applyKnob(o.kx, o.ky);
    },
    { passive: false }
  );

  const onStickEnd = (e) => {
    if (activePointerId !== e.pointerId) return;
    try {
      stick.releasePointerCapture(e.pointerId);
    } catch {
      //
    }
    endStick();
  };

  stick.addEventListener("pointerup", onStickEnd);
  stick.addEventListener("pointercancel", onStickEnd);

  window.addEventListener("blur", endStick);

  const bindHold = (el, down) => {
    if (!el) return;
    const set = (v) => {
      down(v);
    };
    el.addEventListener("pointerdown", (e) => {
      if (!root.classList.contains("is-active")) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      set(true);
    });
    el.addEventListener("pointerup", (e) => {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        //
      }
      set(false);
    });
    el.addEventListener("pointercancel", () => set(false));
  };

  bindHold(btnInteract, (v) => setMobileInteractPressed(v));

  if (btnPause instanceof HTMLButtonElement) {
    btnPause.addEventListener("click", () => {
      const { game } = getRuntime();
      if (!game) return;
      if (game.mode === "playing") {
        game.pause();
        opts.onPauseStateChange?.(game);
      } else if (game.mode === "paused") {
        game.resume();
        opts.onPauseStateChange?.(game);
      }
    });
  }

  const tick = () => {
    const mobile = prefersMobileGameChrome();
    const { screen, game } = getRuntime();
    const inGame = screen === "game" && game != null;
    const playing = inGame && game.mode === "playing";
    const paused = inGame && game.mode === "paused";
    const levelUp = inGame && game.mode === "levelUp";
    const show = mobile && inGame && (playing || paused || levelUp);

    root.classList.toggle("is-active", show);
    root.classList.toggle("hidden", !show);
    root.setAttribute("aria-hidden", show ? "false" : "true");

    const portalOn = !!isPortalHudActive();
    if (btnInteract instanceof HTMLElement) {
      btnInteract.classList.toggle("is-portal-visible", portalOn);
    }

    if (btnPause instanceof HTMLButtonElement) {
      btnPause.textContent = paused ? "▶" : "⏸";
      btnPause.setAttribute("aria-label", paused ? "Resume" : "Pause");
    }

    if (!show) {
      endStick();
      setMobileInteractPressed(false);
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);

  return () => {
    endStick();
    setMobileInteractPressed(false);
  };
}
