import { CONFIG } from "./config.js?v=2026-05-03-xp-progression";

export const UPGRADE_POOL = [
  {
    id: "damage",
    title: "Shadow Mastery",
    description: "Increase damage (projectiles and axes).",
    characters: ["mage"],
    apply: (s) => {
      s.damageMult *= 1.15;
    },
  },
  {
    id: "attack_speed",
    title: "Quick Cast",
    description: "Attack more often.",
    characters: ["mage"],
    apply: (s) => {
      s.cooldownMult *= 0.9;
    },
  },
  {
    id: "projectile_count",
    title: "Splinter Bolt",
    description: "+1 projectile per volley.",
    characters: ["mage"],
    apply: (s) => {
      s.projectileCount += 1;
    },
  },
  {
    id: "projectile_size",
    title: "Void Bloom",
    description: "Larger projectiles.",
    characters: ["mage"],
    apply: (s) => {
      s.projectileSizeMult *= 1.18;
    },
  },
  {
    id: "move_speed",
    title: "Nimble Step",
    description: "Move faster.",
    characters: ["mage", "berserker", "archer"],
    apply: (s) => {
      s.moveSpeedMult *= 1.12;
    },
  },
  // -------------------------
  // Mage-exclusive weapon: Arcane Runes
  // -------------------------
  {
    id: "arcane_runes",
    title: "Arcane Runes",
    description: "Summon orbiting runes that shred enemies around you.",
    characters: ["mage"],
    isMaxed: (s) => (s.arcaneRunesLvl ?? 0) >= 8,
    weight: (s) => ((s.arcaneRunesLvl ?? 0) <= 0 ? 3.4 : 1.2),
    apply: (s) => {
      const next = Math.min(8, (s.arcaneRunesLvl ?? 0) + 1);
      s.arcaneRunesLvl = next;
      // L1: unlock (2 runes via base count in config)
      // L2: +1 rune
      if (next === 2) s.arcaneRunesCountBonus = (s.arcaneRunesCountBonus ?? 0) + 1;
      // L3: +20% rotation speed
      if (next === 3) s.arcaneRunesOrbitSpeedMult = (s.arcaneRunesOrbitSpeedMult ?? 1) * 1.2;
      // L4: +25% damage
      if (next === 4) s.arcaneRunesDamageMult = (s.arcaneRunesDamageMult ?? 1) * 1.25;
      // L5: increase orbit radius slightly
      if (next === 5) s.arcaneRunesOrbitRadiusMult = (s.arcaneRunesOrbitRadiusMult ?? 1) * 1.08;
      // L6: +1 rune
      if (next === 6) s.arcaneRunesCountBonus = (s.arcaneRunesCountBonus ?? 0) + 1;
      // L7: +30% damage
      if (next === 7) s.arcaneRunesDamageMult = (s.arcaneRunesDamageMult ?? 1) * 1.3;
      // L8: +25% rotation speed
      if (next === 8) s.arcaneRunesOrbitSpeedMult = (s.arcaneRunesOrbitSpeedMult ?? 1) * 1.25;
    },
  },
  {
    id: "dagger_weapon",
    title: "Dagger",
    description: "Fire fast daggers in your facing direction (short range, high rate).",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.daggerLvl ?? 0) >= 8,
    weight: (s) => ((s.daggerLvl ?? 0) <= 0 ? 3.1 : 1.15),
    apply: (s) => {
      const next = Math.min(8, (s.daggerLvl ?? 0) + 1);
      s.daggerLvl = next;
      // L2: +1 dagger per attack
      if (next === 2) s.daggerCountBonus = (s.daggerCountBonus ?? 0) + 1;
      // L3: cooldown -15%
      if (next === 3) s.daggerCooldownMult = (s.daggerCooldownMult ?? 1) * 0.85;
      // L4: +20% damage
      if (next === 4) s.daggerDamageMult = (s.daggerDamageMult ?? 1) * 1.2;
      // L5: +1 pierce
      if (next === 5) s.daggerPierceBonus = (s.daggerPierceBonus ?? 0) + 1;
      // L6: projectile speed +20%
      if (next === 6) s.daggerSpeedMult = (s.daggerSpeedMult ?? 1) * 1.2;
      // L7: +1 dagger per attack
      if (next === 7) s.daggerCountBonus = (s.daggerCountBonus ?? 0) + 1;
      // L8: cooldown -15% again
      if (next === 8) s.daggerCooldownMult = (s.daggerCooldownMult ?? 1) * 0.85;
    },
  },
  {
    id: "throwing_axe",
    title: "Throwing Axe",
    description: "Hurl a heavy spinning axe that cleaves through multiple enemies.",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.throwingAxeLvl ?? 0) >= 8,
    weight: (s) => ((s.throwingAxeLvl ?? 0) <= 0 ? 3.0 : 1.15),
    apply: (s) => {
      const next = Math.min(8, (s.throwingAxeLvl ?? 0) + 1);
      s.throwingAxeLvl = next;
      // L2: +20% damage
      if (next === 2) s.throwingAxeDamageMult = (s.throwingAxeDamageMult ?? 1) * 1.2;
      // L3: +1 pierce
      if (next === 3) s.throwingAxePierceBonus = (s.throwingAxePierceBonus ?? 0) + 1;
      // L4: cooldown -15%
      if (next === 4) s.throwingAxeCooldownMult = (s.throwingAxeCooldownMult ?? 1) * 0.85;
      // L5: +1 axe per throw
      if (next === 5) s.throwingAxeCountBonus = (s.throwingAxeCountBonus ?? 0) + 1;
      // L6: +20% damage
      if (next === 6) s.throwingAxeDamageMult = (s.throwingAxeDamageMult ?? 1) * 1.2;
      // L7: +1 pierce
      if (next === 7) s.throwingAxePierceBonus = (s.throwingAxePierceBonus ?? 0) + 1;
      // L8: +1 axe per throw
      if (next === 8) s.throwingAxeCountBonus = (s.throwingAxeCountBonus ?? 0) + 1;
    },
  },
  {
    id: "boomerang_weapon",
    title: "Boomerang",
    description: "Throw a boomerang that returns to you, hitting enemies on the way out and back.",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.boomerangLvl ?? 0) >= 8,
    weight: (s) => ((s.boomerangLvl ?? 0) <= 0 ? 3.05 : 1.15),
    apply: (s) => {
      const next = Math.min(8, (s.boomerangLvl ?? 0) + 1);
      s.boomerangLvl = next;
      // L2: +1 pierce
      if (next === 2) s.boomerangPierceBonus = (s.boomerangPierceBonus ?? 0) + 1;
      // L3: +20% speed
      if (next === 3) s.boomerangSpeedMult = (s.boomerangSpeedMult ?? 1) * 1.2;
      // L4: +1 boomerang
      if (next === 4) s.boomerangCountBonus = (s.boomerangCountBonus ?? 0) + 1;
      // L5: +20% damage
      if (next === 5) s.boomerangDamageMult = (s.boomerangDamageMult ?? 1) * 1.2;
      // L6: +1 pierce
      if (next === 6) s.boomerangPierceBonus = (s.boomerangPierceBonus ?? 0) + 1;
      // L7: faster return speed
      if (next === 7) s.boomerangReturnSpeedMult = (s.boomerangReturnSpeedMult ?? 1) * 1.18;
      // L8: +1 boomerang
      if (next === 8) s.boomerangCountBonus = (s.boomerangCountBonus ?? 0) + 1;
    },
  },
  {
    id: "lightning_strike",
    title: "Lightning Strike",
    description: "Call down instant lightning strikes on enemies (small AOE).",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.lightningLvl ?? 0) >= 8,
    weight: (s) => ((s.lightningLvl ?? 0) <= 0 ? 3.0 : 1.15),
    apply: (s) => {
      const next = Math.min(8, (s.lightningLvl ?? 0) + 1);
      s.lightningLvl = next;
      // L2: +1 strike per cast
      if (next === 2) s.lightningStrikesBonus = (s.lightningStrikesBonus ?? 0) + 1;
      // L3: +20% damage
      if (next === 3) s.lightningDamageMult = (s.lightningDamageMult ?? 1) * 1.2;
      // L4: radius increase
      if (next === 4) s.lightningRadiusMult = (s.lightningRadiusMult ?? 1) * 1.18;
      // L5: +1 strike
      if (next === 5) s.lightningStrikesBonus = (s.lightningStrikesBonus ?? 0) + 1;
      // L6: cooldown reduced
      if (next === 6) s.lightningCooldownMult = (s.lightningCooldownMult ?? 1) * 0.85;
      // L7: +20% damage
      if (next === 7) s.lightningDamageMult = (s.lightningDamageMult ?? 1) * 1.2;
      // L8: +1 strike
      if (next === 8) s.lightningStrikesBonus = (s.lightningStrikesBonus ?? 0) + 1;
    },
  },
  // -------------------------
  // Verdant Ranger upgrades
  // -------------------------
  {
    id: "archer_multi_arrow",
    title: "Multi-Arrow",
    description: "+1 arrow per volley.",
    characters: ["archer"],
    isMaxed: (s) => (s.projectileCount ?? CONFIG.BASE_PROJECTILE_COUNT) >= 4,
    apply: (s) => {
      s.projectileCount = Math.min(4, (s.projectileCount ?? CONFIG.BASE_PROJECTILE_COUNT) + 1);
    },
  },
  {
    id: "archer_poison",
    title: "Poison Arrows",
    description: "Arrows apply poison (damage over time).",
    characters: ["archer"],
    isMaxed: (s) => (s.poisonArrows ?? 0) >= 1,
    apply: (s) => {
      s.poisonArrows = 1;
    },
  },
  {
    id: "toxic_grenade",
    title: "Toxic Grenade",
    description: "Unlock Toxic Grenade (lobbed AOE that leaves a poison cloud).",
    characters: ["archer"],
    isMaxed: (s) => (s.toxicGrenadeLvl ?? 0) >= 1,
    weight: (s) => ((s.toxicGrenadeLvl ?? 0) <= 0 ? 2.9 : 0),
    apply: (s) => {
      s.toxicGrenadeLvl = 1;
    },
  },
  {
    id: "hammer_count",
    title: "Hammers",
    description: "+1 orbiting hammer.",
    // Universal weapon (unlock by taking first level; starts at 0 for everyone).
    characters: ["mage", "berserker", "archer", "revenant"],
    weight: (s) => ((s.hammerCount ?? 0) <= 0 ? 3.0 : 1.15),
    apply: (s) => {
      s.hammerCount = Math.max(0, Math.floor(s.hammerCount ?? 0)) + 1;
    },
  },
  {
    id: "hammer_size",
    title: "Heavy Head",
    description: "Larger hammers (hit area + sprite).",
    characters: ["mage", "berserker", "archer", "revenant"],
    weight: (s) => ((s.hammerCount ?? 0) > 0 ? 1.0 : 0),
    apply: (s) => {
      s.hammerSize *= 1.12;
    },
  },
  {
    id: "hammer_orbit_speed",
    title: "Whirling Haft",
    description: "Hammers orbit faster around you.",
    characters: ["mage", "berserker", "archer", "revenant"],
    weight: (s) => ((s.hammerCount ?? 0) > 0 ? 1.0 : 0),
    apply: (s) => {
      s.hammerOrbitSpeed *= 1.12;
    },
  },
  {
    id: "hammer_orbit_radius",
    title: "Long Reach",
    description: "Hammers orbit farther from you.",
    characters: ["mage", "berserker", "archer", "revenant"],
    weight: (s) => ((s.hammerCount ?? 0) > 0 ? 1.0 : 0),
    apply: (s) => {
      s.hammerOrbitRadius *= 1.1;
    },
  },
  // -------------------------
  // Whip upgrades
  // -------------------------
  {
    id: "whip_unlock",
    title: "Whip",
    description: "Unlock the Whip weapon.",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.whipCount ?? 0) >= 1,
    weight: (s) => ((s.whipCount ?? 0) <= 0 ? 4.0 : 0),
    apply: (s) => {
      s.whipCount = Math.max(1, Math.floor(s.whipCount ?? 0));
    },
  },
  {
    id: "whip_count",
    title: "Twin Lash",
    description: "+1 slash direction (max 3): 2 = front + behind, 3 = front + left + right flanks.",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.whipCount ?? 0) >= 3,
    weight: (s) => {
      const c = s.whipCount ?? 0;
      if (c <= 0) return 0;
      return c < 2 ? 3.0 : 1.0;
    },
    apply: (s) => {
      const cur = s.whipCount ?? 0;
      s.whipCount = Math.min(3, (cur <= 0 ? 1 : cur + 1));
    },
  },
  {
    id: "whip_length",
    title: "Extended Coil",
    description: "Whip range +20% (max +60%).",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.whipLengthLvl ?? 0) >= 3,
    apply: (s) => {
      s.whipLengthLvl = Math.min(3, (s.whipLengthLvl ?? 0) + 1);
      s.whipLengthMult = 1 + 0.2 * s.whipLengthLvl;
    },
  },
  {
    id: "whip_damage",
    title: "Barbed Tip",
    description: "Whip damage +15% (max +75%).",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.whipDamageLvl ?? 0) >= 5,
    apply: (s) => {
      s.whipDamageLvl = Math.min(5, (s.whipDamageLvl ?? 0) + 1);
      s.whipDamageMult = 1 + 0.15 * s.whipDamageLvl;
    },
  },
  {
    id: "whip_speed",
    title: "Quick Flick",
    description: "Whip attacks faster (down to 60% cooldown).",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.whipCooldownMult ?? 1) <= 0.6 + 1e-6,
    weight: (s) => ((s.whipCooldownMult ?? 1) > 0.75 ? 2.2 : 1.0),
    apply: (s) => {
      const cur = s.whipCooldownMult ?? 1;
      s.whipCooldownMult = Math.max(0.6, cur * 0.9);
    },
  },
  {
    id: "whip_width",
    title: "Wide Sweep",
    description: "Whip width +15% (max +45%).",
    characters: ["mage", "berserker", "archer", "revenant"],
    isMaxed: (s) => (s.whipWidthLvl ?? 0) >= 3,
    apply: (s) => {
      s.whipWidthLvl = Math.min(3, (s.whipWidthLvl ?? 0) + 1);
      s.whipWidthMult = 1 + 0.15 * s.whipWidthLvl;
    },
  },

  // -------------------------
  // Berserker upgrades
  // -------------------------
  {
    id: "berserk_damage",
    title: "Blood Oath",
    description: "Increase slash damage.",
    characters: ["berserker"],
    apply: (s) => {
      s.slashDamageMult = (s.slashDamageMult ?? 1) * 1.18;
    },
  },
  {
    id: "berserk_attack_speed",
    title: "Relentless",
    description: "Slash faster.",
    characters: ["berserker"],
    isMaxed: (s) => (s.slashCooldownMult ?? 1) <= 0.62 + 1e-6,
    apply: (s) => {
      const cur = s.slashCooldownMult ?? 1;
      s.slashCooldownMult = Math.max(0.62, cur * 0.9);
    },
  },
  {
    id: "berserk_slash_size",
    title: "Wider Cleave",
    description: "Increase slash arc and range.",
    characters: ["berserker"],
    isMaxed: (s) => (s.slashSizeLvl ?? 0) >= 4,
    apply: (s) => {
      s.slashSizeLvl = Math.min(4, (s.slashSizeLvl ?? 0) + 1);
      s.slashRangeMult = 1 + 0.12 * s.slashSizeLvl;
      s.slashArcMult = 1 + 0.1 * s.slashSizeLvl;
    },
  },
  {
    id: "berserk_multi_slash",
    title: "Rending Flurry",
    description: "Spawn extra slashes at slight angles.",
    characters: ["berserker"],
    isMaxed: (s) => (s.multiSlash ?? 1) >= 3,
    weight: (s) => ((s.multiSlash ?? 1) < 2 ? 2.5 : 1.0),
    apply: (s) => {
      s.multiSlash = Math.min(3, (s.multiSlash ?? 1) + 1);
    },
  },
  {
    id: "berserk_lifesteal",
    title: "Crimson Feast",
    description: "Heal for a portion of slash damage.",
    characters: ["berserker"],
    isMaxed: (s) => (s.lifestealPct ?? 0) >= 0.12 - 1e-6,
    weight: (s) => ((s.lifestealPct ?? 0) < 0.06 ? 2.2 : 1.0),
    apply: (s) => {
      const cur = s.lifestealPct ?? 0;
      s.lifestealPct = Math.min(0.12, cur + 0.03);
    },
  },
  {
    id: "ground_slam",
    title: "Ground Slam",
    description: "Unlock and upgrade a heavy AOE burst around you.",
    characters: ["berserker"],
    isMaxed: (s) => (s.groundSlamLvl ?? 0) >= 8,
    // Locked until unlock step; after unlock, this remains eligible until maxed.
    weight: (s) => {
      const lvl = s.groundSlamLvl ?? 0;
      return lvl <= 0 ? 2.3 : 1.4;
    },
    apply: (s) => {
      const next = Math.min(8, (s.groundSlamLvl ?? 0) + 1);
      s.groundSlamLvl = next;
      s.groundSlamDamageMult = s.groundSlamDamageMult ?? 1;
      s.groundSlamRadiusMult = s.groundSlamRadiusMult ?? 1;
      s.groundSlamCooldownMult = s.groundSlamCooldownMult ?? 1;
      s.groundSlamKnockbackMult = s.groundSlamKnockbackMult ?? 1;
      s.groundSlamDouble = s.groundSlamDouble ?? false;
      // Level-specific path (see user spec).
      if (next === 2) s.groundSlamDamageMult *= 1.2;
      else if (next === 3) s.groundSlamRadiusMult *= 1.15;
      else if (next === 4) s.groundSlamCooldownMult *= 0.85;
      else if (next === 5) s.groundSlamKnockbackMult *= 1.6;
      else if (next === 6) s.groundSlamDamageMult *= 1.25;
      else if (next === 7) s.groundSlamRadiusMult *= 1.2;
      else if (next === 8) s.groundSlamDouble = true;
    },
  },
  {
    id: "soul_pull",
    title: "Soul Push",
    description: "Unlock Soul Push (periodic shockwave that knocks nearby enemies away).",
    characters: ["revenant"],
    isMaxed: (s) => (s.soulPullLvl ?? 0) >= 1,
    weight: (s) => ((s.soulPullLvl ?? 0) <= 0 ? 3.2 : 0),
    apply: (s) => {
      s.soulPullLvl = 1;
    },
  },
];

