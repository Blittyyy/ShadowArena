/**
 * Host → clients world replication (plain JSON-safe structures).
 */
import { CONFIG } from "../config.js?v=2026-04-30-coop-vs-balance-1";
import { findUpgradeById } from "../upgrades.js";

function safeJson(obj) {
  try {
    return JSON.parse(
      JSON.stringify(obj, (_k, v) => {
        if (v instanceof Set) return { __set: [...v] };
        if (typeof v === "function") return undefined;
        return v;
      })
    );
  } catch {
    return null;
  }
}

function reviveSetsInObject(obj) {
  if (obj == null) return;
  if (Array.isArray(obj)) {
    for (const el of obj) reviveSetsInObject(el);
    return;
  }
  if (typeof obj !== "object") return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.__set)) {
      obj[k] = new Set(v.__set);
    } else {
      reviveSetsInObject(v);
    }
  }
}

/** Socket payloads are already plain JSON — skip stringify/parse; only revive `__set` markers. */
function takeSnapArray(arr) {
  const a = Array.isArray(arr) ? arr : [];
  reviveSetsInObject(a);
  return a;
}

/** @param {unknown} raw */
function assignReplayArraysFromSnap(raw) {
  const a = Array.isArray(raw) ? raw : [];
  reviveSetsInObject(a);
  return a;
}

function snapPlayer(p) {
  if (!p) return null;
  const stats = safeJson(p.stats);
  return {
    characterId: p.characterId,
    x: p.x,
    y: p.y,
    hp: p.hp,
    maxHp: p.maxHp,
    facingRight: p.facingRight,
    walkKind: p.walkKind,
    walkFrame: p.walkFrame,
    moving: p.moving,
    hitTimer: p.hitTimer ?? 0,
    attackCd: p.attackCd ?? 0,
    attackTimer: p.attackTimer ?? 0,
    facingVec: { x: p.facingVec?.x ?? 1, y: p.facingVec?.y ?? 0 },
    walkAccumUp: p.walkAccumUp ?? 0,
    walkAccumDown: p.walkAccumDown ?? 0,
    walkAccumSide: p.walkAccumSide ?? 0,
    bloodRageT: p.bloodRageT ?? 0,
    bloodRageCd: p.bloodRageCd ?? 0,
    stats,
    daggerCd: p.daggerCd ?? 0,
    throwingAxeCd: p.throwingAxeCd ?? 0,
    boomerangCd: p.boomerangCd ?? 0,
    lightningCd: p.lightningCd ?? 0,
    whipCd: p.whipCd ?? 0,
    whipSwings: safeJson(p.whipSwings) ?? [],
    whipHeldHideT: p.whipHeldHideT ?? 0,
    hammers: safeJson(p.hammers) ?? [],
    hammerOrbitPhase: p.hammerOrbitPhase ?? 0,
    arcaneRunes: safeJson(p.arcaneRunes) ?? [],
    arcaneRuneOrbitPhase: p.arcaneRuneOrbitPhase ?? 0,
    toxicGrenadeCd: p.toxicGrenadeCd ?? 0,
    groundSlamCd: p.groundSlamCd ?? 0,
    groundSlamSecondT: p.groundSlamSecondT ?? 0,
    soulPullCd: p.soulPullCd ?? 0,
  };
}

function applyPlayer(target, snap) {
  if (!target || !snap) return;
  Object.assign(target, {
    characterId: snap.characterId,
    x: snap.x,
    y: snap.y,
    hp: snap.hp,
    maxHp: snap.maxHp,
    facingRight: snap.facingRight,
    walkKind: snap.walkKind,
    walkFrame: snap.walkFrame,
    moving: snap.moving,
    hitTimer: snap.hitTimer,
    attackCd: snap.attackCd,
    attackTimer: snap.attackTimer,
    facingVec: snap.facingVec,
    walkAccumUp: snap.walkAccumUp,
    walkAccumDown: snap.walkAccumDown,
    walkAccumSide: snap.walkAccumSide,
    bloodRageT: snap.bloodRageT,
    bloodRageCd: snap.bloodRageCd,
    daggerCd: snap.daggerCd,
    throwingAxeCd: snap.throwingAxeCd,
    boomerangCd: snap.boomerangCd,
    lightningCd: snap.lightningCd,
    whipCd: snap.whipCd,
    whipHeldHideT: snap.whipHeldHideT,
    hammerOrbitPhase: snap.hammerOrbitPhase,
    arcaneRuneOrbitPhase: snap.arcaneRuneOrbitPhase,
    toxicGrenadeCd: snap.toxicGrenadeCd,
    groundSlamCd: snap.groundSlamCd,
    groundSlamSecondT: snap.groundSlamSecondT,
    soulPullCd: snap.soulPullCd,
  });
  if (snap.stats && typeof snap.stats === "object") {
    Object.assign(target.stats, snap.stats);
  }
  target.whipSwings = assignReplayArraysFromSnap(snap.whipSwings);
  target.hammers = assignReplayArraysFromSnap(snap.hammers);
  target.arcaneRunes = assignReplayArraysFromSnap(snap.arcaneRunes);
}

/**
 * @param {import("../game.js").Game} game
 */
