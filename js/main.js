import {
  setupInput,
  getMovement,
  clearOnlineInputBridge,
  setOnlineGuestSeat,
  setOnlineHostBridge,
  setHostRemoteMovement,
} from "./input.js";
import { buildGameSnapshot, applyGameSnapshot } from "./net/snapshotSync.js?v=2026-04-30-net-jitter-1";
import { resolveMultiplayerServerUrl } from "./net/onlineCoop.js?v=2026-04-30-dev-socket-default-1";
import { loadAssets, revenantAtlasSourceRect } from "./assets.js?v=2026-04-30-coop-vs-balance-1";
import { Game } from "./game.js?v=2026-04-30-touch-layout";
import {
  upgradeCardIconSrc,
  upgradeChoiceCardMeta,
  upgradeChoicePresentation,
  upgradeIconLayout,
} from "./upgrades.js";
import {
  loadAudioSettings,
  saveAudioSettings,
} from "./audioSettings.js?v=2026-04-30-coop-vs-balance-1";
import {
  configureJamRedirectHooks,
  ingestJamInboundUrl,
  loadForwardBagFromStorage,
} from "./net/vibeJamPortal.js?v=2026-04-30-portal-webring-1";
import { initMobileGameControls } from "./mobileControls.js?v=2026-04-30-touch-layout";

const SERVER_TICK_RATE = 20;
const SERVER_TICK_DT = 1 / SERVER_TICK_RATE;
const MULTIPLAYER_DEBUG =
  typeof window !== "undefined" &&
  ((window.MULTIPLAYER_DEBUG === true) ||
    (typeof window.MULTIPLAYER_DEBUG === "string" && window.MULTIPLAYER_DEBUG === "1"));

try {
  console.log("[main] loaded v-2026-04-30-coop-vs-balance-1");
} catch {
  // ignore
}

/** Online session (set from `main()` closure when a net run starts). */
let gOnlineSession = null;
/** @type {object | null} */
let gPendingClientSnap = null;
/** When client's game.mode/pending upgrades change, rebuild pause/level overlays to match host. */
let gLastClientOverlaySig = null;

let gMpDebugEl = null;
function ensureMpDebugOverlay() {
  if (gMpDebugEl) return gMpDebugEl;
  const el = document.createElement("div");
  el.id = "mp-debug";
  el.style.position = "fixed";
  el.style.left = "10px";
  el.style.top = "10px";
  el.style.zIndex = "999";
  el.style.padding = "8px 10px";
  el.style.borderRadius = "10px";
  el.style.background = "rgba(0,0,0,0.55)";
  el.style.border = "1px solid rgba(255,255,255,0.12)";
  el.style.color = "rgba(240,232,255,0.92)";
  el.style.font = "12px/1.25 system-ui, Segoe UI, sans-serif";
  el.style.pointerEvents = "none";
  el.style.whiteSpace = "pre";
  el.style.display = "none";
  document.body.appendChild(el);
  gMpDebugEl = el;
  return el;
}

configureJamRedirectHooks(() => {
  try {
    if (gOnlineSession?.socket) {
      gOnlineSession.socket.emit("room:leave");
      gOnlineSession.socket.disconnect();
    }
  } catch {
    //
  }
  gOnlineSession = null;
  gPendingClientSnap = null;
  gLastClientOverlaySig = null;
  clearOnlineInputBridge();
});

const canvas = document.getElementById("game");
const xpFill = document.getElementById("xp-fill");
const timeDisplay = document.getElementById("time-display");
const levelDisplay = document.getElementById("level-display");
const overlayLevel = document.getElementById("overlay-levelup");
const levelUpTitle = overlayLevel?.querySelector("h2");
const overlayPause = document.getElementById("overlay-pause");
const pauseSliderMusic = document.getElementById("pause-slider-music");
const pauseSliderSfx = document.getElementById("pause-slider-sfx");
const pauseValMusic = document.getElementById("pause-val-music");
const pauseValSfx = document.getElementById("pause-val-sfx");
const overlayMenuSettings = document.getElementById("overlay-menu-settings");
const menuSliderMusic = document.getElementById("menu-slider-music");
const menuSliderSfx = document.getElementById("menu-slider-sfx");
const menuValMusic = document.getElementById("menu-val-music");
const menuValSfx = document.getElementById("menu-val-sfx");
const btnMenuSettings = document.getElementById("btn-menu-settings");
const btnMenuSettingsClose = document.getElementById("btn-menu-settings-close");
const overlayGameOver = document.getElementById("overlay-gameover");
const overlayMenu = document.getElementById("overlay-menu");
const overlayCharacterSelect = document.getElementById("overlay-character-select");
const btnStartGame = document.getElementById("btn-start-game");
const btnCharacters = document.getElementById("btn-characters");
const characterGrid = document.getElementById("character-grid");
const btnCharacterConfirm = document.getElementById("btn-character-confirm");
const btnCharacterBack = document.getElementById("btn-character-back");
const upgradeChoices = document.getElementById("upgrade-choices");
const goTitle = document.getElementById("go-title");
const goTime = document.getElementById("go-time");
const goLevel = document.getElementById("go-level");
const btnRestart = document.getElementById("btn-restart");
const btnResume = document.getElementById("btn-resume");
const btnEndRun = document.getElementById("btn-end-run");
const hint = document.getElementById("hint");
const menuFog = document.getElementById("menu-fog");
const menuItems = Array.from(document.querySelectorAll("#overlay-menu .menu-item"));
const menuBonesCanvas = document.getElementById("menu-bones-canvas");
// Large character preview panel removed (multiplayer slots replace it).
const characterSelectHeaderPick = document.getElementById("character-select-header-pick");
const characterSelectHeaderBrowse = document.getElementById("character-select-header-browse");
const mpPlayerCountButtons = document.querySelectorAll(".mp-seg-btn[data-player-count]");
const mpPlayerSlots = document.getElementById("mp-player-slots");
const overlayOnlineMenu = document.getElementById("overlay-online-menu");
const overlayOnlineLobby = document.getElementById("overlay-online-lobby");
const onlineErrEl = document.getElementById("online-err");
const onlineMenuDisplayNameEl = document.getElementById("online-display-name");
const onlineCharSelectDisplayNameEl = document.getElementById("online-charselect-display-name");
const onlineJoinCodeInput = document.getElementById("online-join-code");
const onlineRoomCodeDisplay = document.getElementById("online-room-code");
const onlineLobbySlots = document.getElementById("online-lobby-slots");
const btnOnlineCreate = document.getElementById("btn-online-create");
const btnOnlineJoinSubmit = document.getElementById("btn-online-join-submit");
const onlineLobbyErrEl = document.getElementById("online-lobby-err");
const onlineCharSelectErrEl = document.getElementById("online-charselect-err");
const btnOnlineBackMenu = document.getElementById("btn-online-back-menu");
const btnOnlineFromMenu = document.getElementById("btn-online-from-menu");
const btnOnlineLobbyBack = document.getElementById("btn-online-lobby-back");
const btnOnlineReady = document.getElementById("btn-online-ready");
const btnOnlineStart = document.getElementById("btn-online-start");
const btnOnlineCopyCode = document.getElementById("btn-online-copy-code");

const onlineCharSelectPanel = document.getElementById("online-charselect-panel");
const onlineCharSelectRoomCodeEl = document.getElementById("online-charselect-room-code");
const onlineCharSelectRosterEl = document.getElementById("online-charselect-roster");
const btnOnlineCharCopy = document.getElementById("btn-online-charselect-copy");
const btnOnlineCharReady = document.getElementById("btn-online-charselect-ready");
const btnOnlineCharStart = document.getElementById("btn-online-charselect-start");
const btnOnlineCharLeave = document.getElementById("btn-online-charselect-leave");
const characterMpControlsEl = document.querySelector("#overlay-character-select .character-mp-controls");
const characterSelectPickSubEl = characterSelectHeaderPick?.querySelector(".sub") ?? null;
const CHARSEL_LOCAL_SUB_TEXT = "Select your starting class";

function setOnlineCoopLobbyErr(text) {
  if (onlineLobbyErrEl) onlineLobbyErrEl.textContent = text;
  if (onlineCharSelectErrEl) onlineCharSelectErrEl.textContent = text;
}

/** Pick-up nickname (localStorage). Server clamps to safe length separately. */
const ONLINE_DISPLAY_NAME_STORAGE = "shadowArenaOnlineDisplayName";
const ONLINE_DISPLAY_MAX_LEN = 24;

function normalizeTypedOnlineDisplayName(raw) {
  let s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (s.length > ONLINE_DISPLAY_MAX_LEN) s = s.slice(0, ONLINE_DISPLAY_MAX_LEN);
  return s;
}

function loadStoredOnlineDisplayName() {
  try {
    const t = normalizeTypedOnlineDisplayName(localStorage.getItem(ONLINE_DISPLAY_NAME_STORAGE) ?? "");
    if (t) return t;
  } catch {
    //
  }
  return "Player";
}

function persistStoredOnlineDisplayName(raw) {
  const t = normalizeTypedOnlineDisplayName(raw) || loadStoredOnlineDisplayName();
  try {
    localStorage.setItem(ONLINE_DISPLAY_NAME_STORAGE, t);
  } catch {
    //
  }
  return t;
}

const SFX_UI_SRC = "assets/UI.ogg";
/** @type {HTMLAudioElement[] | null} */
let uiSfxPool = null;
let uiSfxPoolIx = 0;
function ensureUiSfxPool() {
  if (!uiSfxPool) {
    uiSfxPool = Array.from({ length: 5 }, () => {
      const a = new Audio(SFX_UI_SRC);
      a.preload = "auto";
      a.volume = 0.42;
      return a;
    });
    uiSfxPoolIx = 0;
  }
}
function refreshAudioSlidersFromStorage() {
  const st = loadAudioSettings();
  const mPct = Math.round(Math.max(0, Math.min(1, Number(st.musicVolume ?? 1))) * 100);
  const sPct = Math.round(Math.max(0, Math.min(1, Number(st.sfxVolume ?? 1))) * 100);
  if (pauseSliderMusic instanceof HTMLInputElement) pauseSliderMusic.value = String(mPct);
  if (pauseSliderSfx instanceof HTMLInputElement) pauseSliderSfx.value = String(sPct);
  if (menuSliderMusic instanceof HTMLInputElement) menuSliderMusic.value = String(mPct);
  if (menuSliderSfx instanceof HTMLInputElement) menuSliderSfx.value = String(sPct);
  updateAudioSliderPercentLabels();
}

