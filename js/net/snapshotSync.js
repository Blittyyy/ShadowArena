/**
 * Host → clients world replication (plain JSON-safe structures).
 */
import { CONFIG } from "../config.js?v=2026-04-30-coop-vs-balance-1";
import { findUpgradeById } from "../upgrades.js";

export const RECONCILE_LERP = 0.12;
export const SNAP_DISTANCE = 120;
export const INTERPOLATION_DELAY_MS = 120;

function snapEnemy(e) {
  if (!e) return null;
  return {
    id: e.id,
    typeId: e.typeId,
    x: e.x,
    y: e.y,
    hp: e.hp,
    maxHp: e.maxHp,
    hitFlash: e.hitFlash ?? 0,
    // Animation-relevant state used by render logic (small, avoids sliding/idle mismatch).
    animPhase: e.animPhase ?? 0,
    necSummonT: e.necSummonT ?? 0,
    necMoving: e.necMoving ?? false,
    necFacingRight: e.necFacingRight ?? false,
    beastState: e.beastState ?? "pause",
    bossAnimKey: e.bossAnimKey ?? "walk",
    bossAnimFrame: e.bossAnimFrame ?? 0,
    splitPopT: e.splitPopT ?? 0,
    splitPopDur: e.splitPopDur ?? 0,
  };
}

function snapBasicPos(o) {
  if (!o) return null;
  return {
    id: o.id,
    x: o.x,
    y: o.y,
    vx: o.vx,
    vy: o.vy,
    r: o.r,
    rot: o.rot,
    kind: o.kind,
    tier: o.tier,
    value: o.value,
    life: o.life,
    maxLife: o.maxLife,
    floatPhase: o.floatPhase,
    sprite: o.sprite,
    tint: o.tint,
    phase: o.phase,
    frame: o.frame,
    second: o.second,
    maxLife2: o.maxLife2,
    ang: o.ang,
    baseAng: o.baseAng,
    lines: o.lines,
    len: o.len,
    elapsed: o.elapsed,
    r2: o.r2,
    seed: o.seed,
    boltDur: o.boltDur,
    impactDur: o.impactDur,
    maxLifeStrike: o.maxLifeStrike,
  };
}

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
    bloodRageT: p.bloodRageT ?? 0,
    bloodRageCd: p.bloodRageCd ?? 0,
    stats,
    daggerCd: p.daggerCd ?? 0,
    throwingAxeCd: p.throwingAxeCd ?? 0,
    boomerangCd: p.boomerangCd ?? 0,
    lightningCd: p.lightningCd ?? 0,
    whipCd: p.whipCd ?? 0,
    // Visual-only state used for rendering weapon orbits / slashes on clients.
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

function applyPlayer(target, snap, opts = {}) {
  if (!target || !snap) return;
  const skipPos = opts?.skipPos === true;
  Object.assign(target, {
    characterId: snap.characterId,
    x: skipPos ? target.x : snap.x,
    y: skipPos ? target.y : snap.y,
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
  const netEvents = typeof game?.netDrainEvents === "function" ? game.netDrainEvents() : [];
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
    ev: Array.isArray(netEvents) && netEvents.length ? netEvents : undefined,
    // Compact net payloads (joiner FPS + latency).
    players: (game.players ?? []).map(snapPlayer),
    enemies: (game.enemies ?? []).map(snapEnemy).filter(Boolean),
    projectiles: (game.projectiles ?? []).map(snapBasicPos).filter(Boolean),
    bossArcaneProjs: (game.bossArcaneProjs ?? []).map(snapBasicPos).filter(Boolean),
    bossPulses: (game.bossPulses ?? []).map(snapBasicPos).filter(Boolean),
    xpOrbs: (game.xpOrbs ?? []).map((o) => ({ id: o.id, x: o.x, y: o.y, tier: o.tier, value: o.value, floatPhase: o.floatPhase })).filter(Boolean),
    pickups: (game.pickups ?? []).map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, life: p.life, maxLife: p.maxLife, floatPhase: p.floatPhase })).filter(Boolean),
    daggers: (game.daggers ?? []).map((d) => ({ id: d.id, x: d.x, y: d.y, vx: d.vx, vy: d.vy })).filter(Boolean),
    throwingAxes: (game.throwingAxes ?? []).map((a) => ({ id: a.id, x: a.x, y: a.y, rot: a.rot })).filter(Boolean),
    boomerangs: (game.boomerangs ?? []).map((b) => ({ id: b.id, x: b.x, y: b.y, rot: b.rot })).filter(Boolean),
    lightningStrikes: (game.lightningStrikes ?? []).map((s) => ({ id: s.id, x: s.x, y: s.y, life: s.life, maxLife: s.maxLife, seed: s.seed, boltDur: s.boltDur, impactDur: s.impactDur })).filter(Boolean),
    hammers: safeJson(game.hammers ?? []) ?? [],
    arcaneRunes: safeJson(game.arcaneRunes ?? []) ?? [],
    toxicGrenades: (game.toxicGrenades ?? []).map((g) => ({ id: g.id, x: g.x, y: g.y, rot: g.rot, t: g.t, dur: g.dur, sx: g.sx, sy: g.sy, tx: g.tx, ty: g.ty, arcH: g.arcH, rotSp: g.rotSp })).filter(Boolean),
    toxicExplosions: (game.toxicExplosions ?? []).map((ex) => ({ id: ex.id, x: ex.x, y: ex.y, frame: ex.frame, t: ex.t, frameT: ex.frameT, didImpact: ex.didImpact, r: ex.r })).filter(Boolean),
    toxicClouds: (game.toxicClouds ?? []).map((c) => ({ id: c.id, x: c.x, y: c.y, life: c.life, maxLife: c.maxLife, r: c.r, puffCd: c.puffCd })).filter(Boolean),
    groundSlams: (game.groundSlams ?? []).map((s) => ({ id: s.id, x: s.x, y: s.y, r: s.r, life: s.life, maxLife: s.maxLife, second: s.second })).filter(Boolean),
    soulRipProjectiles: (game.soulRipProjectiles ?? []).map((p) => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r, life: p.life, maxLife: p.maxLife, targetId: p.targetId, ownerIndex: p.ownerIndex })).filter(Boolean),
    slashes: (game.slashes ?? []).map((s) => ({ id: s.id, x: s.x, y: s.y, ang: s.ang, life: s.life, maxLife: s.maxLife, range: s.range })).filter(Boolean),
    bossMilestones: safeJson(game.bossMilestones) ?? { boss1: false, boss2: false },
  };
}