export function findUpgradeById(id) {
  if (typeof id !== "string" || !id) return null;
  return UPGRADE_POOL.find((u) => u && u.id === id) ?? null;
}

export function createBaseStats() {
  return {
    characterId: "mage",
    damageMult: 1,
    cooldownMult: 1,
    projectileCount: CONFIG.BASE_PROJECTILE_COUNT,
    projectileSizeMult: 1,
    moveSpeedMult: 1,
    /** Orbiting hammer weapon (upgrade hooks). */
    hammerCount: 0,
    hammerSize: 1,
    hammerOrbitSpeed: 1,
    hammerOrbitRadius: 1,

    // Whip scaling (weapon-specific; starts weak and grows quickly).
    whipCount: 0,
    whipLengthLvl: 0,
    whipLengthMult: 1,
    whipDamageLvl: 0,
    whipDamageMult: 1,
    whipCooldownMult: 1,
    whipWidthLvl: 0,
    whipWidthMult: 1,

    // Berserker slash tuning (used only when characterId === 'berserker')
    slashDamageMult: 1,
    slashCooldownMult: 1,
    slashRangeMult: 1,
    slashArcMult: 1,
    slashSizeLvl: 0,
    multiSlash: 1,
    lifestealPct: 0,
    // Berserker special weapon: Ground Slam (unlock + scaling)
    groundSlamLvl: 0,
    groundSlamDamageMult: 1,
    groundSlamRadiusMult: 1,
    groundSlamCooldownMult: 1,
    groundSlamKnockbackMult: 1,
    groundSlamDouble: false,

    // Archer (Verdant Ranger)
    poisonArrows: 0,
    toxicGrenadeLvl: 0,

    // Revenant: Soul Rip (starting weapon uses config; no upgrade fields needed yet).
    soulPullLvl: 0,

    // Mage-exclusive weapon: Arcane Runes (outer ring).
    arcaneRunesLvl: 0,
    arcaneRunesCountBonus: 0,
    arcaneRunesOrbitSpeedMult: 1,
    arcaneRunesDamageMult: 1,
    arcaneRunesOrbitRadiusMult: 1,

    // Universal weapon: Dagger
    daggerLvl: 0,
    daggerDamageMult: 1,
    daggerCooldownMult: 1,
    daggerSpeedMult: 1,
    daggerCountBonus: 0,
    daggerPierceBonus: 0,

    // Universal weapon: Throwing Axe
    throwingAxeLvl: 0,
    throwingAxeDamageMult: 1,
    throwingAxeCooldownMult: 1,
    throwingAxeSpeedMult: 1,
    throwingAxeCountBonus: 0,
    throwingAxePierceBonus: 0,

    // Universal weapon: Boomerang
    boomerangLvl: 0,
    boomerangDamageMult: 1,
    boomerangCooldownMult: 1,
    boomerangSpeedMult: 1,
    boomerangReturnSpeedMult: 1,
    boomerangCountBonus: 0,
    boomerangPierceBonus: 0,

    // Universal weapon: Lightning Strike
    lightningLvl: 0,
    lightningDamageMult: 1,
    lightningCooldownMult: 1,
    lightningRadiusMult: 1,
    lightningStrikesBonus: 0,
  };
}