function updateAudioSliderPercentLabels() {
  if (pauseSliderMusic instanceof HTMLInputElement && pauseValMusic) {
    pauseValMusic.textContent = `${pauseSliderMusic.value}%`;
  }
  if (pauseSliderSfx instanceof HTMLInputElement && pauseValSfx) {
    pauseValSfx.textContent = `${pauseSliderSfx.value}%`;
  }
  if (menuSliderMusic instanceof HTMLInputElement && menuValMusic) {
    menuValMusic.textContent = `${menuSliderMusic.value}%`;
  }
  if (menuSliderSfx instanceof HTMLInputElement && menuValSfx) {
    menuValSfx.textContent = `${menuSliderSfx.value}%`;
  }
}

function playUiSfx() {
  const g = Math.max(0, Math.min(1, Number(loadAudioSettings().sfxVolume ?? 1)));
  if (g <= 0.0001) return;
  ensureUiSfxPool();
  const pool = uiSfxPool;
  if (!pool?.length) return;
  const a = pool[uiSfxPoolIx++ % pool.length];
  try {
    a.volume = 0.42 * g;
    a.currentTime = 0;
    void a.play();
  } catch {
    // ignore
  }
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function syncHud(game) {
  const xpT = game.xpToNext > 0 ? game.xp / game.xpToNext : 0;
  xpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, xpT))})`;

  timeDisplay.textContent = formatTime(game.time);
  levelDisplay.textContent = `Lv ${game.level}`;
}

function hydrateJamOutboundIdentity() {
  try {
    window.__jamPortalUsername = loadStoredOnlineDisplayName();
    const bag = loadForwardBagFromStorage();
    window.__jamPortalColor =
      typeof bag.color === "string" && bag.color.trim() ? bag.color.trim().slice(0, 32) : "purple";
  } catch {
    window.__jamPortalUsername = "ShadowArenaPlayer";
    window.__jamPortalColor = "purple";
  }
}

function updateJamPortalHud(game, screenKind) {
  const root = document.getElementById("jam-portal-prompt");
  if (!root) return;
  if (
    screenKind !== "game" ||
    game?.mode !== "playing" ||
    !game?.jamPortalHud?.active
  ) {
    root.classList.add("hidden");
    return;
  }
  const st = game.jamPortalHud;
  const ln1 = root.querySelector(".jam-portal-line1");
  const ln2 = root.querySelector(".jam-portal-line2");
  /** @type {HTMLElement | null} */
  const fill = root.querySelector(".jam-portal-bar-fill");
  if (!(ln1 instanceof HTMLElement) || !(ln2 instanceof HTMLElement) || !(fill instanceof HTMLElement)) return;
  root.classList.remove("hidden");
  ln1.textContent = st.line1;
  ln2.textContent = st.line2;
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, st.progress)) * 100)}%`;
}

function showLevelUp(game) {
  overlayLevel.classList.remove("hidden");
  overlayLevel.setAttribute("aria-hidden", "false");
  if (levelUpTitle) {
    const idx = Number.isFinite(game?.upgradePlayerIndex) ? game.upgradePlayerIndex : 0;
    levelUpTitle.textContent = `Player ${idx + 1} Upgrade`;
  }
  upgradeChoices.innerHTML = "";
  const uptIdx = Number.isFinite(game?.upgradePlayerIndex) ? Math.trunc(game.upgradePlayerIndex) : 0;
  const nPl = Math.max(1, (game.players ?? []).length);
  const stForCopy = game.players?.[Math.max(0, Math.min(nPl - 1, uptIdx))]?.stats ?? game.stats ?? {};
  for (const u of game.pendingUpgrades) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "upgrade-btn";
    const meta = upgradeChoiceCardMeta(u, stForCopy);
    btn.dataset.rarity = meta.rarity;
    const lbl = upgradeChoicePresentation(u, stForCopy);

    const iconWrap = document.createElement("span");
    iconWrap.className = "upgrade-icon";
    if (meta.icon === "lightning") iconWrap.classList.add("upgrade-icon--lightning");
    if (meta.icon === "whip") iconWrap.classList.add("upgrade-icon--whip");
    iconWrap.setAttribute("aria-hidden", "true");

    const iconLay = upgradeIconLayout(meta.icon);
    iconWrap.style.setProperty("--icon-fx", `${iconLay.fx}%`);
    iconWrap.style.setProperty("--icon-fy", `${iconLay.fy}%`);
    iconWrap.style.setProperty("--icon-scale", String(iconLay.scale));

    const iconImg = document.createElement("img");
    iconImg.className = "upgrade-icon-img";
    iconImg.src = upgradeCardIconSrc(meta.icon);
    iconImg.alt = "";
    iconImg.loading = "eager";
    iconImg.decoding = "async";
    iconWrap.appendChild(iconImg);

    const textCol = document.createElement("span");
    textCol.className = "upgrade-textcol";
    const titleEl = document.createElement("span");
    titleEl.className = "up-title";
    titleEl.textContent = lbl.title;
    const descEl = document.createElement("span");
    descEl.className = "up-desc";
    descEl.textContent = lbl.description;
    textCol.append(titleEl, descEl);
    if (lbl.statLine) {
      const statEl = document.createElement("span");
      statEl.className = "up-stat";
      statEl.textContent = lbl.statLine;
      textCol.append(statEl);
    }
    btn.append(iconWrap, textCol);

    const uptPick = Math.trunc(game?.upgradePlayerIndex ?? 0);
    const canPick =
      game.netMode === "solo" ||
      (game.netMode === "host" && uptPick === (gOnlineSession?.hostSeat ?? 0)) ||
      (game.netMode === "client" && uptPick === gOnlineSession?.mySeat);
    btn.disabled = !canPick;

    btn.addEventListener("click", () => {
      if (gOnlineSession?.role === "client" && uptPick === gOnlineSession.mySeat) {
        gOnlineSession.socket.emit("game:upgradePick", { upgradeId: u.id });
        return;
      }
      if (gOnlineSession?.role === "host" && uptPick !== (gOnlineSession.hostSeat ?? 0)) return;
      game.applyUpgrade(u);
      refreshOverlays(game);
    });
    upgradeChoices.appendChild(btn);
  }
}

function hideLevelUp() {
  overlayLevel.classList.add("hidden");
  overlayLevel.setAttribute("aria-hidden", "true");
  upgradeChoices.innerHTML = "";
}

function showPause() {
  overlayPause.classList.remove("hidden");
  overlayPause.setAttribute("aria-hidden", "false");
  refreshAudioSlidersFromStorage();
}

function hidePause() {
  overlayPause.classList.add("hidden");
  overlayPause.setAttribute("aria-hidden", "true");
}

function showGameOver(game) {
  overlayGameOver.classList.remove("hidden");
  overlayGameOver.setAttribute("aria-hidden", "false");
  goTitle.textContent = game.endedByQuit ? "Run ended" : "Fallen";
  goTime.textContent = `You survived ${formatTime(game.time)}`;
  goLevel.textContent = `Reached level ${game.level}`;
}

function hideGameOver() {
  overlayGameOver.classList.add("hidden");
  overlayGameOver.setAttribute("aria-hidden", "true");
}

function refreshOverlays(game) {
  if (game.mode === "levelUp") {
    showLevelUp(game);
  } else {
    hideLevelUp();
  }
  if (game.mode === "paused") {
    showPause();
  } else {
    hidePause();
  }
  if (game.mode === "gameOver") {
    showGameOver(game);
  } else {
    hideGameOver();
  }
}

