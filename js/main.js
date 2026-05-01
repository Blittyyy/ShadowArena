import { setupInput } from "./input.js";
import { loadAssets, revenantAtlasSourceRect } from "./assets.js?v=2026-04-30-coop-vs-balance-1";
import { Game } from "./game.js?v=2026-04-30-coop-vs-balance-1";
import {
  upgradeCardIconSrc,
  upgradeChoiceCardMeta,
  upgradeChoicePresentation,
  upgradeIconLayout,
} from "./upgrades.js";
import {
  loadAudioSettings,
  resetAudioSettingsToDefaults,
  saveAudioSettings,
} from "./audioSettings.js?v=2026-04-30-coop-vs-balance-1";

try {
  console.log("[main] loaded v-2026-04-30-coop-vs-balance-1");
} catch {
  // ignore
}

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
const btnObserveEnemies = document.getElementById("btn-observe-enemies");
const menuFog = document.getElementById("menu-fog");
const menuItems = Array.from(document.querySelectorAll("#overlay-menu .menu-item"));
const menuBonesCanvas = document.getElementById("menu-bones-canvas");
// Large character preview panel removed (multiplayer slots replace it).
const characterSelectHeaderPick = document.getElementById("character-select-header-pick");
const characterSelectHeaderBrowse = document.getElementById("character-select-header-browse");
const mpPlayerCountButtons = document.querySelectorAll(".mp-seg-btn[data-player-count]");
const mpPlayerSlots = document.getElementById("mp-player-slots");

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

    btn.addEventListener("click", () => {
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
    showOverlay(overlayMenu, screen === "menu");
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

  setScreen("menu");

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

  let started = false;
  let game = null;
  let last = 0;
  let hintT = 0;
  let hintDismissed = false;
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
            <div class="mp-controls">Move: ${MP_CONTROLS_LABEL[i] ?? ""} • L/R to change</div>
            <div class="mp-confirm">Confirm: ${MP_CONFIRM_LABEL[i] ?? ""} (toggle)</div>
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
    overlayCharacterSelect?.classList.toggle("mode-browse", browse);

    if (characterSelectHeaderPick instanceof HTMLElement) {
      characterSelectHeaderPick.classList.toggle("hidden", browse);
      characterSelectHeaderPick.setAttribute("aria-hidden", browse ? "true" : "false");
    }
    if (characterSelectHeaderBrowse instanceof HTMLElement) {
      characterSelectHeaderBrowse.classList.toggle("hidden", !browse);
      characterSelectHeaderBrowse.setAttribute("aria-hidden", browse ? "false" : "true");
    }

    if (btnCharacterConfirm instanceof HTMLButtonElement) {
      if (browse) btnCharacterConfirm.setAttribute("hidden", "");
      else btnCharacterConfirm.removeAttribute("hidden");
    }

    if (browse) syncBrowseCardChrome();
    else {
      // Legacy selectedCharacter mirrors player 1 for preview/back-compat.
      selectedCharacter = MP_CHAR_ORDER[mpCharIndex[0] ?? 0] ?? selectedCharacter;
      syncPickCardChrome();
      syncMpCardChrome();
      renderMpSlots();
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

  const DEV_ENEMY_BY_DIGIT = {
    Digit1: "skeleton",
    Digit2: "goblin",
    Digit3: "brute",
    Digit4: "exploder",
    Digit5: "slime",
    Digit6: "slimeSmall",
    Digit7: "beast",
    Digit8: "bat",
    Digit9: "golem",
    Digit0: "necromancer",
  };

  function startGame() {
    if (started) return;
    started = true;
    setScreen("game");

    // Store selected character in a simple variable (for future wiring).
    window.selectedCharacters = mpCharIndex.map((i) => MP_CHAR_ORDER[i] ?? "mage");
    window.selectedCharacter = window.selectedCharacters[0] ?? selectedCharacter;
    window.localPlayerCount = localPlayerCount;

    game = new Game(canvas);
    window.addEventListener("resize", () => game.syncCanvasResolution());

    function syncObserveButton() {
      if (!btnObserveEnemies) return;
      const on = game.devSafeFromEnemies === true;
      btnObserveEnemies.setAttribute("aria-pressed", on ? "true" : "false");
      btnObserveEnemies.textContent = on ? "Observe on (no hits)" : "Observe enemies";
    }
    syncObserveButton();
    btnObserveEnemies?.addEventListener("click", () => {
      game.devSafeFromEnemies = !game.devSafeFromEnemies;
      syncObserveButton();
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

    btnRestart.addEventListener("click", () => {
      resetAudioSettingsToDefaults();
      refreshAudioSlidersFromStorage();
      game.reset();
      syncObserveButton();
      refreshOverlays(game);
      syncHud(game);
      applyMenuMusicState(screen).catch(() => {});
      applyGameMusicState(screen).catch(() => {});
      hintT = 0;
      hintDismissed = false;
      if (hint) {
        hint.style.display = "";
        hint.style.opacity = "0.9";
      }
    });

    btnResume.addEventListener("click", () => {
      game.resume();
      refreshOverlays(game);
    });

    btnEndRun.addEventListener("click", () => {
      game.endRun();
      refreshOverlays(game);
    });

    window.addEventListener("keydown", (e) => {
      if (!game) return;
      // Dev: Alt+0 clears weapon override. Alt+1..7 selects a weapon to test solo.
      // (Disables base attacks + all other weapons; see game.js applyDevWeaponOverride()).
      if (e.altKey && !e.repeat) {
        const MAP = {
          Digit0: "",
          Digit1: "dagger",
          Digit2: "throwing_axe",
          Digit3: "boomerang",
          Digit4: "lightning",
          Digit5: "hammer",
          Digit6: "whip",
          Digit7: "arcane_runes",
        };
        const w = MAP[e.code];
        if (typeof w === "string") {
          window.DEV_WEAPON = w;
          e.preventDefault();
          return;
        }
      }
      // Dev: [ toggles staff bolts + hammer damage off/on; ] adds one orbiting axe.
      if (e.code === "BracketLeft" && !e.repeat) {
        game.devStaffDisabled = !game.devStaffDisabled;
        e.preventDefault();
        return;
      }
      if (e.code === "BracketRight" && !e.repeat) {
        game.stats.hammerCount = (game.stats.hammerCount ?? 0) + 1;
        e.preventDefault();
        return;
      }
      // Dev: Alt+Shift+7 spawns the Fire Demon boss (milestone is marked so it won't double-spawn later).
      if (e.shiftKey && e.altKey && e.code === "Digit7" && !e.repeat) {
        game.devSpawnEnemy("boss1", { nearPlayer: false, devBoss: true });
        e.preventDefault();
        return;
      }
      // Dev: Alt+Shift+8 spawns Arcane Sentinel (Boss2).
      if (e.shiftKey && e.altKey && e.code === "Digit8" && !e.repeat) {
        game.devSpawnEnemy("boss2", { nearPlayer: false, devBoss: true });
        e.preventDefault();
        return;
      }
      // Dev: Shift+0–6,8,9 spawn enemy at spawn ring; add Alt for near-player (~100px).
      // Exclude Alt combos (Alt+Shift+7/8 are reserved for bosses).
      if (e.shiftKey && !e.altKey && !e.repeat) {
        const typeId = DEV_ENEMY_BY_DIGIT[e.code];
        if (typeId) {
          game.devSpawnEnemy(typeId, { nearPlayer: e.altKey });
          e.preventDefault();
          return;
        }
      }
      if (e.code !== "Escape") return;
      if (e.repeat) return;
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

    function frame(nowMs) {
      if (!game) return;
      const now = nowMs / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;

      game.update(dt);
      game.render();
      syncHud(game);

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
      if (!hintDismissed && hintT > 5 && hint) {
        hintDismissed = true;
        hint.style.opacity = "0";
        hint.style.transition = "opacity 1s";
        setTimeout(() => {
          if (hint) hint.style.display = "none";
        }, 1100);
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

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
  btnCharacterBack?.addEventListener("click", () => setScreen("menu"));

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
    // In multiplayer select, clicking sets Player 1 (simple + stable).
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
    if (!(mpReady.length > 0 && mpReady.every((r) => r === true))) return;
    startGame();
  });

  // Character select multiplayer keyboard controls (simultaneous).
  window.addEventListener("keydown", (e) => {
    if (screen !== "character_select") return;
    if (characterSelectBrowseOnly === true) return;
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