function weightedPickIndex(items, weights, rng) {
  let sum = 0;
  for (const w of weights) sum += Math.max(0, w);
  if (sum <= 1e-9) return Math.floor(rng() * items.length);
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return i;
  }
  return items.length - 1;
}

export function pickThreeUpgrades(stats, rng = Math.random, opts = {}) {
  const s = stats ?? {};
  const charId = (s && typeof s.characterId === "string" ? s.characterId : "mage") || "mage";
  const level = Number.isFinite(opts?.level) ? Math.max(1, Math.floor(opts.level)) : 1;

  // -------------------------
  // Weapon ownership model
  // -------------------------
  const UNIVERSAL_KEYS = ["dagger", "axe", "boomerang", "lightning", "whip", "hammers"];
  const UNIVERSAL_UNLOCK_ID = {
    dagger: "dagger_weapon",
    axe: "throwing_axe",
    boomerang: "boomerang_weapon",
    lightning: "lightning_strike",
    whip: "whip_unlock",
    hammers: "hammer_count",
  };
  const UNIVERSAL_UPGRADE_IDS = {
    dagger: new Set(["dagger_weapon"]),
    axe: new Set(["throwing_axe"]),
    boomerang: new Set(["boomerang_weapon"]),
    lightning: new Set(["lightning_strike"]),
    whip: new Set(["whip_unlock", "whip_count", "whip_length", "whip_damage", "whip_speed", "whip_width"]),
    hammers: new Set(["hammer_count", "hammer_size", "hammer_orbit_speed", "hammer_orbit_radius"]),
  };
  const SPECIAL_BY_CLASS = {
    mage: "arcane_runes",
    archer: "toxic_grenade",
    berserker: "ground_slam",
    revenant: "soul_pull",
  };

  const ownsUniversal = (key) => {
    if (key === "dagger") return (s.daggerLvl ?? 0) > 0;
    if (key === "axe") return (s.throwingAxeLvl ?? 0) > 0;
    if (key === "boomerang") return (s.boomerangLvl ?? 0) > 0;
    if (key === "lightning") return (s.lightningLvl ?? 0) > 0;
    if (key === "whip") return (s.whipCount ?? 0) > 0;
    if (key === "hammers") return (s.hammerCount ?? 0) > 0;
    return false;
  };
  const ownedUniversalKeys = UNIVERSAL_KEYS.filter((k) => ownsUniversal(k));
  const ownedUniversalCount = ownedUniversalKeys.length;
  const universalSlotsRemaining = Math.max(0, 3 - ownedUniversalCount);

  const specialId = SPECIAL_BY_CLASS[charId] ?? null;
  const ownsSpecial =
    (charId === "mage" && (s.arcaneRunesLvl ?? 0) > 0) ||
    (charId === "archer" && (s.toxicGrenadeLvl ?? 0) > 0) ||
    (charId === "berserker" && (s.groundSlamLvl ?? 0) > 0) ||
    (charId === "revenant" && (s.soulPullLvl ?? 0) > 0);

  // Total weapons = starting weapon (always) + universals + special
  const totalWeapons = 1 + ownedUniversalCount + (ownsSpecial ? 1 : 0);
  const hasMaxWeapons = ownedUniversalCount >= 3 && ownsSpecial;

  const universalKeyForUpgradeId = (id) => {
    for (const k of UNIVERSAL_KEYS) {
      if (UNIVERSAL_UPGRADE_IDS[k]?.has(id)) return k;
    }
    return null;
  };

  const isMaxedFor = (u) => (typeof u.isMaxed === "function" ? u.isMaxed(s) : false);
  const weightFor = (u) => {
    const base = typeof u.weight === "function" ? u.weight(s) : 1;
    return Number.isFinite(base) ? base : 1;
  };

  // Baseline pool: correct character + not maxed + positive weight.
  let pool = UPGRADE_POOL.filter((u) => {
    if (Array.isArray(u.characters) && u.characters.length > 0 && !u.characters.includes(charId)) return false;
    if (isMaxedFor(u)) return false;
    const w = weightFor(u);
    return w > 0;
  });

  // Enforce weapon ownership / slot rules.
  pool = pool.filter((u) => {
    const id = u.id;
    const uniKey = universalKeyForUpgradeId(id);
    if (uniKey) {
      const unlockId = UNIVERSAL_UNLOCK_ID[uniKey];
      // Weapon upgrades require ownership; unlock requires remaining slot.
      if (id !== unlockId && !ownsUniversal(uniKey)) return false;
      if (id === unlockId && !ownsUniversal(uniKey) && universalSlotsRemaining <= 0) return false;
      // If max weapons, do not offer new universal unlocks.
      if (hasMaxWeapons && id === unlockId && !ownsUniversal(uniKey)) return false;
    }

    // Class special gating: only your class; unlock forced at/after level 5, but never before.
    if (id === "arcane_runes" && (s.arcaneRunesLvl ?? 0) <= 0 && level < 5) return false;
    if (id === "ground_slam" && (s.groundSlamLvl ?? 0) <= 0 && level < 5) return false;
    if (id === "toxic_grenade" && (s.toxicGrenadeLvl ?? 0) <= 0 && level < 5) return false;
    if (id === "soul_pull" && (s.soulPullLvl ?? 0) <= 0 && level < 5) return false;

    // If max weapons, do not offer special unlock if not owned.
    if (hasMaxWeapons && typeof specialId === "string" && id === specialId && !ownsSpecial) return false;
    return true;
  });

  const byId = new Map(pool.map((u) => [u.id, u]));

  const newUniversalUnlocks = UNIVERSAL_KEYS.filter((k) => !ownsUniversal(k) && universalSlotsRemaining > 0)
    .map((k) => byId.get(UNIVERSAL_UNLOCK_ID[k]))
    .filter(Boolean);

  const specialEligible =
    level >= 5 &&
    !ownsSpecial &&
    typeof specialId === "string" &&
    specialId.length > 0;
  const specialUpgrade = specialEligible ? byId.get(specialId) : null;

  const out = [];
  const takeWeightedOne = (candidates) => {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const weights = candidates.map((u) => weightFor(u));
    const i = weightedPickIndex(candidates, weights, rng);
    return candidates[i] ?? null;
  };

  const removeFromPool = (id) => {
    pool = pool.filter((u) => u.id !== id);
  };

  // Rule 1: if fewer than 3 total weapons, at least 2 new universal weapons (if available).
  if (totalWeapons < 3 && newUniversalUnlocks.length > 0) {
    const first = takeWeightedOne(newUniversalUnlocks);
    if (first) {
      out.push(first);
      removeFromPool(first.id);
    }
    const remainingUnlocks = newUniversalUnlocks.filter((u) => !out.some((x) => x.id === u.id));
    if (out.length < 2 && remainingUnlocks.length > 0) {
      const second = takeWeightedOne(remainingUnlocks);
      if (second) {
        out.push(second);
        removeFromPool(second.id);
      }
    }
  }

  // Rule 2: starting at level 5, include class special weapon if not owned.
  if (specialUpgrade && out.length < 3 && !out.some((u) => u.id === specialUpgrade.id)) {
    out.push(specialUpgrade);
    removeFromPool(specialUpgrade.id);
  }

  // Rule 6: after level 8, bias toward upgrades over new weapons (unless not at weapon cap).
  const after8 = level > 8;
  const unlockIds = new Set(Object.values(UNIVERSAL_UNLOCK_ID));
  const ownedUnlockIds = new Set(ownedUniversalKeys.map((k) => UNIVERSAL_UNLOCK_ID[k]));

  while (out.length < 3 && pool.length) {
    const candidates = pool.filter((u) => !out.some((x) => x.id === u.id));
    if (candidates.length === 0) break;
    const weights = candidates.map((u) => {
      let w = weightFor(u);
      if (after8 && universalSlotsRemaining > 0 && unlockIds.has(u.id) && !ownedUnlockIds.has(u.id)) {
        w *= 0.25;
      }
      return w;
    });
    const i = weightedPickIndex(candidates, weights, rng);
    const pick = candidates[i];
    if (!pick) break;
    out.push(pick);
    pool = pool.filter((u) => u.id !== pick.id);
  }

  return out.slice(0, 3);
}