/**
 * @param {import("../game.js").Game} game
 * @param {ReturnType<typeof buildGameSnapshot>} snap
 */
export function applyGameSnapshot(game, snap) {
  if (!snap || snap.v !== 1) return;
  // Optional debug flag.
  const mpDebug =
    typeof window !== "undefined" &&
    ((window.MULTIPLAYER_DEBUG === true) ||
      (typeof window.MULTIPLAYER_DEBUG === "string" && window.MULTIPLAYER_DEBUG === "1"));
  game.time = snap.t ?? game.time;
  game.mode = snap.mode ?? game.mode;
  game.level = snap.level ?? game.level;
  game.xp = snap.xp ?? game.xp;
  game.xpToNext = snap.xpToNext ?? game.xpToNext;
  game.levelUpsPending = snap.levelUpsPending ?? 0;
  game.upgradePlayerIndex = snap.upgradePlayerIndex ?? 0;
  if (game.netMode !== "client") {
    game.camX = snap.camX ?? game.camX;
    game.camY = snap.camY ?? game.camY;
  } else if (Number.isFinite(snap.camX) && Number.isFinite(snap.camY)) {
    /** Host-visible camera sampled ~30 Hz — client lerps toward this in Game.update for stable framing. */
    game.netReplayCamX = snap.camX;
    game.netReplayCamY = snap.camY;
  }
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

  // Apply authoritative damage feedback events (client spawns local visuals).
  if (game?.netMode === "client" && typeof game.netApplyDamageEvents === "function") {
    game.netApplyDamageEvents(snap.ev, mpDebug);
  }

  // Online client: apply snapshot as *targets*; interpolate in render loop for smooth joiner experience.
  if (game?.netMode === "client" && typeof game.netApplyWorldTargets === "function") {
    game.netApplyWorldTargets(snap);
  }

  const pls = snap.players ?? [];
  const localSeat =
    game?.netMode === "client"
      ? Math.max(0, Math.min(3, Math.floor(Number(game?._jamLocalSeats?.[0] ?? 0) || 0)))
      : -1;
  const recvMs = Number(snap.__recvMs ?? snap.__srvMs ?? NaN);

  for (let i = 0; i < (game.players?.length ?? 0); i++) {
    const isLocal = game?.netMode === "client" && i === localSeat;
    const isRemote = game?.netMode === "client" && i !== localSeat;
    const ps = pls[i];

    if (isLocal && ps && Number.isFinite(ps.x) && Number.isFinite(ps.y)) {
      game.netLocalServerX = ps.x;
      game.netLocalServerY = ps.y;
    } else if (isRemote && ps && Number.isFinite(ps.x) && Number.isFinite(ps.y)) {
      if (!game.netRemotePosBuf) game.netRemotePosBuf = [[], [], [], []];
      const buf = game.netRemotePosBuf[i] || (game.netRemotePosBuf[i] = []);
      const t = Number.isFinite(recvMs) ? recvMs : performance.now();
      buf.push({ t, x: ps.x, y: ps.y });
      if (buf.length > 30) buf.splice(0, buf.length - 30);
    }

    // Apply non-position state. Positions are predicted/interpolated on clients.
    applyPlayer(game.players[i], ps, { skipPos: game?.netMode === "client" });
  }

  // Server reconciliation: gently pull local predicted player toward server position.
  if (game?.netMode === "client" && localSeat >= 0 && game.players?.[localSeat]) {
    const p = game.players[localSeat];
    const sx = Number(game.netLocalServerX);
    const sy = Number(game.netLocalServerY);
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      const dx = sx - p.x;
      const dy = sy - p.y;
      const d = Math.hypot(dx, dy);
      if (d > SNAP_DISTANCE) {
        p.x = sx;
        p.y = sy;
      } else {
        // When the joiner isn't pressing movement, avoid "creep" corrections that feel like sliding.
        const localInput = typeof game.netGetLocalInput === "function" ? game.netGetLocalInput() : null;
        const inputMag = localInput ? Math.hypot(localInput.x ?? 0, localInput.y ?? 0) : 1;
        if (inputMag < 0.05 && d < 8) {
          // Ignore micro corrections.
        } else {
          p.x += dx * RECONCILE_LERP;
          p.y += dy * RECONCILE_LERP;
        }
      }
    }
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

  // Host/solo still hard-apply arrays. Client interpolates, so avoid snapping & large allocations here.
  if (game?.netMode !== "client") {
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
  }
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
