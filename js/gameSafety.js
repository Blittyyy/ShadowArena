/**
 * Soft caps + NaN guards for playable stats (crash/abuse resilience; no networking auth).
 */
import { CONFIG } from "./config.js?v=2026-04-30-coop-vs-balance-1";
import { clamp } from "./mathutil.js";

/** @param {unknown} n @param {number} fb */
export function finiteOr(n, fb) {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : fb;
}

/** @param {unknown} st */
function cidOf(st) {
  return typeof st?.characterId === "string" && st.characterId.length ? st.characterId : "mage";
}

/**
 * Clamps playable stats after upgrades / whenever values could corrupt (NaN, extreme mults).
 * @param {Record<string, unknown>} st stats object (mutated)
 */
export function sanitizePlayerStats(st) {
  if (!st || typeof st !== "object") return;

  const dmgMin = CONFIG.SAFETY_DAMAGE_MULT_MIN ?? 0.05;
  const dmgMax = CONFIG.SAFETY_DAMAGE_MULT_MAX ?? 28;
  const cdMin = CONFIG.SAFETY_COOLDOWN_MULT_MIN ?? 0.12;
  const cdMax = CONFIG.SAFETY_COOLDOWN_MULT_MAX ?? 4.5;
  const moveMin = CONFIG.SAFETY_MOVE_SPEED_MULT_MIN ?? 0.2;
  const moveMax = CONFIG.SAFETY_MOVE_SPEED_MULT_MAX ?? 3.5;
  const sizeMin = CONFIG.SAFETY_PROJECTILE_SIZE_MULT_MIN ?? 0.25;
  const sizeMax = CONFIG.SAFETY_PROJECTILE_SIZE_MULT_MAX ?? 4;
  const maxProj = CONFIG.SAFETY_PROJECTILE_COUNT_MAX ?? 14;
  const hamMax = CONFIG.SAFETY_HAMMER_COUNT_MAX ?? 18;
  const cid = cidOf(st);
  const minProj = cid === "berserker" || cid === "revenant" ? 0 : 1;

  st.damageMult = clamp(finiteOr(st.damageMult, 1), dmgMin, dmgMax);
  st.cooldownMult = clamp(finiteOr(st.cooldownMult, 1), cdMin, cdMax);
  st.moveSpeedMult = clamp(finiteOr(st.moveSpeedMult, 1), moveMin, moveMax);
  st.projectileSizeMult = clamp(finiteOr(st.projectileSizeMult, 1), sizeMin, sizeMax);
  st.projectileCount = Math.round(
    clamp(finiteOr(st.projectileCount, CONFIG.BASE_PROJECTILE_COUNT ?? 1), minProj, maxProj)
  );

  const ham = Math.round(finiteOr(st.hammerCount, 0));
  st.hammerCount = clamp(ham, 0, hamMax);
  st.hammerSize = clamp(finiteOr(st.hammerSize, 1), 0.4, CONFIG.SAFETY_HAMMER_SIZE_MULT_MAX ?? 5);
  st.hammerOrbitSpeed = clamp(finiteOr(st.hammerOrbitSpeed, 1), 0.25, CONFIG.SAFETY_ORBIT_SPEED_MULT_MAX ?? 6);
  st.hammerOrbitRadius = clamp(finiteOr(st.hammerOrbitRadius, 1), 0.25, CONFIG.SAFETY_ORBIT_RADIUS_MULT_MAX ?? 6);

  st.whipCount = clamp(Math.round(finiteOr(st.whipCount, 0)), 0, 3);
  st.whipLengthMult = clamp(finiteOr(st.whipLengthMult, 1), 0.5, CONFIG.SAFETY_WHIP_GEOM_MULT_MAX ?? 5);
  st.whipDamageMult = clamp(finiteOr(st.whipDamageMult, 1), dmgMin, dmgMax);
  st.whipCooldownMult = clamp(finiteOr(st.whipCooldownMult, 1), cdMin, cdMax);
  st.whipWidthMult = clamp(finiteOr(st.whipWidthMult, 1), 0.5, CONFIG.SAFETY_WHIP_GEOM_MULT_MAX ?? 5);

  st.slashDamageMult = clamp(finiteOr(st.slashDamageMult, 1), dmgMin, dmgMax);
  st.slashCooldownMult = clamp(finiteOr(st.slashCooldownMult, 1), cdMin, cdMax);
  st.slashRangeMult = clamp(finiteOr(st.slashRangeMult, 1), 0.35, CONFIG.SAFETY_SLASH_GEOM_MULT_MAX ?? 5);
  st.slashArcMult = clamp(finiteOr(st.slashArcMult, 1), 0.35, CONFIG.SAFETY_SLASH_GEOM_MULT_MAX ?? 5);
  st.multiSlash = clamp(Math.round(finiteOr(st.multiSlash, 1)), 1, 8);
  st.lifestealPct = clamp(finiteOr(st.lifestealPct, 0), 0, CONFIG.SAFETY_LIFESTEAL_MAX_FRAC ?? 0.35);

  st.groundSlamDamageMult = clamp(finiteOr(st.groundSlamDamageMult, 1), dmgMin, dmgMax * 2);
  st.groundSlamRadiusMult = clamp(finiteOr(st.groundSlamRadiusMult, 1), 0.35, CONFIG.SAFETY_SLAM_GEOM_MULT_MAX ?? 5);
  st.groundSlamCooldownMult = clamp(finiteOr(st.groundSlamCooldownMult, 1), cdMin, cdMax);
  st.groundSlamKnockbackMult = clamp(finiteOr(st.groundSlamKnockbackMult, 1), 0.2, CONFIG.SAFETY_KNOCKBACK_MULT_MAX ?? 12);

  st.arcaneRunesOrbitSpeedMult = clamp(finiteOr(st.arcaneRunesOrbitSpeedMult, 1), 0.35, CONFIG.SAFETY_ORBIT_SPEED_MULT_MAX ?? 8);
  st.arcaneRunesDamageMult = clamp(finiteOr(st.arcaneRunesDamageMult, 1), dmgMin, dmgMax * 1.25);
  st.arcaneRunesOrbitRadiusMult = clamp(finiteOr(st.arcaneRunesOrbitRadiusMult, 1), 0.35, CONFIG.SAFETY_ORBIT_RADIUS_MULT_MAX ?? 6);
  st.arcaneRunesCountBonus = clamp(Math.round(finiteOr(st.arcaneRunesCountBonus, 0)), 0, CONFIG.SAFETY_RUNE_COUNT_BONUS_MAX ?? 16);

  const wx = (k, def, lo, hi) => {
    st[k] = clamp(Math.round(finiteOr(st[k], def)), lo, hi);
  };
  wx("daggerLvl", 0, 0, 8);
  st.daggerDamageMult = clamp(finiteOr(st.daggerDamageMult, 1), dmgMin, dmgMax);
  st.daggerCooldownMult = clamp(finiteOr(st.daggerCooldownMult, 1), cdMin, cdMax);
  st.daggerSpeedMult = clamp(finiteOr(st.daggerSpeedMult, 1), 0.25, CONFIG.SAFETY_WEAPON_SPEED_MULT_MAX ?? 8);
  st.daggerCountBonus = clamp(Math.round(finiteOr(st.daggerCountBonus, 0)), 0, CONFIG.SAFETY_DAGGER_COUNT_BONUS_MAX ?? 12);
  st.daggerPierceBonus = clamp(Math.round(finiteOr(st.daggerPierceBonus, 0)), 0, CONFIG.SAFETY_PIERCE_BONUS_MAX ?? 24);

  wx("throwingAxeLvl", 0, 0, 8);
  st.throwingAxeDamageMult = clamp(finiteOr(st.throwingAxeDamageMult, 1), dmgMin, dmgMax * 2);
  st.throwingAxeCooldownMult = clamp(finiteOr(st.throwingAxeCooldownMult, 1), cdMin, cdMax);
  st.throwingAxeSpeedMult = clamp(finiteOr(st.throwingAxeSpeedMult, 1), 0.25, CONFIG.SAFETY_WEAPON_SPEED_MULT_MAX ?? 8);
  st.throwingAxeCountBonus = clamp(Math.round(finiteOr(st.throwingAxeCountBonus, 0)), 0, CONFIG.SAFETY_UNIVERSAL_COUNT_BONUS_MAX ?? 12);
  st.throwingAxePierceBonus = clamp(Math.round(finiteOr(st.throwingAxePierceBonus, 0)), 0, CONFIG.SAFETY_PIERCE_BONUS_MAX ?? 36);

  wx("boomerangLvl", 0, 0, 8);
  st.boomerangDamageMult = clamp(finiteOr(st.boomerangDamageMult, 1), dmgMin, dmgMax * 2);
  st.boomerangCooldownMult = clamp(finiteOr(st.boomerangCooldownMult, 1), cdMin, cdMax);
  st.boomerangSpeedMult = clamp(finiteOr(st.boomerangSpeedMult, 1), 0.25, CONFIG.SAFETY_WEAPON_SPEED_MULT_MAX ?? 8);
  st.boomerangReturnSpeedMult = clamp(finiteOr(st.boomerangReturnSpeedMult, 1), 0.25, CONFIG.SAFETY_WEAPON_SPEED_MULT_MAX ?? 10);
  st.boomerangCountBonus = clamp(Math.round(finiteOr(st.boomerangCountBonus, 0)), 0, CONFIG.SAFETY_UNIVERSAL_COUNT_BONUS_MAX ?? 12);
  st.boomerangPierceBonus = clamp(Math.round(finiteOr(st.boomerangPierceBonus, 0)), 0, CONFIG.SAFETY_PIERCE_BONUS_MAX ?? 36);

  wx("lightningLvl", 0, 0, 8);
  st.lightningDamageMult = clamp(finiteOr(st.lightningDamageMult, 1), dmgMin, dmgMax * 3);
  st.lightningCooldownMult = clamp(finiteOr(st.lightningCooldownMult, 1), cdMin, cdMax);
  st.lightningRadiusMult = clamp(finiteOr(st.lightningRadiusMult, 1), 0.35, CONFIG.SAFETY_LIGHTNING_RADIUS_MULT_MAX ?? 6);
  st.lightningStrikesBonus = clamp(
    Math.round(finiteOr(st.lightningStrikesBonus, 0)),
    0,
    CONFIG.SAFETY_LIGHTNING_STRIKES_BONUS_MAX ?? 32
  );
}

/** Recover player transform from corrupted numbers (rare glitch). */
export function sanitizePlayerEntity(p) {
  if (!p || typeof p !== "object") return;
  const cx = CONFIG.WORLD_W / 2;
  const cy = CONFIG.WORLD_H / 2;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    p.x = cx;
    p.y = cy;
  }
  p.x = clamp(finiteOr(p.x, cx), CONFIG.PLAYER_RADIUS, CONFIG.WORLD_W - CONFIG.PLAYER_RADIUS);
  p.y = clamp(finiteOr(p.y, cy), CONFIG.PLAYER_RADIUS, CONFIG.WORLD_H - CONFIG.PLAYER_RADIUS);

  const mhp = Math.max(1, finiteOr(p.maxHp, CONFIG.PLAYER_MAX_HP));
  p.maxHp = mhp;
  if (!Number.isFinite(p.hp) || p.hp < 0 || p.hp > mhp * 4) {
    p.hp = mhp;
  } else {
    p.hp = clamp(p.hp, 0, mhp * 2);
  }
  p.attackCd = clamp(finiteOr(p.attackCd, 0), -1, CONFIG.SAFETY_ATTACK_CD_CEILING_SEC ?? 30);
}