/**
 * Level-up UI: stacked weapon tiers reuse the same upgrade `id`; without dynamic copy it looks like a duplicate unlock.
 * @param {{ id?: string; title?: string; description?: string }} u
 * @param {Record<string, unknown>} stats
 * @returns {{ title: string; description: string; statLine: string | null }}
 */
export function upgradeChoicePresentation(u, stats) {
  const s = stats ?? {};
  const id = u?.id;
  const baseTitle = typeof u?.title === "string" ? u.title : "";
  const baseDesc = typeof u?.description === "string" ? u.description : "";

  /**
   * @param {Record<number, string>} descByNext
   * @param {Record<number, string>} [statByNext]
   */
  const tierUniversal = (lvlKey, maxRank, unlockTitle, unlockDesc, unlockStat, descByNext, statByNext) => {
    const cur = s[lvlKey] ?? 0;
    const next = Math.min(maxRank, Math.floor(Number(cur)) + 1);
    if ((cur ?? 0) <= 0) {
      return {
        title: `${unlockTitle} — Unlock`,
        description: unlockDesc,
        statLine: unlockStat,
      };
    }
    return {
      title: `${unlockTitle} — Upgrade (${next}/${maxRank})`,
      description: descByNext[next] ?? `Improve ${unlockTitle}.`,
      statLine: statByNext?.[next] ?? null,
    };
  };

  if (id === "boomerang_weapon") {
    return tierUniversal(
      "boomerangLvl",
      8,
      "Boomerang",
      "Hunt foes on the throw and punish them again on the return.",
      "Unlock weapon",
      {
        2: "Each revolution bites through extra bodies.",
        3: "Put violent spin behind every toss.",
        4: "Blanket the battlefield in returning steel.",
        5: "Turn grazes into executions.",
        6: "Let the blade tunnel through tighter packs.",
        7: "The arc snaps home faster — less time between beatdowns.",
        8: "Double the arcs carving through the crowd.",
      },
      {
        2: "+1 Pierce",
        3: "+20% Throw Speed",
        4: "+1 Boomerang",
        5: "+20% Damage",
        6: "+1 Pierce",
        7: "+18% Return Speed",
        8: "+1 Boomerang",
      }
    );
  }
  if (id === "dagger_weapon") {
    return tierUniversal(
      "daggerLvl",
      8,
      "Dagger",
      "Fan short, vicious blades exactly where you're facing.",
      "Unlock weapon",
      {
        2: "Empty a denser burst into point-blank range.",
        3: "Blink between throws — your hands never cool down.",
        4: "Make every nick hurt twice as badly.",
        5: "Punch blades through crowds instead of dying on first contact.",
        6: "Close distance before victims can blink.",
        7: "Turn the dagger fan into outright suppressing fire.",
        8: "Push attack tempo past the breaking point.",
      },
      {
        2: "+1 Knife / Burst",
        3: "−15% Cooldown",
        4: "+20% Knife Damage",
        5: "+1 Pierce",
        6: "+20% Knife Speed",
        7: "+1 Knife / Burst",
        8: "−15% Cooldown",
      }
    );
  }
  if (id === "throwing_axe") {
    return tierUniversal(
      "throwingAxeLvl",
      8,
      "Throwing Axe",
      "Hurl chunky steel that laughs at straight lines.",
      "Unlock weapon",
      {
        2: "Heavier rotations mean uglier wounds.",
        3: "Let the carve continue through packed ranks.",
        4: "Recover faster — keep axes in the air.",
        5: "Toss duplicates so nothing escapes the arc.",
        6: "Second verse, same devastation.",
        7: "Even thicker packs can't clog the blade.",
        8: "Turn the axe rain into absolute overkill.",
      },
      {
        2: "+20% Axe Damage",
        3: "+1 Pierce",
        4: "−15% Cooldown",
        5: "+1 Axe / Throw",
        6: "+20% Axe Damage",
        7: "+1 Pierce",
        8: "+1 Axe / Throw",
      }
    );
  }
  if (id === "lightning_strike") {
    return tierUniversal(
      "lightningLvl",
      8,
      "Lightning Strike",
      "Call jagged brilliance down on whoever bothers you.",
      "Unlock weapon",
      {
        2: "More bolts — more screams per cast.",
        3: "Each strike boils the air hotter.",
        4: "Widen the devastation circle.",
        5: "Turn the storm into artillery.",
        6: "Strike again before victims recover.",
        7: "Leave nothing but soot where enemies stood.",
        8: "Blanket zones in cascading thunder.",
      },
      {
        2: "+1 Bolt / Cast",
        3: "+20% Bolt Damage",
        4: "+18% Strike Radius",
        5: "+1 Bolt / Cast",
        6: "−15% Cooldown",
        7: "+20% Bolt Damage",
        8: "+1 Bolt / Cast",
      }
    );
  }
  if (id === "arcane_runes") {
    return tierUniversal(
      "arcaneRunesLvl",
      8,
      "Arcane Runes",
      "Keep murderous glyphs orbiting you like impatient satellites.",
      "Unlock weapon",
      {
        2: "More runes slicing the halo around you.",
        3: "Spin the constellation faster.",
        4: "Sharpen each sigil until it peels armor.",
        5: "Push shredding space farther outward.",
        6: "Another rune joins the procession.",
        7: "Overcharge the inscription — enemies melt faster.",
        8: "The ring becomes a frenzy of cutting light.",
      },
      {
        2: "+1 Rune",
        3: "+20% Orbit Speed",
        4: "+25% Rune Damage",
        5: "+8% Orbit Radius",
        6: "+1 Rune",
        7: "+30% Rune Damage",
        8: "+25% Orbit Speed",
      }
    );
  }
  if (id === "ground_slam") {
    return tierUniversal(
      "groundSlamLvl",
      8,
      "Ground Slam",
      "Make the arena jump — then crater everything near you.",
      "Unlock weapon",
      {
        2: "The shock echoes harder through bodies.",
        3: "Claim more floor with each impact.",
        4: "Slam sooner; keep elites guessing.",
        5: "Launch survivors like ragdolls.",
        6: "Turn craters into mass graves.",
        7: "Own even more battlefield real estate.",
        8: "Follow the first slam with vindictive aftershocks.",
      },
      {
        2: "+20% Slam Damage",
        3: "+15% Slam Radius",
        4: "−15% Cooldown",
        5: "+60% Knockback",
        6: "+25% Slam Damage",
        7: "+20% Slam Radius",
        8: "Second Shockwave",
      }
    );
  }
  if (id === "hammer_count") {
    const c = Math.max(0, Math.floor(Number(s.hammerCount ?? 0)));
    if (c <= 0) {
      return {
        title: "Orbiting Hammer — Unlock",
        description: "Forge a ring of steel that hunts threats for you.",
        statLine: "Unlock orbit hammer",
      };
    }
    return {
      title: "Orbiting Hammer — Upgrade",
      description: "Add another striker to your whirlwind — more arcs, more pain.",
      statLine: "+1 Orbiting Hammer",
    };
  }

  switch (id) {
    case "damage":
      return {
        title: "Shadow Mastery",
        description: "Your magic hits crueler across every projectile and axe.",
        statLine: "+15% Damage",
      };
    case "attack_speed":
      return {
        title: "Quick Cast",
        description: "Shorten every gap between bursts, bolts, and answer shots.",
        statLine: "+11% Attack Speed",
      };
    case "projectile_count":
      return {
        title: "Splinter Bolt",
        description: "Split each volley into a wider curtain of doom.",
        statLine: "+1 Projectile",
      };
    case "projectile_size":
      return {
        title: "Void Bloom",
        description: "Let your bolts swell until impossible to dodge.",
        statLine: "+18% Projectile Size",
      };
    case "move_speed":
      return {
        title: "Nimble Step",
        description: "Cut through claustrophobic crowds instead of drowning in them.",
        statLine: "+12% Move Speed",
      };
    case "archer_multi_arrow":
      return {
        title: "Multi-Arrow",
        description: "Stack another shaft into each volley — geometry wins fights.",
        statLine: "+1 Arrow / Volley",
      };
    case "archer_poison":
      return {
        title: "Poison Arrows",
        description: "Let damage linger long after arrows find flesh.",
        statLine: "Unlock: Poison DoT",
      };
    case "toxic_grenade":
      return {
        title: "Toxic Grenade",
        description: "Paint the dirt with creeping venom clouds.",
        statLine: "Unlock: Toxic Grenade",
      };
    case "soul_pull":
      return {
        title: "Soul Push",
        description: "Detonate outward force — scramble everything crowding you.",
        statLine: "Unlock: Knockback Wave",
      };
    case "hammer_size":
      return {
        title: "Heavy Head",
        description: "Fatten hammer heads until impacts feel rude.",
        statLine: "+12% Hammer Hit Size",
      };
    case "hammer_orbit_speed":
      return {
        title: "Whirling Haft",
        description: "Spin the orbital faster — foes eat more passes per second.",
        statLine: "+12% Orbit Speed",
      };
    case "hammer_orbit_radius":
      return {
        title: "Long Reach",
        description: "Push devastation farther from your body.",
        statLine: "+10% Orbit Radius",
      };
    case "whip_unlock":
      return {
        title: "Whip",
        description: "Unfurl snapping reach that loves packed waves.",
        statLine: "Unlock: Whip",
      };
    case "whip_count":
      return {
        title: "Twin Lash",
        description: "Attack from more compass points — nowhere is safe.",
        statLine: "+1 Slash Direction",
      };
    case "whip_length":
      return {
        title: "Extended Coil",
        description: "Stretch the lash until it kisses the horizon.",
        statLine: "+20% Whip Range",
      };
    case "whip_damage":
      return {
        title: "Barbed Tip",
        description: "Serrate each strike until leather becomes lawnmower cord.",
        statLine: "+15% Whip Damage",
      };
    case "whip_speed":
      return {
        title: "Quick Flick",
        description: "Make the lash answer before enemies finish flinching.",
        statLine: "+11% Whip Attack Speed",
      };
    case "whip_width":
      return {
        title: "Wide Sweep",
        description: "Turn narrow cuts into bulldozing swaths.",
        statLine: "+15% Whip Width",
      };
    case "berserk_damage":
      return {
        title: "Blood Oath",
        description: "Let raw violence speak louder — every slash cleaves heavier.",
        statLine: "+18% Slash Damage",
      };
    case "berserk_attack_speed":
      return {
        title: "Relentless",
        description: "Leave no heartbeat between roaring swings.",
        statLine: "+11% Slash Speed",
      };
    case "berserk_slash_size":
      return {
        title: "Wider Cleave",
        description: "Grow the arc until entire packs vanish sideways.",
        statLine: "+12% Slash Reach · +10% Arc",
      };
    case "berserk_multi_slash":
      return {
        title: "Rending Flurry",
        description: "Spawn companion blades at cruel new angles.",
        statLine: "+1 Bonus Slash",
      };
    case "berserk_lifesteal":
      return {
        title: "Crimson Feast",
        description: "Turn carnage directly into stamina.",
        statLine: "+3% Lifesteal",
      };
    default:
      return { title: baseTitle, description: baseDesc, statLine: null };
  }
}