async function main() {
  setupInput();
  const jamInboundBoot = ingestJamInboundUrl();
  if (jamInboundBoot.usernameHint) persistStoredOnlineDisplayName(jamInboundBoot.usernameHint);

  // UI click sounds (menus, character select, HUD, pause / game over, level-up choices).
  document.getElementById("game-root")?.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("canvas#game")) return;
      if (!t.closest("button,.upgrade-btn")) return;
      playUiSfx();
    },
    true
  );

  // -------------------------
  // Music (menu + in-game)
  // -------------------------
  const MENU_MUSIC_SRC = "assets/Main-menu.mp3";
  const MENU_MUSIC_MENU_VOL = 0.45;
  const MENU_MUSIC_CHAR_VOL = 0.18;
  const GAME_MUSIC_SRC = "assets/Game-sound.mp3";
  const GAME_MUSIC_VOL = 0.3;

  /** @type {HTMLAudioElement | null} */
  let menuMusic = null;
  let menuMusicWantsPlay = false;
  let menuMusicUnlocked = false;

  /** @type {HTMLAudioElement | null} */
  let gameMusic = null;
  let gameMusicWantsPlay = false;
  let gameMusicUnlocked = false;

  const ensureMenuMusic = () => {
    if (menuMusic) return menuMusic;
    const a = new Audio(MENU_MUSIC_SRC);
    a.loop = true;
    a.preload = "auto";
    // Start muted; we'll set volume right before play.
    a.volume = 0;
    menuMusic = a;
    return a;
  };

  const ensureGameMusic = () => {
    if (gameMusic) return gameMusic;
    const a = new Audio(GAME_MUSIC_SRC);
    a.loop = true;
    a.preload = "auto";
    a.volume = 0;
    gameMusic = a;
    return a;
  };

  const applyMenuMusicState = async (scr) => {
    const a = ensureMenuMusic();
    const st = loadAudioSettings();
    const mGain = Math.max(0, Math.min(1, Number(st.musicVolume ?? 1)));
    const onMenuScreens = scr === "menu" || scr === "character_select";
    menuMusicWantsPlay = onMenuScreens && mGain > 0;
    const shouldPlay = menuMusicWantsPlay;

    if (!shouldPlay) {
      try {
        a.pause();
        if (!onMenuScreens) a.currentTime = 0;
      } catch {
        // ignore
      }
      return;
    }

    a.volume = (scr === "menu" ? MENU_MUSIC_MENU_VOL : MENU_MUSIC_CHAR_VOL) * mGain;
    try {
      // Browsers may reject autoplay until user gesture.
      await a.play();
      menuMusicUnlocked = true;
    } catch {
      // Will start on first user interaction.
    }
  };

  const applyGameMusicState = async (scr) => {
    const a = ensureGameMusic();
    const st = loadAudioSettings();
    const mGain = Math.max(0, Math.min(1, Number(st.musicVolume ?? 1)));
    const onGame = scr === "game";
    gameMusicWantsPlay = onGame && mGain > 0;
    const shouldPlay = gameMusicWantsPlay;

    if (!shouldPlay) {
      try {
        a.pause();
        if (!onGame) a.currentTime = 0;
      } catch {
        // ignore
      }
      return;
    }

    a.volume = GAME_MUSIC_VOL * mGain;
    try {
      await a.play();
      gameMusicUnlocked = true;
    } catch {
      // Will start on first user interaction.
    }
  };

  const tryUnlockMenuMusic = async () => {
    if (menuMusicUnlocked) return;
    if (!menuMusicWantsPlay) return;
    const a = ensureMenuMusic();
    const st = loadAudioSettings();
    const mGain = Math.max(0, Math.min(1, Number(st.musicVolume ?? 1)));
    a.volume =
      (screen === "menu" ? MENU_MUSIC_MENU_VOL : MENU_MUSIC_CHAR_VOL) * mGain;
    try {
      // Re-apply correct volume based on current screen (set later).
      await a.play();
      menuMusicUnlocked = true;
    } catch {
      // ignore
    }
  };

  const tryUnlockGameMusic = async () => {
    if (gameMusicUnlocked) return;
    if (!gameMusicWantsPlay) return;
    const a = ensureGameMusic();
    const st = loadAudioSettings();
    const mGain = Math.max(0, Math.min(1, Number(st.musicVolume ?? 1)));
    a.volume = GAME_MUSIC_VOL * mGain;
    try {
      await a.play();
      gameMusicUnlocked = true;
    } catch {
      // ignore
    }
  };

  const tryUnlockAnyMusic = () => {
    tryUnlockMenuMusic().catch(() => {});
    tryUnlockGameMusic().catch(() => {});
  };

  // Screen state system
  /** @type {'menu'|'character_select'|'game'} */
  let screen = "menu";
  let menuIndex = 0;
  let menuBones = null;

  let started = false;
  /** When non-null, main menu is hidden and an online overlay is active. */
  let onlineUiMode = null;
  let onlineSocket = null;
  let onlineMySeat = 0;
  let onlineIsHost = false;
  let onlineRoomCode = "";

  let game = null;
  let last = 0;
  let hintT = 0;
  let hintDismissed = false;

  const syncMenuSelection = () => {
    if (menuItems.length === 0) return;
    menuIndex = ((menuIndex % menuItems.length) + menuItems.length) % menuItems.length;
    for (let i = 0; i < menuItems.length; i++) {
      menuItems[i].classList.toggle("selected", i === menuIndex);
    }
    const btn = menuItems[menuIndex]?.querySelector("button");
    if (btn instanceof HTMLElement) btn.focus({ preventScroll: true });
    menuBones?.setAnchorButton(btn);
  };

  const hudTop = document.getElementById("hud-top");
  const hideGameplay = () => {
    if (canvas) canvas.style.display = "none";
    if (hudTop) hudTop.style.display = "none";
    if (hint) hint.style.display = "none";
  };
  const showGameplay = () => {
    if (canvas) canvas.style.display = "";
    if (hudTop) hudTop.style.display = "";
    if (hint) hint.style.display = "";
  };
  const showOverlay = (el, show) => {
    if (!el) return;
    if (show) {
      el.classList.remove("hidden");
      el.setAttribute("aria-hidden", "false");
    } else {
      el.classList.add("hidden");
      el.setAttribute("aria-hidden", "true");
    }
  };

  let charSelectBobRafId = 0;
  const CHAR_SELECT_BOB_AMPLITUDE_PX = 2;
  /** ~1.75s per full cycle (subtle idle). */
  const CHAR_SELECT_BOB_PERIOD_SEC = 1.75;
  const CHAR_SELECT_BOB_SPEED = (Math.PI * 2) / CHAR_SELECT_BOB_PERIOD_SEC;
  /** Desynchronize card bobs (radians). */
  const CHAR_SELECT_BOB_PHASE = {
    mage: 0.0,
    revenant: 1.37,
    berserker: 2.71,
    archer: 4.02,
  };

  const resetCharacterSelectBobTransforms = () => {
    overlayCharacterSelect?.querySelectorAll(".cc-sprite .cc-portrait-img").forEach((el) => {
      if (el instanceof HTMLElement) el.style.transform = "";
    });
    // no preview panel
  };

  const tickCharacterSelectBob = () => {
    if (screen !== "character_select") {
      charSelectBobRafId = 0;
      resetCharacterSelectBobTransforms();
      return;
    }
    const t = performance.now() / 1000;
    const rowBobId = characterSelectBrowseOnly === true ? browseInspectId : selectedCharacter;
    const previewPid =
      characterSelectBrowseOnly === true ? browseInspectId : selectedCharacter;

    if (characterGrid instanceof HTMLElement) {
      for (const card of characterGrid.querySelectorAll(".character-card-premium[data-character]")) {
        const id = card.getAttribute("data-character");
        const img = card.querySelector(".cc-sprite .cc-portrait-img");
        if (!(img instanceof HTMLElement) || id == null || id === "") continue;
        if (rowBobId == null || rowBobId === "" || id !== rowBobId) {
          img.style.transform = "";
          continue;
        }
        const phase = CHAR_SELECT_BOB_PHASE[id] ?? 0;
        const offset = Math.sin(t * CHAR_SELECT_BOB_SPEED + phase) * CHAR_SELECT_BOB_AMPLITUDE_PX;
        img.style.transform = `translateY(${offset.toFixed(3)}px)`;
      }
    }
    // no preview panel bob
    charSelectBobRafId = requestAnimationFrame(tickCharacterSelectBob);
  };

  const startCharacterSelectBobLoop = () => {
    if (charSelectBobRafId !== 0) return;
    charSelectBobRafId = requestAnimationFrame(tickCharacterSelectBob);
  };

  const stopCharacterSelectBobLoop = () => {
    if (charSelectBobRafId !== 0) {
      cancelAnimationFrame(charSelectBobRafId);
      charSelectBobRafId = 0;
    }
    resetCharacterSelectBobTransforms();
  };

  const setScreen = (next) => {
    screen = next;
    if (overlayMenuSettings && screen !== "menu") showOverlay(overlayMenuSettings, false);
    if (screen === "game") {
      onlineUiMode = null;
      showOverlay(overlayOnlineMenu, false);
      showOverlay(overlayOnlineLobby, false);
    }
    showOverlay(overlayMenu, screen === "menu" && onlineUiMode == null);
    showOverlay(overlayCharacterSelect, screen === "character_select");
    if (menuFog) {
      const showFog = screen === "menu" || screen === "character_select";
      menuFog.classList.toggle("hidden", !showFog);
      menuFog.setAttribute("aria-hidden", showFog ? "false" : "true");
    }
    if (screen === "game") showGameplay();
    else hideGameplay();

    // Default menu selection (Enter activates).
    if (screen === "menu") {
      menuIndex = 0;
      syncMenuSelection();
    }

    if (menuBonesCanvas) {
      menuBonesCanvas.style.display = screen === "menu" ? "" : "none";
    }
    if (screen === "character_select") {
      ensurePortraits().catch(() => {});
      startCharacterSelectBobLoop();
    } else {
      stopCharacterSelectBobLoop();
    }

    // Music follows screen state.
    applyMenuMusicState(screen).catch(() => {});
    applyGameMusicState(screen).catch(() => {});
  };

  refreshAudioSlidersFromStorage();

  if (!jamInboundBoot.instantPlay) {
    setScreen("menu");
  } else {
    showOverlay(overlayMenu, false);
    if (menuFog) {
      menuFog.classList.add("hidden");
      menuFog.setAttribute("aria-hidden", "true");
    }
    hideGameplay();
    if (menuBonesCanvas) menuBonesCanvas.style.display = "none";
  }

  const onMusicVolumeSlider = (slider) => {
    if (!(slider instanceof HTMLInputElement)) return;
    const v = Number(slider.value);
    saveAudioSettings({ musicVolume: Math.max(0, Math.min(1, v / 100)) });
    refreshAudioSlidersFromStorage();
    applyMenuMusicState(screen).catch(() => {});
    applyGameMusicState(screen).catch(() => {});
  };
  const onSfxVolumeSlider = (slider) => {
    if (!(slider instanceof HTMLInputElement)) return;
    const v = Number(slider.value);
    saveAudioSettings({ sfxVolume: Math.max(0, Math.min(1, v / 100)) });
    refreshAudioSlidersFromStorage();
  };
  pauseSliderMusic?.addEventListener("input", () => onMusicVolumeSlider(pauseSliderMusic));
  pauseSliderSfx?.addEventListener("input", () => onSfxVolumeSlider(pauseSliderSfx));
  menuSliderMusic?.addEventListener("input", () => onMusicVolumeSlider(menuSliderMusic));
  menuSliderSfx?.addEventListener("input", () => onSfxVolumeSlider(menuSliderSfx));

  const openMenuAudioSettings = () => {
    refreshAudioSlidersFromStorage();
    showOverlay(overlayMenuSettings, true);
  };
  const closeMenuAudioSettings = () => showOverlay(overlayMenuSettings, false);
  btnMenuSettings?.addEventListener("click", () => openMenuAudioSettings());
  btnMenuSettingsClose?.addEventListener("click", () => closeMenuAudioSettings());

  // Attempt to unlock audio on first interaction (autoplay is often blocked).
  // Capture phase ensures we run even if a button handler stops propagation.
  window.addEventListener("pointerdown", tryUnlockAnyMusic, { capture: true, passive: true });
  window.addEventListener("keydown", tryUnlockAnyMusic, { capture: true });

  if (btnStartGame) btnStartGame.disabled = true;
  if (btnCharacters) btnCharacters.disabled = true;
  if (btnMenuSettings) btnMenuSettings.disabled = true;

  try {
    await loadAssets();
  } catch (err) {
    console.error("[assets] load failed; continuing to menu anyway", err);
  }
  if (btnStartGame) btnStartGame.disabled = false;
  if (btnCharacters) btnCharacters.disabled = false;
  if (btnMenuSettings) btnMenuSettings.disabled = false;

  // 3D bone selector (optional; falls back gracefully if it fails to load).
  if (menuBonesCanvas) {
    menuBones = await initMenuBones3D(menuBonesCanvas).catch((err) => {
      console.error("[menu-bones] init failed", err);
      return null;
    });
    syncMenuSelection();
  }

  window.addEventListener("resize", () => game?.syncCanvasResolution());

  window.addEventListener("keydown", (e) => {
    if (screen !== "game" || !game) return;
    if (e.code !== "Escape" || e.repeat) return;
    if (game.mode === "playing") {
      e.preventDefault();
      game.pause();
      refreshOverlays(game);
    } else if (game.mode === "paused") {
      e.preventDefault();
      game.resume();
      refreshOverlays(game);
    }
  });

  initMobileGameControls({
    getRuntime: () => ({ screen, game }),
    isPortalHudActive: () => !!game?.jamPortalHud?.active,
    onPauseStateChange: (g) => {
      refreshOverlays(g);
    },
  });

  /** @type {string | null} */
  let selectedCharacter = null;
  let localPlayerCount = 1;
  /** @type {number[]} */
  let mpCharIndex = [0];
  /** @type {boolean[]} */
  let mpReady = [false];
  /** @type {number} */
  let mpActivePlayer = 0;
  const MP_CHAR_ORDER = ["mage", "revenant", "berserker", "archer"];
  const MP_CONTROLS_LABEL = ["WASD", "Arrows", "IJKL", "TFGH"];
  const MP_CONFIRM_LABEL = ["Space", "Enter", "U", "R"];
  const MP_CONFIRM_CODE = ["Space", "Enter", "KeyU", "KeyR"];
  const MP_LEFT_CODE = ["KeyA", "ArrowLeft", "KeyJ", "KeyF"];
  const MP_RIGHT_CODE = ["KeyD", "ArrowRight", "KeyL", "KeyH"];

  const mpTouchChromeActive = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-touch-game-chrome");

  function touchChromeMpControlsLine(slotIndex) {
    if (!mpTouchChromeActive()) {
      return `Move: ${MP_CONTROLS_LABEL[slotIndex] ?? ""} • L/R to change`;
    }
    return "Tap champion cards • pick your class";
  }

  function touchChromeMpConfirmLine(slotIndex) {
    if (!mpTouchChromeActive()) {
      return `Confirm: ${MP_CONFIRM_LABEL[slotIndex] ?? ""} (toggle)`;
    }
    return "Tap Ready below when set";
  }

  /** True when opened from Characters (codex only); false when opened from Start (pick + confirm). */
  let characterSelectBrowseOnly = false;
  /** Codex browse focus; null until the user taps a card (preview stays empty until then). */
  /** @type {string | null} */
  let browseInspectId = null;
  /** @type {Map<string, string>} */
  const portraitUrlById = new Map();

  function setLocalPlayerCount(n, opts = {}) {
    const v = Math.max(1, Math.min(4, Math.floor(Number(n) || 1)));
    localPlayerCount = v;
    mpCharIndex = Array.from({ length: v }, (_, i) => mpCharIndex[i] ?? 0);
    mpReady = Array.from({ length: v }, (_, i) => mpReady[i] ?? false);
    mpActivePlayer = Math.max(0, Math.min(v - 1, mpActivePlayer | 0));
    for (const b of mpPlayerCountButtons) {
      const bn = Number(b.getAttribute("data-player-count"));
      b.classList.toggle("is-selected", bn === v);
    }
    if (opts.deferUi === true) return;
    // These helpers are initialized later in main(); do not call when bootstrapping.
    renderMpSlots();
    syncMpCardChrome();
    applyPortraitPreviewForCurrentMode();
    updateConfirmState();
  }
  setLocalPlayerCount(1, { deferUi: true });
  for (const b of mpPlayerCountButtons) {
    b.addEventListener("click", () => {
      const n = Number(b.getAttribute("data-player-count"));
      setLocalPlayerCount(n);
    });
  }

  const applyPortraitPreviewForCurrentMode = () => {};

  const syncPickCardChrome = () => {
    if (!(characterGrid instanceof HTMLElement)) return;
    for (const node of characterGrid.querySelectorAll(".character-card")) {
      const id = node.getAttribute("data-character");
      node.classList.toggle("selected", id != null && id === selectedCharacter);
    }
  };

  function syncMpCardChrome() {
    if (!(characterGrid instanceof HTMLElement)) return;
    for (const node of characterGrid.querySelectorAll(".character-card-premium[data-character]")) {
      const id = node.getAttribute("data-character");
      node.classList.remove("p1-selected", "p2-selected", "p3-selected", "p4-selected");
      for (let i = 0; i < localPlayerCount; i++) {
        const pid = MP_CHAR_ORDER[mpCharIndex[i] ?? 0];
        if (id && pid === id) node.classList.add(`p${i + 1}-selected`);
      }
    }
  }

  const syncBrowseCardChrome = () => {
    if (!(characterGrid instanceof HTMLElement)) return;
    for (const node of characterGrid.querySelectorAll(".character-card")) {
      const id = node.getAttribute("data-character");
      node.classList.toggle(
        "selected",
        browseInspectId != null && browseInspectId !== "" && id === browseInspectId
      );
    }
  };

  const updateConfirmState = () => {
    if (!btnCharacterConfirm) return;
    if (characterSelectBrowseOnly === true) {
      btnCharacterConfirm.disabled = true;
      return;
    }
    if (onlineUiMode === "char_select") {
      btnCharacterConfirm.disabled = true;
      return;
    }
    const allReady = mpReady.length > 0 && mpReady.every((r) => r === true);
    btnCharacterConfirm.disabled = !allReady;
  };

  function renderMpSlots() {
    if (!(mpPlayerSlots instanceof HTMLElement)) return;
    mpPlayerSlots.innerHTML = "";
    for (let i = 0; i < localPlayerCount; i++) {
      const cid = MP_CHAR_ORDER[mpCharIndex[i] ?? 0] ?? "mage";
      const url = portraitUrlById.get(cid) ?? "";
      const slot = document.createElement("div");
      slot.className = `mp-slot${mpReady[i] ? " is-ready" : ""}`;
      slot.setAttribute("data-pcolor", String(i + 1));
      slot.innerHTML = `
        <div class="mp-top">
          <div class="mp-pnum">Player ${i + 1}</div>
          <div class="mp-ready">${mpReady[i] ? "READY" : "NOT READY"}</div>
        </div>
        <div class="mp-body">
          <div class="mp-portrait"><img alt="" /></div>
          <div class="mp-meta">
            <div class="mp-name">${cid[0].toUpperCase() + cid.slice(1)}</div>
            <div class="mp-controls">${touchChromeMpControlsLine(i)}</div>
            <div class="mp-confirm">${touchChromeMpConfirmLine(i)}</div>
          </div>
        </div>
        <button type="button" class="mp-ready-btn" data-ready-btn="${i}">
          ${mpReady[i] ? "Ready" : "Not Ready"}
        </button>
      `;
      const img = slot.querySelector("img");
      if (img instanceof HTMLImageElement) {
        if (url) img.src = url;
      }
      mpPlayerSlots.appendChild(slot);
    }
  }

  const syncCharacterSelectModeUI = () => {
    const browse = characterSelectBrowseOnly === true;
    const onlineCharPick = onlineUiMode === "char_select" && !browse;
    overlayCharacterSelect?.classList.toggle("mode-browse", browse);
    overlayCharacterSelect?.classList.toggle("online-charselect-active", onlineCharPick);

    if (characterSelectHeaderPick instanceof HTMLElement) {
      characterSelectHeaderPick.classList.toggle("hidden", browse);
      characterSelectHeaderPick.setAttribute("aria-hidden", browse ? "true" : "false");
    }
    if (characterSelectHeaderBrowse instanceof HTMLElement) {
      characterSelectHeaderBrowse.classList.toggle("hidden", !browse);
      characterSelectHeaderBrowse.setAttribute("aria-hidden", browse ? "false" : "true");
    }

    if (onlineCharSelectPanel instanceof HTMLElement) {
      onlineCharSelectPanel.classList.toggle("hidden", !onlineCharPick);
    }

    if (btnCharacterConfirm instanceof HTMLButtonElement) {
      if (browse) {
        btnCharacterConfirm.setAttribute("hidden", "");
      } else if (onlineCharPick) {
        btnCharacterConfirm.setAttribute("hidden", "");
      } else {
        btnCharacterConfirm.removeAttribute("hidden");
      }
    }

    if (characterSelectPickSubEl instanceof HTMLElement && !browse) {
      characterSelectPickSubEl.textContent = onlineCharPick
        ? "Online — share room code above, pick your class on the cards, then Ready."
        : CHARSEL_LOCAL_SUB_TEXT;
    }

    if (browse) syncBrowseCardChrome();
    else {
      // Legacy selectedCharacter mirrors player 1 for preview/back-compat.
      selectedCharacter = MP_CHAR_ORDER[mpCharIndex[0] ?? 0] ?? selectedCharacter;
      syncPickCardChrome();
      syncMpCardChrome();
      if (!onlineCharPick) renderMpSlots();
    }
    applyPortraitPreviewForCurrentMode();
    updateConfirmState();
  };

  // Now that all character-select helpers are initialized, do an initial full sync.
  setLocalPlayerCount(localPlayerCount);

  // Character select portraits: slice one sheet cell and center it (see frameRow/frameCol per hero).
  const portraitSpec = {
    // Must match `SPRITES.player.sheetSlice` (4×4 @ 1024²). Using rows:5 sliced the wrong Y band (walk landed mid-idle).
    // Walk column 0 = first frame on `animations.walk.row` (full body in frame).
    mage: { src: "assets/Player.png", cols: 4, rows: 4, frameRow: 1, frameCol: 0, cropPad: 10 },
    // Rows/cols match SPRITES.revenant; slicing uses `revenantAtlasSourceRect` (1306×1204 bands, not floor(H/3)).
    revenant: { src: "assets/Revenant.png", cols: 4, rows: 3 },
    berserker: { src: "assets/Berserk.png", cols: 4, rows: 4 },
    archer: { src: "assets/Archer.png", cols: 4, rows: 4 },
  };
  const loadImageForPortrait = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  const finalizeAlphaCrop = (canvas, minX, minY, maxX, maxY, padPx, w, h) => {
    let minXm = minX;
    let minYm = minY;
    let maxXm = maxX;
    let maxYm = maxY;
    const pad = Math.max(0, padPx | 0);
    minXm = Math.max(0, minXm - pad);
    minYm = Math.max(0, minYm - pad);
    maxXm = Math.min(w - 1, maxXm + pad);
    maxYm = Math.min(h - 1, maxYm + pad);
    const cw = maxXm - minXm + 1;
    const ch = maxYm - minYm + 1;
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    const octx = out.getContext("2d", { willReadFrequently: true });
    if (!octx) return canvas;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvas, minXm, minYm, cw, ch, 0, 0, cw, ch);
    return out;
  };

  const alphaCropCanvas = (canvas, alphaThreshold = 12, padPx = 2, mode = "largest-cc") => {
    const w = canvas.width | 0;
    const h = canvas.height | 0;
    if (w < 2 || h < 2) return canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return canvas;
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return canvas;
    }
    if (mode === "bbox") {
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          if (a > alphaThreshold) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return canvas;
      return finalizeAlphaCrop(canvas, minX, minY, maxX, maxY, padPx, w, h);
    }
    const solid = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < solid.length; i++, p += 4) {
      solid[i] = data[p + 3] > alphaThreshold ? 1 : 0;
    }
    const visited = new Uint8Array(w * h);
    let bestMinX = 0;
    let bestMinY = 0;
    let bestMaxX = -1;
    let bestMaxY = -1;
    let bestArea = 0;
    const stack = new Int32Array(w * h + 8);
    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        const si = sx + sy * w;
        if (!solid[si] || visited[si]) continue;
        let sp = 0;
        stack[sp++] = sx;
        stack[sp++] = sy;
        visited[si] = 1;
        let minX = sx;
        let minY = sy;
        let maxX = sx;
        let maxY = sy;
        let area = 0;
        while (sp > 0) {
          const y = stack[--sp];
          const x = stack[--sp];
          area++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          const nbs = [x + 1, y, x - 1, y, x, y + 1, x, y - 1];
          for (let k = 0; k < nbs.length; k += 2) {
            const nx = nbs[k];
            const ny = nbs[k + 1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = nx + ny * w;
            if (!solid[ni] || visited[ni]) continue;
            visited[ni] = 1;
            stack[sp++] = nx;
            stack[sp++] = ny;
          }
        }
        if (area > bestArea) {
          bestArea = area;
          bestMinX = minX;
          bestMinY = minY;
          bestMaxX = maxX;
          bestMaxY = maxY;
        }
      }
    }
    if (bestMaxX < 0) return canvas;
    return finalizeAlphaCrop(canvas, bestMinX, bestMinY, bestMaxX, bestMaxY, padPx, w, h);
  };
  const buildPortrait = async (id) => {
    const spec = portraitSpec[id];
    if (!spec) return null;
    const img = await loadImageForPortrait(spec.src);
    if (!img || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return null;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const frameCol = Number.isFinite(spec.frameCol) ? Math.max(0, (spec.frameCol | 0)) : 0;
    const frameRow = Number.isFinite(spec.frameRow) ? Math.max(0, (spec.frameRow | 0)) : 0;
    const maxCol = Math.max(0, spec.cols - 1);
    const maxRow = Math.max(0, spec.rows - 1);
    const col = Math.min(frameCol, maxCol);
    const row = Math.min(frameRow, maxRow);

    /** @type {number} */
    let sx;
    /** @type {number} */
    let sy;
    /** @type {number} */
    let sw;
    /** @type {number} */
    let sh;
    if (id === "revenant") {
      const cell = revenantAtlasSourceRect(img, col, row);
      sx = cell.sx;
      sy = cell.sy;
      sw = cell.sw;
      sh = cell.sh;
    } else {
      const fw = Math.floor(iw / spec.cols);
      const fh = Math.floor(ih / spec.rows);
      sx = spec.cols === 1 ? 0 : col * fw;
      sy = spec.rows === 1 ? 0 : row * fh;
      sw = spec.cols === 1 ? iw : fw;
      sh = spec.rows === 1 ? ih : fh;
    }
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropPad = typeof spec.cropPad === "number" ? spec.cropPad : 2;
    const cropMode = spec.alphaCrop === "bbox" ? "bbox" : "largest-cc";
    const cropped = alphaCropCanvas(c, 12, cropPad, cropMode);
    try {
      return cropped.toDataURL("image/png");
    } catch {
      return null;
    }
  };
  const ensurePortraits = async () => {
    const ids = ["mage", "revenant", "berserker", "archer"];
    await Promise.all(
      ids.map(async (id) => {
        if (portraitUrlById.has(id)) return;
        const url = await buildPortrait(id);
        if (url) portraitUrlById.set(id, url);
      })
    );
    for (const imgEl of document.querySelectorAll("img[data-portrait]")) {
      const id = imgEl.getAttribute("data-portrait");
      if (!id) continue;
      const url = portraitUrlById.get(id);
      if (url) imgEl.src = url;
    }
    applyPortraitPreviewForCurrentMode();
  };

  let gameUiBound = false;

  function bindGameUiOnce() {
    if (gameUiBound) return;
    gameUiBound = true;

    btnRestart.addEventListener("click", () => {
      hidePause();
      hideGameOver();
      hideLevelUp();
      try {
        if (gOnlineSession?.socket) {
          gOnlineSession.socket.emit("room:leave");
          gOnlineSession.socket.disconnect();
        }
      } catch {
        //
      }
      gOnlineSession = null;
      gPendingClientSnap = null;
      gLastClientOverlaySig = null;
      clearOnlineInputBridge();
      started = false;
      game = null;
      setScreen("menu");
      refreshAudioSlidersFromStorage();
    });

    btnResume.addEventListener("click", () => {
      game.resume();
      refreshOverlays(game);
    });

    btnEndRun.addEventListener("click", () => {
      game.endRun();
      refreshOverlays(game);
    });
  }

  function startGameFrameLoop() {
    function frame(nowMs) {
      if (!game) return;
      const now = nowMs / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;

      // Online debug overlay + reconnect hint (client/joiner focused).
      if (gOnlineSession && game.netMode !== "solo") {
        const el = ensureMpDebugOverlay();
        if (MULTIPLAYER_DEBUG) el.style.display = "block";
        const sock = gOnlineSession.socket;
        const pingMs = Number(sock?.io?.engine?.ping ?? NaN);
        const recvAgoMs =
          game.netMode === "client" && Number.isFinite(game?._netLastSnapRecvMs)
            ? Math.max(0, performance.now() - game._netLastSnapRecvMs)
            : NaN;
        const rec = game.netMode === "client" && Number.isFinite(recvAgoMs) && recvAgoMs > 2000;
        if (rec && hint) {
          hint.textContent = "Reconnecting…";
          hint.style.display = "";
          hint.style.opacity = "0.9";
        }
        if (MULTIPLAYER_DEBUG) {
          const inputN = gOnlineSession._dbgInputN ?? 0;
          gOnlineSession._dbgInputN = 0;
          const evN = Array.isArray(gPendingClientSnap?.ev) ? gPendingClientSnap.ev.length : 0;
          el.textContent =
            `role=${gOnlineSession.role} host=${game.netMode === "host"}\\n` +
            `room=${gOnlineSession.roomCode ?? ""} seat=${gOnlineSession.mySeat ?? gOnlineSession.hostSeat ?? ""}\\n` +
            `socket=${sock?.id ?? ""} ping=${Number.isFinite(pingMs) ? pingMs : "-"}ms\\n` +
            `snapAgo=${Number.isFinite(recvAgoMs) ? Math.round(recvAgoMs) : "-"}ms ev=${evN}\\n` +
            `inputSend=${inputN}/frame`;
        }
      } else if (gMpDebugEl) {
        gMpDebugEl.style.display = "none";
      }

      if (gPendingClientSnap && game.netMode === "client") {
        applyGameSnapshot(game, gPendingClientSnap);
        gPendingClientSnap = null;
        const pendIds = (game.pendingUpgrades ?? []).map((u) => u?.id ?? "").join(",");
        const sig = `${game.mode}|${game.upgradePlayerIndex}|${pendIds}|${game.endedByQuit ? "1" : "0"}`;
        if (sig !== gLastClientOverlaySig) {
          gLastClientOverlaySig = sig;
          refreshOverlays(game);
        }
      }

      game.update(dt);

      // Host: deadman timeout for remote seats (fix "keeps moving after releasing keys").
      if (gOnlineSession?.role === "host" && game.netMode === "host") {
        const DEADMAN_MS = 160;
        const tNow = performance.now();
        const lastMs = gOnlineSession.inputLastMs;
        if (Array.isArray(lastMs)) {
          for (let s = 0; s < 4; s++) {
            if (s === (gOnlineSession.hostSeat ?? 0)) continue;
            const age = tNow - (lastMs[s] || 0);
            if (age > DEADMAN_MS) {
              setHostRemoteMovement(s, 0, 0);
            }
          }
        }
      }

      if (gOnlineSession?.role === "host" && game.netMode === "host") {
        gOnlineSession.snapAcc = (gOnlineSession.snapAcc ?? 0) + dt;
        /** Fixed tick (~20 Hz) — stable payload cadence for clients. */
        while (gOnlineSession.snapAcc >= SERVER_TICK_DT) {
          gOnlineSession.snapAcc -= SERVER_TICK_DT;
          try {
            gOnlineSession.socket.emit("game:snapshot", buildGameSnapshot(game));
          } catch {
            //
          }
        }
      }
      if (gOnlineSession?.role === "client" && game.netMode === "client") {
        const seat = Math.max(
          0,
          Math.min(3, Math.floor(Number(gOnlineSession.mySeat) || 0))
        );
        const sock = gOnlineSession.socket;
        const m = getMovement(seat);
        const prev = gOnlineSession.lastEmittedInput || { ax: 999, ay: 999 };
        const tol = 0.001;
        const changed = Math.abs(m.x - prev.ax) > tol || Math.abs(m.y - prev.ay) > tol;

        const emitInput = (ax, ay) => {
          try {
            sock.emit("game:input", { ax, ay });
          } catch {
            //
          }
          gOnlineSession.lastEmittedInput = { ax, ay };
          if (MULTIPLAYER_DEBUG) gOnlineSession._dbgInputN = (gOnlineSession._dbgInputN ?? 0) + 1;
        };

        // Immediate send on any change (especially critical for stop/zero).
        if (changed) {
          emitInput(m.x, m.y);
          // If we just stopped, redundantly send stop a couple times to survive packet loss.
          if (Math.hypot(m.x, m.y) < 1e-4) {
            if (gOnlineSession._stopBurst == null) gOnlineSession._stopBurst = 0;
            gOnlineSession._stopBurst = 2;
            gOnlineSession._stopBurstT = 0;
          }
        }

        // Steady-state send (60 Hz) to keep host authoritative state tight.
        gOnlineSession.inputAcc = (gOnlineSession.inputAcc ?? 0) + dt;
        const sendDt = 1 / 60;
        if (gOnlineSession.inputAcc >= sendDt) {
          gOnlineSession.inputAcc = 0;
          emitInput(m.x, m.y);
        }

        // Stop burst handling.
        if ((gOnlineSession._stopBurst ?? 0) > 0) {
          gOnlineSession._stopBurstT = (gOnlineSession._stopBurstT ?? 0) + dt;
          if (gOnlineSession._stopBurstT >= 0.03) {
            gOnlineSession._stopBurstT = 0;
            gOnlineSession._stopBurst = Math.max(0, (gOnlineSession._stopBurst ?? 0) - 1);
            emitInput(0, 0);
          }
        }
      }

      game.render();
      syncHud(game);
      updateJamPortalHud(game, screen);
      updateOnlineGameplayHint(game);

      if (game.mode === "levelUp" && upgradeChoices.childElementCount === 0) {
        showLevelUp(game);
      }
      if (game.mode === "paused" && overlayPause.classList.contains("hidden")) {
        showPause();
      }
      if (game.mode === "gameOver" && overlayGameOver.classList.contains("hidden")) {
        showGameOver(game);
      }

      hintT += dt;
      if (!hintDismissed && hintT > 5 && hint && game.netMode === "solo") {
        hintDismissed = true;
        hint.style.opacity = "0";
        hint.style.transition = "opacity 1s";
        setTimeout(() => {
          if (hint && game?.netMode === "solo") hint.style.display = "none";
        }, 1100);
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function startGame() {
    if (started) return;
    started = true;
    setScreen("game");
    clearOnlineInputBridge();
    gOnlineSession = null;
    gPendingClientSnap = null;
    gLastClientOverlaySig = null;

    window.selectedCharacters = mpCharIndex.map((i) => MP_CHAR_ORDER[i] ?? "mage");
    window.selectedCharacter = window.selectedCharacters[0] ?? selectedCharacter;
    window.localPlayerCount = localPlayerCount;

    game = new Game(canvas);
    game.netMode = "solo";
    hydrateJamOutboundIdentity();
    {
      const nLc = Math.max(
        1,
        Math.min(4, Math.floor(Number(window.localPlayerCount ?? localPlayerCount) || 1))
      );
      game._jamLocalSeats = Array.from({ length: nLc }, (_, i) => i);
    }

    refreshOverlays(game);
    syncHud(game);

    last = performance.now() / 1000;
    hintT = 0;
    hintDismissed = false;
    if (hint) {
      hint.style.display = "";
      hint.style.opacity = "0.9";
    }

    bindGameUiOnce();
    startGameFrameLoop();
  }

  function startOnlineHostGame(socket, roomCode, roster) {
    if (started) return;
    clearOnlineInputBridge();
    started = true;
    setScreen("game");
    gPendingClientSnap = null;
    gLastClientOverlaySig = null;

    const sorted = [...roster].sort((a, b) => a.seat - b.seat);
    window.selectedCharacters = sorted.map((r) => r.characterId);
    window.selectedCharacter = window.selectedCharacters[0] ?? "mage";
    window.localPlayerCount = sorted.length;

    game = new Game(canvas);
    game.netMode = "host";
    game.setNetQueueEvent?.((ev) => {
      if (!game?._netPendingEvents) game._netPendingEvents = [];
      game._netPendingEvents.push(ev);
      if (MULTIPLAYER_DEBUG) {
        try {
          console.log("[mp] queueEvent", ev);
        } catch {
          //
        }
      }
    });
    hydrateJamOutboundIdentity();
    game._jamLocalSeats = [0];
    gOnlineSession = {
      role: "host",
      socket,
      roomCode,
      hostSeat: 0,
      snapAcc: 0,
      // Deadman: if a client stops sending input (packet loss / focus loss), force stop.
      inputLastMs: [performance.now(), 0, 0, 0],
      seatDisplayNames: seatDisplayNamesFromRoster(roster),
    };
    setOnlineHostBridge(0);

    socket.off("game:inputRelay");
    socket.on("game:inputRelay", ({ seat, ax, ay }) => {
      setHostRemoteMovement(seat, ax, ay);
      if (gOnlineSession?.role === "host" && Array.isArray(gOnlineSession.inputLastMs)) {
        const s = Math.max(0, Math.min(3, Number(seat) | 0));
        gOnlineSession.inputLastMs[s] = performance.now();
      }
    });
    socket.off("game:upgradePickRelay");
    socket.on("game:upgradePickRelay", ({ seat, upgradeId }) => {
      game?.applyUpgradeByRemoteChoice(upgradeId, seat);
    });

    refreshOverlays(game);
    syncHud(game);

    last = performance.now() / 1000;
    hintT = 0;
    hintDismissed = false;
    if (hint) {
      hint.style.display = "";
      hint.style.opacity = "0.9";
    }

    bindGameUiOnce();
    startGameFrameLoop();
  }

  function startOnlineClientGame(socket, roomCode, mySeat, roster) {
    if (started) return;
    clearOnlineInputBridge();
    started = true;
    setScreen("game");
    gPendingClientSnap = null;
    gLastClientOverlaySig = null;

    const sorted = [...roster].sort((a, b) => a.seat - b.seat);
    window.selectedCharacters = sorted.map((r) => r.characterId);
    window.selectedCharacter = window.selectedCharacters[0] ?? "mage";
    window.localPlayerCount = sorted.length;

    game = new Game(canvas);
    game.netMode = "client";
    hydrateJamOutboundIdentity();
    game._jamLocalSeats = [
      Math.max(0, Math.min(3, Math.floor(Number.isFinite(mySeat) ? mySeat : 0))),
    ];
    setOnlineGuestSeat(mySeat);
    gOnlineSession = {
      role: "client",
      socket,
      roomCode,
      mySeat,
      lastEmittedInput: null,
      _stopBurst: 0,
      _stopBurstT: 0,
      seatDisplayNames: seatDisplayNamesFromRoster(roster),
    };

    socket.off("game:snapshot");
    socket.on("game:snapshot", (snap) => {
      // Timestamp on receive for interpolation buffer.
      try {
        snap.__recvMs = performance.now();
      } catch {
        //
      }
      gPendingClientSnap = snap;
      if (MULTIPLAYER_DEBUG) {
        try {
          const evN = Array.isArray(snap?.ev) ? snap.ev.length : 0;
          console.log("[mp] snapshot recv", { evN, t: snap?.t, mode: snap?.mode });
        } catch {
          //
        }
      }
    });

    // If the joiner loses focus / hides the tab, force-stop on the host immediately.
    const stopNow = () => {
      try {
        socket.emit("game:input", { ax: 0, ay: 0 });
      } catch {
        //
      }
    };
    window.addEventListener("blur", stopNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") stopNow();
    });

    refreshOverlays(game);
    syncHud(game);

    last = performance.now() / 1000;
    hintT = 0;
    hintDismissed = false;
    if (hint) {
      hint.style.display = "";
      hint.style.opacity = "0.9";
    }

    bindGameUiOnce();
    startGameFrameLoop();
  }

  let localOnlineReady = false;
  let onlineDisplayNameLobbyEmitTimer = null;

  function finalizeOnlineWireNameFromUi() {
    const el =
      onlineUiMode === "char_select"
        ? onlineCharSelectDisplayNameEl
        : onlineMenuDisplayNameEl;
    const typed = normalizeTypedOnlineDisplayName(
      el instanceof HTMLInputElement ? el.value : "",
    );
    return typed || loadStoredOnlineDisplayName();
  }

  function seatDisplayNamesFromRoster(roster) {
    /** @type {string[]} */
    const out = ["", "", "", ""];
    for (const r of roster) {
      const s = Math.max(0, Math.min(3, Number(r?.seat ?? 0) | 0));
      const raw = typeof r.displayName === "string" ? r.displayName.trim() : "";
      out[s] = raw || `Player ${s + 1}`;
    }
    return out;
  }

  function updateOnlineGameplayHint(game) {
    if (!hint) return;
    if (game.netMode === "solo") return;
    const names = gOnlineSession?.seatDisplayNames;
    if (!names || names.length !== 4) return;
    const seat =
      game.netMode === "host"
        ? Math.max(0, Math.min(3, Number(gOnlineSession.hostSeat ?? 0) | 0))
        : Math.max(0, Math.min(3, Number(gOnlineSession.mySeat ?? 0) | 0));
    const bits = [];
    for (let i = 0; i < 4; i++) {
      const nm = typeof names[i] === "string" ? names[i].trim() : "";
      if (!nm) continue;
      bits.push(i === seat ? `${nm} (you · P${i + 1})` : `${nm} · P${i + 1}`);
    }
    hint.textContent =
      bits.length > 0
        ? `${bits.join(" · ")} · WASD · Esc pause`
        : `You are P${seat + 1} · WASD · Esc pause`;
    hint.style.opacity = "0.9";
    hint.style.display = "";
  }

  function scheduleLobbyDisplayNameEmitFromCharPanel() {
    if (onlineDisplayNameLobbyEmitTimer != null) clearTimeout(onlineDisplayNameLobbyEmitTimer);
    onlineDisplayNameLobbyEmitTimer = window.setTimeout(() => {
      onlineDisplayNameLobbyEmitTimer = null;
      if (onlineUiMode !== "char_select" || !onlineSocket?.connected) return;
      persistStoredOnlineDisplayName(
        onlineCharSelectDisplayNameEl instanceof HTMLInputElement
          ? onlineCharSelectDisplayNameEl.value
          : "",
      );
      onlineSocket.emit("lobby:setDisplayName", {
        displayName: finalizeOnlineWireNameFromUi(),
      });
    }, 420);
  }

  function disconnectOnlineSocket() {
    if (onlineDisplayNameLobbyEmitTimer != null) {
      clearTimeout(onlineDisplayNameLobbyEmitTimer);
      onlineDisplayNameLobbyEmitTimer = null;
    }
    try {
      onlineSocket?.removeAllListeners?.();
      onlineSocket?.disconnect?.();
    } catch {
      //
    }
    onlineSocket = null;
  }

  function syncOnlineReadyButtonLabels() {
    const lab = localOnlineReady ? "Unready" : "Ready";
    if (btnOnlineReady) btnOnlineReady.textContent = lab;
    if (btnOnlineCharReady) btnOnlineCharReady.textContent = lab;
  }

  function toggleOnlineLobbyReady() {
    localOnlineReady = !localOnlineReady;
    onlineSocket?.emit("lobby:setReady", { ready: localOnlineReady });
    syncOnlineReadyButtonLabels();
  }

  function refreshOnlineCharacterSelect(payload) {
    if (!(onlineCharSelectRosterEl instanceof HTMLElement)) return;
    const code = payload.code ?? onlineRoomCode;
    onlineRoomCode = code;
    if (onlineCharSelectRoomCodeEl) onlineCharSelectRoomCodeEl.textContent = code;
    if (onlineRoomCodeDisplay) onlineRoomCodeDisplay.textContent = code;
    const players = payload.players ?? [];
    onlineCharSelectRosterEl.innerHTML = "";
    for (const row of players) {
      const div = document.createElement("div");
      div.className = "online-charselect-roster-row";
      const tag = row.isHost ? " · Host" : "";
      const nick =
        typeof row.displayName === "string" && row.displayName.trim()
          ? row.displayName.trim()
          : `Player`;
      div.textContent = `P${row.seat + 1} · ${nick} · ${row.characterId}${tag}${row.ready ? " · Ready" : ""}`;
      onlineCharSelectRosterEl.appendChild(div);
    }
    const me = players.find((p) => p.socketId === onlineSocket?.id);
    if (me) {
      localOnlineReady = !!me.ready;
      syncOnlineReadyButtonLabels();
      const cid = me.characterId;
      const ix = MP_CHAR_ORDER.indexOf(cid);
      const seatIx = Math.max(0, Math.min(localPlayerCount - 1, onlineMySeat | 0));
      if (ix >= 0) {
        mpCharIndex[seatIx] = ix;
        selectedCharacter = cid;
        syncPickCardChrome();
        syncMpCardChrome();
      }
    }
    const allR = players.length > 0 && players.every((p) => p.ready);
    if (btnOnlineCharStart) {
      btnOnlineCharStart.disabled = !onlineIsHost || !allR;
      btnOnlineCharStart.style.display = onlineIsHost ? "" : "none";
    }
    if (btnOnlineStart) {
      btnOnlineStart.disabled = !onlineIsHost || !allR;
      btnOnlineStart.style.display = onlineIsHost ? "" : "none";
    }
  }

  async function copyOnlineRoomCodeWithFeedback() {
    const t = onlineRoomCode || "";
    try {
      await navigator.clipboard.writeText(t);
      setOnlineCoopLobbyErr("");
    } catch {
      setOnlineCoopLobbyErr("Copy failed — select and copy manually.");
    }
  }

  function leaveOnlineLobbyUi() {
    onlineUiMode = null;
    localOnlineReady = false;
    syncOnlineReadyButtonLabels();
    showOverlay(overlayOnlineLobby, false);
    showOverlay(overlayOnlineMenu, false);
    onlineCharSelectPanel?.classList.add("hidden");
    overlayCharacterSelect?.classList.remove("online-charselect-active");
    disconnectOnlineSocket();
    if (screen === "character_select") {
      characterSelectBrowseOnly = false;
      setScreen("menu");
    } else {
      showOverlay(overlayMenu, screen === "menu");
    }
    setOnlineCoopLobbyErr("");
    if (onlineErrEl) onlineErrEl.textContent = "";
  }

  function showOnlineEntry() {
    onlineUiMode = "entry";
    showOverlay(overlayMenu, false);
    showOverlay(overlayOnlineMenu, true);
    if (onlineErrEl) onlineErrEl.textContent = "";
    if (onlineMenuDisplayNameEl instanceof HTMLInputElement) {
      const cur = normalizeTypedOnlineDisplayName(onlineMenuDisplayNameEl.value);
      if (!cur) onlineMenuDisplayNameEl.value = loadStoredOnlineDisplayName();
    }
  }

  function attachOnlineSocketHandlers(sock) {
    sock.off("room:lobby");
    sock.on("room:lobby", (payload) => {
      if (onlineUiMode === "char_select") refreshOnlineCharacterSelect(payload);
    });
    sock.off("game:start");
    sock.on("game:start", ({ roster }) => {
      showOverlay(overlayOnlineLobby, false);
      onlineUiMode = null;
      if (onlineIsHost) startOnlineHostGame(sock, onlineRoomCode, roster);
      else startOnlineClientGame(sock, onlineRoomCode, onlineMySeat, roster);
    });
    sock.off("room:hostDisconnected");
    sock.on("room:hostDisconnected", () => {
      if (onlineErrEl) onlineErrEl.textContent = "Host disconnected.";
      if (started && game) btnRestart?.click();
      else {
        // Avoid stuck "started" if we never had a game ref (edge cases / ordering).
        started = false;
        leaveOnlineLobbyUi();
      }
    });
  }

  btnOnlineFromMenu?.addEventListener("click", () => {
    showOnlineEntry();
  });

  btnOnlineBackMenu?.addEventListener("click", () => {
    leaveOnlineLobbyUi();
  });

  btnOnlineLobbyBack?.addEventListener("click", () => {
    if (onlineSocket) onlineSocket.emit("room:leave");
    leaveOnlineLobbyUi();
  });

  btnOnlineCreate?.addEventListener("click", () => {
    const base = resolveMultiplayerServerUrl();
    if (!base) {
      if (onlineErrEl)
        onlineErrEl.textContent =
          "Set window.MULTIPLAYER_SERVER_URL, ?server=…, or use http://localhost (dev default port 8787 — run npm run online-server).";
      return;
    }
    if (typeof globalThis.io !== "function") {
      if (onlineErrEl) onlineErrEl.textContent = "Socket.IO script failed to load.";
      return;
    }
    disconnectOnlineSocket();
    const pollFirstOnline =
      typeof window !== "undefined" &&
      window.MULTIPLAYER_POLLING_FIRST === true;
    onlineSocket = globalThis.io(base, {
      // WebSocket first = lower RTT; set window.MULTIPLAYER_POLLING_FIRST=true to force old polling-primary dev behavior.
      transports: pollFirstOnline ? ["polling", "websocket"] : ["websocket", "polling"],
    });
    onlineSocket.once("connect_error", (err) => {
      if (onlineErrEl)
        onlineErrEl.textContent =
          `Cannot reach room server (${base}). In a second terminal run: npm run online-server — then open ${base}/health in your browser`;
      console.warn("[online]", err?.message ?? err);
    });
    onlineSocket.once("connect", () => {
      attachOnlineSocketHandlers(onlineSocket);
      const dnWire = finalizeOnlineWireNameFromUi();
      persistStoredOnlineDisplayName(dnWire);
      onlineSocket.emit("room:create", { displayName: dnWire }, (res) => {
        if (!res?.ok) {
          if (onlineErrEl) onlineErrEl.textContent = res?.error || "Could not create room.";
          return;
        }
        onlineRoomCode = res.code;
        onlineIsHost = true;
        onlineMySeat = 0;
        localOnlineReady = false;
        syncOnlineReadyButtonLabels();
        onlineUiMode = "char_select";
        showOverlay(overlayOnlineMenu, false);
        showOverlay(overlayOnlineLobby, false);
        setOnlineCoopLobbyErr("");
        setLocalPlayerCount(1);
        characterSelectBrowseOnly = false;
        if (onlineCharSelectDisplayNameEl instanceof HTMLInputElement) {
          onlineCharSelectDisplayNameEl.value = dnWire;
        }
        refreshOnlineCharacterSelect(res);
        setScreen("character_select");
        syncCharacterSelectModeUI();
      });
    });
  });

  btnOnlineJoinSubmit?.addEventListener("click", () => {
    const base = resolveMultiplayerServerUrl();
    const raw = (onlineJoinCodeInput?.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!base) {
      if (onlineErrEl)
        onlineErrEl.textContent =
          "Set window.MULTIPLAYER_SERVER_URL, ?server=…, or open the game over http on localhost/LAN for the dev server (port 8787).";
      return;
    }
    if (!raw) {
      if (onlineErrEl) onlineErrEl.textContent = "Enter a room code.";
      return;
    }
    if (typeof globalThis.io !== "function") {
      if (onlineErrEl) onlineErrEl.textContent = "Socket.IO script failed to load.";
      return;
    }
    disconnectOnlineSocket();
    const pollFirstOnlineJoin =
      typeof window !== "undefined" &&
      window.MULTIPLAYER_POLLING_FIRST === true;
    onlineSocket = globalThis.io(base, {
      transports: pollFirstOnlineJoin ? ["polling", "websocket"] : ["websocket", "polling"],
    });
    onlineSocket.once("connect_error", (err) => {
      if (onlineErrEl)
        onlineErrEl.textContent =
          `Cannot reach room server (${base}). In a second terminal run: npm run online-server — then open ${base}/health in your browser`;
      console.warn("[online]", err?.message ?? err);
    });
    onlineSocket.once("connect", () => {
      attachOnlineSocketHandlers(onlineSocket);
      const dnWire = finalizeOnlineWireNameFromUi();
      persistStoredOnlineDisplayName(dnWire);
      onlineSocket.emit("room:join", { code: raw, displayName: dnWire }, (res) => {
        if (!res?.ok) {
          if (onlineErrEl) onlineErrEl.textContent = res?.error || "Could not join.";
          return;
        }
        onlineRoomCode = res.code;
        onlineIsHost = false;
        onlineMySeat = Number.isFinite(res.yourSeat) ? res.yourSeat : 0;
        localOnlineReady = false;
        syncOnlineReadyButtonLabels();
        onlineUiMode = "char_select";
        showOverlay(overlayOnlineMenu, false);
        showOverlay(overlayOnlineLobby, false);
        setOnlineCoopLobbyErr("");
        setLocalPlayerCount(1);
        characterSelectBrowseOnly = false;
        if (onlineCharSelectDisplayNameEl instanceof HTMLInputElement) {
          onlineCharSelectDisplayNameEl.value = dnWire;
        }
        refreshOnlineCharacterSelect(res);
        setScreen("character_select");
        syncCharacterSelectModeUI();
      });
    });
  });

  onlineMenuDisplayNameEl?.addEventListener("blur", () => {
    if (onlineMenuDisplayNameEl instanceof HTMLInputElement)
      persistStoredOnlineDisplayName(onlineMenuDisplayNameEl.value);
  });

  onlineCharSelectDisplayNameEl?.addEventListener("blur", () => {
    if (onlineUiMode !== "char_select") return;
    if (onlineCharSelectDisplayNameEl instanceof HTMLInputElement) {
      persistStoredOnlineDisplayName(onlineCharSelectDisplayNameEl.value);
    }
    if (onlineSocket?.connected) {
      onlineSocket.emit("lobby:setDisplayName", {
        displayName: finalizeOnlineWireNameFromUi(),
      });
    }
  });

  onlineCharSelectDisplayNameEl?.addEventListener("input", () => {
    scheduleLobbyDisplayNameEmitFromCharPanel();
  });

  document.querySelectorAll(".online-char-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-online-char");
      if (id) onlineSocket?.emit("lobby:setCharacter", { characterId: id });
    });
  });

  btnOnlineReady?.addEventListener("click", () => toggleOnlineLobbyReady());

  btnOnlineStart?.addEventListener("click", () => {
    onlineSocket?.emit("room:start", {}, (res) => {
      if (!res?.ok) setOnlineCoopLobbyErr(res?.error || "Cannot start.");
    });
  });

  btnOnlineCopyCode?.addEventListener("click", () => copyOnlineRoomCodeWithFeedback());

  btnOnlineCharCopy?.addEventListener("click", () => copyOnlineRoomCodeWithFeedback());
  btnOnlineCharReady?.addEventListener("click", () => toggleOnlineLobbyReady());
  btnOnlineCharStart?.addEventListener("click", () => {
    onlineSocket?.emit("room:start", {}, (res) => {
      if (!res?.ok) setOnlineCoopLobbyErr(res?.error || "Cannot start.");
    });
  });
  btnOnlineCharLeave?.addEventListener("click", () => {
    if (onlineSocket) onlineSocket.emit("room:leave");
    leaveOnlineLobbyUi();
  });

  btnStartGame?.addEventListener("click", () => {
    characterSelectBrowseOnly = false;
    syncCharacterSelectModeUI();
    setScreen("character_select");
  });
  btnCharacters?.addEventListener("click", () => {
    characterSelectBrowseOnly = true;
    browseInspectId = null;
    syncCharacterSelectModeUI();
    setScreen("character_select");
  });
  btnCharacterBack?.addEventListener("click", () => {
    if (onlineUiMode === "char_select") {
      onlineSocket?.emit("room:leave");
      leaveOnlineLobbyUi();
      return;
    }
    setScreen("menu");
  });

  // Escape: close main-menu settings panel.
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape" || e.repeat) return;
    if (
      screen === "menu" &&
      overlayMenuSettings &&
      !overlayMenuSettings.classList.contains("hidden")
    ) {
      e.preventDefault();
      closeMenuAudioSettings();
    }
  });

  // Keyboard menu navigation: Up/Down (or W/S) + Enter/Space.
  window.addEventListener("keydown", (e) => {
    if (screen !== "menu") return;
    if (onlineUiMode) return;
    if (
      overlayMenuSettings &&
      !overlayMenuSettings.classList.contains("hidden")
    ) {
      return;
    }
    if (e.repeat) return;
    const key = e.key;
    if (key === "ArrowUp" || key === "w" || key === "W") {
      e.preventDefault();
      menuIndex -= 1;
      syncMenuSelection();
      return;
    }
    if (key === "ArrowDown" || key === "s" || key === "S") {
      e.preventDefault();
      menuIndex += 1;
      syncMenuSelection();
      return;
    }
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      const btn = menuItems[menuIndex]?.querySelector("button");
      if (btn instanceof HTMLButtonElement) btn.click();
    }
  });
  characterGrid?.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest(".character-card") : null;
    if (!el) return;
    const id = el.getAttribute("data-character");
    if (!id) return;
    if (characterSelectBrowseOnly) {
      browseInspectId = id;
      syncBrowseCardChrome();
      applyPortraitPreviewForCurrentMode();
      return;
    }
    if (onlineUiMode === "char_select") {
      const idx = MP_CHAR_ORDER.indexOf(id);
      const seatIx = Math.max(0, Math.min(localPlayerCount - 1, onlineMySeat | 0));
      if (idx >= 0) mpCharIndex[seatIx] = idx;
      selectedCharacter = id;
      onlineSocket?.emit("lobby:setCharacter", { characterId: id });
      syncPickCardChrome();
      syncMpCardChrome();
      applyPortraitPreviewForCurrentMode();
      updateConfirmState();
      return;
    }
    // Local lobby: clicking sets Player 1 (simple + stable).
    const idx = MP_CHAR_ORDER.indexOf(id);
    if (idx >= 0) mpCharIndex[0] = idx;
    selectedCharacter = id;
    syncPickCardChrome();
    syncMpCardChrome();
    renderMpSlots();
    applyPortraitPreviewForCurrentMode();
    updateConfirmState();
  });

  updateConfirmState();

  btnCharacterConfirm?.addEventListener("click", () => {
    if (characterSelectBrowseOnly === true) return;
    if (onlineUiMode === "char_select") return;
    if (!(mpReady.length > 0 && mpReady.every((r) => r === true))) return;
    startGame();
  });

  // Character select multiplayer keyboard controls (simultaneous).
  window.addEventListener("keydown", (e) => {
    if (screen !== "character_select") return;
    if (characterSelectBrowseOnly === true) return;
    if (onlineUiMode === "char_select") return;
    if (e.repeat) return;
    const code = e.code;
    let pIdx = -1;
    for (let i = 0; i < localPlayerCount; i++) {
      if (code === MP_LEFT_CODE[i] || code === MP_RIGHT_CODE[i] || code === MP_CONFIRM_CODE[i]) {
        pIdx = i;
        break;
      }
    }
    if (pIdx < 0) return;
    e.preventDefault();
    mpActivePlayer = pIdx;
    const left = code === MP_LEFT_CODE[pIdx];
    const right = code === MP_RIGHT_CODE[pIdx];
    const confirm = code === MP_CONFIRM_CODE[pIdx];
    if ((left || right) && mpReady[pIdx] !== true) {
      const dir = left ? -1 : 1;
      const n = MP_CHAR_ORDER.length;
      mpCharIndex[pIdx] = ((mpCharIndex[pIdx] ?? 0) + dir + n) % n;
    } else if (confirm) {
      mpReady[pIdx] = !mpReady[pIdx];
    }
    // Mirror player 1 into legacy preview state.
    selectedCharacter = MP_CHAR_ORDER[mpCharIndex[0] ?? 0] ?? selectedCharacter;
    syncPickCardChrome();
    syncMpCardChrome();
    renderMpSlots();
    applyPortraitPreviewForCurrentMode();
    updateConfirmState();
  });

  // Ready buttons in player slots.
  mpPlayerSlots?.addEventListener("click", (e) => {
    if (screen !== "character_select") return;
    if (characterSelectBrowseOnly === true) return;
    if (onlineUiMode === "char_select") return;
    const el = e.target instanceof Element ? e.target.closest("button[data-ready-btn]") : null;
    if (!el) return;
    const idx = Number(el.getAttribute("data-ready-btn"));
    if (!Number.isFinite(idx) || idx < 0 || idx >= localPlayerCount) return;
    mpReady[idx] = !mpReady[idx];
    selectedCharacter = MP_CHAR_ORDER[mpCharIndex[0] ?? 0] ?? selectedCharacter;
    syncPickCardChrome();
    syncMpCardChrome();
    renderMpSlots();
    updateConfirmState();
  });

  if (jamInboundBoot.instantPlay) {
    hydrateJamOutboundIdentity();
    characterSelectBrowseOnly = false;
    onlineUiMode = null;
    setLocalPlayerCount(1);
    mpReady = [true];
    selectedCharacter = MP_CHAR_ORDER[mpCharIndex[0] ?? 0] ?? "mage";
    syncPickCardChrome();
    syncMpCardChrome();
    renderMpSlots();
    updateConfirmState();
    startGame();
  }
}

