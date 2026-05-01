import { CONFIG, ENEMY_TYPES, viewWorldW, viewWorldH } from "./config.js?v=2026-04-30-coop-vs-balance-1";
import { loadAudioSettings } from "./audioSettings.js?v=2026-04-30-coop-vs-balance-1";
import { clamp, dist, angle, randRange } from "./mathutil.js";
import { getMovement, interactHeldForSeat, interactKeyHintForSeat } from "./input.js";
import { INTERPOLATION_DELAY_MS } from "./net/snapshotSync.js?v=2026-04-30-net-jitter-1";
import {
  drawPlayer,
  drawXpOrb,
  drawEnemySprite,
  exploderWalkRowFlip,
  enemyWalkColumn,
  drawTiledGround,
  drawArenaBackground,
  drawHammerSprite,
  drawWhipSprite,
  drawWhipSlashAttackVfx,
  drawBerserkerSlashVfx,
  drawSoulRipProjectile,
  drawArcherProjectile,
  drawGrenadeSprite,
  drawGrenadeExplosionFrame,
  drawPickupIcon,
  drawDaggerSprite,
  drawRuneSprite,
  drawThrowingAxeSprite,
  drawBoomerangSprite,
  drawPlayerHeadHealthBar,
  isPlayerSpriteReady,
  isHammerReady,
  isBerserkerSlashReady,
  isSoulRipProjectileReady,
  HIT_ANIM_DURATION,
  worldCircleBlockedByArena,
  isArenaCollisionReady,
} from "./assets.js?v=2026-04-30-coop-vs-balance-1";
import { pickThreeUpgrades, createBaseStats } from "./upgrades.js";
import { sanitizePlayerEntity, sanitizePlayerStats } from "./gameSafety.js?v=2026-04-30-coop-vs-balance-1";
import {
  computeExitPortal,
  computeReturnPortal,
  hasJamReturnTarget,
  redirectJamReturn,
  redirectToVibeJamHub,
} from "./net/vibeJamPortal.js?v=2026-04-30-portal-webring-1";