/**
 * Sprite paths for compact level-up thumbnails (matches in-game pickup / weapon assets).
 * @param {string} iconKey keys from UPGRADE_ICON_BY_ID
 */
export function upgradeCardIconSrc(iconKey) {
  const hammerSrc =
    typeof CONFIG?.HAMMER_ASSET_SRC === "string" && CONFIG.HAMMER_ASSET_SRC.length
      ? CONFIG.HAMMER_ASSET_SRC
      : "assets/Axe.png";
  const map = {
    hammer: hammerSrc,
    lightning: "assets/Archer-projectile.png",
    dagger: "assets/Knife.png",
    axe: "assets/Tomahawk.png",
    boomerang: "assets/Boomerang.png",
    rune: "assets/Runes.png",
    slam: "assets/Berserk-slash.png",
    grenade: "assets/Grenade.png",
    soul: "assets/Soul-rip.png",
    whip: "assets/Whip.png",
    slash: "assets/Berserk-slash.png",
    bow: "assets/Archer-projectile.png",
    bolt: "assets/Orb.png",
    speed: "assets/Runes.png",
    boot: "assets/Orb-red.png",
    spark: "assets/Orb.png",
  };
  return map[iconKey] ?? "assets/Orb.png";
}

/**
 * Frames UI thumbnails onto each asset's opaque pixels (PNG sheets have huge margins).
 * Values from alpha-bound analysis; percentages are bbox center relative to bitmap size.
 */