main().catch(console.error);

async function initMenuBones3D(canvasEl) {
  console.log("[menu-bones] init start");
  // Uses importmap in `index.html` to resolve these specifiers.
  const THREE = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  console.log("[menu-bones] three loaded");

  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -2000, 2000);
  camera.position.z = 1000;
  scene.add(camera);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(0.4, 0.8, 1);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfa2ff, 0.65);
  rim.position.set(-0.8, 0.2, 1);
  scene.add(rim);
  const hemi = new THREE.HemisphereLight(0xece6ff, 0x1a1028, 0.55);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const group = new THREE.Group();
  scene.add(group);

  const loader = new GLTFLoader();
  console.log("[menu-bones] loading glb");
  const gltf = await loader.loadAsync("./assets/Bone.glb");
  console.log("[menu-bones] glb loaded");
  const base = gltf.scene;
  const makeBoneMaterial = () =>
    new THREE.MeshStandardMaterial({
      color: 0xf3ead4,
      roughness: 0.88,
      metalness: 0.02,
      emissive: 0x2a133d,
      emissiveIntensity: 0.35,
    });
  const applyMenuBoneMaterial = (root) => {
    root.traverse((o) => {
      if (!o || !o.isMesh) return;
      o.frustumCulled = false;
      // Many exported GLBs look black without proper textures/env. Force a readable “bone” material.
      const mat = makeBoneMaterial();
      mat.side = THREE.DoubleSide;
      o.material = mat;
      if (o.geometry) o.geometry.computeVertexNormals?.();
    });
  };
  applyMenuBoneMaterial(base);

  const left = base.clone(true);
  const right = base.clone(true);
  group.add(left);
  group.add(right);

  // Scale bone model into UI space (tunable).
  const targetPx = 86;
  const box = new THREE.Box3().setFromObject(left);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scl = targetPx / maxDim;
  left.scale.setScalar(scl);
  right.scale.setScalar(scl);

  // Mirror right bone.
  right.scale.x *= -1;

  // After scaling, compute half-width in *screen px* (our ortho camera uses px units).
  const scaledBox = new THREE.Box3().setFromObject(left);
  const scaledSize = scaledBox.getSize(new THREE.Vector3());
  const halfW = Math.max(1, scaledSize.x * 0.5);

  let w = 0;
  let h = 0;
  let anchorBtn = null;
  const margin = 26; // px gap from button edge

  const resize = () => {
    const rect = canvasEl.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.left = 0;
    camera.right = w;
    camera.top = 0;
    camera.bottom = h;
    camera.updateProjectionMatrix();
  };

  const setAnchorButton = (btn) => {
    anchorBtn = btn instanceof HTMLElement ? btn : null;
  };

  const updatePositions = () => {
    if (!anchorBtn) {
      left.visible = false;
      right.visible = false;
      return;
    }
    const br = anchorBtn.getBoundingClientRect();
    const cr = canvasEl.getBoundingClientRect();
    const cx0 = br.left - cr.left;
    const cx1 = br.right - cr.left;
    const cy = br.top - cr.top + br.height * 0.5;

    left.visible = true;
    right.visible = true;

    // Position by *edges* of the mesh so it doesn't overlap the button.
    left.position.set(cx0 - margin - halfW, cy, 0);
    right.position.set(cx1 + margin + halfW, cy, 0);
  };

  let running = true;
  const animate = (t) => {
    if (!running) return;
    updatePositions();

    const tt = t * 0.001;
    // Continuous horizontal-axis spin (perfectly horizontal: no yaw/roll tilt).
    const spin = tt * 5.2;
    left.rotation.set(spin, 0, 0);
    right.rotation.set(spin, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  resize();
  requestAnimationFrame(animate);

  return {
    setAnchorButton,
    dispose() {
      running = false;
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    },
  };
}