/** Lash extends outward along facing; 0..1 → 0..1 (not a rotating sword swipe). */
function whipGrowU(u) {
  const t = clamp(u, 0, 1);
  const mode = CONFIG.WHIP_GROW_EASE ?? "cubicOut";
  if (mode === "linear") return t;
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

/**
 * World angles (radians) for each whip line: 1 = forward only; 2 = forward + behind; 3 = forward + left + right.
 */
function whipLineAngles(baseAng, lines) {
  const n = Math.max(1, Math.min(3, Math.floor(lines ?? 1)));
  if (n === 1) return [baseAng];
  if (n === 2) return [baseAng, baseAng + Math.PI];
  return [baseAng, baseAng + Math.PI * 0.5, baseAng - Math.PI * 0.5];
}

function pickEnemyType(gameTime) {
  const tMin = gameTime / 60;
  const slimeMin = CONFIG.SLIME_MIN_GAME_MINUTES ?? 0.35;
  if (tMin >= slimeMin) {
    const slimeLate = CONFIG.SLIME_LATE_GAME_MINUTES ?? 2.5;
    const ps =
      tMin >= slimeLate
        ? (CONFIG.SLIME_SPAWN_CHANCE_LATE ?? 0.12)
        : (CONFIG.SLIME_SPAWN_CHANCE ?? 0.09);
    if (Math.random() < ps) return "slime";
  }
  const batMin = CONFIG.BAT_MIN_GAME_MINUTES ?? 0.2;
  if (tMin >= batMin && Math.random() < (CONFIG.BAT_SPAWN_CHANCE ?? 0.088)) {
    return "bat";
  }
  const golemMin = CONFIG.GOLEM_MIN_GAME_MINUTES ?? 1;
  if (tMin >= golemMin && Math.random() < (CONFIG.GOLEM_SPAWN_CHANCE ?? 0.048)) {
    return "golem";
  }
  const necroMin = CONFIG.NECRO_MIN_GAME_MINUTES ?? 0.85;
  if (tMin >= necroMin && Math.random() < (CONFIG.NECRO_SPAWN_CHANCE ?? 0.052)) {
    return "necromancer";
  }
  const exploderMin = CONFIG.EXPLODER_MIN_GAME_MINUTES ?? 0.75;
  if (tMin >= exploderMin) {
    const lateAt = CONFIG.EXPLODER_LATE_GAME_MINUTES ?? 3;
    const p =
      tMin >= lateAt
        ? (CONFIG.EXPLODER_SPAWN_CHANCE_LATE ?? 0.17)
        : (CONFIG.EXPLODER_SPAWN_CHANCE_EARLY ?? 0.12);
    if (Math.random() < p) return "exploder";
  }
  const beastMin = CONFIG.BEAST_MIN_GAME_MINUTES ?? 0.9;
  if (tMin >= beastMin && Math.random() < (CONFIG.BEAST_SPAWN_CHANCE ?? 0.065)) {
    return "beast";
  }
  const r = Math.random();
  const t = tMin;
  if (t < 0.5) {
    if (r < 0.65) return "skeleton";
    if (r < 0.9) return "goblin";
    return "brute";
  }
  if (t < 2) {
    if (r < 0.45) return "skeleton";
    if (r < 0.8) return "goblin";
    return "brute";
  }
  if (r < 0.35) return "skeleton";
  if (r < 0.7) return "goblin";
  return "brute";
}

/**
 * Random point on the outer spawn ring. Retries if that spot lands inside the collision mask.
 * @param {number} [entityRadius] — footprint for mask test (enemy radius or default ~12).
 */
function spawnPositionAroundPlayer(px, py, camW, camH, entityRadius) {
  const halfW = camW / 2 + CONFIG.SPAWN_MARGIN;
  const halfH = camH / 2 + CONFIG.SPAWN_MARGIN;
  const er = typeof entityRadius === "number" && entityRadius > 0 ? entityRadius : 12;
  const useCol =
    isArenaCollisionReady() &&
    CONFIG.ARENA_COLLISION_ENABLED !== false &&
    CONFIG.COLLISION_BLOCKS_ENEMIES !== false;
  for (let attempt = 0; attempt < 56; attempt++) {
    const R = Math.hypot(halfW, halfH) + 40 + Math.random() * 120;
    const a = Math.random() * Math.PI * 2;
    let x = px + Math.cos(a) * R;
    let y = py + Math.sin(a) * R;
    x = clamp(x, er, CONFIG.WORLD_W - er);
    y = clamp(y, er, CONFIG.WORLD_H - er);
    if (!useCol || !worldCircleBlockedByArena(x, y, er)) return { x, y };
  }
  const R = Math.hypot(halfW, halfH) + 80 + Math.random() * 60;
  const a = Math.random() * Math.PI * 2;
  const x = clamp(px + Math.cos(a) * R, er, CONFIG.WORLD_W - er);
  const y = clamp(py + Math.sin(a) * R, er, CONFIG.WORLD_H - er);
  return { x, y };
}

/** Slide along walls: try full move, then X-only, then Y-only. */
function applyArenaCollisionSlide(x, y, nx, ny, radius) {
  if (!isArenaCollisionReady() || CONFIG.ARENA_COLLISION_ENABLED === false) {
    return { x: nx, y: ny };
  }
  if (!worldCircleBlockedByArena(nx, ny, radius)) return { x: nx, y: ny };
  if (!worldCircleBlockedByArena(nx, y, radius)) return { x: nx, y };
  if (!worldCircleBlockedByArena(x, ny, radius)) return { x, y: ny };
  return { x, y };
}

/** Enemy-only slide: respects COLLISION_BLOCKS_ENEMIES. */
function applyArenaCollisionSlideEnemy(x, y, nx, ny, radius) {
  if (CONFIG.COLLISION_BLOCKS_ENEMIES === false) return { x: nx, y: ny };
  return applyArenaCollisionSlide(x, y, nx, ny, radius);
}

/**
 * Unified enemy hit circle used by *all* weapons (prevents “visible hits don’t register”).
 * Keeps ENEMY_TYPES.radius as a baseline but expands it to better match sprite footprint.
 */
function enemyHitCircle(e) {
  const def = ENEMY_TYPES[e.typeId];
  const baseR = def?.radius ?? 10;
  const isBoss = def?.isBoss || e.isBoss;
  const small = baseR <= 12;
  const rMult = isBoss ? 1.75 : small ? 1.55 : 1.28;
  const yOff = isBoss ? Math.min(24, baseR * 0.22) : small ? Math.min(10, baseR * 0.12) : Math.min(14, baseR * 0.15);
  return { x: e.x, y: e.y - yOff, r: baseR * rMult };
}

function nearestBossWithinRadius(enemies, px, py, radius) {
  const R = typeof radius === "number" ? radius : 0;
  if (!Array.isArray(enemies) || enemies.length === 0) return null;
  if (R <= 0) return null;
  let best = null;
  let bestD = R;
  for (const e of enemies) {
    if (!e || (e.hp ?? 0) <= 0) continue;
    const def = ENEMY_TYPES[e.typeId];
    if (!(def?.isBoss || e.isBoss)) continue;
    const hc = enemyHitCircle(e);
    const d = dist(px, py, hc.x, hc.y) - hc.r;
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Radians to add to “angle to player” when testing wall avoidance (skirt clockwise/counterclockwise).
 */
const ENEMY_AVOID_ANGLE_OFFSETS = [
  0, 0.48, -0.48, 0.95, -0.95, 1.45, -1.45, 1.95, -1.95, 2.5, -2.5,
];

/** Small fan around ±90° from “to player” — both ways each frame so we don’t lock onto matching player Y. */
function buildDetourAngleOffsets() {
  /** @type {number[]} */
  const o = [];
  for (const s of [1, -1]) {
    const tb = s * (Math.PI / 2);
    for (const k of [0, 0.22, -0.22, 0.48, -0.48, 0.78, -0.78, 1.12, -1.12, 1.45, -1.45, 1.85, -1.85]) {
      o.push(tb + k);
    }
  }
  for (const k of ENEMY_AVOID_ANGLE_OFFSETS) o.push(k);
  return o;
}

const ENEMY_DETOUR_OFFSETS = buildDetourAngleOffsets();

/** Build offset-from-baseAng list covering a full circle (for hard stuck). */
function buildFullCircleOffsets(baseAng, stuckLevel) {
  /** @type {number[]} */
  const o = [];
  const n = 36;
  const jitter = stuckLevel >= 3 ? () => randRange(-0.28, 0.28) : () => 0;
  for (let k = 0; k < n; k++) {
    const worldA = (k / n) * Math.PI * 2 + jitter();
    let off = worldA - baseAng;
    if (off > Math.PI) off -= Math.PI * 2;
    if (off < -Math.PI) off += Math.PI * 2;
    o.push(off);
  }
  return o;
}

/**
 * If trapped in a real dead-end pocket, hop to the nearest walkable ring cell (no pathfinding).
 */
function tryEnemyUnstuckTeleport(e, radius) {
  if (CONFIG.COLLISION_BLOCKS_ENEMIES === false) return false;
  if (!isArenaCollisionReady() || CONFIG.ARENA_COLLISION_ENABLED === false) return false;
  // Be more willing to pop enemies out of true pockets.
  if ((e._stuckLevel ?? 0) < 4) return false;
  const ex = e.x;
  const ey = e.y;
  const rProbe = radius * 0.92;
  for (const R of [18, 28, 40, 52, 68, 88, 110, 140, 175]) {
    const steps = Math.max(16, Math.min(48, Math.ceil(R / 6)));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2 + (e.animPhase ?? 0);
      let tx = ex + Math.cos(a) * R;
      let ty = ey + Math.sin(a) * R;
      tx = clamp(tx, radius, CONFIG.WORLD_W - radius);
      ty = clamp(ty, radius, CONFIG.WORLD_H - radius);
      if (!worldCircleBlockedByArena(tx, ty, rProbe)) {
        e.x = tx;
        e.y = ty;
        e._stuckLevel = 0;
        e._stuckMoveT = 0;
        e._stuckAx = e.x;
        e._stuckAy = e.y;
        e._stuckAnchorT = 0;
        return true;
      }
    }
  }
  return false;
}

/**
 * Chase the player but pick a heading that actually moves and closes distance.
 * When “straight at player” barely works (wall in the way), heavily weight movement
 * perpendicular to that line so units go *around* obstacles instead of grinding vertical slides.
 * Escalates: anchor drift → full circle → jitter → emergency teleport out of pockets.
 */
function moveEnemyChasePlayer(e, px, py, sp, dt, radius, useAvoidance) {
  const ex = e.x;
  const ey = e.y;
  const d0 = dist(ex, ey, px, py);
  const baseAng = d0 < 1e-4 ? Math.random() * Math.PI * 2 : angle(ex, ey, px, py);
  const step = sp * dt;

  if (!useAvoidance) {
    const nx = ex + Math.cos(baseAng) * step;
    const ny = ey + Math.sin(baseAng) * step;
    const moved = applyArenaCollisionSlideEnemy(ex, ey, nx, ny, radius);
    e.x = moved.x;
    e.y = moved.y;
    return;
  }

  if (tryEnemyUnstuckTeleport(e, radius)) return;

  const prevBest = e._chaseBestDist ?? d0;
  if (d0 < prevBest - 4) e._stuckLevel = 0;
  e._chaseBestDist = Math.min(prevBest, d0);

  const nxDirect = ex + Math.cos(baseAng) * step;
  const nyDirect = ey + Math.sin(baseAng) * step;
  const mDirect = applyArenaCollisionSlideEnemy(ex, ey, nxDirect, nyDirect, radius);
  const movedDirect = dist(ex, ey, mDirect.x, mDirect.y);
  const dAfterDirect = dist(mDirect.x, mDirect.y, px, py);
  const directGain = d0 - dAfterDirect;

  // If we're barely moving for a while, escalate stuck level faster (corners/pockets).
  e._stuckMoveT = (e._stuckMoveT ?? 0) + (movedDirect < Math.max(0.6, step * 0.08) ? dt : -dt * 1.25);
  e._stuckMoveT = Math.max(0, Math.min(2.5, e._stuckMoveT));
  if (e._stuckMoveT > 0.75) {
    e._stuckMoveT = 0.35;
    e._stuckLevel = Math.min(16, (e._stuckLevel ?? 0) + 1);
  }

  const needDetour =
    movedDirect < step * 0.26 ||
    directGain < Math.max(0.55, step * 0.38);

  const sl = e._stuckLevel ?? 0;
  // Detour memory: avoid left/right flip-flop around thin obstacles.
  // +1 => prefer clockwise offsets, -1 => prefer counter-clockwise.
  let detourSign = Number.isFinite(e._detourSign) ? e._detourSign : 0;
  let detourT = Number.isFinite(e._detourT) ? e._detourT : 0;
  detourT = Math.max(0, detourT - dt);
  if (!needDetour) {
    // Release detour once direct path is working again.
    detourSign = 0;
    detourT = 0;
  }

  /** @type {number[]} */
  let offsets;
  if (sl >= 2) {
    offsets = buildFullCircleOffsets(baseAng, sl);
    for (const k of ENEMY_DETOUR_OFFSETS) offsets.push(k);
  } else {
    offsets = needDetour ? ENEMY_DETOUR_OFFSETS : ENEMY_AVOID_ANGLE_OFFSETS;
  }

  // When detouring, decide (or keep) which side has more clearance and bias candidates.
  if (needDetour) {
    const look = Math.max(10, step * 1.9);
    const aCW = baseAng + Math.PI / 2;
    const aCCW = baseAng - Math.PI / 2;
    const cw = applyArenaCollisionSlideEnemy(ex, ey, ex + Math.cos(aCW) * look, ey + Math.sin(aCW) * look, radius);
    const ccw = applyArenaCollisionSlideEnemy(ex, ey, ex + Math.cos(aCCW) * look, ey + Math.sin(aCCW) * look, radius);
    const cwMoved = dist(ex, ey, cw.x, cw.y);
    const ccwMoved = dist(ex, ey, ccw.x, ccw.y);
    if (detourSign === 0) {
      detourSign = cwMoved >= ccwMoved ? 1 : -1;
      detourT = 0.65; // commit briefly
    }
    // Bias ordering: preferred side first, then the other.
    if (detourSign !== 0 && Array.isArray(offsets) && offsets.length > 6) {
      const pref = [];
      const other = [];
      for (const off of offsets) {
        // sign of sin(off) indicates which side of baseAng (perp) the candidate lies on.
        const side = Math.sign(Math.sin(off));
        if (side === 0) pref.push(off);
        else if (side === detourSign) pref.push(off);
        else other.push(off);
      }
      offsets = pref.concat(other);
    }
    e._detourSign = detourSign;
    e._detourT = detourT;
  } else {
    e._detourSign = 0;
    e._detourT = 0;
  }

  let bestX = ex;
  let bestY = ey;
  let bestScore = -Infinity;
  let bestMoved = 0;

  for (const off of offsets) {
    const a = baseAng + off;
    const nx = ex + Math.cos(a) * step;
    const ny = ey + Math.sin(a) * step;
    const m = applyArenaCollisionSlideEnemy(ex, ey, nx, ny, radius);
    const moved = dist(ex, ey, m.x, m.y);
    const newD = dist(m.x, m.y, px, py);
    const rel = a - baseAng;
    const perpW = 1 - Math.abs(Math.cos(rel));
    // Lookahead: prefer candidates that don't immediately run into walls.
    const look1 = step * 1.25;
    const look2 = step * 2.25;
    const lx1 = ex + Math.cos(a) * look1;
    const ly1 = ey + Math.sin(a) * look1;
    const lx2 = ex + Math.cos(a) * look2;
    const ly2 = ey + Math.sin(a) * look2;
    const b1 = isArenaCollisionReady() && CONFIG.ARENA_COLLISION_ENABLED !== false && CONFIG.COLLISION_BLOCKS_ENEMIES !== false
      ? worldCircleBlockedByArena(lx1, ly1, radius)
      : false;
    const b2 = isArenaCollisionReady() && CONFIG.ARENA_COLLISION_ENABLED !== false && CONFIG.COLLISION_BLOCKS_ENEMIES !== false
      ? worldCircleBlockedByArena(lx2, ly2, radius)
      : false;
    const clearBonus = (b1 ? -6.5 : 1.8) + (b2 ? -8.5 : 2.2);
    let score;
    if (needDetour || sl >= 2) {
      score =
        (d0 - newD) * 2.6 +
        moved * 4.2 +
        perpW * 8.5 +
        Math.min(moved / (step + 1e-6), 1) * 1.5 +
        clearBonus;
    } else {
      score = (d0 - newD) * 4.8 + moved * 2.4 + clearBonus * 0.45;
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = m.x;
      bestY = m.y;
      bestMoved = moved;
    }
  }

  if (bestMoved < step * 0.14) {
    for (const off of offsets) {
      const a = baseAng + off;
      const nx = ex + Math.cos(a) * step;
      const ny = ey + Math.sin(a) * step;
      const m = applyArenaCollisionSlideEnemy(ex, ey, nx, ny, radius);
      const moved = dist(ex, ey, m.x, m.y);
      if (moved > bestMoved) {
        bestMoved = moved;
        bestX = m.x;
        bestY = m.y;
      }
    }
  }

  const travel = dist(ex, ey, bestX, bestY);
  if (travel > step * 0.55) e._stuckLevel = Math.max(0, (e._stuckLevel ?? 0) - 1);

  e.x = bestX;
  e.y = bestY;

  e._stuckAnchorT = (e._stuckAnchorT ?? 0) + dt;
  if (e._stuckAnchorT >= 1.15) {
    const ax = e._stuckAx ?? e.x;
    const ay = e._stuckAy ?? e.y;
    const drift = dist(e.x, e.y, ax, ay);
    if (drift < 11) {
      e._stuckLevel = Math.min(16, (e._stuckLevel ?? 0) + 1);
    }
    e._stuckAx = e.x;
    e._stuckAy = e.y;
    e._stuckAnchorT = 0;
  }
}

const SFX_ENEMY_HIT_SRC = "assets/Hit.ogg";
const SFX_ENEMY_DEATH_SRC = "assets/Death.ogg";
const SFX_XP_PICKUP_SRC = "assets/XP-pickup.ogg";
const SFX_LEVEL_UP_SRC = "assets/Level-up.ogg";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.mode = "playing";
    this.time = 0;
    this.spawnTimer = 0;
    this.camX = 0;
    this.camY = 0;
    this.camTargetX = 0;
    this.camTargetY = 0;
    this.shake = 0;
    this.pendingUpgrades = [];
    this.levelUpsPending = 0;
    this.animTick = 0;
    this.playerFacingRight = true;
    this.playerWalkKind = "down";
    this.playerWalkFrame = 0;
    this.playerHitTimer = 0;
    this.playerMoving = false;
    this.endedByQuit = false;
    this.playerFacingVec = { x: 1, y: 0 };
    this.whipCd = 0;
    this.whipSwings = [];
    /** Hide held whip briefly after a sweep to avoid flicker / double-whip reads. */
    this.whipHeldHideT = 0;
    this.bossPulses = [];
    /** Arcane Sentinel homing bolts (separate from player `projectiles`). */
    this.bossArcaneProjs = [];
    this.nextBossArcaneProjId = 1;
    this.bossIntroT = 0;
    this.bossIntroLine = "";
    this.bossIntroTheme = "";
    this.bossMilestones = { boss1: false, boss2: false };
    // Archer secondary weapon: Toxic Grenade (runs alongside bow).
    this.toxicGrenadeCd = 0;
    this.toxicGrenades = [];
    this.toxicExplosions = [];
    this.toxicClouds = [];
    this.toxicCloudTickCd = 0;
    // Revenant class special: Soul Push (cooldown lives on each player).
    this.soulPullCd = 0;
    this.magnetT = 0;
    this.pickups = [];
    // Soft limiter to prevent pickup streaks/clumps at high kill rates.
    this.pickupDropGlobalCd = 0;
    this.pickupDropHeartCd = 0;
    this.pickupDropMagnetCd = 0;
    this.daggerCd = 0;
    this.daggers = [];
    // Universal weapon: Throwing Axe
    this.throwingAxeCd = 0;
    this.throwingAxes = [];
    // Universal weapon: Boomerang
    this.boomerangCd = 0;
    this.boomerangs = [];
    // Universal weapon: Lightning Strike
    this.lightningCd = 0;
    this.lightningStrikes = [];
    // Mage-exclusive weapon: Arcane Runes (outer orbit ring).
    this.arcaneRunes = [];
    this.arcaneRuneOrbitPhase = 0;
    /** Local multiplayer players (player 1 is this.player alias). */
    this.players = [];
    this.characterIds =
      typeof window !== "undefined" && Array.isArray(window.selectedCharacters)
        ? window.selectedCharacters
        : [
            typeof window !== "undefined" && typeof window.selectedCharacter === "string"
              ? window.selectedCharacter
              : "mage",
          ];
    this.characterId = this.characterIds[0] ?? "mage";
    /** @type {HTMLAudioElement[] | null} */
    this._sfxHitPool = null;
    /** @type {HTMLAudioElement[] | null} */
    this._sfxDeathPool = null;
    this._sfxHitPoolIx = 0;
    this._sfxDeathPoolIx = 0;
    this._sfxHitGlobalT = -999;
    /** @type {HTMLAudioElement[] | null} */
    this._sfxXpPool = null;
    this._sfxXpPoolIx = 0;
    /** @type {HTMLAudioElement[] | null} */
    this._sfxLevelUpPool = null;
    this._sfxLevelUpPoolIx = 0;
    /** `'solo'` | `'host'` | `'client'` — online guests apply snapshots only. */
    this.netMode = "solo";
    /** Online client: last replicated camera targets from snapshots (smoothly approached each frame). */
    this.netReplayCamX = NaN;
    this.netReplayCamY = NaN;
    /** Online client prediction/reconciliation: latest server position for local seat. */
    this.netLocalServerX = NaN;
    this.netLocalServerY = NaN;
    /** Online client interpolation: per-seat position buffers (remote seats only). */
    this.netRemotePosBuf = [[], [], [], []];
    this.netRemotePosPtr = [0, 0, 0, 0];
    /** Online host: snapshot-embedded events (damage feedback / ability VFX). */
    this._netQueueEvent = null;
    this._netPendingEvents = [];
    /** Online client: enemy HP cache for damage events. */
    this._netEnemyById = null;
    this._netLastEnemyHp = null;
    this._netLastEnemyDmgAt = null;
    /** Seat indices controlled by keyboards on THIS machine (solo 0..n-1, host [0], client [mySeat]). */
    this._jamLocalSeats = [0];
    /** @type {{ key: string; t: number }} */
    this._jamPortalAccum = { key: "", t: 0 };
    /** @type {null | { kind: string; label: string; x: number; y: number; r: number }} */
    this.vibeJamExit = null;
    /** @type {null | { kind: string; label: string; x: number; y: number; r: number }} */
    this.vibeJamReturn = null;
    /** @type {{ active: boolean; line1: string; line2: string; progress: number } | null} */
    this.jamPortalHud = null;
    this.reset();
  }

  reset() {
    this.mode = "playing";
    this.endedByQuit = false;
    this.time = 0;
    this.spawnTimer = 0;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = this.computeXpToNext();
    const idsRaw = Array.isArray(this.characterIds) ? this.characterIds : [this.characterId ?? "mage"];
    const pcRaw =
      typeof window !== "undefined" && Number.isFinite(window.localPlayerCount)
        ? window.localPlayerCount
        : 1;
    const playerCount = Math.max(1, Math.min(4, Math.floor(pcRaw)));
    const baseMaxHp = CONFIG.PLAYER_MAX_HP;
    const cx = CONFIG.WORLD_W / 2;
    const cy = CONFIG.WORLD_H / 2;
    const spread = 34;
    this.players = [];
    for (let i = 0; i < playerCount; i++) {
      const ox = (i % 2 === 0 ? -1 : 1) * (i >= 2 ? spread : spread * 0.5);
      const oy = (i < 2 ? -1 : 1) * spread * 0.5;
      const st = createBaseStats();
      const cid = typeof idsRaw[i] === "string" && idsRaw[i] ? idsRaw[i] : (idsRaw[0] ?? "mage");
      st.characterId = cid;
      this.players.push({
        characterId: cid,
        x: cx + ox,
        y: cy + oy,
        hp: baseMaxHp,
        maxHp: baseMaxHp,
        attackCd: randRange(0, 0.2),
        hitTimer: 0,
        attackTimer: 0,
        facingRight: true,
        walkKind: "down",
        walkFrame: 0,
        moving: false,
        facingVec: { x: 1, y: 0 },
        walkAccumUp: 0,
        walkAccumDown: 0,
        walkAccumSide: 0,
        bloodRageT: 0,
        bloodRageCd: CONFIG.BERSERKER_BLOOD_RAGE_PERIOD ?? 5.0,
        stats: st,
        // Per-player weapon cooldown/state (so builds can diverge).
        daggerCd: randRange(0.1, 0.25),
        throwingAxeCd: randRange(0.2, 0.6),
        boomerangCd: randRange(0.2, 0.6),
        lightningCd: randRange(0.3, 0.9),
        whipCd: 0.15,
        whipSwings: [],
        whipHeldHideT: 0,
        hammers: [],
        hammerOrbitPhase: 0,
        arcaneRunes: [],
        arcaneRuneOrbitPhase: 0,
        toxicGrenadeCd: randRange(0.2, 0.8),
        groundSlamCd: 0,
        groundSlamSecondT: 0,
        soulPullCd: randRange(0.6, 1.4),
      });
    }
    // Back-compat alias: many systems still reference this.player (player 1).
    this.player = this.players[0];
    // Legacy: keep this.stats pointing at player 1 while migrating weapons.
    this.stats = this.player.stats;
    this.upgradePlayerIndex = 0;
    this.enemies = [];
    this.nextEnemyId = 1;
    this.projectiles = [];
    this.xpOrbs = [];
    this.particles = [];
    this.floatTexts = [];
    this._netPendingEvents = [];
    this._netEnemyById = null;
    this._netLastEnemyHp = null;
    this._netLastEnemyDmgAt = null;
    this.camX = this.player.x - viewWorldW() / 2;
    this.camY = this.player.y - viewWorldH() / 2;
    this.camTargetX = this.camX;
    this.camTargetY = this.camY;
    this.shake = 0;
    this.pendingUpgrades = [];
    this.levelUpsPending = 0;
    this.animTick = 0;
    // Legacy single-player draw state mirrors player 1 (used by UI/animations in a few places).
    this.playerFacingRight = true;
    this.playerWalkKind = "down";
    this.playerWalkFrame = 0;
    this.playerHitTimer = 0;
    this.playerMoving = false;
    this.walkAccumUp = 0;
    this.walkAccumDown = 0;
    this.walkAccumSide = 0;
    this.hammers = [];
    /** Shared rotation; each hammer uses phase + i/n * 2π so spacing stays even when count changes. */
    this.hammerOrbitPhase = 0;
    this.playerFacingVec = { x: 1, y: 0 };
    this.whipCd = 0.15;
    this.whipSwings = [];
    this.whipHeldHideT = 0;
    this.slashes = [];
    this.playerAttackTimer = 0;
    this.soulRipImpactDone = false;
    this.soulRipProjectiles = [];
    this.bloodRageT = 0;
    this.bloodRageCd = CONFIG.BERSERKER_BLOOD_RAGE_PERIOD ?? 5.0;
    this.groundSlamCd = 0;
    this.groundSlams = [];
    this.groundSlamSecondT = 0;
    this.toxicGrenadeCd = randRange(0.2, 0.8);
    this.toxicGrenades = [];
    this.toxicExplosions = [];
    this.toxicClouds = [];
    this.toxicCloudTickCd = CONFIG.ARCHER_TOXIC_CLOUD_TICK_INTERVAL ?? 0.5;
    this.soulPullCd = randRange(0.6, 1.4);
    this.magnetT = 0;
    this.pickups = [];
    this.pickupDropGlobalCd = 0;
    this.pickupDropHeartCd = 0;
    this.pickupDropMagnetCd = 0;
    this.daggerCd = randRange(0.1, 0.25);
    this.daggers = [];
    this.throwingAxeCd = randRange(0.2, 0.6);
    this.throwingAxes = [];
    this.boomerangCd = randRange(0.2, 0.6);
    this.boomerangs = [];
    this.lightningCd = randRange(0.3, 0.9);
    this.lightningStrikes = [];
    this.arcaneRunes = [];
    this.arcaneRuneOrbitPhase = 0;
    this.syncHammers();
    this.bossPulses = [];
    this.bossArcaneProjs = [];
    this.nextBossArcaneProjId = 1;
    this.bossIntroT = 0;
    this.bossIntroLine = "";
    this.bossIntroTheme = "";
    this.bossMilestones = { boss1: false, boss2: false };

    // Per-player character loadouts (HP + starting weapons).
    for (const pl of this.players ?? []) {
      const cid = pl.characterId ?? pl.stats?.characterId ?? "mage";
      const st = pl.stats ?? this.stats;
      if (cid === "berserker") {
        const mh = CONFIG.BERSERKER_MAX_HP ?? 140;
        pl.maxHp = mh;
        pl.hp = mh;
        st.projectileCount = 0;
      } else if (cid === "archer") {
        const mh = CONFIG.ARCHER_MAX_HP ?? 95;
        pl.maxHp = mh;
        pl.hp = mh;
        // keep projectileCount (bow) from base stats
      } else if (cid === "revenant") {
        const mh = CONFIG.REVENANT_MAX_HP ?? 110;
        pl.maxHp = mh;
        pl.hp = mh;
        st.projectileCount = 0;
      } else {
        const mh = CONFIG.MAGE_MAX_HP ?? 100;
        pl.maxHp = mh;
        pl.hp = mh;
      }
      sanitizePlayerStats(pl.stats);
      sanitizePlayerEntity(pl);
    }
    this.refreshVibeJamPortalLayout();
    this._jamPortalAccum = { key: "", t: 0 };
    this.jamPortalHud = null;
  }

  refreshVibeJamPortalLayout() {
    this.vibeJamExit = computeExitPortal(CONFIG.WORLD_W ?? 2400, CONFIG.WORLD_H ?? 2400);
    this.vibeJamReturn = hasJamReturnTarget()
      ? computeReturnPortal(CONFIG.WORLD_W ?? 2400, CONFIG.WORLD_H ?? 2400)
      : null;
  }

  /**
   * Hold interact (seat-local key) inside ring to navigate webring.
   * @param {number} dt
   */
  updateVibeJamPortals(dt) {
    this.jamPortalHud = null;
    if (this.mode !== "playing") return;

    /** @type {{ kind: string; label: string; x: number; y: number; r: number }[]} */
    const portals = [];
    if (this.vibeJamReturn) portals.push(this.vibeJamReturn);
    if (this.vibeJamExit) portals.push(this.vibeJamExit);
    if (portals.length === 0) return;

    const mult =
      typeof CONFIG.COLLISION_PLAYER_RADIUS_MULT === "number"
        ? CONFIG.COLLISION_PLAYER_RADIUS_MULT
        : 1;
    const pr = CONFIG.PLAYER_RADIUS * mult;
    const reachPad = 12;

    const locals = Array.isArray(this._jamLocalSeats) ? this._jamLocalSeats : [0];
    /** @type {{ portal: object; seat: number; d: number } | null} */
    let overlap = null;
    for (const seat of locals) {
      const p = this.players?.[seat];
      if (!p || (p.hp ?? 0) <= 0) continue;
      for (const portal of portals) {
        const d = dist(p.x, p.y, portal.x, portal.y);
        if (d > portal.r + pr + reachPad) continue;
        if (!overlap || d < overlap.d) overlap = { portal, seat, d };
      }
    }

    if (!overlap) {
      this._jamPortalAccum = { key: "", t: 0 };
      return;
    }

    const { portal, seat } = overlap;
    const key = `${portal.kind}:${seat}`;
    const held = interactHeldForSeat(seat);
    const hint = interactKeyHintForSeat(seat);
    const line1 =
      portal.kind === "return" ? "Return Portal — go back with continuity" : "Vibe Jam Portal — exit to hub";
    const line2 = `Hold [${hint}] 1s — ${portal.kind === "return" ? "previous game" : "vibejam.cc hub"}`;

    if (!held) {
      this._jamPortalAccum = { key: "", t: 0 };
      this.jamPortalHud = { active: true, line1, line2, progress: 0 };
      return;
    }

    if (this._jamPortalAccum.key !== key) this._jamPortalAccum = { key, t: 0 };
    this._jamPortalAccum.t += dt;
    const prog = Math.min(1, this._jamPortalAccum.t / 1);
    this.jamPortalHud = { active: true, line1, line2, progress: prog };

    if (this._jamPortalAccum.t < 1) return;

    const p = this.players?.[seat];
    const un =
      typeof window !== "undefined" && window.__jamPortalUsername != null && String(window.__jamPortalUsername)
        ? String(window.__jamPortalUsername).slice(0, 64)
        : "ShadowArenaPlayer";
    const color =
      typeof window !== "undefined" && window.__jamPortalColor
        ? String(window.__jamPortalColor).slice(0, 32)
        : "purple";

    if (portal.kind === "exit") {
      const hpPct =
        p && (p.maxHp ?? 0) > 0
          ? Math.max(1, Math.min(100, Math.round(((p.hp ?? 0) / p.maxHp) * 100)))
          : undefined;
      const spd = p ? this.getMoveSpeed(p) / 88 : undefined;
      /** @type {Record<string, string | number>} */
      const extra = {};
      if (hpPct != null) extra.hp = hpPct;
      if (spd != null && Number.isFinite(spd)) extra.speed = Number(spd.toFixed(2));
      redirectToVibeJamHub(un, color, extra);
      return;
    }
    if (portal.kind === "return") {
      redirectJamReturn();
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  drawVibeJamPortals(ctx) {
    if (this.mode !== "playing") return;
    const z = CONFIG.VIEW_WORLD_SCALE ?? 1;

    /** @param {object} portal */
    const drawOne = (portal, hueA, hueB) => {
      const sp = this.worldToScreen(portal.x, portal.y);
      const rPx = Math.max(20, portal.r / z);
      const pulse = 0.55 + 0.45 * Math.sin(this.animTick * 3.1);
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.25 * pulse;
      const rg = ctx.createRadialGradient(sp.x, sp.y, rPx * 0.08, sp.x, sp.y, rPx * 1.08);
      rg.addColorStop(0, hueA);
      rg.addColorStop(0.62, hueB);
      rg.addColorStop(1, "rgba(40,30,120,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle =
        portal.kind === "return" ? "rgba(140,214,255,0.95)" : "rgba(212,164,255,0.96)";
      ctx.lineWidth = 3 + pulse * 2;
      ctx.shadowColor = hueB;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, rPx * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(226,236,255,0.95)";
      ctx.font = "bold 13px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(portal.label, sp.x, sp.y - rPx - 14);
      ctx.restore();
    };

    if (this.vibeJamReturn) drawOne(this.vibeJamReturn, "rgba(120,220,255,0.5)", "rgba(80,180,255,0.22)");
    if (this.vibeJamExit) drawOne(this.vibeJamExit, "rgba(180,120,255,0.55)", "rgba(120,70,230,0.28)");
  }

  alivePlayers() {
    return Array.isArray(this.players) ? this.players.filter((p) => (p?.hp ?? 0) > 0) : [];
  }

  teamCenterAlive() {
    const alive = this.alivePlayers();
    if (alive.length === 0) return { x: this.player?.x ?? CONFIG.WORLD_W / 2, y: this.player?.y ?? CONFIG.WORLD_H / 2 };
    let sx = 0;
    let sy = 0;
    for (const p of alive) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / alive.length, y: sy / alive.length };
  }

  nearestAlivePlayer(x, y) {
    const alive = this.alivePlayers();
    if (alive.length === 0) return null;
    let best = alive[0];
    let bestD = Infinity;
    for (const p of alive) {
      const d = dist(x, y, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Party size clamped for co-op tuning (solo = 1). */
  getCoopPlayerCount() {
    return Math.max(1, Math.min(4, (this.players ?? []).length || 1));
  }

  /** Multiplies incoming spawn-rate curve (solo = 1). */
  getCoopSpawnIntensityMult() {
    const n = this.getCoopPlayerCount();
    const per = CONFIG.COOP_SPAWN_INTENSITY_PER_EXTRA_PLAYER ?? 0;
    return Math.max(1, 1 + (n - 1) * Math.max(0, per));
  }

  /** Multiplies enemy baseline HP after time scaling (solo = 1). */
  getCoopEnemyHpMult() {
    const n = this.getCoopPlayerCount();
    const per = CONFIG.COOP_ENEMY_HP_MULT_PER_EXTRA_PLAYER ?? 0;
    return Math.max(1, 1 + (n - 1) * Math.max(0, per));
  }

  /** Revenant: up to `want` foes within Soul Rip radius, nearest first; pads with clone of nearest for multi-shot. */
  soulRipCastTargets(player, want) {
    const n = Math.max(1, Math.floor(want ?? 1));
    const maxD = CONFIG.SOUL_RIP_RANGE ?? CONFIG.ATTACK_RANGE;
    const bossR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    const boss = nearestBossWithinRadius(this.enemies, player.x, player.y, bossR);
    const scored = [];
    /** @type {Set<number|string>} */
    const seen = new Set();
    const pushIf = (e) => {
      if (!e || (e.hp ?? 0) <= 0 || seen.has(e.id)) return;
      const hc = enemyHitCircle(e);
      const d = dist(player.x, player.y, hc.x, hc.y) - hc.r;
      if (d < maxD) {
        seen.add(e.id);
        scored.push({ e, d });
      }
    };
    if (boss) pushIf(boss);
    for (const e of this.enemies) pushIf(e);
    scored.sort((a, b) => a.d - b.d);
    const uniq = scored.map((s) => s.e);
    const out = [];
    for (let i = 0; i < n; i++) out.push(uniq[i] ?? uniq[0] ?? null);
    return out;
  }

  getSlashCooldown(player = this.player) {
    const base = CONFIG.BERSERKER_SLASH_COOLDOWN ?? 0.42;
    let cd = base * (this.stats.slashCooldownMult ?? 1);
    if ((player?.characterId ?? player?.stats?.characterId) === "berserker" && (player?.bloodRageT ?? 0) > 0) {
      const spd = CONFIG.BERSERKER_BLOOD_RAGE_ATTACK_SPEED_MULT ?? 1.3;
      if (spd > 1e-3) cd /= spd;
    }
    return cd;
  }

  getSlashDamage(player = this.player) {
    const base = CONFIG.BERSERKER_SLASH_DAMAGE ?? 26;
    let dmg = base * (this.stats.slashDamageMult ?? 1);
    if ((player?.characterId ?? player?.stats?.characterId) === "berserker" && (player?.bloodRageT ?? 0) > 0) {
      dmg *= CONFIG.BERSERKER_BLOOD_RAGE_DAMAGE_MULT ?? 1.5;
    }
    return dmg;
  }

  /**
   * Nearest enemy whose center is within berserker slash reach (so kiting still hits behind you).
   */
  nearestEnemyForBerserkerSlash(player = this.player) {
    const range =
      (CONFIG.BERSERKER_SLASH_RANGE ?? 110) * (this.stats.slashRangeMult ?? 1);
    let best = null;
    let bestD = Infinity;
    const px = player.x;
    const py = player.y;
    const bossR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    const boss = nearestBossWithinRadius(this.enemies, px, py, bossR);
    if (boss) return boss;
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      const d = dist(px, py, hc.x, hc.y) - hc.r;
      if (d > range + 4) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  spawnSlash(baseAng, player = this.player) {
    const life = CONFIG.BERSERKER_SLASH_LIFETIME ?? 0.2;
    const range =
      (CONFIG.BERSERKER_SLASH_RANGE ?? 110) * (this.stats.slashRangeMult ?? 1);
    const arc =
      (CONFIG.BERSERKER_SLASH_ARC ?? 1.55) * (this.stats.slashArcMult ?? 1);
    const dmg = this.getSlashDamage(player);
    const nx = Math.cos(baseAng);
    const ny = Math.sin(baseAng);
    const fwd = CONFIG.BERSERKER_SLASH_FORWARD_OFFSET ?? 34;
    const normalOff = CONFIG.BERSERKER_SLASH_NORMAL_OFFSET ?? 0;
    const upOff = CONFIG.BERSERKER_SLASH_UP_OFFSET ?? 0;
    const px = player.x;
    const py = player.y;
    // Perp points to the "left" of the aim direction. Flip it when aiming left so the offset stays
    // consistent in screen space (prevents left-aim from inverting vertical placement).
    const perpSign = Math.cos(baseAng) < 0 ? -1 : 1;
    const sx = px + nx * fwd + (-ny) * normalOff * perpSign;
    const sy = py + ny * fwd + nx * normalOff * perpSign + upOff;
    this.slashes.push({
      x: sx,
      y: sy,
      ang: baseAng,
      facingRight: nx >= 0,
      arc,
      range,
      dmg,
      life,
      maxLife: life,
      dbg: { fwd, normalOff, upOff, nx, ny, perpSign },
    });
    this.applySlashDamageOnce({
      x: sx,
      y: sy,
      ang: baseAng,
      arc,
      range,
      dmg,
    });
    player.attackTimer = Math.max(
      player.attackTimer ?? 0,
      CONFIG.BERSERKER_ATTACK_ANIM_DURATION ?? 0.3
    );
    this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.12);
  }

  updateSlashes(dt) {
    if (!Array.isArray(this.slashes) || this.slashes.length === 0) return;
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.slashes.splice(i, 1);
      }
    }
  }

  _ensureEnemySfxPools() {
    if (!this._sfxHitPool) {
      this._sfxHitPool = Array.from({ length: 8 }, () => {
        const a = new Audio(SFX_ENEMY_HIT_SRC);
        a.preload = "auto";
        a.volume = 0.55;
        return a;
      });
      this._sfxHitPoolIx = 0;
    }
    if (!this._sfxDeathPool) {
      this._sfxDeathPool = Array.from({ length: 4 }, () => {
        const a = new Audio(SFX_ENEMY_DEATH_SRC);
        a.preload = "auto";
        a.volume = 0.65;
        return a;
      });
      this._sfxDeathPoolIx = 0;
    }
  }

  tryPlayEnemyHitSfx(e) {
    const g = Math.max(0, Math.min(1, Number(loadAudioSettings().sfxVolume ?? 1)));
    if (g <= 0.0001) return;
    if (!e) return;
    const t = this.time ?? 0;
    e._sfxHitT = e._sfxHitT ?? -999;
    if (t - e._sfxHitT < 0.055) return;
    if (t - (this._sfxHitGlobalT ?? -999) < 0.02) return;
    e._sfxHitT = t;
    this._sfxHitGlobalT = t;
    this._ensureEnemySfxPools();
    const pool = this._sfxHitPool;
    if (!pool || pool.length === 0) return;
    const a = pool[this._sfxHitPoolIx++ % pool.length];
    try {
      a.volume = 0.55 * g;
      a.currentTime = 0;
      void a.play();
    } catch {
      // ignore (autoplay / decode)
    }
  }

  playEnemyDeathSfx() {
    const g = Math.max(0, Math.min(1, Number(loadAudioSettings().sfxVolume ?? 1)));
    if (g <= 0.0001) return;
    this._ensureEnemySfxPools();
    const pool = this._sfxDeathPool;
    if (!pool || pool.length === 0) return;
    const a = pool[this._sfxDeathPoolIx++ % pool.length];
    try {
      a.volume = 0.65 * g;
      a.currentTime = 0;
      void a.play();
    } catch {
      // ignore
    }
  }

  _ensureMiscSfxPools() {
    if (!this._sfxXpPool) {
      this._sfxXpPool = Array.from({ length: 6 }, () => {
        const a = new Audio(SFX_XP_PICKUP_SRC);
        a.preload = "auto";
        a.volume = 0.48;
        return a;
      });
      this._sfxXpPoolIx = 0;
    }
    if (!this._sfxLevelUpPool) {
      this._sfxLevelUpPool = Array.from({ length: 2 }, () => {
        const a = new Audio(SFX_LEVEL_UP_SRC);
        a.preload = "auto";
        a.volume = 0.52;
        return a;
      });
      this._sfxLevelUpPoolIx = 0;
    }
  }

  playXpPickupSfx() {
    const g = Math.max(0, Math.min(1, Number(loadAudioSettings().sfxVolume ?? 1)));
    if (g <= 0.0001) return;
    this._ensureMiscSfxPools();
    const pool = this._sfxXpPool;
    if (!pool?.length) return;
    const a = pool[this._sfxXpPoolIx++ % pool.length];
    try {
      a.volume = 0.48 * g;
      a.currentTime = 0;
      void a.play();
    } catch {
      // ignore
    }
  }

  playLevelUpSfx() {
    const g = Math.max(0, Math.min(1, Number(loadAudioSettings().sfxVolume ?? 1)));
    if (g <= 0.0001) return;
    this._ensureMiscSfxPools();
    const pool = this._sfxLevelUpPool;
    if (!pool?.length) return;
    const a = pool[this._sfxLevelUpPoolIx++ % pool.length];
    try {
      a.volume = 0.52 * g;
      a.currentTime = 0;
      void a.play();
    } catch {
      // ignore
    }
  }

  /**
   * Subtract HP from an enemy; on kill routes through killEnemy (death SFX there).
   * @param {{ skipHitSfx?: boolean }} [opts] — set for DoT / poison cloud ticks (no hit tick sounds).
   * @returns {boolean} true if the enemy died and was removed.
   */
  applyEnemyDamage(e, dmg, opts = {}) {
    if (!e || !(dmg > 0)) return false;
    e.hp -= dmg;
    if (e.hp <= 0) {
      this.killEnemy(e);
      return true;
    }
    // Online: queue authoritative damage feedback for remote clients (numbers/VFX are local-only there).
    if (
      this.netMode === "host" &&
      typeof this._netQueueEvent === "function" &&
      typeof e.id === "number" &&
      Number.isFinite(e.x) &&
      Number.isFinite(e.y)
    ) {
      const hpAfter = e.hp;
      const amt = dmg;
      // Minimal dedupe to avoid spamming on rapid DoT ticks.
      e._netLastDmgEvT = e._netLastDmgEvT ?? -999;
      if ((this.time ?? 0) - e._netLastDmgEvT > 0.035) {
        e._netLastDmgEvT = this.time ?? 0;
        this._netQueueEvent({
          type: "damage",
          enemyId: e.id,
          damageAmount: Math.round(amt * 100) / 100,
          enemyHpAfter: hpAfter,
          x: e.x,
          y: e.y,
          t: this.time ?? 0,
        });
      }
    }
    if (!opts.skipHitSfx) this.tryPlayEnemyHitSfx(e);
    return false;
  }

  applySlashDamageOnce(s) {
    const lifesteal = this.stats.lifestealPct ?? 0;
    const halfArc = (s.arc ?? 0) * 0.5;
    const ox = s.x;
    const oy = s.y;
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      const dx = hc.x - ox;
      const dy = hc.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > (s.range ?? 0) + hc.r) continue;
      const a = Math.atan2(dy, dx);
      let da = a - (s.ang ?? 0);
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const extra = d > 1 ? Math.asin(Math.min(1, hc.r / d)) : 0;
      if (Math.abs(da) > halfArc + extra) continue;
      const dmg = s.dmg ?? 0;
      this.applyEnemyDamage(e, dmg);
      e.hitFlash = CONFIG.HIT_FLASH_DURATION;
      this.spawnHitParticles(hc.x, hc.y);
      this.addFloatText(e.x, e.y - (ENEMY_TYPES[e.typeId]?.radius ?? 10) - 4, Math.ceil(dmg).toString(), "#ffb3b3");
      if (lifesteal > 0 && dmg > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + dmg * lifesteal);
      }
    }
  }

  computeXpToNext() {
    const base = CONFIG.XP_LEVEL_BASE ?? 22;
    const exp = CONFIG.XP_LEVEL_EXPONENT ?? 1.3;
    return Math.max(1, Math.floor(base * Math.pow(Math.max(1, this.level), exp)));
  }

  getEffectiveDamage(player = this.player) {
    const st = player?.stats ?? this.stats;
    const base =
      (player?.characterId ?? st.characterId) === "archer"
        ? (CONFIG.BASE_DAMAGE * (CONFIG.ARCHER_DAMAGE_MULT ?? 2))
        : CONFIG.BASE_DAMAGE;
    const dm = clamp(st.damageMult ?? 1, CONFIG.SAFETY_DAMAGE_MULT_MIN ?? 0.05, CONFIG.SAFETY_DAMAGE_MULT_MAX ?? 28);
    return base * dm;
  }

  getAttackCooldown(player = this.player) {
    const st = player?.stats ?? this.stats;
    const base =
      (player?.characterId ?? st.characterId) === "archer"
        ? (CONFIG.ARCHER_BOW_COOLDOWN ?? CONFIG.BASE_ATTACK_COOLDOWN)
        : CONFIG.BASE_ATTACK_COOLDOWN;
    const cm = clamp(
      st.cooldownMult ?? 1,
      CONFIG.SAFETY_COOLDOWN_MULT_MIN ?? 0.12,
      CONFIG.SAFETY_COOLDOWN_MULT_MAX ?? 4.5
    );
    const raw = base * cm;
    return Math.max(CONFIG.SAFETY_MIN_WEAPON_VOLLEY_CD_SEC ?? 0.042, raw);
  }

  getMoveSpeed(player = this.player) {
    const st = player?.stats ?? this.stats;
    const cid = player?.characterId ?? st.characterId;
    const base =
      cid === "berserker"
        ? (CONFIG.PLAYER_BASE_SPEED * (CONFIG.BERSERKER_MOVE_SPEED_MULT ?? 0.92))
        : cid === "archer"
          ? (CONFIG.PLAYER_BASE_SPEED * (CONFIG.ARCHER_MOVE_SPEED_MULT ?? 1.05))
        : CONFIG.PLAYER_BASE_SPEED;
    const mm = clamp(
      st.moveSpeedMult ?? 1,
      CONFIG.SAFETY_MOVE_SPEED_MULT_MIN ?? 0.2,
      CONFIG.SAFETY_MOVE_SPEED_MULT_MAX ?? 3.5
    );
    return base * mm;
  }

  getProjectileRadius(player = this.player) {
    const st = player?.stats ?? this.stats;
    const mult =
      (player?.characterId ?? st.characterId) === "archer"
        ? (CONFIG.ARCHER_PROJECTILE_RADIUS_MULT ?? 0.6)
        : 1;
    const sz = clamp(
      st.projectileSizeMult ?? 1,
      CONFIG.SAFETY_PROJECTILE_SIZE_MULT_MIN ?? 0.25,
      CONFIG.SAFETY_PROJECTILE_SIZE_MULT_MAX ?? 4
    );
    const rRaw = CONFIG.BASE_PROJECTILE_RADIUS * mult * sz;
    return clamp(rRaw, 0.5, 120);
  }

  syncHammers() {
    const n = Math.max(0, Math.floor(this.stats.hammerCount ?? 0));
    while (this.hammers.length < n) {
      this.hammers.push({
        spinAngle: Math.random() * Math.PI * 2,
      });
    }
    while (this.hammers.length > n) {
      this.hammers.pop();
    }
  }

  syncArcaneRunes() {
    const lvl = this.stats.arcaneRunesLvl ?? 0;
    const base = CONFIG.ARCANE_RUNES_BASE_COUNT ?? 2;
    const bonus = Math.max(0, Math.floor(this.stats.arcaneRunesCountBonus ?? 0));
    const n = lvl > 0 ? Math.max(0, base + bonus) : 0;
    while (this.arcaneRunes.length < n) {
      this.arcaneRunes.push({
        spin: Math.random() * Math.PI * 2,
      });
    }
    while (this.arcaneRunes.length > n) {
      this.arcaneRunes.pop();
    }
  }

  arcaneRuneOrbitAngle(i) {
    const n = this.arcaneRunes.length;
    if (n <= 0) return 0;
    return this.arcaneRuneOrbitPhase + (i / n) * Math.PI * 2;
  }

  updateArcaneRunes(dt) {
    // Mage-exclusive (per-player).
    if (!(this.players ?? []).some((p) => (p?.characterId ?? p?.stats?.characterId) === "mage")) return;

    // Swept hit test to prevent tunneling at high orbit speed.
    const distPointToSegment = (px0, py0, ax0, ay0, bx0, by0) => {
      const abx = bx0 - ax0;
      const aby = by0 - ay0;
      const apx = px0 - ax0;
      const apy = py0 - ay0;
      const ab2 = abx * abx + aby * aby;
      const t = ab2 > 1e-9 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
      const cx = ax0 + abx * t;
      const cy = ay0 + aby * t;
      return Math.hypot(px0 - cx, py0 - cy);
    };

    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const lvl = st.arcaneRunesLvl ?? 0;
      const base = CONFIG.ARCANE_RUNES_BASE_COUNT ?? 2;
      const bonus = Math.max(0, Math.floor(st.arcaneRunesCountBonus ?? 0));
      const n = lvl > 0 ? Math.max(0, base + bonus) : 0;

      while ((pl.arcaneRunes?.length ?? 0) < n) {
        (pl.arcaneRunes ?? (pl.arcaneRunes = [])).push({ spin: Math.random() * Math.PI * 2 });
      }
      while ((pl.arcaneRunes?.length ?? 0) > n) {
        pl.arcaneRunes.pop();
      }
      if (!pl.arcaneRunes || pl.arcaneRunes.length === 0) {
        pl.arcaneRuneOrbitPhase = 0;
        continue;
      }

      const orbitSpeed =
        (CONFIG.ARCANE_RUNES_ORBIT_SPEED ?? 3.1) * (st.arcaneRunesOrbitSpeedMult ?? 1);
      const hammerR =
        (pl.hammers?.length ?? 0) > 0
          ? ((CONFIG.HAMMER_ORBIT_RADIUS ?? 80) * (st.hammerOrbitRadius ?? 1)) +
            (((pl.characterId ?? st.characterId) === "mage") ? (CONFIG.HAMMER_ORBIT_RADIUS_MAGE_BONUS ?? 0) : 0)
          : 0;
      const baseR =
        (CONFIG.ARCANE_RUNES_ORBIT_RADIUS ?? 108) * (st.arcaneRunesOrbitRadiusMult ?? 1);
      const radius = Math.max(baseR, hammerR + 26);

      const hitR = (CONFIG.ARCANE_RUNES_HIT_RADIUS ?? 18);
      const cooldown = (CONFIG.ARCANE_RUNES_HIT_COOLDOWN ?? 0.2);
      const dmg =
        (CONFIG.ARCANE_RUNES_BASE_DAMAGE ?? 16) *
        (st.damageMult ?? 1) *
        (st.arcaneRunesDamageMult ?? 1);

      pl.arcaneRuneOrbitPhase = (pl.arcaneRuneOrbitPhase ?? 0) + orbitSpeed * dt;
      if (pl.arcaneRuneOrbitPhase > Math.PI * 64) pl.arcaneRuneOrbitPhase -= Math.PI * 64;

      const ownerIndex = (this.players ?? []).indexOf(pl);
      const positions = pl.arcaneRunes.map((r, i) => {
        const a = (pl.arcaneRuneOrbitPhase ?? 0) + (i / pl.arcaneRunes.length) * Math.PI * 2;
        const x = pl.x + Math.cos(a) * radius;
        const y = pl.y + Math.sin(a) * radius;
        return { r, i, a, x, y };
      });

      // Continuous contact damage with per-enemy cooldown.
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        const hitMap =
          e.arcaneRuneHitUntilMap instanceof Map
            ? e.arcaneRuneHitUntilMap
            : (e.arcaneRuneHitUntilMap = new Map());
        const hc = enemyHitCircle(e);
        for (const pos of positions) {
          const runeKey = `${ownerIndex}:${pos.i}`;
          if (this.time < (hitMap.get(runeKey) ?? 0)) continue;
          const r = pos.r;
          const prevX = Number.isFinite(r.prevX) ? r.prevX : pos.x;
          const prevY = Number.isFinite(r.prevY) ? r.prevY : pos.y;
          const d = distPointToSegment(hc.x, hc.y, prevX, prevY, pos.x, pos.y);
          if (d < hitR + hc.r) {
            const dead = this.applyEnemyDamage(e, dmg);
            e.hitFlash = CONFIG.HIT_FLASH_DURATION;
            hitMap.set(runeKey, this.time + cooldown);
            this.spawnHitParticles(hc.x, hc.y);
            this.addFloatText(e.x, e.y - (ENEMY_TYPES[e.typeId]?.radius ?? 10) - 4, Math.ceil(dmg).toString(), "#cdb6ff");
            if (dead) break;
          }
        }
      }

      // Store positions for next frame sweep.
      for (const pos of positions) {
        pos.r.prevX = pos.x;
        pos.r.prevY = pos.y;
      }
    }
  }

  /**
   * Pick a grenade throw target:
   * - Primarily nearest enemy
   * - Slight bias toward player facing direction so throws feel intentional
   */
  pickGrenadeTarget(player = this.player) {
    if (!Array.isArray(this.enemies) || this.enemies.length === 0) return null;
    const px = player.x;
    const py = player.y;
    const bossR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    const boss = nearestBossWithinRadius(this.enemies, px, py, bossR);
    if (boss) return boss;
    const fx = player.facingVec?.x ?? 1;
    const fy = player.facingVec?.y ?? 0;
    const fmag = Math.hypot(fx, fy);
    const nx = fmag > 1e-4 ? fx / fmag : 1;
    const ny = fmag > 1e-4 ? fy / fmag : 0;
    const bias =
      typeof CONFIG.ARCHER_TOXIC_GRENADE_FACING_BIAS === "number"
        ? CONFIG.ARCHER_TOXIC_GRENADE_FACING_BIAS
        : 60;

    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      const dx = e.x - px;
      const dy = e.y - py;
      const d = Math.hypot(dx, dy);
      if (d < 1e-4) return e;
      const dot = (dx / d) * nx + (dy / d) * ny; // [-1..1]
      // Lower is better: distance minus facing bonus.
      const score = d - dot * bias;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  spawnToxicGrenadeAt(target, player = this.player) {
    if (!target) return;
    const px = player.x;
    const py = player.y;
    const dur = Math.max(0.12, CONFIG.ARCHER_TOXIC_GRENADE_FLIGHT_DURATION ?? 0.4);
    const arcH = Math.max(12, CONFIG.ARCHER_TOXIC_GRENADE_ARC_HEIGHT ?? 110);
    const spin =
      typeof CONFIG.ARCHER_TOXIC_GRENADE_SPIN_SPEED === "number"
        ? CONFIG.ARCHER_TOXIC_GRENADE_SPIN_SPEED
        : 14;

    const fx = player.facingVec?.x ?? 1;
    const fy = player.facingVec?.y ?? 0;
    const fmag = Math.hypot(fx, fy);
    const nx = fmag > 1e-4 ? fx / fmag : 1;
    const ny = fmag > 1e-4 ? fy / fmag : 0;
    const spawnX = px + nx * 18;
    const spawnY = py + ny * 18;

    // Clamp landing point so grenades don't yeet across the map.
    const maxR =
      typeof CONFIG.ARCHER_TOXIC_GRENADE_MAX_RANGE === "number"
        ? Math.max(60, CONFIG.ARCHER_TOXIC_GRENADE_MAX_RANGE)
        : 420;
    let tx = target.x;
    let ty = target.y;
    const dx = tx - spawnX;
    const dy = ty - spawnY;
    const d = Math.hypot(dx, dy);
    if (d > maxR) {
      const inv = d > 1e-4 ? 1 / d : 0;
      tx = spawnX + dx * inv * maxR;
      ty = spawnY + dy * inv * maxR;
    }
    tx = clamp(tx, 0, CONFIG.WORLD_W);
    ty = clamp(ty, 0, CONFIG.WORLD_H);

    this.toxicGrenades.push({
      sx: spawnX,
      sy: spawnY,
      tx,
      ty,
      x: spawnX,
      y: spawnY,
      t: 0,
      dur,
      arcH,
      rot: Math.random() * Math.PI * 2,
      rotSp: spin * (0.85 + Math.random() * 0.35),
    });
  }

  spawnToxicExplosion(x, y) {
    const r = Math.max(24, CONFIG.ARCHER_TOXIC_GRENADE_RADIUS ?? 92);
    const dmg = this.getEffectiveDamage() * (CONFIG.ARCHER_TOXIC_GRENADE_DAMAGE_MULT ?? 1.25);

    // One-time AOE burst.
    const killed = [];
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      if (dist(hc.x, hc.y, x, y) >= r + hc.r * 0.25) continue;
      e.hitFlash = CONFIG.HIT_FLASH_DURATION;
      this.spawnHitParticles(hc.x, hc.y);
      const def = ENEMY_TYPES[e.typeId];
      this.addFloatText(
        e.x,
        e.y - def.radius - 4,
        Math.ceil(dmg).toString(),
        "rgba(160,255,190,0.95)"
      );
      if (this.applyEnemyDamage(e, dmg)) killed.push(e);
    }
    for (const e of killed) this.killEnemy(e);

    this.toxicExplosions.push({
      x,
      y,
      t: 0,
      frame: 0,
      frameT: 0,
      didImpact: false,
      r,
    });

    // Poison cloud (lingering).
    const dur = Math.max(0.5, CONFIG.ARCHER_TOXIC_CLOUD_DURATION ?? 3);
    this.toxicClouds.push({
      x,
      y,
      life: dur,
      maxLife: dur,
      r,
      puffCd: 0,
    });
  }

  updateToxicGrenades(dt) {
    if (!(this.players ?? []).some((p) => (p?.characterId ?? p?.stats?.characterId) === "archer")) return;
    // Spawn loop per-player (runs alongside base bow attack).
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      if ((st.toxicGrenadeLvl ?? 0) <= 0) continue;
      pl.toxicGrenadeCd = (pl.toxicGrenadeCd ?? 0) - dt;
      if ((pl.toxicGrenadeCd ?? 0) <= 0) {
        const target = this.pickGrenadeTarget(pl);
        if (!target) {
          pl.toxicGrenadeCd = 0.35;
        } else {
          const interval = Math.max(0.4, CONFIG.ARCHER_TOXIC_GRENADE_INTERVAL ?? 3.5);
          pl.toxicGrenadeCd = interval;
          this.spawnToxicGrenadeAt(target, pl);
        }
      }
    }

    // Grenade flight (arc interpolation).
    for (let i = this.toxicGrenades.length - 1; i >= 0; i--) {
      const g = this.toxicGrenades[i];
      g.t += dt;
      const u = clamp(g.t / Math.max(1e-4, g.dur ?? 0.4), 0, 1);
      g.x = g.sx + (g.tx - g.sx) * u;
      g.y = g.sy + (g.ty - g.sy) * u - Math.sin(u * Math.PI) * (g.arcH ?? 110);
      g.rot = (g.rot ?? 0) + (g.rotSp ?? 14) * dt;

      if (u >= 1) {
        const ix = g.tx;
        const iy = g.ty;
        this.toxicGrenades.splice(i, 1);
        this.spawnToxicExplosion(ix, iy);
      }
    }

    // Explosion VFX (4 frames ~0.2s).
    const frameDur = [0.03, 0.05, 0.08, 0.04];
    for (let i = this.toxicExplosions.length - 1; i >= 0; i--) {
      const ex = this.toxicExplosions[i];
      ex.t += dt;
      ex.frameT += dt;
      const fi = Math.max(0, Math.min(3, ex.frame | 0));
      const fd = frameDur[fi] ?? 0.05;
      if (ex.frameT >= fd) {
        ex.frameT -= fd;
        ex.frame += 1;
      }
      if (ex.frame === 2 && !ex.didImpact) {
        ex.didImpact = true;
        this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 1.35);
        const n = 8 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const s = randRange(90, 240);
          this.particles.push({
            x: ex.x,
            y: ex.y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s - randRange(15, 55),
            life: randRange(0.22, 0.5),
            maxLife: 0.5,
            color: "rgba(120, 255, 160, 0.95)",
            size: randRange(2.5, 5.5),
          });
        }
      }
      if (ex.frame >= 4) {
        this.toxicExplosions.splice(i, 1);
      }
    }

    // Poison clouds:
    // - Global tick (prevents stacking damage if multiple clouds overlap)
    // - Per-cloud particle spawning for "alive" visuals
    const tickI = Math.max(0.12, CONFIG.ARCHER_TOXIC_CLOUD_TICK_INTERVAL ?? 0.5);
    this.toxicCloudTickCd -= dt;
    if (this.toxicCloudTickCd <= 0) {
      this.toxicCloudTickCd += tickI;
      // MVP: cloud DOT uses team damage baseline (could be per-owner later).
      const tickDmg =
        this.getEffectiveDamage(this.player) * (CONFIG.ARCHER_TOXIC_CLOUD_TICK_DAMAGE_MULT ?? 0.22);
      const killed = [];
      for (const e of this.enemies) {
        let inside = false;
        for (const c of this.toxicClouds) {
          const hc = enemyHitCircle(e);
          if (dist(hc.x, hc.y, c.x, c.y) < (c.r ?? 0) + hc.r * 0.15) {
            inside = true;
            break;
          }
        }
        if (!inside) continue;
        if (this.applyEnemyDamage(e, tickDmg, { skipHitSfx: true })) {
          killed.push(e);
          continue;
        }
        if (e.hitFlash <= 0) e.hitFlash = CONFIG.HIT_FLASH_DURATION * 0.25;
      }
      for (const e of killed) this.killEnemy(e);
    }

    for (let i = this.toxicClouds.length - 1; i >= 0; i--) {
      const c = this.toxicClouds[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.toxicClouds.splice(i, 1);
        continue;
      }

      c.puffCd = (c.puffCd ?? 0) - dt;
      const spawnEvery = 0.045;
      while (c.puffCd <= 0) {
        c.puffCd += spawnEvery;
        const rr = Math.sqrt(Math.random()) * c.r;
        const a = Math.random() * Math.PI * 2;
        const px = c.x + Math.cos(a) * rr;
        const py = c.y + Math.sin(a) * rr;
        const drift = randRange(10, 34);
        const da = Math.random() * Math.PI * 2;
        const up = randRange(6, 20);
        const life = randRange(0.55, 1.05);
        this.particles.push({
          x: px,
          y: py,
          vx: Math.cos(da) * drift,
          vy: Math.sin(da) * drift - up,
          life,
          maxLife: life,
          color: "rgba(90, 255, 140, 0.55)",
          size: randRange(1.6, 3.8),
        });
      }
    }
  }

  updateSoulPush(dt) {
    if (!(this.players ?? []).some((p) => (p?.characterId ?? p?.stats?.characterId) === "revenant")) return;
    if (!Array.isArray(this.enemies) || this.enemies.length === 0) return;
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      if ((st.soulPullLvl ?? 0) <= 0) continue;
      pl.soulPullCd = (pl.soulPullCd ?? 0) - dt;
      if ((pl.soulPullCd ?? 0) > 0) continue;

      const cd = CONFIG.SOUL_PUSH_COOLDOWN ?? 6.2;
      const radius = CONFIG.SOUL_PUSH_RADIUS ?? 240;
      const strength = CONFIG.SOUL_PUSH_STRENGTH ?? 88;
      pl.soulPullCd = Math.max(0.6, cd);

      const px = pl.x;
      const py = pl.y;
      const r2 = radius * radius;
      for (const e of this.enemies) {
        const dx = e.x - px;
        const dy = e.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1e-6 || d2 > r2) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        e.x += nx * strength;
        e.y += ny * strength;
        e.hitFlash = CONFIG.HIT_FLASH_DURATION;
      }
    }
  }

  /** World angle (radians) of hammer slot `i` around the player. */
  hammerOrbitAngle(i) {
    const n = this.hammers.length;
    if (n <= 0) return 0;
    return this.hammerOrbitPhase + (i / n) * Math.PI * 2;
  }

  updateHammers(dt) {
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const n = Math.max(0, Math.floor(st.hammerCount ?? 0));
      while ((pl.hammers?.length ?? 0) < n) {
        (pl.hammers ?? (pl.hammers = [])).push({ spinAngle: Math.random() * Math.PI * 2 });
      }
      while ((pl.hammers?.length ?? 0) > n) {
        pl.hammers.pop();
      }
      if (!pl.hammers || pl.hammers.length === 0) {
        pl.hammerOrbitPhase = 0;
        continue;
      }

      const orbitSpeed = (CONFIG.HAMMER_ORBIT_SPEED ?? 0) * (st.hammerOrbitSpeed ?? 1);
      const spinSpeed = CONFIG.HAMMER_SPIN_SPEED ?? 0;
      const baseRadius = (CONFIG.HAMMER_ORBIT_RADIUS ?? 80) * (st.hammerOrbitRadius ?? 1);
      const mageBonus = this.characterId === "mage" ? (CONFIG.HAMMER_ORBIT_RADIUS_MAGE_BONUS ?? 0) : 0;
      const radius = baseRadius + mageBonus;
      const hitR = (CONFIG.HAMMER_HIT_RADIUS ?? 12) * (st.hammerSize ?? 1);
      const dmg = (CONFIG.HAMMER_BASE_DAMAGE ?? 10) * (st.damageMult ?? 1);

      pl.hammerOrbitPhase = (pl.hammerOrbitPhase ?? 0) + orbitSpeed * dt;
      if (pl.hammerOrbitPhase > Math.PI * 64) pl.hammerOrbitPhase -= Math.PI * 64;
      for (const h of pl.hammers) h.spinAngle = (h.spinAngle ?? 0) + spinSpeed * dt;

      const positions = pl.hammers.map((_, i) => {
        const ang = pl.hammerOrbitPhase + (i / pl.hammers.length) * Math.PI * 2;
        return { x: pl.x + Math.cos(ang) * radius, y: pl.y + Math.sin(ang) * radius };
      });

      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        if (this.time < (e.hammerHitUntil ?? 0)) continue;
        const def = ENEMY_TYPES[e.typeId];
        let hit = false;
        for (const pos of positions) {
          if (dist(pos.x, pos.y, e.x, e.y) < hitR + def.radius) {
            hit = true;
            break;
          }
        }
        if (!hit) continue;
        this.applyEnemyDamage(e, dmg);
        e.hitFlash = CONFIG.HIT_FLASH_DURATION;
        e.hammerHitUntil = this.time + (CONFIG.HAMMER_HIT_COOLDOWN ?? 0.18);
        this.spawnHitParticles(e.x, e.y);
        this.addFloatText(e.x, e.y - def.radius - 4, Math.ceil(dmg).toString(), "#e8d4ff");
      }
    }
  }

  spawnInterval() {
    const stepSec = CONFIG.DIFFICULTY_STEP_SECONDS ?? 30;
    const spawnRateMult = CONFIG.DIFFICULTY_SPAWN_RATE_MULT_PER_STEP ?? 1.1;
    const steps = Math.max(0, Math.floor(this.time / Math.max(1, stepSec)));
    const rate = Math.pow(Math.max(1.001, spawnRateMult), steps);
    const coop = this.getCoopSpawnIntensityMult();
    const interval = (CONFIG.ENEMY_SPAWN_BASE ?? 1.35) / (rate * coop);
    return Math.max(CONFIG.ENEMY_SPAWN_MIN ?? 0.3, interval);
  }

  update(dt) {
    if (this.mode === "gameOver") return;
    if (this.netMode === "client") {
      if (this.mode === "paused") {
        this.shake = Math.max(0, this.shake - dt * CONFIG.SCREEN_SHAKE_DECAY);
        return;
      }
      this.animTick += dt;
      if (this.mode === "levelUp") {
        this.shake = Math.max(0, this.shake - dt * CONFIG.SCREEN_SHAKE_DECAY);
        this.updateParticles(dt);
        this.updateFloatTexts(dt);
        return;
      }
      this.shake = Math.max(0, this.shake - dt * CONFIG.SCREEN_SHAKE_DECAY);
      this.updateParticles(dt);
      this.updateFloatTexts(dt);

      // Client-side prediction: move local player immediately (movement only; host remains authoritative for combat/world).
      if (this.mode === "playing") {
        const localSeat = Math.max(
          0,
          Math.min(3, Math.floor(Number(this?._jamLocalSeats?.[0] ?? 0) || 0))
        );
        this.predictLocalMovement(dt, localSeat);
        this.applyRemotePlayerInterpolation(localSeat);

        // Advance short-lived VFX timers locally so they don't "stick" between snapshots.
        this.netTickClientVfx(dt);
      }

      if (
        this.mode === "playing" &&
        Number.isFinite(this.netReplayCamX) &&
        Number.isFinite(this.netReplayCamY)
      ) {
        const k = 1 - Math.exp(-(CONFIG.CAMERA_SMOOTH ?? 12) * dt);
        this.camX += (this.netReplayCamX - this.camX) * k;
        this.camY += (this.netReplayCamY - this.camY) * k;
      }
      if (this.mode === "playing") this.updateVibeJamPortals(dt);
      return;
    }
    if (this.mode === "paused") {
      this.shake = Math.max(0, this.shake - dt * CONFIG.SCREEN_SHAKE_DECAY);
      return;
    }
    this.animTick += dt;
    if (this.mode === "levelUp") {
      this.shake = Math.max(0, this.shake - dt * CONFIG.SCREEN_SHAKE_DECAY);
      this.updateParticles(dt);
      this.updateFloatTexts(dt);
      return;
    }

    this.time += dt;

    this.trySpawnBoss1();
    this.trySpawnBoss2();
    this.updateBossPulses(dt);
    this.updateBossArcaneProjectiles(dt);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval();
      this.spawnEnemy();
    }

    for (let i = 0; i < (this.players?.length ?? 0); i++) {
      this.updatePlayer(dt, i);
    }
    this.updateGroundSlam(dt);
    this.updateToxicGrenades(dt);
    this.updateSoulPush(dt);
    this.updatePickups(dt);
    this.updateDaggers(dt);
    this.updateThrowingAxes(dt);
    this.updateBoomerangs(dt);
    this.updateLightningStrikes(dt);
    this.updateWhip(dt);
    this.updateSlashes(dt);
    this.updateEnemies(dt);
    // Game over only when all players are dead.
    if ((this.players ?? []).length > 0 && this.alivePlayers().length === 0) {
      this.mode = "gameOver";
      return;
    }
    this.updateProjectiles(dt);
    this.updateHammers(dt);
    this.updateArcaneRunes(dt);
    this.updateXpOrbs(dt);
    this.updateParticles(dt);
    this.updateFloatTexts(dt);

    // Prevent pickup clumping/streaks at high kill rates.
    this.pickupDropGlobalCd = Math.max(0, (this.pickupDropGlobalCd ?? 0) - dt);
    this.pickupDropHeartCd = Math.max(0, (this.pickupDropHeartCd ?? 0) - dt);
    this.pickupDropMagnetCd = Math.max(0, (this.pickupDropMagnetCd ?? 0) - dt);

    this.shake = Math.max(0, this.shake - dt * CONFIG.SCREEN_SHAKE_DECAY);

    // -------------------------
    // Multiplayer camera: dynamic zoom + soft leash (Option D, Loose)
    // -------------------------
    const tc = this.teamCenterAlive();
    let camC = tc;
    const alive = this.alivePlayers();

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let anyAlive = false;
    for (const p of alive) {
      if (!p || (p.hp ?? 0) <= 0) continue;
      anyAlive = true;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const boundsOk = anyAlive && Number.isFinite(minX) && minX !== Infinity;

    if ((alive?.length ?? 0) >= 2 && boundsOk) {
      // Camera center uses alive-players bounds midpoint (Sentinel not included — avoids panning/zooming away from a player).
      camC = { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };

      const padPx = CONFIG.CAMERA_ZOOM_PADDING_PX ?? 120;
      const safeWpx = Math.max(64, (CONFIG.CANVAS_W ?? 960) - padPx * 2);
      const safeHpx = Math.max(64, (CONFIG.CANVAS_H ?? 540) - padPx * 2);
      const spreadW = Math.max(1, maxX - minX);
      const spreadH = Math.max(1, maxY - minY);

      // Required world-scale to fit all alive players inside the safe screen rect.
      const requiredScale = Math.max(spreadW / safeWpx, spreadH / safeHpx);
      const minScale = CONFIG.CAMERA_ZOOM_MIN ?? 1.35;
      const maxScale = CONFIG.CAMERA_ZOOM_MAX ?? 2.35;
      const targetScale = clamp(requiredScale, minScale, maxScale);

      // Smoothly approach target zoom (mutating VIEW_WORLD_SCALE keeps other systems consistent).
      const zK = 1 - Math.exp(-(CONFIG.CAMERA_ZOOM_SMOOTH ?? 6.5) * dt);
      const curScale = CONFIG.VIEW_WORLD_SCALE ?? 1;
      CONFIG.VIEW_WORLD_SCALE = curScale + (targetScale - curScale) * zK;

      // If players exceed what the max zoom can cover, apply a gentle soft leash.
      if (requiredScale > maxScale + 1e-6) {
        const halfW = ((CONFIG.CANVAS_W ?? 960) * 0.5 - padPx) * maxScale;
        const vMult = CONFIG.CAMERA_SOFT_LEASH_VERTICAL_MULT ?? 1;
        const halfH = ((CONFIG.CANVAS_H ?? 540) * 0.5 - padPx) * maxScale * Math.max(1, vMult);
        const leashK = CONFIG.CAMERA_SOFT_LEASH_STRENGTH ?? 1.25;
        const maxSpeed = CONFIG.CAMERA_SOFT_LEASH_MAX_SPEED ?? 220;

        for (const p of alive) {
          if (!p) continue;
          const dx = p.x - camC.x;
          const dy = p.y - camC.y;
          const overX = Math.max(0, Math.abs(dx) - Math.max(8, halfW));
          const overY = Math.max(0, Math.abs(dy) - Math.max(8, halfH));
          if (overX <= 0 && overY <= 0) continue;

          // Pull toward center based on how far outside the max camera bounds they are.
          const pullX = Math.sign(dx) * overX;
          const pullY = Math.sign(dy) * overY;
          const pullLen = Math.hypot(pullX, pullY) || 1;
          const spd = Math.min(maxSpeed, pullLen * leashK);
          const ux = pullX / pullLen;
          const uy = pullY / pullLen;

          p.x -= ux * spd * dt;
          p.y -= uy * spd * dt;
        }
      }
    }

    const vw = viewWorldW();
    const vh = viewWorldH();
    this.camTargetX = camC.x - vw / 2;
    this.camTargetY = camC.y - vh / 2;
    const maxCamX = CONFIG.WORLD_W - vw;
    const maxCamY = CONFIG.WORLD_H - vh;
    this.camTargetX = clamp(this.camTargetX, 0, Math.max(0, maxCamX));
    this.camTargetY = clamp(this.camTargetY, 0, Math.max(0, maxCamY));
    const k = 1 - Math.exp(-CONFIG.CAMERA_SMOOTH * dt);
    this.camX += (this.camTargetX - this.camX) * k;
    this.camY += (this.camTargetY - this.camY) * k;

    this.updateVibeJamPortals(dt);
    // (Game over handled above when all players are dead.)
  }

  updateGroundSlam(dt) {
    if (!(this.players ?? []).some((p) => (p?.characterId ?? p?.stats?.characterId) === "berserker")) return;

    // VFX life
    if (Array.isArray(this.groundSlams) && this.groundSlams.length > 0) {
      for (let i = this.groundSlams.length - 1; i >= 0; i--) {
        const s = this.groundSlams[i];
        s.life = (s.life ?? 0) - dt;
        if ((s.life ?? 0) <= 0) this.groundSlams.splice(i, 1);
      }
    }

    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const lvl = st.groundSlamLvl ?? 0;
      if (lvl <= 0) continue;

      // Double slam delayed trigger (lvl 8)
      if ((pl.groundSlamSecondT ?? 0) > 0) {
        pl.groundSlamSecondT = Math.max(0, (pl.groundSlamSecondT ?? 0) - dt);
        if ((pl.groundSlamSecondT ?? 0) <= 1e-6) {
          this.triggerGroundSlam(true, pl);
        }
      }

      // Main cooldown
      const baseCd = CONFIG.GROUND_SLAM_COOLDOWN ?? 5.0;
      const cdMult = st.groundSlamCooldownMult ?? 1;
      if ((pl.groundSlamCd ?? 0) <= 0) {
        this.triggerGroundSlam(false, pl);
        pl.groundSlamCd = Math.max(0.4, baseCd * cdMult);
        if ((st.groundSlamDouble ?? false) === true) {
          pl.groundSlamSecondT = CONFIG.GROUND_SLAM_DOUBLE_DELAY ?? 0.35;
        }
      } else {
        pl.groundSlamCd = Math.max(0, (pl.groundSlamCd ?? 0) - dt);
      }
    }
  }

  triggerGroundSlam(isSecond, player = this.player) {
    const st = player?.stats ?? this.stats;
    const px = player.x;
    const py = player.y;
    const baseR = CONFIG.GROUND_SLAM_RADIUS ?? 95;
    const baseDmg = CONFIG.GROUND_SLAM_DAMAGE ?? 62;
    const dmgMult = st.groundSlamDamageMult ?? 1;
    const rMult = st.groundSlamRadiusMult ?? 1;
    const kbMult = st.groundSlamKnockbackMult ?? 1;
    const r0 = baseR * rMult;
    const dmg0 = baseDmg * dmgMult;
    const r = isSecond ? r0 * (CONFIG.GROUND_SLAM_DOUBLE_RADIUS_MULT ?? 0.7) : r0;
    const dmg = isSecond ? dmg0 * (CONFIG.GROUND_SLAM_DOUBLE_DAMAGE_MULT ?? 0.6) : dmg0;
    const kb = (CONFIG.GROUND_SLAM_KNOCKBACK_DIST ?? 16) * kbMult;

    let hitAny = false;
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      const dx = hc.x - px;
      const dy = hc.y - py;
      const d = Math.hypot(dx, dy);
      if (d > r + hc.r) continue;
      hitAny = true;
      this.applyEnemyDamage(e, dmg);
      e.hitFlash = CONFIG.HIT_FLASH_DURATION;
      // Small outward knockback (position nudge).
      if (kb > 1e-3 && d > 1e-3) {
        const step = Math.min(kb, Math.max(0, d));
        const inv = step / d;
        e.x += dx * inv;
        e.y += dy * inv;
      }
      this.spawnHitParticles(hc.x, hc.y);
      this.addFloatText(e.x, e.y - (ENEMY_TYPES[e.typeId]?.radius ?? 10) - 4, Math.ceil(dmg).toString(), "#ffb3b3");
    }

    // Visual
    const vDur = Math.max(0.1, CONFIG.GROUND_SLAM_VFX_DURATION ?? 0.3);
    this.groundSlams.push({ x: px, y: py, r, life: vDur, maxLife: vDur, second: isSecond === true });

    if (hitAny) {
      this.shake = Math.min(
        CONFIG.SCREEN_SHAKE_MAX ?? 3,
        this.shake + (CONFIG.GROUND_SLAM_SHAKE_ON_HIT ?? 0.35) * (isSecond ? 0.7 : 1)
      );
    }
  }

  updateWhip(dt) {
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      if ((st.whipCount ?? 0) <= 0) continue;

      if ((pl.whipHeldHideT ?? 0) > 0) {
        pl.whipHeldHideT = Math.max(0, (pl.whipHeldHideT ?? 0) - dt);
      }

      // Animate existing sweeps (and apply damage during the sweep).
      for (let i = (pl.whipSwings?.length ?? 0) - 1; i >= 0; i--) {
        const s = pl.whipSwings[i];
        s.elapsed = (s.elapsed ?? 0) + dt;
        const dur = Math.max(0.05, s.dur ?? (CONFIG.WHIP_SWEEP_DURATION ?? 0.16));
        if (s.elapsed >= dur) {
          pl.whipSwings.splice(i, 1);
          continue;
        }

        const u = clamp(s.elapsed / dur, 0, 1);
        const grow = whipGrowU(u);
        const baseAng = s.baseAng ?? 0;
        const lines = Math.max(1, Math.min(3, Math.floor(s.lines ?? 1)));
        const lineAngles = whipLineAngles(baseAng, lines);

        const len = s.len ?? (CONFIG.WHIP_LENGTH ?? 320);
        const effLen = len * grow;
        const wid = s.wid ?? (CONFIG.WHIP_WIDTH ?? 52);
        const off = s.off ?? (CONFIG.WHIP_OFFSET ?? 26);
        const halfL = effLen * 0.5;
        const halfW = wid * 0.5;
        const hit = s.hit instanceof Set ? s.hit : (s.hit = new Set());

        for (let li = 0; li < lineAngles.length; li++) {
          const ang = lineAngles[li];
          const nx = Math.cos(ang);
          const ny = Math.sin(ang);
          const px = -ny;
          const py = nx;
          const cx = s.x + nx * (off + effLen * 0.5);
          const cy = s.y + ny * (off + effLen * 0.5);
          for (const e of this.enemies) {
            if (hit.has(e)) continue;
            const hc = enemyHitCircle(e);
            const dx = hc.x - cx;
            const dy = hc.y - cy;
            const along = dx * nx + dy * ny;
            const perp = dx * px + dy * py;
            if (Math.abs(along) > halfL + hc.r) continue;
            if (Math.abs(perp) > halfW + hc.r) continue;
            hit.add(e);
            const dmg = s.dmg ?? 0;
            this.applyEnemyDamage(e, dmg);
            e.hitFlash = CONFIG.HIT_FLASH_DURATION;
            this.spawnHitParticles(hc.x, hc.y);
            this.addFloatText(
              e.x,
              e.y - (ENEMY_TYPES[e.typeId]?.radius ?? 10) - 4,
              Math.ceil(dmg).toString(),
              CONFIG.WHIP_SWEEP_TINT ?? "#c9a8ff"
            );
          }
        }
      }

      // Start a new sweep when off cooldown.
      pl.whipCd = (pl.whipCd ?? 0) - dt;
      if ((pl.whipCd ?? 0) > 0) continue;
      const baseCd = CONFIG.WHIP_COOLDOWN ?? 1.2;
      const cdMult = st.whipCooldownMult ?? 1;
      pl.whipCd = baseCd * cdMult;

      const fx = pl.facingVec?.x ?? 1;
      const fy = pl.facingVec?.y ?? 0;
      const mag = Math.hypot(fx, fy);
      const nx0 = mag > 1e-4 ? fx / mag : 1;
      const ny0 = mag > 1e-4 ? fy / mag : 0;

      const len = (CONFIG.WHIP_LENGTH ?? 320) * (st.whipLengthMult ?? 1);
      const wid = (CONFIG.WHIP_WIDTH ?? 52) * (st.whipWidthMult ?? 1);
      const off = CONFIG.WHIP_OFFSET ?? 26;
      const dmg =
        (CONFIG.WHIP_DAMAGE ?? 18) *
        (st.damageMult ?? 1) *
        (st.whipDamageMult ?? 1);
      const lines = Math.max(1, Math.min(3, Math.floor(st.whipCount ?? 1)));

      pl.whipSwings.push({
        x: pl.x,
        y: pl.y,
        baseAng: Math.atan2(ny0, nx0),
        arc: CONFIG.WHIP_SWEEP_ARC_RAD ?? 1.25,
        dur: CONFIG.WHIP_SWEEP_DURATION ?? (CONFIG.WHIP_VISUAL_DURATION ?? 0.18),
        elapsed: 0,
        len,
        wid,
        off,
        dmg,
        lines,
        hit: new Set(),
      });
      const hide =
        typeof CONFIG.WHIP_HELD_HIDE_AFTER_SWING === "number"
          ? CONFIG.WHIP_HELD_HIDE_AFTER_SWING
          : 0.22;
      pl.whipHeldHideT = Math.max(pl.whipHeldHideT ?? 0, hide);
    }
  }

  trySpawnBoss1() {
    if (this.mode !== "playing") return;
    if (this.bossMilestones?.boss1 === true) return;
    const tOk = this.time >= (CONFIG.BOSS1_TRIGGER_TIME_SEC ?? 120);
    const lvlOk = this.level >= (CONFIG.BOSS1_TRIGGER_LEVEL ?? 5);
    if (!tOk && !lvlOk) return;
    this.bossMilestones.boss1 = true;

    const spawned = this.spawnEnemyOfType("boss1");
    if (!spawned) return;
    const boss = this.enemies[this.enemies.length - 1];
    this.initBoss1(boss, { withIntro: true });
  }

  trySpawnBoss2() {
    if (this.mode !== "playing") return;
    if (this.bossMilestones?.boss2 === true) return;
    const tReq = CONFIG.BOSS2_TRIGGER_TIME_SEC ?? 300;
    if (this.time + 1e-6 < tReq) return;
    this.bossMilestones.boss2 = true;

    const spawned = this.spawnEnemyOfType("boss2");
    if (!spawned) return;
    const boss = this.enemies[this.enemies.length - 1];
    this.initBoss2(boss, { withIntro: true });
  }

  /** @param {{ withIntro?: boolean }} [opts] */
  initBoss1(boss, opts = {}) {
    boss.isBoss = true;
    boss.bossId = "boss1";
    boss.bossState = "walk";
    boss.bossAnimT = 0;
    boss.bossAnimKey = "walk";
    boss.bossAnimFrame = 0;
    boss.bossMotion = "walk";
    boss.bossChargeT = 0;
    boss.bossNextPulseIn = randRange(
      CONFIG.BOSS1_PULSE_INTERVAL_MIN ?? 5,
      CONFIG.BOSS1_PULSE_INTERVAL_MAX ?? 7
    );
    boss.bossPlanned = null;
    if (opts.withIntro) {
      this.bossIntroT = 1.35;
      this.bossIntroTheme = "fire";
      this.bossIntroLine = CONFIG.BOSS1_INTRO_TITLE ?? "A Fire Demon Emerges";
      this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 2.2);
      this.addFloatText(
        this.player.x,
        this.player.y - 58,
        this.bossIntroLine,
        "#ffb35a"
      );
    }
  }

  /** @param {{ withIntro?: boolean }} [opts] */
  initBoss2(boss, opts = {}) {
    boss.isBoss = true;
    boss.bossId = "boss2";
    boss.bossState = "roam";
    boss.bossAnimT = 0;
    boss.bossAnimKey = "idle";
    boss.bossAnimFrame = 0;
    boss.boss2Phase = "roam";
    boss.boss2PatIx = Math.floor(Math.random() * 4);
    boss.boss2CurPat = 0;
    boss.boss2ChargeT = 0;
    boss.boss2AtkT = 0;
    boss.boss2SpiralAcc = 0;
    boss.boss2SpiralAng = Math.random() * Math.PI * 2;
    boss.boss2WaitT = CONFIG.BOSS2_FIRST_CHARGE_DELAY_SEC ?? 2.2;
    boss.boss2RecoverT = 0;
    if (opts.withIntro) {
      this.bossIntroT = 1.35;
      this.bossIntroTheme = "arcane";
      this.bossIntroLine = CONFIG.BOSS2_INTRO_TITLE ?? "Arcane Sentinel Awakens";
      this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 2.0);
      const px = this.player?.x ?? CONFIG.WORLD_W / 2;
      const py = this.player?.y ?? CONFIG.WORLD_H / 2;
      this.addFloatText(px, py - 58, this.bossIntroLine, "#d8a8ff");
    }
  }

  getBoss2CoreWorld(e) {
    const ox = CONFIG.BOSS2_CORE_OFFSET_X ?? 0;
    const oy = CONFIG.BOSS2_CORE_OFFSET_Y ?? -52;
    return { x: (e?.x ?? 0) + ox, y: (e?.y ?? 0) + oy };
  }

  pushBossArcaneProjectile(raw) {
    const maxN = CONFIG.BOSS2_MAX_ACTIVE_PROJECTILES ?? 70;
    while (this.bossArcaneProjs.length >= maxN) this.bossArcaneProjs.shift();
    const hitCdPl = Array.from({ length: 4 }, () => -999);
    this.bossArcaneProjs.push({
      ...raw,
      id: this.nextBossArcaneProjId++,
      traveled: raw.traveled ?? 0,
      phase: raw.phase ?? "move",
      holdLeft: typeof raw.holdLeft === "number" ? raw.holdLeft : 0,
      hitCdPl,
    });
  }

  spawnBoss2RadialBurst(cx, cy) {
    const n = Math.max(3, Math.floor(CONFIG.BOSS2_BURST_COUNT ?? 10));
    const spd = CONFIG.BOSS2_BURST_SPEED ?? 248;
    const dmg = CONFIG.BOSS2_PROJ_DAMAGE ?? 15;
    const r = CONFIG.BOSS2_PROJ_RADIUS ?? 9;
    const life = CONFIG.BOSS2_PROJ_LIFE_SEC ?? 3.2;
    const maxD = CONFIG.BOSS2_PROJ_MAX_DIST ?? 720;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.pushBossArcaneProjectile({
        x: cx,
        y: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        damage: dmg,
        r,
        life,
        maxDist: maxD,
        phase: "move",
        holdLeft: 0,
      });
    }
    this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.65);
  }

  spawnBoss2ConeBurst(e, cx, cy, tgt) {
    const minC = CONFIG.BOSS2_CONE_COUNT_MIN ?? 5;
    const maxC = CONFIG.BOSS2_CONE_COUNT_MAX ?? 7;
    const count = minC + Math.floor(Math.random() * (Math.max(minC, maxC) - minC + 1));
    const h0 = CONFIG.BOSS2_CONE_HALF_ANGLE_MIN_RAD ?? 0.395;
    const h1 = CONFIG.BOSS2_CONE_HALF_ANGLE_MAX_RAD ?? 0.524;
    const half = h0 + Math.random() * Math.max(0, h1 - h0);
    const spd = CONFIG.BOSS2_CONE_SPEED ?? 340;
    const dmg = CONFIG.BOSS2_PROJ_DAMAGE ?? 15;
    const pr = CONFIG.BOSS2_PROJ_RADIUS ?? 9;
    const life = CONFIG.BOSS2_PROJ_LIFE_SEC ?? 3.2;
    const maxD = CONFIG.BOSS2_PROJ_MAX_DIST ?? 720;
    const base = Math.atan2(tgt.y - cy, tgt.x - cx);
    if (count === 1) {
      this.pushBossArcaneProjectile({
        x: cx,
        y: cy,
        vx: Math.cos(base) * spd,
        vy: Math.sin(base) * spd,
        damage: dmg,
        r: pr,
        life,
        maxDist: maxD,
        phase: "move",
        holdLeft: 0,
      });
      return;
    }
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1) - 0.5;
      const ang = base + u * half * 2;
      this.pushBossArcaneProjectile({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        damage: dmg,
        r: pr,
        life,
        maxDist: maxD,
        phase: "move",
        holdLeft: 0,
      });
    }
    this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.5);
  }

  spawnBoss2DelayedRing(cx, cy) {
    const n = Math.max(6, Math.floor(CONFIG.BOSS2_RING_COUNT ?? 10));
    const rad = CONFIG.BOSS2_RING_SPAWN_RADIUS ?? 58;
    const hold = CONFIG.BOSS2_RING_HOLD_SEC ?? 0.5;
    const outSp = CONFIG.BOSS2_RING_OUT_SPEED ?? 270;
    const dmg = CONFIG.BOSS2_PROJ_DAMAGE ?? 15;
    const pr = CONFIG.BOSS2_PROJ_RADIUS ?? 9;
    const baseLife = CONFIG.BOSS2_PROJ_LIFE_SEC ?? 3.2;
    const maxD = CONFIG.BOSS2_PROJ_MAX_DIST ?? 720;
    const life = baseLife + hold;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      this.pushBossArcaneProjectile({
        x: cx + ux * rad,
        y: cy + uy * rad,
        vx: 0,
        vy: 0,
        damage: dmg,
        r: pr,
        life: life + 0.05,
        maxDist: maxD,
        phase: "hold",
        holdLeft: hold,
        pendingUx: ux,
        pendingUy: uy,
        moveSpd: outSp,
      });
    }
    this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.55);
  }

  updateBossArcaneProjectiles(dt) {
    if (!Array.isArray(this.bossArcaneProjs) || this.bossArcaneProjs.length === 0) return;
    const hitIv = CONFIG.BOSS2_PROJ_HIT_PLAYER_CD ?? 0.42;
    const pls = this.players ?? [];
    for (let i = this.bossArcaneProjs.length - 1; i >= 0; i--) {
      const pr = this.bossArcaneProjs[i];
      if ((pr.phase ?? "move") === "hold") {
        pr.holdLeft = Math.max(0, (pr.holdLeft ?? 0) - dt);
        if (pr.holdLeft <= 1e-6) {
          pr.phase = "move";
          const sp = pr.moveSpd ?? CONFIG.BOSS2_RING_OUT_SPEED ?? 260;
          pr.vx = (pr.pendingUx ?? 1) * sp;
          pr.vy = (pr.pendingUy ?? 0) * sp;
        }
        continue;
      }
      pr.life -= dt;
      const step = Math.hypot(pr.vx ?? 0, pr.vy ?? 0) * dt;
      pr.x += (pr.vx ?? 0) * dt;
      pr.y += (pr.vy ?? 0) * dt;
      pr.traveled = (pr.traveled ?? 0) + step;
      if (
        pr.life <= 0 ||
        pr.traveled >= (pr.maxDist ?? CONFIG.BOSS2_PROJ_MAX_DIST ?? 720) ||
        pr.x < -80 ||
        pr.y < -80 ||
        pr.x > CONFIG.WORLD_W + 80 ||
        pr.y > CONFIG.WORLD_H + 80
      ) {
        this.bossArcaneProjs.splice(i, 1);
        continue;
      }
      const rr = CONFIG.PLAYER_RADIUS;
      const er = pr.r ?? CONFIG.BOSS2_PROJ_RADIUS ?? 9;
      for (let pi = 0; pi < pls.length; pi++) {
        const pl = pls[pi];
        if (!pl || (pl.hp ?? 0) <= 0) continue;
        const cds = Array.isArray(pr.hitCdPl) ? pr.hitCdPl : [];
        if (this.time < (cds[pi] ?? -999)) continue;
        if (dist(pl.x, pl.y, pr.x, pr.y) < rr + er) {
          pl.hp -= pr.damage ?? CONFIG.BOSS2_PROJ_DAMAGE ?? 15;
          cds[pi] = this.time + hitIv;
          pr.hitCdPl = cds;
          pl.hitTimer = HIT_ANIM_DURATION;
          if (pi === 0) this.playerHitTimer = HIT_ANIM_DURATION;
          this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.28);
        }
      }
    }
  }

  updateBossPulses(dt) {
    if (!Array.isArray(this.bossPulses) || this.bossPulses.length === 0) return;
    const px = this.player.x;
    const py = this.player.y;
    for (let i = this.bossPulses.length - 1; i >= 0; i--) {
      const p = this.bossPulses[i];
      p.r += p.speed * dt;
      p.life -= dt;
      if (p.r >= p.rMax || p.life <= 0) {
        this.bossPulses.splice(i, 1);
        continue;
      }
      if (this.time < (p.hitUntil ?? 0)) continue;
      const d = dist(px, py, p.x, p.y);
      const thick = p.thickness;
      if (Math.abs(d - p.r) > thick + CONFIG.PLAYER_RADIUS) continue;
      let ang = Math.atan2(py - p.y, px - p.x);
      if (ang < 0) ang += Math.PI * 2;
      const segs = p.segments;
      const step = (Math.PI * 2) / segs;
      const idx = Math.floor(ang / step);
      if (p.gaps && p.gaps.has(idx)) continue;
      // active segment hit
      this.player.hp -= p.damage;
      this.playerHitTimer = HIT_ANIM_DURATION;
      p.hitUntil = this.time + 0.35;
      this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.6);
    }
  }

  pause() {
    if (this.mode === "playing") this.mode = "paused";
  }

  resume() {
    if (this.mode === "paused") this.mode = "playing";
  }

  /** End the run immediately (same stats screen as death, different title). */
  endRun() {
    if (this.mode === "gameOver" || this.mode === "levelUp") return;
    this.endedByQuit = true;
    this.mode = "gameOver";
  }

  spawnEnemy() {
    this.spawnEnemyOfType(pickEnemyType(this.time));
  }

  /**
   * @param {string} typeId — key of ENEMY_TYPES
   * @param {{
   *   at?: { x: number; y: number };
   *   spawnPopDuration?: number;
   * }} [opts] — at: exact world position (split spawns); spawnPopDuration: split pop scale seconds
   */
  spawnEnemyOfType(typeId, opts = {}) {
    const def = ENEMY_TYPES[typeId];
    if (!def) return false;
    const maxAlive = CONFIG.SAFETY_MAX_ENEMIES_ALIVE ?? 220;
    const maxHard = CONFIG.SAFETY_MAX_ENEMIES_HARD ?? 320;
    const isBoss = typeId === "boss1" || typeId === "boss2";
    if (this.enemies.length >= maxHard) return false;
    if (!isBoss && this.enemies.length >= maxAlive) return false;
    let x;
    let y;
    if (opts.at && Number.isFinite(opts.at.x) && Number.isFinite(opts.at.y)) {
      x = clamp(opts.at.x, def.radius * 2, CONFIG.WORLD_W - def.radius * 2);
      y = clamp(opts.at.y, def.radius * 2, CONFIG.WORLD_H - def.radius * 2);
    } else {
      const p = spawnPositionAroundPlayer(
        this.player.x,
        this.player.y,
        viewWorldW(),
        viewWorldH(),
        def.radius
      );
      x = p.x;
      y = p.y;
    }
    if (
      CONFIG.COLLISION_BLOCKS_ENEMIES !== false &&
      isArenaCollisionReady() &&
      CONFIG.ARENA_COLLISION_ENABLED !== false &&
      worldCircleBlockedByArena(x, y, def.radius)
    ) {
      if (opts.at && Number.isFinite(opts.at.x) && Number.isFinite(opts.at.y)) {
        const ax = opts.at.x;
        const ay = opts.at.y;
        for (let t = 0; t < 36; t++) {
          const a = t * 0.42 + Math.random() * 0.8;
          const d = 6 + t * 4;
          const nx = clamp(
            ax + Math.cos(a) * d,
            def.radius * 2,
            CONFIG.WORLD_W - def.radius * 2
          );
          const ny = clamp(
            ay + Math.sin(a) * d,
            def.radius * 2,
            CONFIG.WORLD_H - def.radius * 2
          );
          if (!worldCircleBlockedByArena(nx, ny, def.radius)) {
            x = nx;
            y = ny;
            break;
          }
        }
      }
    }
    // Difficulty scaling: every N seconds, HP increases by ~15%.
    const stepSec = CONFIG.DIFFICULTY_STEP_SECONDS ?? 30;
    const hpMult = CONFIG.DIFFICULTY_HP_MULT_PER_STEP ?? 1.15;
    const steps = Math.max(0, Math.floor(this.time / Math.max(1, stepSec)));
    const coopHp = this.getCoopEnemyHpMult();
    const scaledMax = Math.max(
      1,
      Math.round(def.maxHp * Math.pow(Math.max(1.001, hpMult), steps) * coopHp)
    );
    const popDur =
      typeof opts.spawnPopDuration === "number" && opts.spawnPopDuration > 0
        ? opts.spawnPopDuration
        : 0;
    this.enemies.push({
      id: (this.nextEnemyId = (this.nextEnemyId ?? 1) + 1) - 1,
      typeId,
      x,
      y,
      hp: scaledMax,
      maxHp: scaledMax,
      hitFlash: 0,
      animPhase: randRange(0, 6.28),
      hammerHitUntil: 0,
      splitPopT: popDur,
      splitPopDur: popDur,
      ...(typeId === "necromancer"
        ? {
            necSummonCd: randRange(2, 4.2),
            necSummonT: 0,
            necMoving: false,
            necFacingRight: Math.random() < 0.5,
          }
        : {}),
    });
    return true;
  }

  updatePlayer(dt, playerIndex = 0) {
    const p = this.players?.[playerIndex] ?? this.player;
    if (!p) return;
    sanitizePlayerEntity(p);
    if ((p.hp ?? 0) <= 0) return;
    const m = getMovement(playerIndex);
    const sp = this.getMoveSpeed(p);
    const hpBefore = p.hp;
    const pxBefore = p.x;

    const pr =
      CONFIG.PLAYER_RADIUS *
      (typeof CONFIG.COLLISION_PLAYER_RADIUS_MULT === "number"
        ? CONFIG.COLLISION_PLAYER_RADIUS_MULT
        : 1);
    const nx = p.x + m.x * sp * dt;
    const ny = p.y + m.y * sp * dt;
    const moved = applyArenaCollisionSlide(p.x, p.y, nx, ny, pr);
    p.x = moved.x;
    p.y = moved.y;
    p.x = clamp(p.x, pr, CONFIG.WORLD_W - pr);
    p.y = clamp(p.y, pr, CONFIG.WORLD_H - pr);

    const moving = Math.hypot(m.x, m.y) > 0.1;
    p.moving = moving;
    if (moving) {
      const mm = Math.hypot(m.x, m.y);
      if (mm > 1e-4) {
        p.facingVec.x = m.x / mm;
        p.facingVec.y = m.y / mm;
      }
    }
    const h = CONFIG.WALK_KIND_AXIS_HYSTERESIS ?? 1.2;
    const ax = Math.abs(m.x);
    const ay = Math.abs(m.y);
    if (moving) {
      if (ax > ay * h) {
        p.walkKind = "side";
        if (ax > 0.01) p.facingRight = m.x > 0;
      } else if (ay > ax * h && m.y > 0) {
        p.walkKind = "down";
      } else if (ay > ax * h && m.y < 0) {
        p.walkKind = "up";
      } else {
        if (p.walkKind === "side" && ax > 0.01) p.facingRight = m.x > 0;
      }
    }

    // Berserker uses a 2-way (left/right) sheet. Keep facing responsive even when walkKind isn't "side".
    // Use the raw movement X sign (A/D) so it *always* flips when you press left/right.
    // Do not require "moving" (diagonal/slow input can fail the moving threshold).
    // If A/D is held, always face that direction.
    if (p.characterId === "berserker" && Math.abs(m.x) > 1e-4) {
      p.facingRight = m.x > 0;
    }
    // Also update facing from actual displacement (handles cases where input isn't reported but the player moves).
    if (p.characterId === "berserker") {
      const dx = p.x - pxBefore;
      if (Math.abs(dx) > 1e-3) p.facingRight = dx > 0;
    }

    // Mage (Player.png) is also 2-way (all frames face right; we flip for left).
    // Keep facing tied to A/D even when walking up/down so it never looks like "moonwalking".
    if (p.characterId === "mage" && Math.abs(m.x) > 1e-4) {
      p.facingRight = m.x > 0;
    }
    // Revenant: also 2-way (face depends on A/D).
    if (p.characterId === "revenant" && Math.abs(m.x) > 1e-4) {
      p.facingRight = m.x > 0;
    }

    const baseDpf = Math.max(0.5, CONFIG.PLAYER_WALK_DIST_PER_FRAME ?? 22);
    const sideDpf = baseDpf * (CONFIG.PLAYER_WALK_SIDE_DIST_SCALE ?? 1);
    if (moving && (p.hitTimer ?? 0) <= 0) {
      const kind = p.walkKind;
      if (kind === "side") {
        p.walkAccumSide = (p.walkAccumSide ?? 0) + sp * dt;
        const cl = sideDpf * 4;
        p.walkAccumSide %= cl;
        p.walkFrame = Math.floor(p.walkAccumSide / sideDpf) % 4;
      } else if (kind === "up") {
        p.walkAccumUp = (p.walkAccumUp ?? 0) + sp * dt;
        const cl = baseDpf * 4;
        p.walkAccumUp %= cl;
        p.walkFrame = Math.floor(p.walkAccumUp / baseDpf) % 4;
      } else {
        p.walkAccumDown = (p.walkAccumDown ?? 0) + sp * dt;
        const cl = baseDpf * 4;
        p.walkAccumDown %= cl;
        p.walkFrame = Math.floor(p.walkAccumDown / baseDpf) % 4;
      }
    } else {
      if (!moving) {
        p.walkAccumUp = 0;
        p.walkAccumDown = 0;
        p.walkAccumSide = 0;
        p.walkFrame = 0;
      }
    }

    let contactDps = 0;
    for (const e of this.enemies) {
      const def = ENEMY_TYPES[e.typeId];
      if (dist(p.x, p.y, e.x, e.y) < CONFIG.PLAYER_RADIUS + def.radius) {
        contactDps += def.touchDps;
      }
    }
    if (contactDps > 0) {
      p.hp -= contactDps * dt * CONFIG.PLAYER_CONTACT_DAMAGE_MULT;
    }

    if (CONFIG.CLEAR_ENEMIES_ON_PLAYER_CONTACT) {
      const clearSec = CONFIG.CONTACT_CLEAR_DAMAGE_SECONDS ?? 0;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const def = ENEMY_TYPES[e.typeId];
        if (def?.isBoss || e.isBoss) continue;
        if (def?.blocksContactClear) continue;
        if (dist(p.x, p.y, e.x, e.y) < CONFIG.PLAYER_RADIUS + def.radius) {
          if (clearSec > 0) {
            p.hp -= def.touchDps * clearSec;
          }
          this.killEnemy(e);
        }
      }
    }

    if (p.hp < hpBefore - 1e-4) {
      p.hitTimer = HIT_ANIM_DURATION;
    }
    if ((p.hitTimer ?? 0) > 0) {
      p.hitTimer = Math.max(0, (p.hitTimer ?? 0) - dt);
    }

    // Berserker passive: Blood Rage (auto burst windows).
    if (p.characterId === "berserker") {
      const period = Math.max(0.1, CONFIG.BERSERKER_BLOOD_RAGE_PERIOD ?? 5.0);
      const dur = Math.max(0, CONFIG.BERSERKER_BLOOD_RAGE_DURATION ?? 2.0);
      p.bloodRageCd = (p.bloodRageCd ?? period) - dt;
      if ((p.bloodRageCd ?? 0) <= 0) {
        p.bloodRageCd = period;
        p.bloodRageT = dur;
      }
      if ((p.bloodRageT ?? 0) > 0) p.bloodRageT = Math.max(0, (p.bloodRageT ?? 0) - dt);

      // VFX: embers radiating from head while active.
      if ((p.bloodRageT ?? 0) > 0) {
        p.bloodRageFxCd = (p.bloodRageFxCd ?? 0) - dt;
        const rate = 0.035; // seconds per spawn burst
        while ((p.bloodRageFxCd ?? 0) <= 0) {
          p.bloodRageFxCd = (p.bloodRageFxCd ?? 0) + rate;
          const hx = p.x + randRange(-10, 10);
          const hy = p.y - 76 + randRange(-10, 6);
          const a = randRange(-Math.PI * 0.85, -Math.PI * 0.15); // mostly upward
          const sp = randRange(60, 160);
          const outward = randRange(18, 52);
          this.particles.push({
            x: hx + Math.cos(a) * outward * 0.08,
            y: hy + Math.sin(a) * outward * 0.08,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - randRange(10, 40),
            life: randRange(0.35, 0.65),
            maxLife: randRange(0.35, 0.65),
            color: Math.random() < 0.5 ? "rgba(255,90,70,1)" : "rgba(255,190,90,1)",
            size: randRange(1.8, 3.4),
          });
        }
      } else {
        p.bloodRageFxCd = 0;
      }
    } else {
      p.bloodRageT = 0;
      p.bloodRageCd = 0;
      p.bloodRageFxCd = 0;
    }

    p.attackCd = (p.attackCd ?? 0) - dt;
    if ((p.attackCd ?? 0) <= 0) {
      if (p.characterId === "berserker") {
        // Single red slash only. Auto-aim hit direction toward nearest enemy in range so kiting still hits.
        // Sprite facing remains movement-driven elsewhere (A/D); only the slash hitbox direction is aimed.
        const aim = this.nearestEnemyForBerserkerSlash(p);
        if (!aim) {
          // Don't swing if nothing to lock onto; just re-check soon.
          p.attackCd = 0.12;
          return;
        }
        const baseAng = Math.atan2(aim.y - p.y, aim.x - p.x);
        this.spawnSlash(baseAng, p);
        p.attackCd = this.getSlashCooldown(p);
      } else if (p.characterId === "revenant") {
        // Respect Soul Rip range (not global attack range).
        const [target] = this.soulRipCastTargets(p, 1);
        if (!target) {
          p.attackCd = 0.12;
          return;
        }
        this.fireSoulRip(p);
        p.attackCd = CONFIG.SOUL_RIP_COOLDOWN ?? 0.8;
      } else {
        // Mage/Archer starter shots: only fire when a target exists; otherwise don't "spam".
        const fired = this.fireProjectiles(p);
        if (fired) p.attackCd = this.getAttackCooldown(p);
        else p.attackCd = 0.12;
      }
    }

    if ((p.attackTimer ?? 0) > 0) {
      p.attackTimer = Math.max(0, (p.attackTimer ?? 0) - dt);
    }

    this.updateSoulRipProjectiles(dt);

    // Mirror player 1 into legacy fields (used by draw + some special-case VFX).
    if (playerIndex === 0) {
      this.playerFacingRight = p.facingRight;
      this.playerWalkKind = p.walkKind;
      this.playerWalkFrame = p.walkFrame;
      this.playerHitTimer = p.hitTimer;
      this.playerMoving = p.moving;
      this.playerFacingVec = p.facingVec;
      this.playerAttackTimer = p.attackTimer;
      this.bloodRageT = p.bloodRageT;
      this.bloodRageCd = p.bloodRageCd;
    }
  }

  fireSoulRip(player = this.player) {
    const st = player?.stats ?? this.stats;
    const dur = CONFIG.SOUL_RIP_DURATION ?? 0.42;
    player.attackTimer = Math.max(player.attackTimer ?? 0, dur);
    const facingAng = player.facingRight ? 0 : Math.PI;
    const count = Math.max(1, Math.floor(CONFIG.SOUL_RIP_PROJECTILES_PER_CAST ?? 1));
    const targets = this.soulRipCastTargets(player, count);
    const speed = CONFIG.SOUL_RIP_PROJECTILE_SPEED ?? 420;
    const fwd = CONFIG.SOUL_RIP_PROJECTILE_FORWARD_OFFSET ?? 26;
    const ox = CONFIG.SOUL_RIP_PROJECTILE_SPAWN_X_OFFSET ?? 0;
    const oy = CONFIG.SOUL_RIP_PROJECTILE_SPAWN_Y_OFFSET ?? -56;
    const fan = count > 1 ? CONFIG.SOUL_RIP_PROJECTILE_FAN_SPREAD_RAD ?? 0 : 0;
    const owners = this.players ?? [];
    const oIdx = owners.indexOf(player);
    const pi = oIdx >= 0 ? oIdx : 0;
    const maxSoul = CONFIG.SAFETY_MAX_SOUL_RIP_PROJ_ALIVE ?? 48;
    while (this.soulRipProjectiles.length >= maxSoul) this.soulRipProjectiles.shift();
    // Aim and spawn from the *same* reference point: torso-offset base.
    const baseX = player.x + ox;
    const baseY = player.y + oy;
    for (let k = 0; k < count; k++) {
      const tgt = targets[k];
      let aimAng =
        tgt && Number.isFinite(tgt.y) && Number.isFinite(tgt.x)
          ? Math.atan2(tgt.y - baseY, tgt.x - baseX)
          : facingAng;
      if (count > 1 && fan > 1e-5) aimAng += (-0.5 + k / Math.max(1, count - 1)) * fan;
      const forwardX = Math.cos(aimAng);
      const forwardY = Math.sin(aimAng);
      const spawnX = baseX + forwardX * fwd;
      const spawnY = baseY + forwardY * fwd;
      const tid =
        tgt && Number.isFinite(tgt.id) ? tgt.id : null;
      this.soulRipProjectiles.push({
        x: spawnX,
        y: spawnY,
        vx: forwardX * speed,
        vy: forwardY * speed,
        r: CONFIG.SOUL_RIP_PROJECTILE_RADIUS ?? 14,
        dmg: clamp(
          (CONFIG.SOUL_RIP_DAMAGE ?? 24) *
            clamp(
              st.damageMult ?? 1,
              CONFIG.SAFETY_DAMAGE_MULT_MIN ?? 0.05,
              CONFIG.SAFETY_DAMAGE_MULT_MAX ?? 28
            ),
          0,
          9999
        ),
        ownerIndex: pi >= 0 ? pi : 0,
        targetId: tid,
      });
    }
  }

  updateSoulRipProjectiles(dt) {
    if (!Array.isArray(this.soulRipProjectiles) || this.soulRipProjectiles.length === 0) return;
    const ls = CONFIG.SOUL_RIP_LIFESTEAL_PCT ?? 0.06;
    for (let i = this.soulRipProjectiles.length - 1; i >= 0; i--) {
      const p = this.soulRipProjectiles[i];
      // Homing: steer toward the first locked target (or reacquire if it died).
      const turnRate = CONFIG.SOUL_RIP_PROJECTILE_HOMING_TURN_RATE ?? 0;
      const homingRange = CONFIG.SOUL_RIP_PROJECTILE_HOMING_RANGE ?? 0;
      if (turnRate > 1e-4 && homingRange > 1e-4) {
        let best = null;
        if (Number.isFinite(p.targetId)) {
          const tid = p.targetId;
          best = this.enemies.find((e) => e && e.id === tid && (e.hp ?? 0) > 0) ?? null;
        }
        if (!best) {
          let bestD2 = homingRange * homingRange;
          for (const e of this.enemies) {
            if (!e || (e.hp ?? 0) <= 0) continue;
            const dx = e.x - (p.x ?? 0);
            const dy = e.y - (p.y ?? 0);
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = e;
            }
          }
          p.targetId = best && Number.isFinite(best.id) ? best.id : null;
        }
        if (best) {
          const vx0 = p.vx ?? 0;
          const vy0 = p.vy ?? 0;
          const spd = Math.max(1e-4, Math.hypot(vx0, vy0));
          const dx = best.x - (p.x ?? 0);
          const dy = best.y - (p.y ?? 0);
          const mag = Math.hypot(dx, dy);
          if (mag > 1e-4) {
            const dvx = (dx / mag) * spd;
            const dvy = (dy / mag) * spd;
            const t = Math.max(0, Math.min(1, turnRate * dt));
            p.vx = vx0 + (dvx - vx0) * t;
            p.vy = vy0 + (dvy - vy0) * t;
          }
        }
      }
      const x0 = p.x;
      const y0 = p.y;
      const x1 = x0 + (p.vx ?? 0) * dt;
      const y1 = y0 + (p.vy ?? 0) * dt;
      p.x = x1;
      p.y = y1;
      if (p.x < -40 || p.y < -40 || p.x > CONFIG.WORLD_W + 40 || p.y > CONFIG.WORLD_H + 40) {
        this.soulRipProjectiles.splice(i, 1);
        continue;
      }
      let hitEnemy = null;
      // Swept collision (segment vs circle) to prevent tunneling through enemies at high speed.
      const segHitsCircle = (ax, ay, bx, by, cx, cy, rr) => {
        const abx = bx - ax;
        const aby = by - ay;
        const acx = cx - ax;
        const acy = cy - ay;
        const ab2 = abx * abx + aby * aby;
        const t = ab2 > 1e-9 ? (acx * abx + acy * aby) / ab2 : 0;
        const u = t < 0 ? 0 : t > 1 ? 1 : t;
        const hx = ax + abx * u;
        const hy = ay + aby * u;
        const dx = cx - hx;
        const dy = cy - hy;
        return dx * dx + dy * dy <= rr * rr;
      };
      for (const e of this.enemies) {
        const def = ENEMY_TYPES[e.typeId];
        const rr = (p.r ?? 0) + def.radius;
        if (segHitsCircle(x0, y0, x1, y1, e.x, e.y, rr)) {
          hitEnemy = e;
          break;
        }
      }
      if (!hitEnemy) continue;
      const dmg = p.dmg ?? 0;
      const hpBefore = hitEnemy.hp ?? 0;
      const pushDist = CONFIG.SOUL_RIP_PUSH_ON_HIT_DIST ?? 0;
      if (pushDist > 1e-3) {
        let dx = hitEnemy.x - x1;
        let dy = hitEnemy.y - y1;
        let mag = Math.hypot(dx, dy);
        if (mag <= 1e-6) {
          const pvx = p.vx ?? 0;
          const pvy = p.vy ?? 0;
          mag = Math.hypot(pvx, pvy);
          if (mag > 1e-6) {
            dx = pvx / mag;
            dy = pvy / mag;
            mag = 1;
          }
        }
        if (mag > 1e-6) {
          hitEnemy.x += (dx / mag) * pushDist;
          hitEnemy.y += (dy / mag) * pushDist;
        }
      }
      const killed = this.applyEnemyDamage(hitEnemy, dmg);
      hitEnemy.hitFlash = CONFIG.HIT_FLASH_DURATION;
      this.spawnHitParticles(hitEnemy.x, hitEnemy.y);
      this.addFloatText(
        hitEnemy.x,
        hitEnemy.y - ENEMY_TYPES[hitEnemy.typeId].radius - 4,
        Math.ceil(dmg).toString(),
        "#b8fff2"
      );
      if (killed && dmg > 0 && ls > 0) {
        const lethal = Math.min(dmg, hpBefore);
        let healAmt = lethal * ls;
        const healCap = CONFIG.SOUL_RIP_MAX_HEAL_PER_ATTACK ?? 0;
        if (healCap > 0) healAmt = Math.min(healAmt, healCap);
        const oi = Number.isFinite(p.ownerIndex) ? p.ownerIndex : 0;
        const owner = this.players?.[oi] ?? this.player;
        owner.hp = Math.min(owner.maxHp, owner.hp + healAmt);
      }
      const sh = CONFIG.SOUL_RIP_SHAKE_ON_HIT ?? 0.22;
      this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + sh);
      this.soulRipProjectiles.splice(i, 1);
    }
  }

  nearestEnemyInRange(player = this.player) {
    const bossR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    const boss = nearestBossWithinRadius(this.enemies, player.x, player.y, bossR);
    if (boss) return boss;

    let best = null;
    let bestD = CONFIG.ATTACK_RANGE;
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      const d = dist(player.x, player.y, hc.x, hc.y) - hc.r;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  nearestEnemyInFacingCone(player = this.player) {
    const half = CONFIG.ARCHER_FACING_CONE_HALF_ANGLE ?? 0.75;
    const maxD = CONFIG.ATTACK_RANGE;
    const fx = player.facingVec?.x ?? 1;
    const fy = player.facingVec?.y ?? 0;
    const mag = Math.hypot(fx, fy);
    const nx = mag > 1e-4 ? fx / mag : 1;
    const ny = mag > 1e-4 ? fy / mag : 0;
    const facingAng = Math.atan2(ny, nx);
    const bossR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    const boss = nearestBossWithinRadius(this.enemies, player.x, player.y, bossR);
    if (boss) {
      // Respect cone gating: if boss is wildly off-facing, allow normal cone behavior.
      const hc = enemyHitCircle(boss);
      const dx = hc.x - player.x;
      const dy = hc.y - player.y;
      const d = Math.hypot(dx, dy) - hc.r;
      if (d < maxD) {
        const a = Math.atan2(dy, dx);
        let da = a - facingAng;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) <= half) return boss;
      }
    }
    let best = null;
    let bestD = maxD;
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      const dx = hc.x - player.x;
      const dy = hc.y - player.y;
      const d = Math.hypot(dx, dy) - hc.r;
      if (d >= bestD) continue;
      const a = Math.atan2(dy, dx);
      let da = a - facingAng;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > half) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  fireProjectiles(player = this.player) {
    const st = player?.stats ?? this.stats;
    const isArcher = (player?.characterId ?? st.characterId) === "archer";
    const target = isArcher
      ? (this.nearestEnemyInFacingCone(player) ?? this.nearestEnemyInRange(player))
      : this.nearestEnemyInRange(player);
    if (!target) return false;

    const dToTarget = dist(player.x, player.y, target.x, target.y);
    const baseAng =
      dToTarget < 1e-4 ? Math.random() * Math.PI * 2 : angle(player.x, player.y, target.x, target.y);
    const projMax = CONFIG.SAFETY_PROJECTILE_COUNT_MAX ?? 14;
    const count = clamp(Math.floor(st.projectileCount ?? 1), 1, projMax);
    const maxBolts = CONFIG.SAFETY_MAX_MAGE_PROJECTILES ?? 160;
    while (this.projectiles.length >= maxBolts) this.projectiles.shift();
    const step = isArcher
      ? (CONFIG.ARCHER_MULTI_ARROW_SPREAD ?? CONFIG.EXTRA_PROJECTILE_SPREAD)
      : CONFIG.EXTRA_PROJECTILE_SPREAD;
    const angles = [baseAng];
    for (let i = 1; i < count; i++) {
      const tier = Math.ceil(i / 2);
      const sign = i % 2 === 1 ? 1 : -1;
      angles.push(baseAng + sign * tier * step);
    }

    const ed = this.getEffectiveDamage(player);
    const dmgVal = clamp(Number.isFinite(ed) ? ed : 0, 0, 9999);
    const rVal = clamp(this.getProjectileRadius(player), 0.5, 120);
    for (const ang of angles) {
      const spd = CONFIG.BASE_PROJECTILE_SPEED * (isArcher ? (CONFIG.ARCHER_PROJECTILE_SPEED_MULT ?? 1.6) : 1);
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      const poisonOn = isArcher && (st.poisonArrows ?? 0) > 0;
      this.projectiles.push({
        x: player.x + Math.cos(ang) * 18,
        y: player.y + Math.sin(ang) * 18,
        vx,
        vy,
        damage: dmgVal,
        r: rVal,
        tint: isArcher ? "green" : "purple",
        sprite: isArcher ? "archer" : null,
        pierceLeft: isArcher ? (CONFIG.ARCHER_PIERCE_COUNT ?? 2) : 1,
        hit: isArcher ? new Set() : null,
        poison:
          poisonOn
            ? {
                dur: CONFIG.ARCHER_POISON_DURATION ?? 2.2,
                dps: CONFIG.ARCHER_POISON_DPS ?? 9,
              }
            : null,
      });
    }
    return true;
  }

  updateEnemies(dt) {
    if (this.bossIntroT > 0) this.bossIntroT = Math.max(0, this.bossIntroT - dt);
    for (const e of this.enemies) {
      const tgt = this.nearestAlivePlayer(e.x, e.y) ?? this.player;
      const def = ENEMY_TYPES[e.typeId];
      // Slow effects from pools (short refresh; 0 when expired).
      if ((e.slowT ?? 0) > 0) {
        e.slowT = Math.max(0, e.slowT - dt);
      } else {
        e.slowT = 0;
        e.slowPct = 0;
      }
      // Poison DOT (used by Verdant Ranger).
      if ((e.poisonT ?? 0) > 0 && (e.poisonDps ?? 0) > 0) {
        const t = Math.min(dt, e.poisonT);
        e.poisonT -= t;
        const dmg = e.poisonDps * t;
        if (dmg > 0) {
          if (this.applyEnemyDamage(e, dmg, { skipHitSfx: true })) {
            continue;
          }
          // light flash so poison reads
          if (e.hitFlash <= 0) e.hitFlash = CONFIG.HIT_FLASH_DURATION * 0.35;
        }
        if (e.poisonT <= 0) {
          e.poisonT = 0;
          e.poisonDps = 0;
        }
      }
      let sp = def.speed;
      if ((e.slowT ?? 0) > 0 && (e.slowPct ?? 0) > 0) {
        sp *= Math.max(0.25, 1 - e.slowPct);
      }
      // Beast: pause → dash → recover loop (burst threat).
      if (e.typeId === "beast") {
        const pauseDur = CONFIG.BEAST_PAUSE_DURATION ?? 0.38;
        const dashDur = CONFIG.BEAST_DASH_DURATION ?? 0.22;
        const recDur = CONFIG.BEAST_RECOVER_DURATION ?? 0.5;
        const dashSp = CONFIG.BEAST_DASH_SPEED ?? 560;

        const st = e.beastState ?? "pause";
        if (st === "pause") {
          e.beastPauseT = (e.beastPauseT ?? pauseDur) - dt;
          if (e.beastPauseT <= 0) {
            e.beastState = "dash";
            e.beastDashT = dashDur;
            e.beastPauseT = pauseDur;
            e.beastDashAng = angle(e.x, e.y, tgt.x, tgt.y);
          }
        } else if (st === "dash") {
          e.beastDashT = (e.beastDashT ?? dashDur) - dt;
          const a = Number.isFinite(e.beastDashAng) ? e.beastDashAng : angle(e.x, e.y, tgt.x, tgt.y);
          const step = dashSp * dt;
          const nx = e.x + Math.cos(a) * step;
          const ny = e.y + Math.sin(a) * step;
          const moved = applyArenaCollisionSlideEnemy(e.x, e.y, nx, ny, def.radius);
          e.x = moved.x;
          e.y = moved.y;
          if (e.beastDashT <= 0) {
            e.beastState = "recover";
            e.beastRecoverT = recDur;
            e.beastDashT = dashDur;
          }
        } else {
          e.beastRecoverT = (e.beastRecoverT ?? recDur) - dt;
          if (e.beastRecoverT <= 0) {
            e.beastState = "pause";
            e.beastPauseT = pauseDur;
            e.beastRecoverT = recDur;
          }
        }
        if (e.hitFlash > 0) e.hitFlash -= dt;
        if (e.splitPopT > 0) e.splitPopT -= dt;
        continue;
      }
      if (e.typeId === "boss1") {
        // Fire Demon: simple chase, plus periodic charge → pulse.
        e.bossAnimT = (e.bossAnimT ?? 0) + dt;

        const chargeTime = CONFIG.BOSS1_CHARGE_TIME ?? 0.8;
        if ((e.bossChargeT ?? 0) > 0) {
          e.bossChargeT = Math.max(0, e.bossChargeT - dt);
          sp *= 0.15;
          e.bossState = "charge";
          e.bossAnimKey = "charge";
          const u = 1 - e.bossChargeT / chargeTime;
          const eased = Math.min(0.999, Math.max(0, u * (0.85 + 0.25 * u)));
          e.bossAnimFrame = Math.min(4, Math.floor(eased * 5));
          if (e.bossChargeT <= 0) {
            // Fire pulse
            const segs = Math.max(6, Math.floor(CONFIG.BOSS1_PULSE_SEGMENTS ?? 9));
            const gapsN = Math.max(1, Math.min(segs - 2, Math.floor(CONFIG.BOSS1_PULSE_SAFE_GAPS ?? 3)));
            const gaps = new Set();
            while (gaps.size < gapsN) gaps.add(Math.floor(Math.random() * segs));
            const pulse = {
              x: e.x,
              y: e.y,
              r: CONFIG.BOSS1_PULSE_RADIUS_START ?? 46,
              rMax: CONFIG.BOSS1_PULSE_RADIUS_MAX ?? 420,
              speed: CONFIG.BOSS1_PULSE_SPEED ?? 260,
              thickness: CONFIG.BOSS1_PULSE_THICKNESS ?? 12,
              segments: segs,
              gaps,
              damage: CONFIG.BOSS1_PULSE_DAMAGE ?? 22,
              life: 2.4,
              hitUntil: 0,
            };
            this.bossPulses.push(pulse);
            e.bossPlanned = null;
            e.bossNextPulseIn = randRange(
              CONFIG.BOSS1_PULSE_INTERVAL_MIN ?? 5,
              CONFIG.BOSS1_PULSE_INTERVAL_MAX ?? 7
            );
            this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 1.1);
            // Burst particles
            for (let n = 0; n < 14; n++) {
              const a = Math.random() * Math.PI * 2;
              const s = randRange(80, 210);
              this.particles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: randRange(0.22, 0.5),
                maxLife: 0.5,
                color: "rgba(255, 120, 40, 0.9)",
                size: randRange(2, 4.5),
              });
            }
          }
        } else {
          e.bossNextPulseIn = (e.bossNextPulseIn ?? 6) - dt;
          const dPlayer = dist(e.x, e.y, tgt.x, tgt.y);
          const dEnterWalk = def.radius * 1.35 + 26;
          const dExitWalk = def.radius * 1.35 + 14;
          const motion = e.bossMotion ?? "walk";
          let nextMotion = motion;
          if (motion === "idle") {
            if (dPlayer > dEnterWalk) nextMotion = "walk";
          } else {
            if (dPlayer < dExitWalk) nextMotion = "idle";
          }
          if (nextMotion !== motion) {
            e.bossMotion = nextMotion;
            e.bossAnimT = 0;
          }
          const moving = (e.bossMotion ?? "walk") === "walk";
          if (e.bossNextPulseIn <= 0) {
            e.bossChargeT = chargeTime;
            e.bossState = "charge";
            e.bossAnimKey = "charge";
            e.bossAnimFrame = 0;
            // Plan the gaps for preview during charge
            const segs = Math.max(6, Math.floor(CONFIG.BOSS1_PULSE_SEGMENTS ?? 9));
            const gapsN = Math.max(1, Math.min(segs - 2, Math.floor(CONFIG.BOSS1_PULSE_SAFE_GAPS ?? 3)));
            const gaps = new Set();
            while (gaps.size < gapsN) gaps.add(Math.floor(Math.random() * segs));
            e.bossPlanned = { segments: segs, gaps };
          } else if (moving) {
            e.bossState = "walk";
            e.bossAnimKey = "walk";
            const fps = 5.2;
            e.bossAnimFrame = Math.floor(e.bossAnimT * fps) % 4;
          } else {
            e.bossState = "idle";
            e.bossAnimKey = "idle";
            const fps = 1.8;
            e.bossAnimFrame = Math.floor(e.bossAnimT * fps) % 4;
          }
        }
      } else if (e.typeId === "boss2") {
        e.bossAnimT = (e.bossAnimT ?? 0) + dt;
        const ch = CONFIG.BOSS2_CHARGE_TIME ?? 0.72;
        const gap = CONFIG.BOSS2_PATTERN_GAP_SEC ?? 2;
        const moveM = CONFIG.BOSS2_MOVE_SPEED_MULT ?? 0.5;
        const core = this.getBoss2CoreWorld(e);
        const phase = e.boss2Phase ?? "roam";

        if (phase === "roam") {
          sp *= moveM;
          e.boss2WaitT = (e.boss2WaitT ?? 0) - dt;
          const fpsIdle = 1.65;
          e.bossAnimKey = "idle";
          e.bossAnimFrame = Math.floor(e.bossAnimT * fpsIdle) % 4;
          if ((e.boss2WaitT ?? 0) <= 0) {
            e.boss2Phase = "charge";
            e.boss2ChargeT = ch;
            e.bossAnimKey = "charge";
            e.bossAnimFrame = 0;
          }
        } else if (phase === "charge") {
          e.boss2ChargeT = Math.max(0, (e.boss2ChargeT ?? 0) - dt);
          sp *= 0.12;
          const u = 1 - Math.max(1e-4, e.boss2ChargeT) / Math.max(1e-4, ch);
          const eased = Math.min(0.999, Math.max(0, u * (0.82 + 0.28 * u)));
          e.bossAnimKey = "charge";
          e.bossAnimFrame = Math.min(3, Math.floor(eased * 4));
          if (e.boss2ChargeT <= 0) {
            const pat = (e.boss2PatIx ?? 0) % 4;
            e.boss2PatIx = (e.boss2PatIx ?? 0) + 1;
            e.boss2CurPat = pat;
            if (pat === 0) {
              this.spawnBoss2RadialBurst(core.x, core.y);
              e.boss2Phase = "recover";
              e.boss2RecoverT = gap;
            } else if (pat === 1) {
              e.boss2Phase = "attack";
              e.boss2AtkT = CONFIG.BOSS2_SPIRAL_DURATION_SEC ?? 2.5;
              e.boss2SpiralAcc = 0;
              e.bossAnimKey = "attack";
            } else if (pat === 2) {
              this.spawnBoss2ConeBurst(e, core.x, core.y, tgt);
              e.boss2Phase = "recover";
              e.boss2RecoverT = gap;
            } else {
              this.spawnBoss2DelayedRing(core.x, core.y);
              e.boss2Phase = "recover";
              e.boss2RecoverT = gap;
            }
          }
        } else if (phase === "attack") {
          sp *= 0.1;
          const pat = e.boss2CurPat ?? 1;
          if (pat !== 1) {
            e.boss2Phase = "recover";
            e.boss2RecoverT = gap;
          } else {
            e.boss2AtkT = (e.boss2AtkT ?? 0) - dt;
            e.boss2SpiralAng =
              (e.boss2SpiralAng ?? 0) + dt * (CONFIG.BOSS2_SPIRAL_TURN_SPEED ?? 1.35);
            e.boss2SpiralAcc = (e.boss2SpiralAcc ?? 0) + dt;
            const intv = CONFIG.BOSS2_SPIRAL_FIRE_INTERVAL ?? 0.11;
            const spdSp = CONFIG.BOSS2_SPIRAL_SHOT_SPEED ?? 255;
            while ((e.boss2SpiralAcc ?? 0) >= intv) {
              e.boss2SpiralAcc -= intv;
              const ca = e.boss2SpiralAng ?? 0;
              this.pushBossArcaneProjectile({
                x: core.x,
                y: core.y,
                vx: Math.cos(ca) * spdSp,
                vy: Math.sin(ca) * spdSp,
                damage: CONFIG.BOSS2_PROJ_DAMAGE ?? 15,
                r: CONFIG.BOSS2_PROJ_RADIUS ?? 9,
                life: CONFIG.BOSS2_PROJ_LIFE_SEC ?? 3.2,
                maxDist: CONFIG.BOSS2_PROJ_MAX_DIST ?? 720,
                phase: "move",
                holdLeft: 0,
              });
            }
            e.bossAnimKey = "attack";
            e.bossAnimFrame = Math.floor(e.bossAnimT * 6.5) % 4;
            if (e.boss2AtkT <= 0) {
              e.boss2Phase = "recover";
              e.boss2RecoverT = gap;
            }
          }
        } else if (phase === "recover") {
          sp *= moveM;
          e.boss2RecoverT = Math.max(0, (e.boss2RecoverT ?? gap) - dt);
          e.bossAnimKey = "walk";
          e.bossAnimFrame = Math.floor(e.bossAnimT * 4.0) % 4;
          if (e.boss2RecoverT <= 0) {
            e.boss2Phase = "roam";
            e.boss2WaitT = 0;
          }
        }
      }
      if (def.organicSlime) {
        sp *= 1 + 0.08 * Math.sin(this.time * 5.5 + (e.animPhase ?? 0));
      }
      const er = def.radius;
      const erEff =
        er *
        (typeof CONFIG.COLLISION_ENEMY_RADIUS_MULT === "number"
          ? Math.max(0.75, Math.min(1, CONFIG.COLLISION_ENEMY_RADIUS_MULT))
          : 1);
      const blockEn = CONFIG.COLLISION_BLOCKS_ENEMIES !== false;
      const useAvoid =
        CONFIG.ENEMY_WALL_AVOIDANCE !== false &&
        blockEn &&
        isArenaCollisionReady() &&
        CONFIG.ARENA_COLLISION_ENABLED !== false;
      const ox0 = e.x;
      const oy0 = e.y;
      let tx = tgt.x;
      let ty = tgt.y;
      if (e.typeId === "necromancer") {
        const px = tgt.x;
        const py = tgt.y;
        const hys = CONFIG.NECRO_FLIP_HYSTERESIS_PX ?? 28;
        if (px < e.x - hys) e.necFacingRight = false;
        else if (px > e.x + hys) e.necFacingRight = true;

        const dMin = CONFIG.NECRO_PREFERRED_DIST_MIN ?? 198;
        const dMax = CONFIG.NECRO_PREFERRED_DIST_MAX ?? 392;
        const d = dist(e.x, e.y, px, py);

        if ((e.necSummonT ?? 0) > 0) {
          e.necSummonT -= dt;
          sp = 0;
          if (e.necSummonT <= 0) {
            const a = angle(e.x, e.y, px, py) + randRange(-0.55, 0.55);
            const spawnR = 28 + Math.random() * 32;
            this.spawnEnemyOfType("skeleton", {
              at: {
                x: e.x + Math.cos(a) * spawnR,
                y: e.y + Math.sin(a) * spawnR,
              },
            });
            e.necSummonCd =
              (CONFIG.NECRO_SUMMON_COOLDOWN ?? 4.25) + randRange(-0.55, 0.85);
          }
        } else {
          e.necSummonCd = (e.necSummonCd ?? 3) - dt;
          const minCastD = CONFIG.NECRO_SUMMON_MIN_DIST ?? 128;
          if ((e.necSummonCd ?? 0) <= 0 && d >= minCastD) {
            e.necSummonT = CONFIG.NECRO_SUMMON_CAST_DURATION ?? 0.92;
            e.necSummonCd = 9999;
          }

          if (d < dMin) {
            const inv = d > 1e-4 ? 1 / d : 1;
            tx = e.x + (e.x - px) * inv * 520;
            ty = e.y + (e.y - py) * inv * 520;
          } else if (d > dMax) {
            tx = px;
            ty = py;
          } else {
            const perp = Math.atan2(e.y - py, e.x - px) + Math.PI / 2;
            tx = e.x + Math.cos(perp) * 260;
            ty = e.y + Math.sin(perp) * 260;
            sp *= CONFIG.NECRO_STRAFE_SPEED_MULT ?? 0.36;
          }
        }
      }
      if (e.typeId === "bat") {
        const toward = angle(e.x, e.y, tgt.x, tgt.y);
        const amp = CONFIG.BAT_ZIG_LATERAL ?? 34;
        const f1 = CONFIG.BAT_ZIG_FREQ ?? 8.2;
        const f2 = CONFIG.BAT_FLUTTER_FREQ ?? 12.5;
        const ph = e.animPhase ?? 0;
        const s1 = Math.sin(this.time * f1 + ph);
        const s2 = Math.sin(this.time * f2 + ph * 1.73);
        const lateral = amp * (s1 * 0.82 + s2 * 0.28);
        const px = tgt.x;
        const py = tgt.y;
        tx = px - Math.sin(toward) * lateral;
        ty = py + Math.cos(toward) * lateral;
      }
      if (e.typeId === "boss2") {
        const px = tgt.x;
        const py = tgt.y;
        const dMin = CONFIG.BOSS2_ORBIT_DIST_MIN ?? 210;
        const dMax = CONFIG.BOSS2_ORBIT_DIST_MAX ?? 400;
        const d = dist(e.x, e.y, px, py);
        if (d < dMin) {
          const inv = d > 1e-4 ? 1 / d : 1;
          tx = e.x + (e.x - px) * inv * 520;
          ty = e.y + (e.y - py) * inv * 520;
        } else if (d > dMax) {
          tx = px;
          ty = py;
        } else {
          const perp = Math.atan2(e.y - py, e.x - px) + Math.PI / 2;
          tx = e.x + Math.cos(perp) * 260;
          ty = e.y + Math.sin(perp) * 260;
          sp *= CONFIG.BOSS2_ORBIT_STRAFE_MULT ?? 0.38;
        }
      }

      // If an enemy is struggling to make progress (common on thin obstacles like fences),
      // temporarily target a point *around* the player to encourage going around the obstruction.
      // This avoids the "slide in place forever while roughly parallel" failure mode.
      if (useAvoid && e.typeId !== "bat" && e.typeId !== "necromancer" && !def?.isBoss && !e.isBoss) {
        const sl = e._stuckLevel ?? 0;
        const smt = e._stuckMoveT ?? 0;
        if (sl >= 2 || smt >= 0.45) {
          const dxp = tgt.x - e.x;
          const dyp = tgt.y - e.y;
          const dpp = Math.hypot(dxp, dyp);
          if (dpp > 1e-4) {
            const nx = dxp / dpp;
            const ny = dyp / dpp;
            // Perp to "to player"
            const pxv = -ny;
            const pyv = nx;
            // Pick a stable side per enemy (based on animPhase) so they don't jitter left/right.
            const side = (Math.sin((e.animPhase ?? 0) * 999) >= 0 ? 1 : -1) * (sl >= 4 ? -1 : 1);
            const off = Math.min(220, Math.max(90, def.radius * 7));
            tx = tgt.x + pxv * off * side;
            ty = tgt.y + pyv * off * side;
          }
        }
      }
      moveEnemyChasePlayer(e, tx, ty, sp, dt, erEff, useAvoid);
      if (e.typeId === "necromancer") {
        const moved = dist(ox0, oy0, e.x, e.y);
        // Prevent walk/idle thrash: drive animation from actual movement, not target selection.
        e.necMoving = moved > 0.65;
      }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.splitPopT > 0) e.splitPopT -= dt;
    }
  }

  updateProjectiles(dt) {
    outer: for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0 || p.y < 0 || p.x > CONFIG.WORLD_W || p.y > CONFIG.WORLD_H) {
        this.projectiles.splice(i, 1);
        continue;
      }
      for (const e of this.enemies) {
        const hc = enemyHitCircle(e);
        const hitSet = p.hit instanceof Set ? p.hit : null;
        if (hitSet && hitSet.has(e)) continue;
        if (dist(p.x, p.y, hc.x, hc.y) < p.r + hc.r) {
          this.applyEnemyDamage(e, p.damage);
          // Poison arrows (Verdant Ranger)
          if (p.poison && (p.poison.dur ?? 0) > 0 && (p.poison.dps ?? 0) > 0) {
            const cur = e.poisonT ?? 0;
            e.poisonT = Math.max(cur, p.poison.dur);
            e.poisonDps = Math.max(e.poisonDps ?? 0, p.poison.dps);
          }
          e.hitFlash = CONFIG.HIT_FLASH_DURATION;
          this.spawnHitParticles(hc.x, hc.y);
          this.addFloatText(e.x, e.y - (ENEMY_TYPES[e.typeId]?.radius ?? 10) - 4, Math.ceil(p.damage).toString(), "#e8d4ff");
          if (hitSet) hitSet.add(e);
          if (Number.isFinite(p.pierceLeft)) {
            p.pierceLeft -= 1;
            if (p.pierceLeft <= 0) {
              this.projectiles.splice(i, 1);
            }
          } else {
            this.projectiles.splice(i, 1);
          }
          continue outer; // one hit per frame per projectile
        }
      }
    }
  }

  killEnemy(e) {
    return this.killEnemyWithOpts(e, {});
  }

  /** @param {{ noXp?: boolean }} opts */
  killEnemyWithOpts(e, opts) {
    const def = ENEMY_TYPES[e.typeId];
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) {
      this.enemies.splice(idx, 1);
      this.playEnemyDeathSfx();
    }
    if (e.typeId === "boss1" || e.typeId === "boss2" || def?.isBoss) {
      // Boss milestone already marked on spawn; this is just for clarity/future hooks.
      this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 2.2);
      const msg =
        e.typeId === "boss2"
          ? "Arcane Sentinel Defeated"
          : e.typeId === "boss1"
            ? "Fire Demon Defeated"
            : "Boss Defeated!";
      const col =
        e.typeId === "boss2" ? "#e8ccff" : e.typeId === "boss1" ? "#ffe08a" : "#ffe08a";
      this.addFloatText(e.x, e.y - 70, msg, col);
    }

    const ex = e.x;
    const ey = e.y;
    if (def.explodesOnDeath) {
      this.applyExploderExplosion(ex, ey, def);
    }

    // Drops: XP orb tiers + optional pickups.
    if (opts?.noXp !== true) {
      const r = Math.random();
      const pL = CONFIG.XP_ORB_DROP_P_LARGE ?? 0.03;
      const pM = CONFIG.XP_ORB_DROP_P_MED ?? 0.12;
      const tier = r < pL ? "large" : r < pL + pM ? "med" : "small";
      const value =
        tier === "large"
          ? (CONFIG.XP_ORB_LARGE_VALUE ?? 8)
          : tier === "med"
            ? (CONFIG.XP_ORB_MED_VALUE ?? 3)
            : (CONFIG.XP_ORB_SMALL_VALUE ?? 1);
      this.xpOrbs.push({
        x: ex,
        y: ey,
        value,
        tier,
        floatPhase: Math.random() * Math.PI * 2,
      });
    }

    // Pickups (independent rolls).
    const pickupLife = 10;
    const gOk = (this.pickupDropGlobalCd ?? 0) <= 0;
    if (gOk && (this.pickupDropHeartCd ?? 0) <= 0 && Math.random() < (CONFIG.PICKUP_DROP_HEART_P ?? 0.06)) {
      this.pickups.push({
        kind: "heart",
        x: ex,
        y: ey,
        life: pickupLife,
        maxLife: pickupLife,
        floatPhase: Math.random() * Math.PI * 2,
      });
      this.pickupDropGlobalCd = 0.22;
      this.pickupDropHeartCd = 0.75;
    }
    if (gOk && (this.pickupDropMagnetCd ?? 0) <= 0 && Math.random() < (CONFIG.PICKUP_DROP_MAGNET_P ?? 0.02)) {
      this.pickups.push({
        kind: "magnet",
        x: ex,
        y: ey,
        life: pickupLife,
        maxLife: pickupLife,
        floatPhase: Math.random() * Math.PI * 2,
      });
      this.pickupDropGlobalCd = 0.22;
      this.pickupDropMagnetCd = 1.1;
    }
    if (Math.random() < (CONFIG.PICKUP_DROP_BOMB_P ?? 0.02)) {
      this.pickups.push({
        kind: "bomb",
        x: ex,
        y: ey,
        life: pickupLife,
        maxLife: pickupLife,
        floatPhase: Math.random() * Math.PI * 2,
      });
    }
    if (def.splitsInto && def.splitsInto.typeId) {
      const si = def.splitsInto;
      const n = Math.min(4, Math.max(1, si.count ?? 2));
      const spread = si.spawnRadius ?? 14;
      const pop = si.popDuration ?? 0.22;
      for (let i = 0; i < n; i++) {
        const a = ((i / n) * Math.PI * 2) + randRange(-0.25, 0.25);
        this.spawnEnemyOfType(si.typeId, {
          at: { x: ex + Math.cos(a) * spread, y: ey + Math.sin(a) * spread },
          spawnPopDuration: pop,
        });
      }
      this.spawnSlimeSplitBurst(ex, ey);
    }
    if (def.explodesOnDeath) {
      /* explosion VFX only; no generic death burst */
    } else if (def.splitsInto) {
      /* slime green burst above */
    } else {
      this.spawnDeathBurst(ex, ey, def.color);
    }
    this.shake = Math.min(
      CONFIG.SCREEN_SHAKE_MAX ?? 3,
      this.shake + (CONFIG.SCREEN_SHAKE_PER_KILL ?? 1)
    );
  }

  spawnHitParticles(x, y) {
    for (let n = 0; n < 6; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(40, 120);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randRange(0.15, 0.35),
        maxLife: 0.35,
        color: "rgba(200, 160, 255, 0.9)",
        size: randRange(2, 4),
      });
    }
  }

  spawnDeathBurst(x, y, tint) {
    for (let n = 0; n < 12; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(60, 180);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randRange(0.25, 0.55),
        maxLife: 0.55,
        color: tint,
        size: randRange(3, 6),
      });
    }
  }

  spawnSlimeSplitBurst(x, y) {
    for (let n = 0; n < 18; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(70, 200);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randRange(0.2, 0.42),
        maxLife: 0.42,
        color: "rgba(120, 255, 160, 0.95)",
        size: randRange(2.5, 5.5),
      });
    }
    for (let n = 0; n < 8; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(40, 110);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - randRange(20, 70),
        life: randRange(0.28, 0.5),
        maxLife: 0.5,
        color: "rgba(200, 255, 220, 0.75)",
        size: randRange(2, 4),
      });
    }
  }

  /** Fire burst + ring read for exploder death AoE. */
  spawnExplosionEffect(x, y, radius) {
    for (let n = 0; n < 22; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(90, 260);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randRange(0.2, 0.45),
        maxLife: 0.45,
        color: "rgba(255, 140, 60, 0.95)",
        size: randRange(3, 7),
      });
    }
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(a) * radius * 0.35,
        y: y + Math.sin(a) * radius * 0.35,
        vx: Math.cos(a) * randRange(40, 120),
        vy: Math.sin(a) * randRange(40, 120),
        life: 0.35,
        maxLife: 0.35,
        color: "rgba(255, 200, 100, 0.85)",
        size: randRange(4, 8),
      });
    }
  }

  /**
   * AoE when an exploder dies. Damages player and all enemies in radius; chained exploders can chain.
   */
  applyExploderExplosion(x, y, sourceDef) {
    const R = sourceDef.explosionRadius;
    const dmg = sourceDef.explosionDamage;
    this.spawnExplosionEffect(x, y, R);

    if (dist(this.player.x, this.player.y, x, y) < R + CONFIG.PLAYER_RADIUS) {
      this.player.hp -= dmg;
      this.playerHitTimer = HIT_ANIM_DURATION;
      this.addFloatText(
        this.player.x,
        this.player.y - CONFIG.PLAYER_RADIUS - 8,
        Math.ceil(dmg).toString(),
        "#ff9a6e"
      );
    }

    const killed = [];
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      const d = ENEMY_TYPES[e.typeId];
      if (dist(hc.x, hc.y, x, y) >= R + hc.r) continue;
      e.hitFlash = CONFIG.HIT_FLASH_DURATION;
      this.spawnHitParticles(hc.x, hc.y);
      this.addFloatText(
        e.x,
        e.y - d.radius - 4,
        Math.ceil(dmg).toString(),
        "#ffb070"
      );
      if (this.applyEnemyDamage(e, dmg)) killed.push(e);
    }
    for (const e of killed) {
      this.killEnemy(e);
    }
  }

  updateXpOrbs(dt) {
    if (this.magnetT > 0) this.magnetT = Math.max(0, this.magnetT - dt);
    const magnetR0 = CONFIG.XP_ORB_MAGNET ?? 140;
    const magnetR =
      this.magnetT > 0
        ? Math.min(CONFIG.XP_ORB_MAGNET_MAX ?? 420, CONFIG.XP_ORB_MAGNET_WHEN_PICKUP ?? 320)
        : magnetR0;
    for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
      const o = this.xpOrbs[i];
      const tgt = this.nearestAlivePlayer(o.x, o.y) ?? this.player;
      const px = tgt.x;
      const py = tgt.y;
      const d = dist(px, py, o.x, o.y);
      if (d < magnetR && d > 0.01) {
        const pull = CONFIG.XP_ORB_PULL * dt;
        const nx = (px - o.x) / d;
        const ny = (py - o.y) / d;
        o.x += nx * pull;
        o.y += ny * pull;
      }
      if (d < CONFIG.PLAYER_RADIUS + CONFIG.XP_ORB_RADIUS) {
        const v = Number(o.value);
        if (Number.isFinite(v) && v > 0) {
          this.playXpPickupSfx();
          this.addXp(v);
        }
        this.spawnPickupSparkle(o.x, o.y);
        this.xpOrbs.splice(i, 1);
      }
    }
  }

  spawnPickupSparkle(x, y) {
    for (let n = 0; n < 8; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(30, 90);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.4,
        maxLife: 0.4,
        color: "rgba(180, 140, 255, 1)",
        size: 2.5,
      });
    }
  }

  addXp(amount) {
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    if (!Number.isFinite(this.xp)) this.xp = 0;
    this.xp += v;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = this.computeXpToNext();
      this.levelUpsPending += 1;
    }
    if (this.mode === "playing" && this.levelUpsPending > 0) {
      this.openLevelUp();
    }
  }

  openLevelUp() {
    this.mode = "levelUp";
    const alive = this.alivePlayers();
    const aliveIndices = alive.map((p) => (this.players ?? []).indexOf(p)).filter((i) => i >= 0);
    const pickIdx =
      aliveIndices.length > 0 ? aliveIndices[(Math.max(0, this.level - 2) % aliveIndices.length)] : 0;
    this.upgradePlayerIndex = pickIdx;
    const ps = this.players?.[pickIdx]?.stats ?? this.stats;
    this.pendingUpgrades = pickThreeUpgrades(ps, Math.random, { level: this.level });
    this.shake = Math.min(
      CONFIG.SCREEN_SHAKE_LEVEL_MAX ?? 3.5,
      this.shake + (CONFIG.SCREEN_SHAKE_ON_LEVEL ?? 1.5)
    );
    this.playLevelUpSfx();
  }

  applyUpgrade(upgrade) {
    const idx = Math.max(0, Math.min((this.players?.length ?? 1) - 1, Math.floor(this.upgradePlayerIndex ?? 0)));
    const p = this.players?.[idx] ?? this.player;
    const st = p?.stats ?? this.stats;
    upgrade.apply(st);
    sanitizePlayerStats(st);
    // Small heal goes only to the upgraded player (keeps MVP simple + matches per-player upgrades).
    if (p && (p.hp ?? 0) > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.05);
    }
    this.levelUpsPending = Math.max(0, this.levelUpsPending - 1);
    if (this.levelUpsPending > 0) {
      this.playLevelUpSfx();
      const ps = this.players?.[idx]?.stats ?? this.stats;
      this.pendingUpgrades = pickThreeUpgrades(ps, Math.random, { level: this.level });
    } else {
      this.mode = "playing";
      this.pendingUpgrades = [];
    }
  }

  /** Online: guest chose a card; host validates seat + id then applies. */
  applyUpgradeByRemoteChoice(upgradeId, fromSeat) {
    if (this.netMode !== "host" || this.mode !== "levelUp") return;
    const seat = Math.max(0, Math.min(3, Math.floor(fromSeat ?? -1)));
    const cur = Math.max(0, Math.min((this.players?.length ?? 1) - 1, Math.floor(this.upgradePlayerIndex ?? 0)));
    if (seat !== cur) return;
    const u = (this.pendingUpgrades ?? []).find((x) => x && x.id === upgradeId);
    if (!u) return;
    this.applyUpgrade(u);
  }

  /**
   * Apply a movement-only prediction step for the local seat.
   * Mirrors the position/facing parts of `updatePlayer` without spawning combat/VFX.
   */
  predictLocalMovement(dt, seat) {
    const p = this.players?.[seat];
    if (!p) return;
    sanitizePlayerEntity(p);
    if ((p.hp ?? 0) <= 0) return;

    const m = getMovement(seat);
    const sp = this.getMoveSpeed(p);

    const pr =
      CONFIG.PLAYER_RADIUS *
      (typeof CONFIG.COLLISION_PLAYER_RADIUS_MULT === "number"
        ? CONFIG.COLLISION_PLAYER_RADIUS_MULT
        : 1);

    const nx = p.x + m.x * sp * dt;
    const ny = p.y + m.y * sp * dt;
    const moved = applyArenaCollisionSlide(p.x, p.y, nx, ny, pr);
    p.x = clamp(moved.x, pr, CONFIG.WORLD_W - pr);
    p.y = clamp(moved.y, pr, CONFIG.WORLD_H - pr);

    const moving = Math.hypot(m.x, m.y) > 0.1;
    p.moving = moving;
    if (moving) {
      const mm = Math.hypot(m.x, m.y);
      if (mm > 1e-4) {
        p.facingVec.x = m.x / mm;
        p.facingVec.y = m.y / mm;
      }
    }
    const h = CONFIG.WALK_KIND_AXIS_HYSTERESIS ?? 1.2;
    const ax = Math.abs(m.x);
    const ay = Math.abs(m.y);
    if (moving) {
      if (ax > ay * h) {
        p.walkKind = "side";
        if (ax > 0.01) p.facingRight = m.x > 0;
      } else if (ay > ax * h && m.y > 0) {
        p.walkKind = "down";
      } else if (ay > ax * h && m.y < 0) {
        p.walkKind = "up";
      } else {
        if (p.walkKind === "side" && ax > 0.01) p.facingRight = m.x > 0;
      }
    }

    // Keep 2-way sheets responsive (same rules as server).
    if (
      (p.characterId === "berserker" || p.characterId === "mage" || p.characterId === "revenant") &&
      Math.abs(m.x) > 1e-4
    ) {
      p.facingRight = m.x > 0;
    }

    // Walk animation frames (same math as `updatePlayer`, movement-only).
    const baseDpf = Math.max(0.5, CONFIG.PLAYER_WALK_DIST_PER_FRAME ?? 22);
    const sideDpf = baseDpf * (CONFIG.PLAYER_WALK_SIDE_DIST_SCALE ?? 1);
    if (moving && (p.hitTimer ?? 0) <= 0) {
      const kind = p.walkKind;
      if (kind === "side") {
        p.walkAccumSide = (p.walkAccumSide ?? 0) + sp * dt;
        const cl = sideDpf * 4;
        p.walkAccumSide %= cl;
        p.walkFrame = Math.floor(p.walkAccumSide / sideDpf) % 4;
      } else if (kind === "up") {
        p.walkAccumUp = (p.walkAccumUp ?? 0) + sp * dt;
        const cl = baseDpf * 4;
        p.walkAccumUp %= cl;
        p.walkFrame = Math.floor(p.walkAccumUp / baseDpf) % 4;
      } else {
        p.walkAccumDown = (p.walkAccumDown ?? 0) + sp * dt;
        const cl = baseDpf * 4;
        p.walkAccumDown %= cl;
        p.walkFrame = Math.floor(p.walkAccumDown / baseDpf) % 4;
      }
    } else if (!moving) {
      p.walkAccumUp = 0;
      p.walkAccumDown = 0;
      p.walkAccumSide = 0;
      p.walkFrame = 0;
    }
  }

  /**
   * Interpolate remote players (non-local seats) to reduce snapping.
   * Renders about `INTERPOLATION_DELAY_MS` in the past.
   */
  applyRemotePlayerInterpolation(localSeat) {
    const players = this.players ?? [];
    if (players.length === 0) return;
    const now = performance.now();
    const targetT = now - INTERPOLATION_DELAY_MS;

    for (let seat = 0; seat < players.length; seat++) {
      if (seat === localSeat) continue;
      const p = players[seat];
      if (!p) continue;
      const buf = this.netRemotePosBuf?.[seat];
      if (!buf || buf.length < 2) continue;

      let idx = this.netRemotePosPtr?.[seat] ?? 0;
      while (idx + 1 < buf.length && buf[idx + 1].t <= targetT) idx++;
      this.netRemotePosPtr[seat] = idx;

      const a = buf[idx];
      const b = buf[Math.min(idx + 1, buf.length - 1)];
      if (!a || !b) continue;
      const span = Math.max(1, b.t - a.t);
      const t = Math.max(0, Math.min(1, (targetT - a.t) / span));
      const nx = a.x + (b.x - a.x) * t;
      const ny = a.y + (b.y - a.y) * t;

      // Drive remote animation from rendered velocity to avoid sliding.
      this._netPrevRenderX ??= [NaN, NaN, NaN, NaN];
      this._netPrevRenderY ??= [NaN, NaN, NaN, NaN];
      this._netRemoteWalkAccum ??= [0, 0, 0, 0];

      const px = this._netPrevRenderX[seat];
      const py = this._netPrevRenderY[seat];
      this._netPrevRenderX[seat] = nx;
      this._netPrevRenderY[seat] = ny;

      p.x = nx;
      p.y = ny;

      if (Number.isFinite(px) && Number.isFinite(py)) {
        const vx = nx - px;
        const vy = ny - py;
        const speed = Math.hypot(vx, vy);
        const moving = speed > 0.18; // pixels/frame-ish threshold (tuned for 60fps rendering)
        p.moving = moving;
        if (moving) {
          // Facing + walk kind from velocity direction.
          if (Math.abs(vx) > Math.abs(vy) * (CONFIG.WALK_KIND_AXIS_HYSTERESIS ?? 1.2)) {
            p.walkKind = "side";
            p.facingRight = vx >= 0;
          } else if (vy < 0) {
            p.walkKind = "up";
          } else {
            p.walkKind = "down";
          }

          // Walk frame advance (approx distance-based).
          const baseDpf = Math.max(0.5, CONFIG.PLAYER_WALK_DIST_PER_FRAME ?? 22);
          const distStep = Math.max(0.1, (baseDpf / (CONFIG.VIEW_WORLD_SCALE ?? 1)) * 0.08);
          this._netRemoteWalkAccum[seat] += speed;
          if (this._netRemoteWalkAccum[seat] >= distStep) {
            const steps = Math.floor(this._netRemoteWalkAccum[seat] / distStep);
            this._netRemoteWalkAccum[seat] -= steps * distStep;
            p.walkFrame = ((p.walkFrame ?? 0) + steps) % 4;
          }
        } else {
          p.walkFrame = 0;
        }
      }
    }
  }

  /** Host: allow main.js to provide a queue sink for events. */
  setNetQueueEvent(fn) {
    this._netQueueEvent = typeof fn === "function" ? fn : null;
  }

  /** Host: called from main tick to drain queued events into snapshot. */
  netDrainEvents() {
    const ev = this._netPendingEvents;
    if (!Array.isArray(ev) || ev.length === 0) return [];
    this._netPendingEvents = [];
    return ev;
  }

  /** Client: apply damage events for hit feedback + HP correctness. */
  netApplyDamageEvents(events, debug = false) {
    if (!Array.isArray(events) || events.length === 0) return;

    // Build enemy map lazily.
    if (!this._netEnemyById) this._netEnemyById = new Map();
    const map = this._netEnemyById;
    map.clear();
    for (const e of this.enemies ?? []) {
      if (e && typeof e.id === "number") map.set(e.id, e);
    }

    this._netLastEnemyHp ??= new Map();
    this._netLastEnemyDmgAt ??= new Map();

    for (const ev of events) {
      if (!ev || ev.type !== "damage") continue;
      const id = ev.enemyId;
      if (typeof id !== "number") continue;
      const e = map.get(id);
      if (!e) continue;

      // Set authoritative HP.
      if (typeof ev.enemyHpAfter === "number") e.hp = ev.enemyHpAfter;
      e.hitFlash = Math.max(e.hitFlash ?? 0, CONFIG.HIT_FLASH_DURATION * 0.75);

      // Dedup spam (DoT ticks etc).
      const lastAt = this._netLastEnemyDmgAt.get(id) ?? -999;
      const t = typeof ev.t === "number" ? ev.t : this.time ?? 0;
      if (t - lastAt < 0.03) continue;
      this._netLastEnemyDmgAt.set(id, t);

      // Spawn local feedback.
      const dx = typeof ev.damageAmount === "number" ? ev.damageAmount : 0;
      const sx = typeof ev.x === "number" ? ev.x : e.x;
      const sy = typeof ev.y === "number" ? ev.y : e.y;
      this.spawnHitParticles(sx, sy);
      this.addFloatText(
        sx,
        sy - (ENEMY_TYPES[e.typeId]?.radius ?? 10) - 4,
        Math.ceil(dx).toString(),
        "#e8d4ff"
      );

      if (debug) {
        try {
          console.log("[mp] damageEvent", { enemyId: id, dmg: dx, hp: e.hp });
        } catch {
          //
        }
      }
    }
  }

  /**
   * Client-only: advance lifetimes and spawn local-only VFX driven by authoritative state.
   * Keeps online feel closer to local without syncing particles/floatText objects.
   */
  netTickClientVfx(dt) {
    // Slashes lifetime.
    if (Array.isArray(this.slashes)) {
      for (let i = this.slashes.length - 1; i >= 0; i--) {
        const s = this.slashes[i];
        if (!s) continue;
        s.life = (s.life ?? 0) - dt;
        if ((s.life ?? 0) <= 0) this.slashes.splice(i, 1);
      }
    }

    // Ground slam rings lifetime (visual only).
    if (Array.isArray(this.groundSlams)) {
      for (let i = this.groundSlams.length - 1; i >= 0; i--) {
        const s = this.groundSlams[i];
        if (!s) continue;
        s.life = (s.life ?? 0) - dt;
        if ((s.life ?? 0) <= 0) this.groundSlams.splice(i, 1);
      }
    }

    // Blood rage particles: spawn locally for any berserker with bloodRageT>0.
    for (const pl of this.players ?? []) {
      if (!pl) continue;
      const cid = pl.characterId ?? pl.stats?.characterId;
      if (cid !== "berserker") continue;
      if (!((pl.bloodRageT ?? 0) > 0)) continue;
      pl._netBloodFxCd = (pl._netBloodFxCd ?? 0) - dt;
      const rate = 0.045;
      while ((pl._netBloodFxCd ?? 0) <= 0) {
        pl._netBloodFxCd = (pl._netBloodFxCd ?? 0) + rate;
        const hx = pl.x + randRange(-10, 10);
        const hy = pl.y - 76 + randRange(-10, 6);
        const a = randRange(-Math.PI * 0.85, -Math.PI * 0.15);
        const sp = randRange(60, 160);
        const outward = randRange(18, 52);
        this.particles.push({
          x: hx + Math.cos(a) * outward * 0.08,
          y: hy + Math.sin(a) * outward * 0.08,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - randRange(10, 40),
          life: randRange(0.35, 0.65),
          maxLife: randRange(0.35, 0.65),
          color: Math.random() < 0.5 ? "rgba(255,90,70,1)" : "rgba(255,190,90,1)",
          size: randRange(1.8, 3.4),
        });
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  updatePickups(dt) {
    if (!Array.isArray(this.pickups) || this.pickups.length === 0) return;
    const pr = CONFIG.PLAYER_RADIUS;
    const attractR = CONFIG.PICKUP_MAGNET_RADIUS ?? 110;
    const pull = CONFIG.PICKUP_MAGNET_PULL ?? 520;
    // Must be closer than XP orbs: XP uses PLAYER_RADIUS + XP_ORB_RADIUS (default 14+7=21).
    const grabR = pr + (CONFIG.PICKUP_GRAB_EXTRA_RADIUS ?? 4); // default 18
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }
      const tgt = this.nearestAlivePlayer(p.x, p.y) ?? this.player;
      const px = tgt.x;
      const py = tgt.y;
      const d = dist(px, py, p.x, p.y);
      // Gentle magnet when nearby (not whole-map).
      if (d < attractR && d > 0.01) {
        const nx = (px - p.x) / d;
        const ny = (py - p.y) / d;
        const k = Math.min(d / attractR, 1);
        const strength = (0.35 + 0.65 * (1 - k)) * pull;
        p.x += nx * strength * dt;
        p.y += ny * strength * dt;
      }
      // Actual pickup requires being closer than XP orbs.
      if (d < grabR) {
        if (p.kind === "heart") {
          const frac = CONFIG.PICKUP_HEART_HEAL_FRAC ?? 0.22;
          tgt.hp = Math.min(tgt.maxHp, tgt.hp + tgt.maxHp * frac);
          this.spawnPickupSparkle(p.x, p.y);
        } else if (p.kind === "magnet") {
          this.magnetT = Math.max(this.magnetT, CONFIG.XP_MAGNET_PICKUP_DURATION ?? 2);
          this.spawnPickupSparkle(p.x, p.y);
        } else if (p.kind === "bomb") {
          const R = CONFIG.PICKUP_BOMB_RADIUS ?? 420;
          const dmg = this.getEffectiveDamage() * (CONFIG.PICKUP_BOMB_DAMAGE_MULT ?? 2.5);
          const killed = [];
          for (const e of this.enemies) {
            const def = ENEMY_TYPES[e.typeId];
            if (dist(e.x, e.y, px, py) >= R + def.radius) continue;
            e.hitFlash = CONFIG.HIT_FLASH_DURATION;
            if (this.applyEnemyDamage(e, dmg)) killed.push(e);
          }
          for (const e of killed) this.killEnemyWithOpts(e, { noXp: true });
          this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 2.0);
          this.spawnExplosionEffect(px, py, Math.min(70, R * 0.18));
        }
        this.pickups.splice(i, 1);
      }
    }
  }

  fireDaggers(player = this.player) {
    const st = player?.stats ?? this.stats;
    const lvl = st.daggerLvl ?? 0;
    if (lvl <= 0) return;
    const px = player.x;
    const py = player.y;
    const ox = CONFIG.DAGGER_SPAWN_X_OFFSET ?? 0;
    const oy = CONFIG.DAGGER_SPAWN_Y_OFFSET ?? -56;

    const fx = player.facingVec?.x ?? 1;
    const fy = player.facingVec?.y ?? 0;
    const mag = Math.hypot(fx, fy);
    const nx = mag > 1e-4 ? fx / mag : 1;
    const ny = mag > 1e-4 ? fy / mag : 0;
    const baseAng = Math.atan2(ny, nx);

    const bonus = Math.max(0, Math.floor(st.daggerCountBonus ?? 0));
    const count = Math.max(1, 1 + bonus);

    /** @type {number[]} */
    let angles = [baseAng];
    const s2 = CONFIG.DAGGER_SPREAD_2 ?? (8 * Math.PI) / 180;
    const s3 = CONFIG.DAGGER_SPREAD_3 ?? (12 * Math.PI) / 180;
    if (count === 2) angles = [baseAng - s2, baseAng + s2];
    else if (count >= 3) angles = [baseAng - s3, baseAng, baseAng + s3];

    const spd = (CONFIG.DAGGER_PROJECTILE_SPEED ?? 650) * (st.daggerSpeedMult ?? 1);
    const dmg =
      (CONFIG.DAGGER_DAMAGE ?? 8) *
      (st.damageMult ?? 1) *
      (st.daggerDamageMult ?? 1);
    const r = CONFIG.DAGGER_HIT_RADIUS ?? 4;
    const pierce = 1 + Math.max(0, Math.floor(st.daggerPierceBonus ?? 0));
    const ownerIndex = (this.players ?? []).indexOf(player);

    const maxD = CONFIG.SAFETY_MAX_DAGGERS_ALIVE ?? 120;
    while (this.daggers.length >= maxD) this.daggers.shift();
    for (const ang of angles) {
      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;
      this.daggers.push({
        x: px + ox + Math.cos(ang) * 16,
        y: py + oy + Math.sin(ang) * 16,
        vx,
        vy,
        damage: dmg,
        r,
        pierceLeft: pierce,
        hit: new Set(),
        ownerIndex,
      });
    }
  }

  fireThrowingAxes(player = this.player) {
    const st = player?.stats ?? this.stats;
    const lvl = st.throwingAxeLvl ?? 0;
    if (lvl <= 0) return;
    const px = player.x;
    const py = player.y;
    const count = Math.max(1, 1 + Math.max(0, Math.floor(st.throwingAxeCountBonus ?? 0)));

    const vx2 = CONFIG.THROWING_AXE_SPREAD_VX_2 ?? 120;
    const vx3 = CONFIG.THROWING_AXE_SPREAD_VX_3 ?? 160;
    const jitter = CONFIG.THROWING_AXE_JITTER_VX ?? 24;
    const vxs =
      count === 1
        ? [0]
        : count === 2
          ? [-vx2, vx2]
          : [-vx3, 0, vx3];

    const vyMin = CONFIG.THROWING_AXE_LAUNCH_VY_MIN ?? -650;
    const vyMax = CONFIG.THROWING_AXE_LAUNCH_VY_MAX ?? -520;
    const spdMult = st.throwingAxeSpeedMult ?? 1;
    const life = Math.max(0.6, CONFIG.THROWING_AXE_LIFETIME ?? 1.85);
    const r = Math.max(8, CONFIG.THROWING_AXE_HIT_RADIUS ?? 12);
    const pierce = Math.max(
      1,
      (CONFIG.THROWING_AXE_PIERCE ?? 6) + Math.max(0, Math.floor(st.throwingAxePierceBonus ?? 0))
    );
    const dmg =
      (CONFIG.THROWING_AXE_DAMAGE ?? 26) *
      (st.damageMult ?? 1) *
      (st.throwingAxeDamageMult ?? 1);
    const ownerIndex = (this.players ?? []).indexOf(player);

    const spawnX = px;
    const spawnY = py - 6;

    const maxAx = CONFIG.SAFETY_MAX_THROWING_AXES_ALIVE ?? 80;
    while (this.throwingAxes.length >= maxAx) this.throwingAxes.shift();
    for (const vx0 of vxs) {
      this.throwingAxes.push({
        x: spawnX,
        y: spawnY,
        ox: spawnX,
        oy: spawnY,
        vx: (vx0 + randRange(-jitter, jitter)) * spdMult,
        vy: randRange(vyMin, vyMax) * spdMult,
        life,
        maxLife: life,
        damage: dmg,
        r,
        rot: Math.random() * Math.PI * 2,
        pierceLeft: pierce,
        hit: new Map(),
        ownerIndex,
      });
    }
  }

  fireBoomerangs(player = this.player) {
    const st = player?.stats ?? this.stats;
    const lvl = st.boomerangLvl ?? 0;
    if (lvl <= 0) return;
    const px = player.x;
    const py = player.y;

    // Soft auto-aim: choose nearest enemy within radius and lock direction for outgoing phase.
    const aimR = CONFIG.BOOMERANG_AUTOAIM_RADIUS ?? 560;
    let ax = 0;
    let ay = 0;
    let bestD = Infinity;
    if (Array.isArray(this.enemies) && this.enemies.length > 0) {
      for (const e of this.enemies) {
        const d = dist(px, py, e.x, e.y);
        if (d > aimR) continue;
        if (d < bestD) {
          bestD = d;
          ax = e.x - px;
          ay = e.y - py;
        }
      }
    }
    let baseAng = 0;
    if (bestD < Infinity && Math.hypot(ax, ay) > 1e-4) {
      baseAng = Math.atan2(ay, ax);
    } else {
      // Fallback: movement direction, else last facing direction.
      const mv = player === this.player ? getMovement(0) : getMovement((this.players ?? []).indexOf(player));
      const vxIn = mv?.x ?? 0;
      const vyIn = mv?.y ?? 0;
      const useMove = Math.hypot(vxIn, vyIn) > 0.15;
      const fx = useMove ? vxIn : (player.facingVec?.x ?? 1);
      const fy = useMove ? vyIn : (player.facingVec?.y ?? 0);
      baseAng = Math.atan2(fy, fx);
    }

    const count = Math.max(1, 1 + Math.max(0, Math.floor(st.boomerangCountBonus ?? 0)));
    const spread2 = CONFIG.BOOMERANG_SPREAD_2 ?? ((10 * Math.PI) / 180);
    const spread3 = CONFIG.BOOMERANG_SPREAD_3 ?? ((15 * Math.PI) / 180);
    const angles =
      count === 1
        ? [baseAng]
        : count === 2
          ? [baseAng - spread2, baseAng + spread2]
          : [baseAng - spread3, baseAng, baseAng + spread3];

    const spd = (CONFIG.BOOMERANG_PROJECTILE_SPEED ?? 620) * (st.boomerangSpeedMult ?? 1);
    const outDur = Math.max(0.25, CONFIG.BOOMERANG_OUT_DURATION ?? 0.6);
    const life = Math.max(outDur + 0.25, CONFIG.BOOMERANG_MAX_LIFETIME ?? 1.8);
    const r = Math.max(6, CONFIG.BOOMERANG_HIT_RADIUS ?? 10);
    const pierce = Math.max(1, (CONFIG.BOOMERANG_PIERCE ?? 4) + Math.max(0, Math.floor(st.boomerangPierceBonus ?? 0)));
    const dmg =
      (CONFIG.BOOMERANG_DAMAGE ?? 14) *
      (st.damageMult ?? 1) *
      (st.boomerangDamageMult ?? 1);
    const ownerIndex = (this.players ?? []).indexOf(player);

    const spawnX = px + Math.cos(baseAng) * 18;
    const spawnY = py + Math.sin(baseAng) * 18;

    const maxBr = CONFIG.SAFETY_MAX_BOOMERANGS_ALIVE ?? 90;
    while (this.boomerangs.length >= maxBr) this.boomerangs.shift();
    for (const a of angles) {
      this.boomerangs.push({
        x: spawnX,
        y: spawnY,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        outT: outDur,
        phase: "out",
        life,
        maxLife: life,
        damage: dmg,
        r,
        rot: a,
        pierceLeft: pierce,
        // Allow re-hits later (e.g. on return) with a small per-enemy cooldown.
        hit: new Map(),
        ownerIndex,
      });
    }
  }

  spawnDaggerHitSpark(x, y) {
    for (let n = 0; n < 4; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = randRange(60, 140);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: randRange(0.08, 0.16),
        maxLife: 0.16,
        color: "rgba(240, 240, 255, 0.9)",
        size: randRange(1.5, 2.5),
      });
    }
  }

  updateDaggers(dt) {
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const lvl = st.daggerLvl ?? 0;
      if (lvl <= 0) continue;
      pl.daggerCd = (pl.daggerCd ?? 0) - dt;
      if ((pl.daggerCd ?? 0) <= 0) {
        const dcm = clamp(
          st.daggerCooldownMult ?? 1,
          CONFIG.SAFETY_COOLDOWN_MULT_MIN ?? 0.12,
          CONFIG.SAFETY_COOLDOWN_MULT_MAX ?? 4.5
        );
        const cd = Math.max(
          CONFIG.SAFETY_MIN_WEAPON_VOLLEY_CD_SEC ?? 0.042,
          Math.max(0.22, (CONFIG.DAGGER_COOLDOWN ?? 0.55) * dcm)
        );
        pl.daggerCd = cd;
        this.fireDaggers(pl);
      }
    }

    outer: for (let i = this.daggers.length - 1; i >= 0; i--) {
      const d = this.daggers[i];
      const x0 = d.x;
      const y0 = d.y;
      const x1 = x0 + d.vx * dt;
      const y1 = y0 + d.vy * dt;
      d.x = x1;
      d.y = y1;
      if (d.x < 0 || d.y < 0 || d.x > CONFIG.WORLD_W || d.y > CONFIG.WORLD_H) {
        this.daggers.splice(i, 1);
        continue;
      }
      // Swept collision (segment vs circle) prevents fast daggers tunneling through enemies.
      const segHitsCircle = (ax, ay, bx, by, cx, cy, rr) => {
        const abx = bx - ax;
        const aby = by - ay;
        const acx = cx - ax;
        const acy = cy - ay;
        const ab2 = abx * abx + aby * aby;
        const t = ab2 > 1e-9 ? (acx * abx + acy * aby) / ab2 : 0;
        const u = t < 0 ? 0 : t > 1 ? 1 : t;
        const hx = ax + abx * u;
        const hy = ay + aby * u;
        const dx = cx - hx;
        const dy = cy - hy;
        return dx * dx + dy * dy <= rr * rr;
      };
      for (const e of this.enemies) {
        const def = ENEMY_TYPES[e.typeId];
        const hitSet = d.hit instanceof Set ? d.hit : null;
        if (hitSet && hitSet.has(e)) continue;
        // Dagger hit testing: match sprite read better than the base enemy radius.
        const isBoss = def?.isBoss || e.isBoss;
        const yOff = isBoss ? Math.min(22, def.radius * 0.22) : Math.min(10, def.radius * 0.15);
        const cy = e.y - yOff;
        // Small enemies need a bigger multiplier (their config.radius is conservative).
        const rMult = isBoss ? 1.65 : def.radius <= 12 ? 1.55 : 1.25;
        const er = def.radius * rMult;
        const rr = (d.r ?? 4) + er;
        if (segHitsCircle(x0, y0, x1, y1, e.x, cy, rr)) {
          this.applyEnemyDamage(e, d.damage);
          e.hitFlash = CONFIG.HIT_FLASH_DURATION * 0.7;
          this.spawnDaggerHitSpark(e.x, cy);
          if (hitSet) hitSet.add(e);
          d.pierceLeft -= 1;
          if (d.pierceLeft <= 0) {
            this.daggers.splice(i, 1);
          }
          continue outer;
        }
      }
    }
  }

  updateThrowingAxes(dt) {
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const lvl = st.throwingAxeLvl ?? 0;
      if (lvl <= 0) continue;
      pl.throwingAxeCd = (pl.throwingAxeCd ?? 0) - dt;
      if ((pl.throwingAxeCd ?? 0) <= 0) {
        const cd = Math.max(0.25, (CONFIG.THROWING_AXE_COOLDOWN ?? 1.1) * (st.throwingAxeCooldownMult ?? 1));
        pl.throwingAxeCd = cd;
        this.fireThrowingAxes(pl);
      }
    }

    const grav = CONFIG.THROWING_AXE_GRAVITY ?? 1050;
    const spinSpd = CONFIG.THROWING_AXE_SPIN_SPEED ?? 7.5;
    const hitCd = CONFIG.THROWING_AXE_HIT_COOLDOWN ?? 0.25;
    const maxD = CONFIG.THROWING_AXE_MAX_DISTANCE ?? 520;

    outer: for (let i = this.throwingAxes.length - 1; i >= 0; i--) {
      const a = this.throwingAxes[i];
      // Mild arc: gravity pulls downward (positive Y in world).
      a.vy += grav * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot = (a.rot ?? 0) + spinSpd * dt;
      a.life -= dt;
      if (a.life <= 0) {
        this.throwingAxes.splice(i, 1);
        continue;
      }
      // Despawn if it has fallen too far from its origin (VS-style "lob" cleanup).
      if (Number.isFinite(a.ox) && Number.isFinite(a.oy) && dist(a.x, a.y, a.ox, a.oy) > maxD) {
        this.throwingAxes.splice(i, 1);
        continue;
      }
      if (a.x < -80 || a.y < -80 || a.x > CONFIG.WORLD_W + 80 || a.y > CONFIG.WORLD_H + 80) {
        this.throwingAxes.splice(i, 1);
        continue;
      }

      for (const e of this.enemies) {
        const hc = enemyHitCircle(e);
        const hitMap = a.hit instanceof Map ? a.hit : (a.hit = new Map());
        const last = hitMap.get(e) ?? -Infinity;
        if (this.time - last < hitCd) continue;
        if (dist(a.x, a.y, hc.x, hc.y) < (a.r ?? 10) + hc.r) {
          this.applyEnemyDamage(e, a.damage);
          e.hitFlash = CONFIG.HIT_FLASH_DURATION * 0.85;
          this.spawnDaggerHitSpark(hc.x, hc.y); // reuse small impact spark
          hitMap.set(e, this.time);
          a.pierceLeft -= 1;
          if (a.pierceLeft <= 0) {
            this.throwingAxes.splice(i, 1);
          }
          continue outer;
        }
      }
    }
  }

  updateBoomerangs(dt) {
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const lvl = st.boomerangLvl ?? 0;
      if (lvl <= 0) continue;
      pl.boomerangCd = (pl.boomerangCd ?? 0) - dt;
      if ((pl.boomerangCd ?? 0) <= 0) {
        const cd = Math.max(0.25, (CONFIG.BOOMERANG_COOLDOWN ?? 1.0) * (st.boomerangCooldownMult ?? 1));
        pl.boomerangCd = cd;
        this.fireBoomerangs(pl);
      }
    }

    const spinSpd = CONFIG.BOOMERANG_SPIN_SPEED ?? 10.5;
    const hitCd = CONFIG.BOOMERANG_HIT_COOLDOWN ?? 0.15;

    outer: for (let i = this.boomerangs.length - 1; i >= 0; i--) {
      const b = this.boomerangs[i];
      const owner = this.players?.[Number.isFinite(b.ownerIndex) ? b.ownerIndex : 0] ?? this.player;
      const st = owner?.stats ?? this.stats;
      const baseSpd = (CONFIG.BOOMERANG_PROJECTILE_SPEED ?? 620) * (st.boomerangSpeedMult ?? 1);
      const retMult = Math.max(1.1, (CONFIG.BOOMERANG_RETURN_SPEED_MULT ?? 1.4) * (st.boomerangReturnSpeedMult ?? 1));
      const retSpd = baseSpd * retMult;
      b.life -= dt;
      if (b.life <= 0) {
        this.boomerangs.splice(i, 1);
        continue;
      }

      if ((b.phase ?? "out") === "out") {
        b.outT = (b.outT ?? 0) - dt;
        if ((b.outT ?? 0) <= 0) b.phase = "return";
      }

      if ((b.phase ?? "out") === "return") {
        // Smooth homing: steer velocity toward owner.
        const dx = owner.x - b.x;
        const dy = owner.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 14) {
          // Returned to player.
          this.boomerangs.splice(i, 1);
          continue;
        }
        const nx = dx / Math.max(1e-4, d);
        const ny = dy / Math.max(1e-4, d);
        const tvx = nx * retSpd;
        const tvy = ny * retSpd;
        // Smoothly blend velocity (prevents snap).
        const k = 1 - Math.exp(-dt * 9.0);
        b.vx = (b.vx ?? 0) + (tvx - (b.vx ?? 0)) * k;
        b.vy = (b.vy ?? 0) + (tvy - (b.vy ?? 0)) * k;
      }

      b.x += (b.vx ?? 0) * dt;
      b.y += (b.vy ?? 0) * dt;
      b.rot = (b.rot ?? 0) + spinSpd * dt;

      if (b.x < -40 || b.y < -40 || b.x > CONFIG.WORLD_W + 40 || b.y > CONFIG.WORLD_H + 40) {
        this.boomerangs.splice(i, 1);
        continue;
      }

      for (const e of this.enemies) {
        const hc = enemyHitCircle(e);
        const hitMap = b.hit instanceof Map ? b.hit : (b.hit = new Map());
        const last = hitMap.get(e) ?? -Infinity;
        if (this.time - last < hitCd) continue;
        if (dist(b.x, b.y, hc.x, hc.y) < (b.r ?? 10) + hc.r) {
          this.applyEnemyDamage(e, b.damage);
          e.hitFlash = CONFIG.HIT_FLASH_DURATION * 0.85;
          this.spawnDaggerHitSpark(hc.x, hc.y);
          hitMap.set(e, this.time);
          b.pierceLeft -= 1;
          if (b.pierceLeft <= 0) {
            this.boomerangs.splice(i, 1);
          }
          continue outer;
        }
      }
    }
  }

  pickLightningTargets(n, player = this.player) {
    if (!Array.isArray(this.enemies) || this.enemies.length === 0) return [];
    const want = Math.max(0, Math.floor(n));
    if (want <= 0) return [];
    const bossR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    const boss = nearestBossWithinRadius(this.enemies, player.x, player.y, bossR);
    // Prefer on-screen enemies.
    const onscreen = [];
    const offscreen = [];
    for (const e of this.enemies) {
      const s = this.worldToScreen(e.x, e.y);
      const inView =
        s.x >= -40 && s.y >= -40 && s.x <= CONFIG.CANVAS_W + 40 && s.y <= CONFIG.CANVAS_H + 40;
      (inView ? onscreen : offscreen).push(e);
    }
    let pool = (CONFIG.LIGHTNING_PREFER_ONSCREEN !== false && onscreen.length > 0) ? onscreen : this.enemies;
    // Pick random unique (fallback to nearest if pool small).
    const out = [];
    const used = new Set();
    if (boss) {
      out.push(boss);
      used.add(boss);
      pool = pool.filter((e) => e !== boss);
    }
    if (pool.length + out.length <= want) return out.concat(pool).slice(0, want);
    // Mix: half random, then nearest to player for reliability.
    const randCount = Math.max(1, Math.floor(want * 0.6));
    for (let i = 0; i < randCount && out.length < want; i++) {
      let tries = 0;
      while (tries++ < 12) {
        const e = pool[(Math.random() * pool.length) | 0];
        if (!used.has(e)) {
          used.add(e);
          out.push(e);
          break;
        }
      }
    }
    if (out.length < want) {
      const px = player.x;
      const py = player.y;
      const rest = pool
        .filter((e) => !used.has(e))
        .map((e) => ({ e, d: dist(px, py, e.x, e.y) }))
        .sort((a, b) => a.d - b.d);
      for (const r of rest) {
        out.push(r.e);
        if (out.length >= want) break;
      }
    }
    return out.slice(0, want);
  }

  spawnLightningStrikeAt(x, y, radiusWorld, damage) {
    const maxStrike = CONFIG.SAFETY_MAX_LIGHTNING_STRIKES_VFX ?? 60;
    while (this.lightningStrikes.length >= maxStrike) this.lightningStrikes.shift();
    const boltDur = CONFIG.LIGHTNING_BOLT_DURATION ?? 0.12;
    const impactDur = CONFIG.LIGHTNING_IMPACT_DURATION ?? 0.18;
    const maxLife = Math.max(boltDur, impactDur);
    const seed = Math.random() * 9999;
    this.lightningStrikes.push({
      x,
      y,
      r: radiusWorld,
      life: maxLife,
      maxLife,
      boltDur,
      impactDur,
      seed,
    });

    // Apply damage instantly.
    const killed = [];
    for (const e of this.enemies) {
      const hc = enemyHitCircle(e);
      if (dist(x, y, hc.x, hc.y) < radiusWorld + hc.r) {
        e.hitFlash = CONFIG.HIT_FLASH_DURATION;
        if (this.applyEnemyDamage(e, damage)) killed.push(e);
      }
    }
    for (const e of killed) this.killEnemy(e);
    // Micro shake to sell impact.
    this.shake = Math.min(CONFIG.SCREEN_SHAKE_MAX ?? 3, this.shake + 0.25);
  }

  updateLightningStrikes(dt) {
    for (const pl of this.players ?? []) {
      if (!pl || (pl.hp ?? 0) <= 0) continue;
      const st = pl.stats ?? this.stats;
      const lvl = st.lightningLvl ?? 0;
      if (lvl <= 0) continue;
      pl.lightningCd = (pl.lightningCd ?? 0) - dt;
      if ((pl.lightningCd ?? 0) <= 0) {
        const cd = Math.max(0.25, (CONFIG.LIGHTNING_COOLDOWN ?? 1.35) * (st.lightningCooldownMult ?? 1));
        pl.lightningCd = cd;

        const strikes =
          (CONFIG.LIGHTNING_BASE_STRIKES ?? 1) + Math.max(0, Math.floor(st.lightningStrikesBonus ?? 0));
        const targets = this.pickLightningTargets(strikes, pl);
        if (targets.length > 0) {
          const radius = Math.max(10, (CONFIG.LIGHTNING_RADIUS ?? 55) * (st.lightningRadiusMult ?? 1));
          const dmg =
            (CONFIG.LIGHTNING_DAMAGE ?? 24) *
            (st.damageMult ?? 1) *
            (st.lightningDamageMult ?? 1);
          for (const e of targets) {
            this.spawnLightningStrikeAt(e.x, e.y, radius, dmg);
          }
        }
      }
    }

    if (!Array.isArray(this.lightningStrikes) || this.lightningStrikes.length === 0) return;
    for (let i = this.lightningStrikes.length - 1; i >= 0; i--) {
      const s = this.lightningStrikes[i];
      s.life -= dt;
      if (s.life <= 0) this.lightningStrikes.splice(i, 1);
    }
  }

  addFloatText(x, y, text, color) {
    this.floatTexts.push({
      x,
      y,
      text,
      color,
      life: CONFIG.DAMAGE_NUMBER_DURATION,
      vy: -42,
    });
  }

  updateFloatTexts(dt) {
    for (const f of this.floatTexts) {
      f.y += f.vy * dt;
      f.vy *= 0.95;
      f.life -= dt;
    }
    this.floatTexts = this.floatTexts.filter((f) => f.life > 0);
  }

  worldToScreen(wx, wy) {
    const k = CONFIG.VIEW_WORLD_SCALE ?? 1;
    return {
      x: (wx - this.camX) / k + this._shakeOX,
      y: (wy - this.camY) / k + this._shakeOY,
    };
  }

  /**
   * Match bitmap resolution to on-screen size × DPR, then scale the 2D context so all drawing stays in
   * CONFIG.CANVAS_W×H logical pixels (crisp nearest-neighbor scaling for sprites).
   */
  syncCanvasResolution() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const rect = canvas.getBoundingClientRect();
    const raw = window.devicePixelRatio || 1;
    let cap = CONFIG.CANVAS_MAX_DPR ?? 2;
    try {
      if (
        window.matchMedia("(pointer: coarse)").matches &&
        window.matchMedia("(hover: none)").matches
      ) {
        cap = Math.min(cap, 2);
      }
    } catch {
      //
    }
    const dpr = Math.min(cap, Math.max(1, raw));
    const rw = Math.max(rect.width || CONFIG.CANVAS_W, 2);
    const rh = Math.max(rect.height || CONFIG.CANVAS_H, 2);
    const bw = Math.max(1, Math.floor(rw * dpr));
    const bh = Math.max(1, Math.floor(rh * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(bw / CONFIG.CANVAS_W, 0, 0, bh / CONFIG.CANVAS_H, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if ("imageSmoothingQuality" in ctx) {
      ctx.imageSmoothingQuality = "low";
    }
  }

  render() {
    this.syncCanvasResolution();
    const ctx = this.ctx;
    const w = CONFIG.CANVAS_W;
    const h = CONFIG.CANVAS_H;
    ctx.save();
    ctx.fillStyle = "#0f0c14";
    ctx.fillRect(0, 0, w, h);

    ctx.translate(0, 0);
    this.drawWorld(ctx);

    ctx.restore();
  }

  drawWorld(ctx) {
    const amp = (CONFIG.SCREEN_SHAKE_AMP ?? 0.5) * this.shake;
    const t = this.animTick;
    this._shakeOX =
      0.5 * amp * (Math.sin(t * 19.1) + Math.sin(t * 24.7));
    this._shakeOY =
      0.5 * amp * (Math.cos(t * 18.4) + Math.cos(t * 22.3));

    const vw = viewWorldW();
    const vh = viewWorldH();
    const useArenaBg =
      CONFIG.USE_ARENA_BACKGROUND &&
      drawArenaBackground(
        ctx,
        this.camX,
        this.camY,
        CONFIG.WORLD_W,
        CONFIG.WORLD_H,
        vw,
        vh,
        CONFIG.CANVAS_W,
        CONFIG.CANVAS_H
      );

    const textureTile = CONFIG.GROUND_TEXTURE_TILE_WORLD;
    const usedTiles =
      !useArenaBg &&
      drawTiledGround(
        ctx,
        textureTile,
        this.camX,
        this.camY,
        vw,
        vh,
        (wx, wy) => this.worldToScreen(wx, wy),
        CONFIG.GROUND_GRASS_ONLY
      );
    if (!useArenaBg && !usedTiles) {
      const tile = CONFIG.GROUND_TILE_SIZE;
      const z = 1 / (CONFIG.VIEW_WORLD_SCALE ?? 1);
      const x0 = Math.floor(this.camX / tile) * tile;
      const y0 = Math.floor(this.camY / tile) * tile;
      for (let tx = x0; tx < this.camX + vw + tile; tx += tile) {
        for (let ty = y0; ty < this.camY + vh + tile; ty += tile) {
          const odd = (Math.floor(tx / tile) + Math.floor(ty / tile)) % 2;
          const grass1 = odd ? "#2d4a32" : "#355a3c";
          const grass2 = odd ? "#243d2a" : "#2d5034";
          const p = this.worldToScreen(tx, ty);
          const tw = (tile + 1) * z;
          ctx.fillStyle = grass1;
          ctx.fillRect(p.x, p.y, tw, tw);
          ctx.fillStyle = grass2;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(p.x + 4 * z, p.y + 6 * z, 6 * z, 3 * z);
          ctx.fillRect(p.x + 22 * z, p.y + 18 * z, 5 * z, 2 * z);
          ctx.fillRect(p.x + 14 * z, p.y + 28 * z, 4 * z, 2 * z);
          ctx.globalAlpha = 1;
        }
      }
    }

    const cx = CONFIG.CANVAS_W / 2 + this._shakeOX;
    const cy = CONFIG.CANVAS_H / 2 + this._shakeOY;
    const grad = ctx.createRadialGradient(cx, cy, 80, cx, cy, 420);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(12,8,20,0.45)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

    // Toxic poison clouds: faint underlay circle beneath enemies.
    if (Array.isArray(this.toxicClouds) && this.toxicClouds.length > 0) {
      const z = CONFIG.VIEW_WORLD_SCALE ?? 1;
      for (const c of this.toxicClouds) {
        const sp = this.worldToScreen(c.x, c.y);
        const u = clamp((c.life ?? 0) / Math.max(1e-4, c.maxLife ?? 1), 0, 1);
        const rPx = (c.r ?? 80) / z;
        const a = 0.08 + 0.05 * u;
        const rg = ctx.createRadialGradient(sp.x, sp.y, rPx * 0.2, sp.x, sp.y, rPx);
        rg.addColorStop(0, `rgba(100,255,160,${a})`);
        rg.addColorStop(1, "rgba(100,255,160,0)");
        ctx.save();
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    /** Fire Demon only — Arcane Sentinel has no radial pulse telegraph strip. */
    const pulseBoss = this.enemies.find((e) => e.typeId === "boss1");
    /** Prefer Fire Demon HUD if both existed; otherwise Sentinel. */
    const hudBoss =
      this.enemies.find((e) => e.typeId === "boss1") ??
      this.enemies.find((e) => e.typeId === "boss2");

    // Boss pulse rings (telegraph + active pulses) — draw before enemies for readability.
    if (pulseBoss && pulseBoss.bossPlanned && pulseBoss.bossChargeT > 0) {
      const pp = this.worldToScreen(pulseBoss.x, pulseBoss.y);
      const u = 1 - pulseBoss.bossChargeT / (CONFIG.BOSS1_CHARGE_TIME ?? 0.8);
      const baseR = (CONFIG.BOSS1_PULSE_RADIUS_START ?? 46) * (0.85 + 0.35 * u);
      this.drawBossRing(
        ctx,
        pp.x,
        pp.y,
        baseR,
        pulseBoss.bossPlanned.segments,
        pulseBoss.bossPlanned.gaps,
        0.55 + 0.35 * u,
        6
      );
    }
    for (const rp of this.bossPulses) {
      const sp = this.worldToScreen(rp.x, rp.y);
      this.drawBossRing(ctx, sp.x, sp.y, rp.r, rp.segments, rp.gaps, 0.9, rp.thickness);
    }

    // Boss targeting radius: visible only when at least one player is within range.
    const bossTargetR = CONFIG.BOSS_TARGET_RADIUS ?? 0;
    if (hudBoss && bossTargetR > 0) {
      const anyIn =
        (this.players ?? []).some(
          (pl) => pl && (pl.hp ?? 0) > 0 && dist(pl.x, pl.y, hudBoss.x, hudBoss.y) <= bossTargetR
        );
      if (anyIn) {
        const z = CONFIG.VIEW_WORLD_SCALE ?? 1;
        const sp = this.worldToScreen(hudBoss.x, hudBoss.y);
        const rPx = (bossTargetR / z) * (1 + 0.018 * Math.sin(this.time * 2.2));
        ctx.save();
        const ringArcane = hudBoss.typeId === "boss2";
        ctx.globalAlpha = 0.34;
        ctx.strokeStyle = ringArcane ? "rgba(180,140,255,0.92)" : "rgba(255,120,80,0.85)";
        ctx.lineWidth = 2;
        ctx.shadowColor = ringArcane ? "rgba(140,90,240,0.55)" : "rgba(255,90,40,0.55)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = ringArcane ? "rgba(230,210,255,0.72)" : "rgba(255,200,140,0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, rPx - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const o of this.xpOrbs) {
      const floatY =
        Math.sin(
          this.time * CONFIG.XP_ORB_FLOAT_SPEED + (o.floatPhase ?? 0)
        ) * CONFIG.XP_ORB_FLOAT_AMP;
      const p = this.worldToScreen(o.x, o.y + floatY);
      const r = CONFIG.XP_ORB_RADIUS * 2;
      if (!drawXpOrb(ctx, p.x, p.y, r, o.tier ?? "small")) {
        ctx.save();
        ctx.shadowColor = "rgba(168, 85, 247, 0.85)";
        ctx.shadowBlur = 14;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, "#e8d8ff");
        g.addColorStop(0.45, "#9b6dff");
        g.addColorStop(1, "rgba(80,40,140,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#f4eeff";
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(p.x - 1, p.y - 1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    for (const e of this.enemies) {
      const def = ENEMY_TYPES[e.typeId];
      const isSlime = e.typeId === "slime" || e.typeId === "slimeSmall";
      const isBat = e.typeId === "bat";
      const isNecro = e.typeId === "necromancer";
      let bob = 0;
      if (isSlime) {
        bob = Math.sin(this.time * 7 + (e.animPhase ?? 0)) * 1.9;
      } else if (isBat) {
        bob = Math.sin(this.time * 9.4 + (e.animPhase ?? 0)) * 2.3;
      }
      const p = this.worldToScreen(e.x, e.y + bob);
      const isBoss = def?.isBoss || e.isBoss;
      const wFrame = isBoss
        ? (e.bossAnimFrame ?? 0)
        : enemyWalkColumn(e.typeId, this.animTick, e.animPhase ?? 0);
      const exploderWalk =
        e.typeId === "exploder"
          ? exploderWalkRowFlip(
              this.player.x - e.x,
              this.player.y - e.y,
              CONFIG.EXPLODER_WALK_SIDE_AXIS_HYSTERESIS ?? 1.35
            )
          : null;
      let popScale = 1;
      if (e.splitPopT > 0 && e.splitPopDur > 0) {
        const u = 1 - e.splitPopT / e.splitPopDur;
        popScale = 1 + 0.28 * Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
      }
      let walkOpts = undefined;
      if (exploderWalk) {
        walkOpts = {
          walkRow: exploderWalk.row,
          flipX: exploderWalk.flipX,
        };
      } else if (isSlime) {
        walkOpts = {
          extraScale: popScale,
          /** Face toward player: mirror when player is to the left (enemy moving left). */
          flipX: this.player.x < e.x,
        };
      } else if (isBat) {
        walkOpts = {
          flipX: this.player.x < e.x,
        };
      } else if (isNecro) {
        const castDur = CONFIG.NECRO_SUMMON_CAST_DURATION ?? 0.92;
        // Hard-disable mirroring: prevents rapid flip jitter while strafing around the player.
        const flipX = false;
        if ((e.necSummonT ?? 0) > 0) {
          const u = Math.max(0, Math.min(1, (castDur - e.necSummonT) / castDur));
          const sf = Math.min(3, Math.floor(u * 4));
          walkOpts = {
            animKey: "summon",
            animFrame: sf,
            flipX,
          };
        } else {
          const idleF =
            Math.floor(this.animTick * 2.0 + (e.animPhase ?? 0) * 0.35) % 4;
          walkOpts = {
            animKey: e.necMoving ? "walk" : "idle",
            animFrame: e.necMoving ? undefined : idleF,
            flipX,
          };
        }
      } else if (isBoss) {
        const ak = e.bossAnimKey ?? "walk";
        const chargeFrames = e.typeId === "boss1" ? 5 : 4;
        walkOpts = {
          animKey: ak,
          walkFrames: ak === "charge" ? chargeFrames : 4,
          animFrame: e.bossAnimFrame ?? 0,
          flipX: this.player.x < e.x,
        };
      } else if (e.typeId === "beast") {
        const st = e.beastState ?? "pause";
        walkOpts = {
          animKey: st === "dash" ? "dash" : "walk",
          flipX: this.player.x < e.x,
        };
      }
      const drew = drawEnemySprite(
        ctx,
        e.typeId,
        p.x,
        p.y,
        wFrame,
        e.hitFlash > 0,
        walkOpts
      );
      if (!drew) {
        if (e.hitFlash > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
        } else {
          ctx.fillStyle = def.color;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, def.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = def.outline;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (e.typeId === "skeleton") {
          ctx.strokeStyle = "#222";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - 4, p.y - 6);
          ctx.lineTo(p.x + 4, p.y - 6);
          ctx.stroke();
        } else if (e.typeId === "goblin") {
          ctx.fillStyle = "#1a301e";
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - def.radius * 0.4, 6, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (isSlime) {
          ctx.fillStyle = "rgba(0, 40, 20, 0.35)";
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + def.radius * 0.35, def.radius * 0.85, def.radius * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(p.x - def.radius * 0.6, p.y - 2, def.radius * 1.2, def.radius * 0.5);
        }
      }
    }

    this.drawVibeJamPortals(ctx);

    for (const pl of this.players ?? []) {
      if (!pl) continue;
      const pp = this.worldToScreen(pl.x, pl.y);
      const cid = pl.characterId ?? pl.stats?.characterId ?? "mage";
      const attackTimerMax =
        cid === "berserker"
          ? (CONFIG.BERSERKER_ATTACK_ANIM_DURATION ?? 0.3)
          : cid === "revenant"
            ? (CONFIG.SOUL_RIP_DURATION ?? 0.42)
            : 0.22;
      const playerDrawState = {
        hitTimer: pl.hitTimer ?? 0,
        attackTimer: pl.attackTimer ?? 0,
        attackTimerMax,
        characterId: cid,
        walkKind: pl.walkKind ?? "down",
        facingRight: pl.facingRight !== false,
        walkFrame: pl.walkFrame ?? 0,
        moving: pl.moving === true,
        bloodRageActive: cid === "berserker" && (pl.bloodRageT ?? 0) > 0,
      };
      drawPlayer(ctx, pp.x, pp.y, playerDrawState);
      const hpFrac = pl.maxHp > 0 ? (pl.hp ?? 0) / pl.maxHp : 0;
      drawPlayerHeadHealthBar(ctx, pp.x, pp.y, hpFrac, playerDrawState);
    }

    // Berserker special weapon: Ground Slam VFX (quick expanding shockwave ring).
    if (Array.isArray(this.groundSlams) && this.groundSlams.length > 0) {
      const z = CONFIG.VIEW_WORLD_SCALE ?? 1;
      for (const s of this.groundSlams) {
        const sp = this.worldToScreen(s.x, s.y);
        const maxLife = Math.max(1e-4, s.maxLife ?? 0.3);
        const u = clamp(1 - (s.life ?? 0) / maxLife, 0, 1);
        const rPx = (s.r ?? (CONFIG.GROUND_SLAM_RADIUS ?? 95)) / z;
        const ringR = rPx * (0.35 + 0.75 * u);
        const a = (s.second ? 0.55 : 0.75) * (1 - u);
        if (a <= 0.02) continue;
        ctx.save();
        // Soft dust underlay
        const rg = ctx.createRadialGradient(sp.x, sp.y, ringR * 0.2, sp.x, sp.y, ringR);
        rg.addColorStop(0, `rgba(255,210,200,${0.06 * a})`);
        rg.addColorStop(1, "rgba(255,210,200,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, ringR, 0, Math.PI * 2);
        ctx.fill();
        // Shockwave ring
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(255,235,230,${0.85 * a})`;
        ctx.lineWidth = Math.max(1, (s.second ? 4 : 6) * (1 - 0.55 * u));
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        // Cracked segments (simple broken arcs)
        ctx.strokeStyle = `rgba(110,70,55,${0.55 * a})`;
        ctx.lineWidth = Math.max(1, (s.second ? 2 : 3) * (1 - 0.4 * u));
        const segs = s.second ? 6 : 8;
        for (let i = 0; i < segs; i++) {
          const ang0 = (i / segs) * Math.PI * 2 + 0.35;
          const gap = 0.22 + 0.08 * Math.sin(i * 1.7);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, ringR * (0.92 + 0.07 * Math.sin(i * 2.3)), ang0, ang0 + gap);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Whip attack VFX: one slash PNG at player center, facing = atan2(fy, fx); full length instantly; fade only.
    const z = CONFIG.VIEW_WORLD_SCALE ?? 1;
    const vfxDur = Math.max(
      0.05,
      typeof CONFIG.WHIP_SLASH_VFX_DURATION === "number" ? CONFIG.WHIP_SLASH_VFX_DURATION : 0.12
    );
    if (this.whipSwings.length > 0) {
      for (const s of this.whipSwings) {
        const elapsed = s.elapsed ?? 0;
        if (elapsed >= vfxDur) continue;
        const fadeU = clamp(elapsed / vfxDur, 0, 1);
        const alpha = 1 - fadeU;
        if (alpha < 0.02) continue;
        const off =
          typeof CONFIG.WHIP_SLASH_ANGLE_OFFSET_RAD === "number"
            ? CONFIG.WHIP_SLASH_ANGLE_OFFSET_RAD
            : 0;
        const lines = Math.max(1, Math.min(3, Math.floor(s.lines ?? 1)));
        const baseAng =
          s.baseAng ?? Math.atan2(this.playerFacingVec?.y ?? 0, this.playerFacingVec?.x ?? 1);
        const lenPxFull = (s.len ?? CONFIG.WHIP_LENGTH) / z;
        const sp = this.worldToScreen(s.x, s.y);
        for (const lineAng of whipLineAngles(baseAng, lines)) {
          drawWhipSlashAttackVfx(ctx, sp.x, sp.y, lineAng + off, lenPxFull, alpha);
        }
      }
    }

    // Berserker slash VFX: one-frame red slash sprite (hitbox applied immediately at spawn).
    // In online co-op, berserker may not be player 1 on this client — draw slashes whenever present.
    if (Array.isArray(this.slashes) && this.slashes.length > 0) {
      const vDur = Math.max(0.05, CONFIG.BERSERKER_SLASH_VFX_DURATION ?? 0.18);
      for (const s of this.slashes) {
        const elapsed = (s.maxLife ?? 0) - (s.life ?? 0);
        const u = clamp(elapsed / vDur, 0, 1);
        const a = 1 - u;
        if (a <= 0.02) continue;
        const sp = this.worldToScreen(s.x, s.y);
        if (isBerserkerSlashReady()) {
          drawBerserkerSlashVfx(ctx, sp.x, sp.y, s.ang ?? 0, a);
        }
        if (CONFIG.DEBUG_BERSERKER_SLASH_POS === true) {
          ctx.save();
          ctx.strokeStyle = "rgba(0,255,120,0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sp.x - 6, sp.y);
          ctx.lineTo(sp.x + 6, sp.y);
          ctx.moveTo(sp.x, sp.y - 6);
          ctx.lineTo(sp.x, sp.y + 6);
          ctx.stroke();
          ctx.font = "11px monospace";
          ctx.fillStyle = "rgba(0,255,120,0.95)";
          const d = s.dbg ?? {};
          ctx.fillText(
            `slash ang=${(s.ang ?? 0).toFixed(2)} fwd=${(d.fwd ?? 0)} n=${(d.normalOff ?? 0)} up=${(d.upOff ?? 0)}`,
            sp.x + 10,
            sp.y - 10
          );
          ctx.restore();
        }
      }
    }
    if (Array.isArray(this.soulRipProjectiles) && this.soulRipProjectiles.length > 0) {
      for (const p of this.soulRipProjectiles) {
        const s = this.worldToScreen(p.x, p.y);
        if (isSoulRipProjectileReady()) {
          const ang = Math.atan2(p.vy ?? 0, p.vx ?? 1);
          drawSoulRipProjectile(ctx, s.x, s.y, CONFIG.SOUL_RIP_PROJECTILE_DRAW_SIZE ?? 68, 0.98, ang);
        }
      }
    }

    if (isHammerReady()) {
      for (const pl of this.players ?? []) {
        if (!pl || (pl.hp ?? 0) <= 0) continue;
        const st = pl.stats ?? this.stats;
        const hs = pl.hammers ?? [];
        if (hs.length <= 0) continue;
        const radius =
          (CONFIG.HAMMER_ORBIT_RADIUS * (st.hammerOrbitRadius ?? 1)) +
          (this.characterId === "mage" ? (CONFIG.HAMMER_ORBIT_RADIUS_MAGE_BONUS ?? 0) : 0);
        const sizePx = CONFIG.HAMMER_DRAW_SIZE * (st.hammerSize ?? 1);
        hs.forEach((h, i) => {
          const a = (pl.hammerOrbitPhase ?? 0) + (i / hs.length) * Math.PI * 2;
          const wx = pl.x + Math.cos(a) * radius;
          const wy = pl.y + Math.sin(a) * radius;
          const s = this.worldToScreen(wx, wy);
          drawHammerSprite(ctx, s.x, s.y, h.spinAngle, sizePx);
        });
      }
    }

    // Mage-exclusive outer ring: Arcane Runes (per-player).
    if (this.characterId === "mage") {
      const z = CONFIG.VIEW_WORLD_SCALE ?? 1;
      for (const pl of this.players ?? []) {
        if (!pl || (pl.hp ?? 0) <= 0) continue;
        const st = pl.stats ?? this.stats;
        const rs = pl.arcaneRunes ?? [];
        if (rs.length <= 0) continue;
        const hammerR =
          (pl.hammers?.length ?? 0) > 0
            ? (CONFIG.HAMMER_ORBIT_RADIUS ?? 80) * (st.hammerOrbitRadius ?? 1)
            : 0;
        const baseR =
          (CONFIG.ARCANE_RUNES_ORBIT_RADIUS ?? 108) * (st.arcaneRunesOrbitRadiusMult ?? 1);
        const radius = Math.max(baseR, hammerR + 26);
        const sizePx = (CONFIG.ARCANE_RUNES_DRAW_SIZE ?? 64) / z;
        rs.forEach((r, i) => {
          const a = (pl.arcaneRuneOrbitPhase ?? 0) + (i / rs.length) * Math.PI * 2;
          const wx = pl.x + Math.cos(a) * radius;
          const wy = pl.y + Math.sin(a) * radius;
          const s = this.worldToScreen(wx, wy);
          const spin = (r?.spin ?? 0) + this.time * 1.6 + a * 0.35;
          drawRuneSprite(ctx, s.x, s.y, spin, sizePx, 0.98);
        });
      }
    }

    for (const p of this.projectiles) {
      const s = this.worldToScreen(p.x, p.y);
      if (p.sprite === "archer") {
        const ang = Math.atan2(p.vy ?? 0, p.vx ?? 1);
        // Use a screen size that tracks projectile radius so upgrades still scale.
        const k = CONFIG.ARCHER_PROJECTILE_DRAW_RADIUS_SCALE ?? 14;
        const sizePx = Math.max(34, (p.r ?? 6) * k);
        drawArcherProjectile(ctx, s.x, s.y, ang, sizePx, 0.98);
        continue;
      }
      const rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, p.r * 2.2);
      if (p.tint === "green") {
        rg.addColorStop(0, "rgba(220, 255, 220, 1)");
        rg.addColorStop(0.35, "rgba(80, 220, 120, 0.95)");
        rg.addColorStop(1, "rgba(10, 70, 30, 0)");
      } else {
        rg.addColorStop(0, "rgba(240, 220, 255, 1)");
        rg.addColorStop(0.35, "rgba(155, 109, 255, 0.95)");
        rg.addColorStop(1, "rgba(80, 30, 140, 0)");
      }
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.tint === "green" ? "rgba(160, 255, 190, 0.55)" : "rgba(200, 170, 255, 0.5)";
      ctx.beginPath();
      ctx.arc(s.x - p.r * 0.3, s.y - p.r * 0.3, p.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    const zArcBolts = CONFIG.VIEW_WORLD_SCALE ?? 1;
    if (Array.isArray(this.bossArcaneProjs) && this.bossArcaneProjs.length > 0) {
      for (const pr of this.bossArcaneProjs) {
        const s = this.worldToScreen(pr.x, pr.y);
        const rPx = Math.max(4, (pr.r ?? CONFIG.BOSS2_PROJ_RADIUS ?? 9) / zArcBolts);
        const hold = (pr.phase ?? "move") === "hold";
        ctx.save();
        ctx.shadowColor = hold ? "rgba(200,140,255,0.95)" : "rgba(236,112,255,0.82)";
        ctx.shadowBlur = hold ? 16 : 10;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rPx * 2.4);
        g.addColorStop(0, hold ? "rgba(255,255,255,0.95)" : "rgba(255,238,255,0.95)");
        g.addColorStop(0.35, "rgba(236,112,255,0.92)");
        g.addColorStop(0.65, "rgba(140,60,210,0.55)");
        g.addColorStop(1, "rgba(80,30,140,0)");
        ctx.globalAlpha = hold ? 0.78 : 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rPx * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,245,255,0.42)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rPx * 1.05, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Toxic grenade projectile (arc flight) + explosion sheet VFX.
    for (const g of this.toxicGrenades) {
      const sp = this.worldToScreen(g.x, g.y);
      drawGrenadeSprite(ctx, sp.x, sp.y, g.rot ?? 0, 56, 0.98);
    }
    for (const ex of this.toxicExplosions) {
      const sp = this.worldToScreen(ex.x, ex.y);
      const fr = Math.max(0, Math.min(3, ex.frame | 0));
      const scale = fr === 0 ? 0.92 : fr === 1 ? 1.03 : fr === 2 ? 1.18 : 1.08;
      const alpha = fr === 3 ? 0.9 : 1;
      drawGrenadeExplosionFrame(ctx, sp.x, sp.y, fr, 220, scale, alpha);
    }

    // Pickups (heart/magnet/bomb).
    if (Array.isArray(this.pickups) && this.pickups.length > 0) {
      const orbPx = (CONFIG.XP_ORB_RADIUS * 2) * 2.2; // match drawXpOrb scale factor
      for (const pu of this.pickups) {
        const bob = Math.sin(this.time * 4.6 + (pu.floatPhase ?? 0)) * 3;
        const sp = this.worldToScreen(pu.x, pu.y + bob);
        const a = clamp((pu.life ?? 0) / Math.max(1e-4, pu.maxLife ?? 1), 0, 1);
        const sizePx =
          pu.kind === "heart"
            ? orbPx * 0.39
            : pu.kind === "magnet"
              ? orbPx * 0.9
              : orbPx;
        drawPickupIcon(ctx, sp.x, sp.y, pu.kind, sizePx, 0.95 * a);
      }
    }

    // Daggers (fast directional projectiles).
    if (Array.isArray(this.daggers) && this.daggers.length > 0) {
      for (const d of this.daggers) {
        const sp = this.worldToScreen(d.x, d.y);
        const ang = Math.atan2(d.vy ?? 0, d.vx ?? 1);
        const sizePx = 58;
        drawDaggerSprite(ctx, sp.x, sp.y, ang, sizePx, 0.98);
      }
    }

    // Throwing axes (heavy rotating projectiles with a mild arc).
    if (Array.isArray(this.throwingAxes) && this.throwingAxes.length > 0) {
      for (const a of this.throwingAxes) {
        const sp = this.worldToScreen(a.x, a.y);
        const sizePx = CONFIG.THROWING_AXE_DRAW_SIZE ?? 68;
        drawThrowingAxeSprite(ctx, sp.x, sp.y, a.rot ?? 0, sizePx, 0.98);
      }
    }

    // Boomerangs (outgoing then returning to player).
    if (Array.isArray(this.boomerangs) && this.boomerangs.length > 0) {
      for (const b of this.boomerangs) {
        const sp = this.worldToScreen(b.x, b.y);
        const sizePx = CONFIG.BOOMERANG_DRAW_SIZE ?? 66;
        drawBoomerangSprite(ctx, sp.x, sp.y, b.rot ?? 0, sizePx, 0.98);
      }
    }

    // Lightning strikes: instant bolt + impact flash (very short-lived).
    if (Array.isArray(this.lightningStrikes) && this.lightningStrikes.length > 0) {
      for (const s of this.lightningStrikes) {
        const sp = this.worldToScreen(s.x, s.y);
        const u = 1 - (s.life ?? 0) / Math.max(1e-4, s.maxLife ?? 0.2);
        const boltU = Math.min(1, u / Math.max(1e-4, (s.boltDur ?? 0.12) / (s.maxLife ?? 0.2)));
        const impactU = Math.min(1, u / Math.max(1e-4, (s.impactDur ?? 0.18) / (s.maxLife ?? 0.2)));

        // Bolt: jagged vertical line from above to impact.
        const seed = s.seed ?? 0;
        const topY = -30;
        const x0 = sp.x;
        const y0 = topY;
        const x1 = sp.x;
        const y1 = sp.y;
        const segs = 7;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const aBolt = Math.max(0, 1 - boltU) * 0.95;
        if (aBolt > 0.02) {
          ctx.globalAlpha = aBolt;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.shadowColor = "rgba(255,230,160,0.75)";
          ctx.shadowBlur = 12;
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const yy = y0 + (y1 - y0) * t;
            const wob = Math.sin(seed + i * 2.1) * 6 + Math.sin(seed * 0.7 + i * 1.3) * 3;
            const xx = x0 + wob * (1 - t * 0.65);
            if (i === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Impact burst: small ring + bright flash.
        const aImp = Math.max(0, 1 - impactU);
        if (aImp > 0.02) {
          const r = (s.r ?? 55) / (CONFIG.VIEW_WORLD_SCALE ?? 1);
          ctx.globalAlpha = Math.min(0.9, aImp * 0.9);
          ctx.fillStyle = "rgba(255,245,210,0.55)";
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, Math.max(10, r * 0.18), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = Math.min(0.75, aImp * 0.75);
          ctx.strokeStyle = "rgba(255,230,160,0.85)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, Math.max(14, r * (0.28 + 0.22 * impactU)), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (const p of this.particles) {
      const s = this.worldToScreen(p.x, p.y);
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.font = "bold 14px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    for (const f of this.floatTexts) {
      const s = this.worldToScreen(f.x, f.y);
      const a = clamp(f.life / CONFIG.DAMAGE_NUMBER_DURATION, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, s.x, s.y);
      ctx.fillText(f.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }

    // Boss intro cue overlay + HP bar
    if (this.bossIntroT > 0) {
      const a = clamp(this.bossIntroT / 1.35, 0, 1);
      const title = this.bossIntroLine || "Boss Appears";
      const arcIntro = this.bossIntroTheme === "arcane";
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.35 * a})`;
      ctx.fillRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);
      ctx.font = "800 28px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = arcIntro
        ? `rgba(226,182,255,${0.95 * a})`
        : `rgba(255,200,120,${0.95 * a})`;
      ctx.strokeStyle = `rgba(0,0,0,${0.6 * a})`;
      ctx.lineWidth = 6;
      ctx.strokeText(title, CONFIG.CANVAS_W / 2, 88);
      ctx.fillText(title, CONFIG.CANVAS_W / 2, 88);
      ctx.restore();
    }

    if (hudBoss) {
      const def = ENEMY_TYPES[hudBoss.typeId];
      const name = def?.name ?? "Boss";
      const frac = clamp(hudBoss.hp / Math.max(1, hudBoss.maxHp), 0, 1);
      const barW = 520;
      const barH = 16;
      const x = (CONFIG.CANVAS_W - barW) / 2;
      const y = 10;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - 6, y - 6, barW + 12, barH + 30);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y, barW, barH);
      const g = ctx.createLinearGradient(x, 0, x + barW, 0);
      if (hudBoss.typeId === "boss2") {
        g.addColorStop(0, "#8b3dff");
        g.addColorStop(0.5, "#c978ff");
        g.addColorStop(1, "#f0dcff");
      } else {
        g.addColorStop(0, "#ff5a2b");
        g.addColorStop(0.55, "#ffb13d");
        g.addColorStop(1, "#ffd47a");
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, barW * frac, barH);
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, barW, barH);
      ctx.font = "700 14px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,240,220,0.95)";
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 4;
      ctx.strokeText(name, CONFIG.CANVAS_W / 2, y + 28);
      ctx.fillText(name, CONFIG.CANVAS_W / 2, y + 28);
      ctx.restore();
    }
  }

  drawBossRing(ctx, x, y, r, segments, gaps, alpha, thickness) {
    const segs = Math.max(3, segments | 0);
    const step = (Math.PI * 2) / segs;
    const gapSet = gaps instanceof Set ? gaps : null;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = "rgba(255, 120, 40, 0.95)";
    ctx.lineWidth = Math.max(2, thickness);
    ctx.shadowColor = "rgba(255, 120, 40, 0.65)";
    ctx.shadowBlur = 10;
    for (let i = 0; i < segs; i++) {
      if (gapSet && gapSet.has(i)) continue;
      const a0 = i * step + step * 0.08;
      const a1 = (i + 1) * step - step * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, r, a0, a1);
      ctx.stroke();
    }
    ctx.restore();
  }
}