export function upgradeIconLayout(iconKey) {
  const layouts = /** @type {Record<string, { fx: number; fy: number; scale: number }>} */ ({
    hammer: { fx: 50.27, fy: 51.43, scale: 2.12 },
    boomerang: { fx: 17.43, fy: 49.91, scale: 1.92 },
    axe: { fx: 50.78, fy: 48.08, scale: 2.38 },
    dagger: { fx: 44.73, fy: 50.0, scale: 1.88 },
    lightning: { fx: 36.23, fy: 58.15, scale: 2.05 },
    rune: { fx: 13.28, fy: 29.25, scale: 2.25 },
    slam: { fx: 60.16, fy: 48.3, scale: 2.12 },
    grenade: { fx: 51.76, fy: 60.99, scale: 2.15 },
    soul: { fx: 13.92, fy: 49.91, scale: 2.08 },
    whip: { fx: 48.34, fy: 53.27, scale: 2.25 },
    slash: { fx: 60.16, fy: 48.3, scale: 2.12 },
    bow: { fx: 36.23, fy: 58.15, scale: 1.95 },
    bolt: { fx: 49.98, fy: 50.55, scale: 1.78 },
    speed: { fx: 13.28, fy: 29.25, scale: 2.25 },
    boot: { fx: 49.98, fy: 50.55, scale: 1.72 },
    spark: { fx: 49.98, fy: 50.55, scale: 1.72 },
  });
  return layouts[iconKey] ?? { fx: 50, fy: 50, scale: 1.85 };
}