export function buildGameSnapshot(game) {
  const pendingUpgradeIds = (game.pendingUpgrades ?? []).map((u) => u?.id).filter(Boolean);
  return {
    v: 1,
    t: game.time,
    mode: game.mode,
    level: game.level,
    xp: game.xp,
    xpToNext: game.xpToNext,
    levelUpsPending: game.levelUpsPending,
    upgradePlayerIndex: game.upgradePlayerIndex,
    pendingUpgradeIds,
    camX: game.camX,
    camY: game.camY,
    camTargetX: game.camTargetX,
    camTargetY: game.camTargetY,
    shake: game.shake,
    endedByQuit: !!game.endedByQuit,
    bossIntroT: game.bossIntroT,
    bossIntroLine: game.bossIntroLine,
    bossIntroTheme: game.bossIntroTheme,
    viewWorldScale: CONFIG.VIEW_WORLD_SCALE ?? 1,
    magnetT: game.magnetT ?? 0,
    players: (game.players ?? []).map(snapPlayer),
    enemies: safeJson(game.enemies ?? []) ?? [],
    projectiles: safeJson(game.projectiles ?? []) ?? [],
    bossArcaneProjs: safeJson(game.bossArcaneProjs ?? []) ?? [],
    bossPulses: safeJson(game.bossPulses ?? []) ?? [],
    xpOrbs: safeJson(game.xpOrbs ?? []) ?? [],
    pickups: safeJson(game.pickups ?? []) ?? [],
    daggers: safeJson(game.daggers ?? []) ?? [],
    throwingAxes: safeJson(game.throwingAxes ?? []) ?? [],
    boomerangs: safeJson(game.boomerangs ?? []) ?? [],
    lightningStrikes: safeJson(game.lightningStrikes ?? []) ?? [],
    hammers: safeJson(game.hammers ?? []) ?? [],
    arcaneRunes: safeJson(game.arcaneRunes ?? []) ?? [],
    toxicGrenades: safeJson(game.toxicGrenades ?? []) ?? [],
    toxicExplosions: safeJson(game.toxicExplosions ?? []) ?? [],
    toxicClouds: safeJson(game.toxicClouds ?? []) ?? [],
    groundSlams: safeJson(game.groundSlams ?? []) ?? [],
    soulRipProjectiles: safeJson(game.soulRipProjectiles ?? []) ?? [],
    slashes: safeJson(game.slashes ?? []) ?? [],
    bossMilestones: safeJson(game.bossMilestones) ?? { boss1: false, boss2: false },
  };
}

/**
 * @param {import("../game.js").Game} game
 * @param {ReturnType<typeof buildGameSnapshot>} snap
 */
export function applyGameSnapshot(game, snap) {
  if (!snap || snap.v !== 1) return;
  game.time = snap.t ?? game.time;
  game.mode = snap.mode ?? game.mode;
  game.level = snap.level ?? game.level;
  game.xp = snap.xp ?? game.xp;
  game.xpToNext = snap.xpToNext ?? game.xpToNext;
  game.levelUpsPending = snap.levelUpsPending ?? 0;
  game.upgradePlayerIndex = snap.upgradePlayerIndex ?? 0;
  game.camX = snap.camX ?? game.camX;
  game.camY = snap.camY ?? game.camY;
  game.camTargetX = snap.camTargetX ?? game.camTargetX;
  game.camTargetY = snap.camTargetY ?? game.camTargetY;
  game.shake = snap.shake ?? 0;
  game.endedByQuit = !!snap.endedByQuit;
  game.bossIntroT = snap.bossIntroT ?? 0;
  game.bossIntroLine = snap.bossIntroLine ?? "";
  game.bossIntroTheme = snap.bossIntroTheme ?? "";
  if (typeof snap.viewWorldScale === "number" && Number.isFinite(snap.viewWorldScale)) {
    CONFIG.VIEW_WORLD_SCALE = snap.viewWorldScale;
  }
  game.magnetT = snap.magnetT ?? 0;

  const pls = snap.players ?? [];
  for (let i = 0; i < (game.players?.length ?? 0); i++) {
    applyPlayer(game.players[i], pls[i]);
  }
  if (game.player) {
    game.playerFacingRight = !!game.player.facingRight;
    game.playerWalkKind = game.player.walkKind;
    game.playerWalkFrame = game.player.walkFrame;
    game.playerMoving = !!game.player.moving;
    game.playerHitTimer = game.player.hitTimer ?? 0;
    game.playerFacingVec = { ...game.player.facingVec };
    game.stats = game.player.stats;
  }

  game.enemies = takeSnapArray(snap.enemies);
  game.projectiles = takeSnapArray(snap.projectiles);
  game.bossArcaneProjs = takeSnapArray(snap.bossArcaneProjs);
  game.bossPulses = takeSnapArray(snap.bossPulses);
  game.xpOrbs = takeSnapArray(snap.xpOrbs);
  game.pickups = takeSnapArray(snap.pickups);
  game.daggers = takeSnapArray(snap.daggers);
  game.throwingAxes = takeSnapArray(snap.throwingAxes);
  game.boomerangs = takeSnapArray(snap.boomerangs);
  game.lightningStrikes = takeSnapArray(snap.lightningStrikes);
  game.hammers = takeSnapArray(snap.hammers);
  game.arcaneRunes = takeSnapArray(snap.arcaneRunes);
  game.toxicGrenades = takeSnapArray(snap.toxicGrenades);
  game.toxicExplosions = takeSnapArray(snap.toxicExplosions);
  game.toxicClouds = takeSnapArray(snap.toxicClouds);
  game.groundSlams = takeSnapArray(snap.groundSlams);
  game.soulRipProjectiles = takeSnapArray(snap.soulRipProjectiles);
  game.slashes = takeSnapArray(snap.slashes);
  if (snap.bossMilestones && typeof snap.bossMilestones === "object") {
    game.bossMilestones = { ...game.bossMilestones, ...snap.bossMilestones };
  }

  game.pendingUpgrades = [];
  for (const id of snap.pendingUpgradeIds ?? []) {
    const u = findUpgradeById(id);
    if (u) game.pendingUpgrades.push(u);
  }

  game.characterIds = (game.players ?? []).map((p) => p?.characterId ?? "mage");
  game.characterId = game.characterIds[0] ?? "mage";
}