/** @type {Record<string, string>} */
const UPGRADE_ICON_BY_ID = {
  hammer_count: "hammer",
  hammer_size: "hammer",
  hammer_orbit_speed: "hammer",
  hammer_orbit_radius: "hammer",
  dagger_weapon: "dagger",
  throwing_axe: "axe",
  boomerang_weapon: "boomerang",
  lightning_strike: "lightning",
  arcane_runes: "rune",
  ground_slam: "slam",
  toxic_grenade: "grenade",
  soul_pull: "soul",
  whip_unlock: "whip",
  whip_count: "whip",
  whip_length: "whip",
  whip_damage: "whip",
  whip_speed: "whip",
  whip_width: "whip",
  berserk_damage: "slash",
  berserk_attack_speed: "slash",
  berserk_slash_size: "slash",
  berserk_multi_slash: "slash",
  berserk_lifesteal: "slash",
  archer_multi_arrow: "bow",
  archer_poison: "bow",
  damage: "bolt",
  attack_speed: "speed",
  projectile_count: "bolt",
  projectile_size: "bolt",
  move_speed: "boot",
};

/**
 * Rarity + icon for level-up cards (accent + small glyph). Not tied to gameplay power — presentation only.
 * @param {{ id?: string }} u
 * @param {Record<string, unknown>} stats
 */
export function upgradeChoiceCardMeta(u, stats) {
  const s = stats ?? {};
  const id = typeof u?.id === "string" ? u.id : "";
  const icon = UPGRADE_ICON_BY_ID[id] ?? "spark";

  if (id === "hammer_count" && (s.hammerCount ?? 0) <= 0) return { rarity: "epic", icon };
  if (id === "arcane_runes" && (s.arcaneRunesLvl ?? 0) <= 0) return { rarity: "epic", icon };
  if (id === "ground_slam" && (s.groundSlamLvl ?? 0) <= 0) return { rarity: "epic", icon };
  if (id === "toxic_grenade" && (s.toxicGrenadeLvl ?? 0) <= 0) return { rarity: "epic", icon };
  if (id === "soul_pull") return { rarity: "epic", icon };

  if (id === "dagger_weapon" && (s.daggerLvl ?? 0) <= 0) return { rarity: "rare", icon };
  if (id === "throwing_axe" && (s.throwingAxeLvl ?? 0) <= 0) return { rarity: "rare", icon };
  if (id === "boomerang_weapon" && (s.boomerangLvl ?? 0) <= 0) return { rarity: "rare", icon };
  if (id === "lightning_strike" && (s.lightningLvl ?? 0) <= 0) return { rarity: "rare", icon };
  if (id === "whip_unlock") return { rarity: "rare", icon };

  if (["dagger_weapon", "throwing_axe", "boomerang_weapon", "lightning_strike", "hammer_count"].includes(id)) {
    return { rarity: "rare", icon };
  }
  if (id === "arcane_runes" || id === "ground_slam") return { rarity: "rare", icon };

  if (["projectile_count", "archer_multi_arrow", "berserk_multi_slash", "archer_poison", "berserk_lifesteal"].includes(id)) {
    return { rarity: "rare", icon };
  }

  return { rarity: "uncommon", icon };
}

