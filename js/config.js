export const CONFIG = {
  CANVAS_W: 960,
  CANVAS_H: 540,
  /**
   * Logical game resolution is CANVAS_W×H; the canvas backing store is scaled by devicePixelRatio (capped)
   * so CSS-sized fullscreen canvas stays sharp (pixel art + HiDPI). Set 1 to disable extra resolution.
   */
  CANVAS_MAX_DPR: 4,
  WORLD_W: 2400,
  WORLD_H: 2400,
  /** Procedural fallback grid (no PNG ground). */
  GROUND_TILE_SIZE: 48,
  /**
   * World size of one ground cell when using Grass/Dirt/Hybrid PNGs.
   * Keep this on the same scale as the player (~radius 14): large values = huge “jungle” pixels.
   */
  GROUND_TEXTURE_TILE_WORLD: 112,
  /** If true, only assets/Grass.png is tiled (no dirt/hybrid mix). */
  GROUND_GRASS_ONLY: true,

  /**
   * One image covering the whole arena (camera scrolls over it). Skips tiled grass.
   * Uses assets/arena-background.png when present; otherwise see USE_ARENA_GRASS_AS_FALLBACK.
   */
  USE_ARENA_BACKGROUND: true,
  ARENA_BACKGROUND_SRC: "assets/arena-background.png",
  /** If true and arena-background.png is missing, stretch Grass.png once (not tiled). */
  USE_ARENA_GRASS_AS_FALLBACK: true,

  /**
   * Arena collision mask (same aspect as arena background; stretched to WORLD_W×WORLD_H).
   * Dark/black = blocked, light/white/transparent = walkable.
   * Set null to disable loading (no file).
   */
  ARENA_COLLISION_SRC: "assets/arena-collision.png",
  /** Master switch after load (failed load = no collisions). */
  ARENA_COLLISION_ENABLED: true,
  /** When false, player uses the mask but enemies ignore it. */
  COLLISION_BLOCKS_ENEMIES: false,
  /**
   * If true, enemies sample several headings each frame and pick the best step toward the player.
   * Prevents getting stuck pushing straight into walls; not full pathfinding, but cheap and effective.
   */
  ENEMY_WALL_AVOIDANCE: true,

  /**
   * Pixel is solid if max(R,G,B) <= this. Lower = stricter (only near-black walls);
   * higher = fat obstacles but may mark dark shadows / soft edges as solid — raises false “invisible walls”.
   */
  COLLISION_BLOCK_MAX_RGB: 46,
  /** Fully transparent pixels are always walkable. */
  COLLISION_MIN_ALPHA: 12,
  /**
   * After building the mask, shrink solid obstacles by this many pixel layers (4-neighbor erosion).
   * Fixes masks that include shadow fringes or slightly oversized black vs visible art.
   */
  COLLISION_MASK_ERODE_PASSES: 2,
  /** Sample circle edge at radius × this when testing movement (<1 = hugs walls tighter). */
  COLLISION_SAMPLE_RADIUS_MULT: 0.82,
  /** Player-only: multiply foothit radius so you can stand closer to walls (enemies use full radius). */
  COLLISION_PLAYER_RADIUS_MULT: 0.88,
  /**
   * Enemies-only: multiply collision probe radius to reduce snagging on mask pixels.
   * Slightly < 1 helps avoid "stuck on corners" without letting enemies clip through walls.
   */
  COLLISION_ENEMY_RADIUS_MULT: 0.88,

  PLAYER_RADIUS: 14,
  /** World HUD: thin HP bar above the player's head (width tracks sprite frame). */
  PLAYER_HEAD_HEALTHBAR_HEIGHT_PX: 4,
  PLAYER_HEAD_HEALTHBAR_GAP_PX: 6,
  /** Multiplier on the measured visible sprite width. */
  PLAYER_HEAD_HEALTHBAR_WIDTH_MULT: 0.72,
  PLAYER_MAX_HP: 100,
  PLAYER_BASE_SPEED: 220,
  PLAYER_CONTACT_DAMAGE_CD: 0.65,

  // -------------------------
  // Berserker (playable)
  // -------------------------
  BERSERKER_MAX_HP: 145,
  /** Slightly slower than mage. */
  BERSERKER_MOVE_SPEED_MULT: 0.92,
  /** Medium-fast, heavy-feeling melee cadence. */
  BERSERKER_SLASH_COOLDOWN: 0.52,
  /** How long the attack-pose anim runs (sync with `playerAttackTimer` / `attackTimerMax`). */
  BERSERKER_ATTACK_ANIM_DURATION: 0.3,
  BERSERKER_SLASH_DAMAGE: 28,
  /** World units. */
  BERSERKER_SLASH_RANGE: 110,
  /** Radians: wide arc. */
  BERSERKER_SLASH_ARC: 1.55,
  /** Seconds slash hitbox remains active. */
  BERSERKER_SLASH_LIFETIME: 0.14,
  /** VFX duration in seconds (can outlive hitbox slightly). */
  BERSERKER_SLASH_VFX_DURATION: 0.18,
  // Berserker passive: Blood Rage (automatic burst windows)
  BERSERKER_BLOOD_RAGE_PERIOD: 5.0,
  BERSERKER_BLOOD_RAGE_DURATION: 2.0,
  BERSERKER_BLOOD_RAGE_DAMAGE_MULT: 1.5,
  /** +30% attack speed => cooldown / 1.3 while active. */
  BERSERKER_BLOOD_RAGE_ATTACK_SPEED_MULT: 1.3,
  /** Visual overlay alpha while Blood Rage is active. */
  BERSERKER_BLOOD_RAGE_TINT_ALPHA: 0.18,
  // Berserker special weapon: Ground Slam (unlockable via level-up)
  GROUND_SLAM_COOLDOWN: 5.0,
  GROUND_SLAM_RADIUS: 95,
  GROUND_SLAM_DAMAGE: 62,
  GROUND_SLAM_KNOCKBACK_DIST: 16,
  GROUND_SLAM_VFX_DURATION: 0.3,
  GROUND_SLAM_SHAKE_ON_HIT: 0.35,
  // Double slam (lvl 8)
  GROUND_SLAM_DOUBLE_DELAY: 0.35,
  GROUND_SLAM_DOUBLE_RADIUS_MULT: 0.7,
  GROUND_SLAM_DOUBLE_DAMAGE_MULT: 0.6,
  /** One-frame Red Slash sprite (no sheet animation). */
  BERSERKER_SLASH_ASSET_SRC: "assets/Berserk-slash.png",
  /** Draw size in screen px for the red slash sprite. */
  BERSERKER_SLASH_DRAW_SIZE_PX: 180,
  /** Anchor of the slash sprite at spawn point (0..1). */
  BERSERKER_SLASH_ANCHOR_X: 0.52,
  BERSERKER_SLASH_ANCHOR_Y: 0.52,
  /** If true, flip the sprite vertically when aiming left to keep the crescent "cup" consistent. */
  BERSERKER_SLASH_FLIP_Y_WHEN_AIMING_LEFT: true,
  /** Spawn slash center forward from player by this world distance. */
  BERSERKER_SLASH_FORWARD_OFFSET: 52,
  /** Extra offsets for positioning the arc sprite (world units). */
  BERSERKER_SLASH_NORMAL_OFFSET: 12,
  BERSERKER_SLASH_UP_OFFSET: -48,
  /** Temporary: draw debug cross + numbers at slash origin. */
  DEBUG_BERSERKER_SLASH_POS: false,
  /** Angle offsets for multislash (radians). */
  BERSERKER_MULTI_SLASH_SPREAD: 0.22,
  /**
   * Enemies overlapping the player are removed after contact damage so they never block shots (degenerate aim + spawn offset).
   * Bosses are excluded — they are not insta-killed on overlap (touch DPS still applies above).
   */
  CLEAR_ENEMIES_ON_PLAYER_CONTACT: true,
  /**
   * When clearing on contact, apply this many seconds of touch DPS at once (instant kill only leaves ~1 frame of the normal tick).
   */
  CONTACT_CLEAR_DAMAGE_SECONDS: 0.22,
  /** Multiplier on summed enemy touchDps per frame (standing in packs hurts). */
  PLAYER_CONTACT_DAMAGE_MULT: 0.22,

  // -------------------------
  // Revenant (playable)
  // -------------------------
  REVENANT_MAX_HP: 110,
  /** Seconds: Soul Rip attack anim duration (plays once); 3 ghost-pull frames @ ~0.13s/frame. */
  SOUL_RIP_DURATION: 0.42,
  /** Seconds between Soul Rip attacks (medium cadence). */
  // Slower cadence; projectile now steers so it still hits consistently.
  SOUL_RIP_COOLDOWN: 1.15,
  /** World units from player center to eligible Soul Rip targets (lock + prioritization). */
  SOUL_RIP_RANGE: 260,
  /** Radians: half-angle of cone. 0.75 ≈ 86°. */
  SOUL_RIP_HALF_ANGLE: 0.75,
  /** Base damage of Soul Rip (scaled by stats.damageMult). */
  SOUL_RIP_DAMAGE: 24,
  /** Revenant: projectiles spawned per Soul Rip cast (each homes and hits separately). */
  SOUL_RIP_PROJECTILES_PER_CAST: 2,
  /** Fan spread between first and last shot when SOUL_RIP_PROJECTILES_PER_CAST > 1 (radians). */
  SOUL_RIP_PROJECTILE_FAN_SPREAD_RAD: 0.14,
  /** Impact moment within animation (0..1): ~midpoint when ghost is visible (“rip” feel). */
  SOUL_RIP_IMPACT_U: 0.5,
  /** Optional: world units push enemy away from Soul Rip impact (0 = disabled). */
  SOUL_RIP_PUSH_ON_HIT_DIST: 18,
  /** Kill-only: heal % of HP removed by Soul Rip on lethal hits (0.06 ≈ 6%; uses min(hit damage, pre-hit enemy HP)). */
  SOUL_RIP_LIFESTEAL_PCT: 0.06,
  /** Optional cap per Soul Rip kill-heal proc (single projectile strike); prevents huge heals on elites. */
  SOUL_RIP_MAX_HEAL_PER_ATTACK: 10,
  /** Screen shake added when Soul Rip hits at least one enemy. */
  SOUL_RIP_SHAKE_ON_HIT: 0.22,
  /** Soul projectile visual + flight. */
  SOUL_RIP_PROJECTILE_ASSET_SRC: "assets/Soul-rip.png",
  /** Slower projectile, compensated by homing steer in `game.js`. */
  SOUL_RIP_PROJECTILE_SPEED: 250,
  SOUL_RIP_PROJECTILE_LIFETIME: 0.9,
  SOUL_RIP_PROJECTILE_RADIUS: 14,
  SOUL_RIP_PROJECTILE_DRAW_SIZE: 110,
  SOUL_RIP_PROJECTILE_FORWARD_OFFSET: 26,
  /** Homing: turn toward nearest enemy while flying. */
  SOUL_RIP_PROJECTILE_HOMING_RANGE: 560,
  /** Per-second steering rate (higher = snaps harder). */
  SOUL_RIP_PROJECTILE_HOMING_TURN_RATE: 10.5,
  /** Spawn offset from player origin (player origin is feet; negative Y moves up toward torso). */
  SOUL_RIP_PROJECTILE_SPAWN_X_OFFSET: 0,
  SOUL_RIP_PROJECTILE_SPAWN_Y_OFFSET: -56,
  /** Sheet sampling for Soul-rip sprite: one fixed frame only (no animation). */
  // Soul-rip.png is a single sprite with large empty padding (not a 4-wide strip).
  SOUL_RIP_PROJECTILE_FRAME_COLS: 1,
  SOUL_RIP_PROJECTILE_FRAME_ROWS: 1,
  SOUL_RIP_PROJECTILE_FRAME_INDEX: 0,
  /** Temporary: overlay Revenant grid source rect + label (4×5 sheet). Set false when done. */
  DEBUG_REVENANT_SPRITE_SLICE: false,
  /** World units moved per walk frame (4 frames = one full cycle). Ties stride to speed, not wall-clock time. */
  PLAYER_WALK_DIST_PER_FRAME: 22,
  /**
   * Multiplier on dist-per-frame while walkKind is "side" only (< 1 = faster frame changes).
   * Profile walks often read static when leg motion is subtle at drawScale; tune before changing art.
   */
  /** Side walk only: <1 = faster frame changes vs up/down. 1 = same stride cadence (recommended). */
  PLAYER_WALK_SIDE_DIST_SCALE: 1,
  /**
   * Which sheet column (0–3) to show for each stride step on Walk (Side), row 2.
   * Default is identity. If feet look “stuck” but columns differ in Aseprite, try e.g. [0,2,1,3].
   */
  PLAYER_WALK_SIDE_COLUMN_ORDER: [0, 1, 2, 3],
  /**
   * Extra pixels trimmed from the bottom of each player row slice (enemies still use assets.js default).
   * Profile “Walk (Side)” feet often sit in this strip — use 0 so foot motion isn’t clipped.
   */
  PLAYER_SHEET_PAD_BOTTOM: 0,
  /** Override label strip height (px) if your Player.png labels are taller/shorter than default. */
  PLAYER_SHEET_LABEL_SKIP_Y: 58,
  /** animTick multiplier for enemy walk columns; lower = slower / less jittery. */
  ENEMY_WALK_ANIM_RATE: 4,
  /**
   * If > 0, side walk ignores distance and steps this many frames per second (feels like a gallop).
   * 0 = same distance-based 0→1→2→3 cycle as walk up/down (uses all 4 columns on row 2).
   */
  PLAYER_WALK_SIDE_TIME_FPS: 0,
  /** Vertical bob multiplier while walkKind is side (0 = off — bob fights tiny foot motion). */
  PLAYER_WALK_SIDE_BOB_MULT: 0,
  /** Extra scale for side-walk row only (1 = same size as up/down; >1 was for debugging foot read). */
  PLAYER_DRAW_SCALE_SIDE_MULT: 1,
  /** Horizontal vs vertical must beat the other by this ratio to switch walk row (avoids diagonal row flicker). */
  WALK_KIND_AXIS_HYSTERESIS: 1.2,

  // -------------------------
  // Verdant Ranger (playable archer)
  // -------------------------
  ARCHER_MAX_HP: 95,
  /** Slightly faster / agile. */
  ARCHER_MOVE_SPEED_MULT: 1.15,
  /** Bow cadence (slower than mage). */
  ARCHER_BOW_COOLDOWN: 1.0,
  /** Archer arrow damage = BASE_DAMAGE * this (before damageMult). */
  ARCHER_DAMAGE_MULT: 2.0,
  /** Faster arrows (before stats). */
  ARCHER_PROJECTILE_SPEED_MULT: 1.6,
  /** Narrower hitbox than mage bolts. */
  ARCHER_PROJECTILE_RADIUS_MULT: 0.6,
  /** Visual-only: arrow sprite pixels per world radius unit (bigger = easier to read). */
  ARCHER_PROJECTILE_DRAW_RADIUS_SCALE: 14,
  /** How many enemies an arrow can pierce (hits) before disappearing. */
  ARCHER_PIERCE_COUNT: 2,
  /** Prefer enemies within this half-angle (radians) around facing. */
  ARCHER_FACING_CONE_HALF_ANGLE: 0.75,
  /** Spread between multi-arrows (radians). Tighter = more precise. */
  ARCHER_MULTI_ARROW_SPREAD: 0.09,
  /** Poison arrows (DOT) */
  ARCHER_POISON_DURATION: 2.2,
  ARCHER_POISON_DPS: 9,

  // -------------------------
  // Archer weapon: Toxic Grenade (class-specific secondary)
  // -------------------------
  /** Seconds between grenade throws. */
  ARCHER_TOXIC_GRENADE_INTERVAL: 4.0,
  /** Seconds the grenade spends traveling (arc interpolation). */
  ARCHER_TOXIC_GRENADE_FLIGHT_DURATION: 0.4,
  /** World units: peak arc height (visual only). */
  ARCHER_TOXIC_GRENADE_ARC_HEIGHT: 110,
  /** Explosion/poison radius in world units (matches frame 3 size). */
  ARCHER_TOXIC_GRENADE_RADIUS: 92,
  /** Explosion burst damage = effectiveDamage * this. */
  ARCHER_TOXIC_GRENADE_DAMAGE_MULT: 1.0,
  /** Poison cloud duration (sec). */
  ARCHER_TOXIC_CLOUD_DURATION: 3.0,
  /** Seconds between poison ticks. */
  ARCHER_TOXIC_CLOUD_TICK_INTERVAL: 0.5,
  /** Tick damage = effectiveDamage * this (per tick). */
  ARCHER_TOXIC_CLOUD_TICK_DAMAGE_MULT: 0.22,
  /** Enemy targeting bias toward facing (higher = more likely to throw forward). */
  ARCHER_TOXIC_GRENADE_FACING_BIAS: 60,
  /** Max distance a grenade can be thrown (world units). */
  ARCHER_TOXIC_GRENADE_MAX_RANGE: 420,
  /** Spin speed (rad/sec) while flying. */
  ARCHER_TOXIC_GRENADE_SPIN_SPEED: 14,

  // -------------------------
  // Beast (enemy) — burst dash threat
  // -------------------------
  BEAST_MIN_GAME_MINUTES: 0.9,
  BEAST_SPAWN_CHANCE: 0.065,
  /** Seconds: brief pause (telegraph) before dashing. */
  BEAST_PAUSE_DURATION: 0.38,
  /** Seconds: dash travel time. */
  BEAST_DASH_DURATION: 0.22,
  /** Seconds: recovery after dash. */
  BEAST_RECOVER_DURATION: 0.5,
  /** World units per second during dash. */
  BEAST_DASH_SPEED: 560,

  ATTACK_RANGE: 520,
  /** If a boss is within this radius, auto-targeting prioritizes it. */
  BOSS_TARGET_RADIUS: 500,
  BASE_ATTACK_COOLDOWN: 0.55,
  BASE_DAMAGE: 12,
  BASE_PROJECTILE_SPEED: 480,
  BASE_PROJECTILE_RADIUS: 6,
  BASE_PROJECTILE_COUNT: 1,
  /** Radians between stacked extra projectiles (first extra is always ±this from aim) */
  EXTRA_PROJECTILE_SPREAD: 0.13,

  // -------------------------
  // Runtime safety — stable sim limits (no auth; future client/server hardening helpers)
  // -------------------------
  /** Non-boss spawns skipped at or above this count (performance + tame runaway spawners). */
  SAFETY_MAX_ENEMIES_ALIVE: 220,
  /** Hard stop: no more enemies incl. bosses/necro splits (crash guard). */
  SAFETY_MAX_ENEMIES_HARD: 320,

  SAFETY_MAX_MAGE_PROJECTILES: 160,
  SAFETY_MAX_DAGGERS_ALIVE: 120,
  SAFETY_MAX_THROWING_AXES_ALIVE: 80,
  SAFETY_MAX_BOOMERANGS_ALIVE: 90,
  SAFETY_MAX_SOUL_RIP_PROJ_ALIVE: 48,
  SAFETY_MAX_LIGHTNING_STRIKES_VFX: 60,

  SAFETY_DAMAGE_MULT_MIN: 0.05,
  SAFETY_DAMAGE_MULT_MAX: 28,
  SAFETY_COOLDOWN_MULT_MIN: 0.12,
  SAFETY_COOLDOWN_MULT_MAX: 4.5,
  SAFETY_MOVE_SPEED_MULT_MIN: 0.2,
  SAFETY_MOVE_SPEED_MULT_MAX: 3.5,
  SAFETY_PROJECTILE_SIZE_MULT_MIN: 0.25,
  SAFETY_PROJECTILE_SIZE_MULT_MAX: 4,
  SAFETY_PROJECTILE_COUNT_MAX: 14,
  SAFETY_MIN_WEAPON_VOLLEY_CD_SEC: 0.042,
  SAFETY_ATTACK_CD_CEILING_SEC: 30,

  SAFETY_HAMMER_COUNT_MAX: 18,
  SAFETY_HAMMER_SIZE_MULT_MAX: 5,
  SAFETY_ORBIT_SPEED_MULT_MAX: 8,
  SAFETY_ORBIT_RADIUS_MULT_MAX: 7,
  SAFETY_WHIP_GEOM_MULT_MAX: 6,
  SAFETY_SLASH_GEOM_MULT_MAX: 5,
  SAFETY_SLAM_GEOM_MULT_MAX: 5,
  SAFETY_KNOCKBACK_MULT_MAX: 14,
  SAFETY_WEAPON_SPEED_MULT_MAX: 10,
  SAFETY_PIERCE_BONUS_MAX: 48,
  SAFETY_UNIVERSAL_COUNT_BONUS_MAX: 12,
  SAFETY_DAGGER_COUNT_BONUS_MAX: 14,
  SAFETY_LIGHTNING_RADIUS_MULT_MAX: 7,
  SAFETY_LIGHTNING_STRIKES_BONUS_MAX: 34,
  SAFETY_RUNE_COUNT_BONUS_MAX: 18,
  SAFETY_LIFESTEAL_MAX_FRAC: 0.38,

  /**
   * Orbiting hammer: one PNG, rotated in code.
   * If the file is a sprite sheet, set HAMMER_SHEET_CELL so only one cell is drawn (else the whole bitmap
   * is scaled down and looks like a smear). Use null when the PNG is already a single hammer/axe frame.
   */
  HAMMER_ASSET_SRC: "assets/Axe.png",
  /**
   * null = entire PNG is one hammer/axe (recommended for a single exported frame).
   * Set { cols, rows, col, row } if the file is a sprite sheet.
   */
  HAMMER_SHEET_CELL: null,
  /** World px; tighter orbit keeps close enemies in axe range (outer weapons can use larger radius later). */
  HAMMER_ORBIT_RADIUS: 80,
  /** Extra orbit radius applied only when characterId === "mage" (Mage sprite is bigger). */
  HAMMER_ORBIT_RADIUS_MAGE_BONUS: 34,
  /** Radians per second around the player. */
  HAMMER_ORBIT_SPEED: 2.5,
  /** Radians per second for the hammer graphic spin. */
  HAMMER_SPIN_SPEED: 6,
  /** World-space hit radius from hammer center (before stats.hammerSize); scales with large axe sprite. */
  HAMMER_HIT_RADIUS: 28,
  /** Base damage per hit (scaled by stats.damageMult). Slightly below BASE_DAMAGE. */
  HAMMER_BASE_DAMAGE: 10,
  /** Seconds before the same enemy can be hit by hammer again. */
  HAMMER_HIT_COOLDOWN: 0.14,
  /** Max dimension in screen px when drawing the axe (before stats.hammerSize); ~70–80% of player sprite height. */
  HAMMER_DRAW_SIZE: 76,

  /**
   * Whip: directional line strike (single PNG rotated in code).
   * Hits all enemies in an oriented rectangle instantly; sprite is shown briefly for readability.
   */
  WHIP_ASSET_SRC: "assets/Whip.png?v=2026-04-16-11",
  WHIP_COOLDOWN: 1.2,
  WHIP_DAMAGE: 18,
  /** World units. */
  WHIP_LENGTH: 260,
  WHIP_WIDTH: 40,
  /** Offset from player center along facing before the hitbox begins (world units). */
  WHIP_OFFSET: 26,
  /** Seconds the sprite remains visible after firing. */
  WHIP_VISUAL_DURATION: 0.18,
  /** Max dimension in screen px for drawing the whip sprite. */
  WHIP_DRAW_SIZE: 200,
  /** 0..1 anchor within the sprite image (0 = left/top). */
  WHIP_ANCHOR_X: 0.16,
  WHIP_ANCHOR_Y: 0.52,
  /**
   * Whip visuals:
   * - Held whip is always visible near the player hip.
   * - Attack is a quick sweep (VS-style) that applies damage during the sweep.
   */
  WHIP_HELD_DRAW_SIZE: 46,
  /** World-unit offsets from player center for the held sprite (hip-ish). */
  WHIP_HELD_OFFSET_X: 40,
  WHIP_HELD_OFFSET_Y: 16,
  /** Small float/bob for the held sprite (world units). */
  WHIP_HELD_FLOAT_AMP: 1.6,
  WHIP_HELD_FLOAT_SPEED: 4.2,
  /** Seconds to keep the held whip hidden after a sweep ends (prevents 1-frame flicker). */
  WHIP_HELD_HIDE_AFTER_SWING: 0.22,
  /** Sweep animation (radians) and duration (sec). */
  WHIP_SWEEP_ARC_RAD: 1.25,
  WHIP_SWEEP_DURATION: 0.16,
  /** How the lash reaches full range: "cubicOut" = extends outward (not a sword rotation). */
  WHIP_GROW_EASE: "cubicOut",
  /** Light purple tint for damage numbers / legacy sweep tint. */
  WHIP_SWEEP_TINT: "#e8d4ff",
  /** Attack VFX: single `Slash.png`, full length, linear fade 1→0 over this duration (seconds). */
  WHIP_SLASH_VFX_DURATION: 0.24,
  /** Extra scale along the slash length (local X after rotation) for impact. */
  WHIP_SLASH_LENGTH_SCALE: 1.08,
  /**
   * Slash attack sprite (transparent). Pivot: left = origin at player; image extends along +X (facing).
   */
  WHIP_SLASH_ASSET_SRC: "assets/Slash.png?v=1",
  /**
   * Slash.png: wide on the left, narrow tip on the right. Do NOT flip X — flipping after rotate(facing) mirrors
   * along forward and draws the slash behind the player. Anchor near the left (small ax) so the body sits on
   * the player and the tip extends along +facing; raise ax slightly (e.g. 0.06–0.14) to trim transparent padding.
   */
  WHIP_SLASH_FLIP_X: false,
  WHIP_SLASH_ANCHOR_X: 0.08,
  WHIP_SLASH_ANCHOR_Y: 0.5,
  /** Optional radians added to atan2(facing) for art that isn’t perfectly horizontal in the file. */
  WHIP_SLASH_ANGLE_OFFSET_RAD: 0,
  /**
   * When true, mirror the slash on Y when cos(facingAngle) is negative (left half of the compass). Rotating 180° for
   * “face left” flips the arc upside down; this keeps the same cup direction as when facing right.
   */
  WHIP_SLASH_FLIP_Y_WHEN_FACING_LEFT: true,
  /** If true, slash PNG is drawn with nearest-neighbor (matches pixel art). Set false for soft gradient slash art. */
  WHIP_SLASH_PIXEL_CRISP: true,
  /**
   * Procedural fallback: thin elliptical arc (like VS), not a filled “sword” wedge.
   * Origin should sit on the player rim — see WHIP_VFX_HAND_FORWARD.
   */
  WHIP_ARC_RX_MULT: 0.5,
  WHIP_ARC_RY_MULT: 0.038,
  /** Arc parameter range on ellipse (π … 2π passes over the top). */
  WHIP_ARC_T0: 1.22,
  WHIP_ARC_T1: 1.78,
  WHIP_ARC_GLOW_LINE: 10,
  WHIP_ARC_CORE_LINE: 2.5,
  /** World units: origin = playerCenter + facing * (PLAYER_RADIUS + this). */
  WHIP_VFX_HAND_FORWARD: 6,
  /**
   * Whip asset currently has a solid black background; key it out to transparent at load time so
   * tinted sweep afterimages don't appear as purple rectangles.
   */
  WHIP_KEY_BLACK_BACKGROUND: true,
  /** 0–255 threshold; per-channel max for "dark neutral" background pixels we clear. */
  WHIP_KEY_BLACK_MAX_RGB: 48,
  /** Max spread between R,G,B to count as neutral-ish (prevents eating colored whip pixels). */
  WHIP_KEY_BLACK_MAX_CHANNEL_DELTA: 26,
  /** Alpha threshold for auto-cropping transparent padding from the whip bitmap after key-out. */
  WHIP_CROP_ALPHA_THRESHOLD: 12,
  /** Extra padding (px) around the computed whip bounds when cropping. */
  WHIP_CROP_PAD_PX: 2,
  /**
   * Crush low-alpha pixels to fully transparent after crop. This prevents tinted sweep layers from
   * painting huge "plates" due to soft anti-aliased background halos in exported PNGs.
   */
  WHIP_ALPHA_HARD_THRESHOLD: 28,

  ENEMY_SPAWN_BASE: 1.35,
  /** Higher = reaches minimum spawn interval sooner. */
  ENEMY_SPAWN_RAMP_PER_MIN: 0.88,
  ENEMY_SPAWN_MIN: 0.3,
  /**
   * Local co-op (VS-style): each extra player increases spawn pressure.
   * Effective spawn rate multiplier = 1 + (partySize - 1) * value (solo = 1).
   */
  COOP_SPAWN_INTENSITY_PER_EXTRA_PLAYER: 0.22,
  /** Each extra player multiplies enemy max HP after time scaling (solo = baseline). */
  COOP_ENEMY_HP_MULT_PER_EXTRA_PLAYER: 0.18,
  /** Seconds; HP multiplier is 1 + min(time / this, ENEMY_HP_SCALE_MAX_BONUS). */
  ENEMY_HP_SCALE_TIME_CAP: 120,
  ENEMY_HP_SCALE_MAX_BONUS: 0.5,
  SPAWN_MARGIN: 80,
  /**
   * Exploder: first eligible after this many minutes of run time (see `game.time`).
   * Each spawn is an independent roll; chance is lower than any single basic type.
   */
  EXPLODER_MIN_GAME_MINUTES: 0.75,
  /** Per-spawn probability once past min time (before EXPLODER_LATE_GAME_MINUTES). */
  EXPLODER_SPAWN_CHANCE_EARLY: 0.12,
  /** After this many minutes, use EXPLODER_SPAWN_CHANCE_LATE instead. */
  EXPLODER_LATE_GAME_MINUTES: 3,
  EXPLODER_SPAWN_CHANCE_LATE: 0.17,
  /**
   * When not true, exploder always uses the front walk row (no side-profile stride / long feet).
   * Set true to allow row 1 + flip using EXPLODER_WALK_SIDE_AXIS_HYSTERESIS.
   */
  EXPLODER_USE_SIDE_WALK_ROW: false,
  /** Exploder uses side walk only when |dx| > |dy| * this (only if EXPLODER_USE_SIDE_WALK_ROW is true). */
  EXPLODER_WALK_SIDE_AXIS_HYSTERESIS: 1.35,
  /** Pixels cropped from the bottom of each exploder cell — non-zero clips feet off the walk frames. */
  EXPLODER_SHEET_PAD_BOTTOM: 0,

  /** Slime splitter: first eligible after this many minutes of `game.time`. */
  SLIME_MIN_GAME_MINUTES: 0.35,
  /** Per-spawn chance once past SLIME_MIN_GAME_MINUTES (independent roll). */
  SLIME_SPAWN_CHANCE: 0.09,
  SLIME_SPAWN_CHANCE_LATE: 0.12,
  SLIME_LATE_GAME_MINUTES: 2.5,

  /**
   * Bat: fast, low HP, erratic lateral “pressure” movement (independent roll after slime).
   */
  BAT_MIN_GAME_MINUTES: 0.2,
  BAT_SPAWN_CHANCE: 0.088,
  /** World units: lateral weave amplitude (perpendicular to line to player). */
  BAT_ZIG_LATERAL: 34,
  BAT_ZIG_FREQ: 8.2,
  BAT_FLUTTER_FREQ: 12.5,
  /** If true, Bat.png exported on white — keyed to transparent at load (like Slime). */
  BAT_KEY_WHITE_BACKGROUND: true,

  /**
   * Golem: slow tanky lane wall; independent spawn roll after bat (before exploder table).
   */
  GOLEM_MIN_GAME_MINUTES: 1.0,
  GOLEM_SPAWN_CHANCE: 0.048,
  /** If true, Golem.png white backdrop is keyed out (uses SLIME_KEY_* thresholds). */
  GOLEM_KEY_WHITE_BACKGROUND: true,

  /**
   * Necromancer: support summoner — hangs at range, periodic skeleton spawn (no player projectiles).
   */
  NECRO_MIN_GAME_MINUTES: 0.85,
  NECRO_SPAWN_CHANCE: 0.052,
  /** Preferred distance band from player (world units): inside → kite out, outside → approach. */
  NECRO_PREFERRED_DIST_MIN: 198,
  NECRO_PREFERRED_DIST_MAX: 392,
  /** While in the band, multiply speed for slow strafe. */
  NECRO_STRAFE_SPEED_MULT: 0.36,
  /** Won’t start a summon while this close (must peel first). */
  NECRO_SUMMON_MIN_DIST: 128,
  /** Seconds between skeleton spawns (after cast completes). */
  NECRO_SUMMON_COOLDOWN: 4.25,
  /** Cast animation length (matches summon strip playback). */
  NECRO_SUMMON_CAST_DURATION: 0.92,
  /**
   * Pixels of X separation required before necromancer flips to face the other direction.
   * Prevents rapid left/right mirroring when it strafes around the player (zoetrope jitter).
   */
  NECRO_FLIP_HYSTERESIS_PX: 28,
  NECRO_KEY_WHITE_BACKGROUND: true,
  /**
   * Optional slime row Y boundaries in sheet pixels: length must be 6 for 5 rows, e.g.
   * [0, y1, y2, y3, y4, imageHeight]. When null, rows are inferred from the PNG (see assets.js).
   */
  SLIME_ROW_BAND_STARTS: null,
  /**
   * When both are finite numbers, overrides the slime walk strip in sheet pixels (top Y and height).
   * Use if the sprite drifts vertically in the PNG; otherwise SPRITES.slime.sheetSlice walkSy/walkSh apply.
   */
  SLIME_WALK_SY: null,
  SLIME_WALK_SH: null,
  /**
   * If true, after load the slime sheet is copied to a canvas and flat near-white pixels (typical Canva
   * canvas fill) are cleared to transparent so auto row slicing and drawImage behave like a proper
   * transparent PNG. Turn off if your slime uses neutral gray-white for the body.
   */
  SLIME_KEY_WHITE_BACKGROUND: true,
  /** RGB floor for “background white” when SLIME_KEY_WHITE_BACKGROUND is true (0–255). */
  SLIME_KEY_WHITE_MIN_RGB: 248,
  /** Max spread between R,G,B to count as neutral white (slime highlights often tint one channel). */
  SLIME_KEY_WHITE_MAX_CHANNEL_DELTA: 14,

  // -------------------------
  // Boss 1: Fire Demon
  // -------------------------
  /** Spawn when time >= this OR player level >= BOSS1_TRIGGER_LEVEL (whichever happens first). */
  BOSS1_TRIGGER_TIME_SEC: 120,
  BOSS1_TRIGGER_LEVEL: 5,
  /** Charge-up duration before firing the ring pulse (sec). */
  BOSS1_CHARGE_TIME: 0.8,
  /** Seconds between pulses (random in [min,max]) once boss is active. */
  BOSS1_PULSE_INTERVAL_MIN: 5.0,
  BOSS1_PULSE_INTERVAL_MAX: 7.0,
  /** Ring shape + damage. */
  BOSS1_PULSE_SEGMENTS: 9,
  BOSS1_PULSE_SAFE_GAPS: 3,
  BOSS1_PULSE_THICKNESS: 12,
  BOSS1_PULSE_SPEED: 260,
  BOSS1_PULSE_RADIUS_START: 46,
  BOSS1_PULSE_RADIUS_MAX: 420,
  BOSS1_PULSE_DAMAGE: 22,
  /** Title during intro vignette (Fire Demon). */
  BOSS1_INTRO_TITLE: "A Fire Demon Emerges",

  // -------------------------
  // Boss 2: Arcane Sentinel (projectile patterns)
  // -------------------------
  BOSS2_TRIGGER_TIME_SEC: 300,
  /** World offsets from enemy feet/origin → chest core spawn point. */
  BOSS2_CORE_OFFSET_X: 0,
  BOSS2_CORE_OFFSET_Y: -52,
  BOSS2_INTRO_TITLE: "Arcane Sentinel Awakens",
  /** Telegraph before volley fires (matches charge strip feel). */
  BOSS2_CHARGE_TIME: 0.7,
  /** Seconds after spawn before Sentinel begins first charge (+ intro vignette overlap). */
  BOSS2_FIRST_CHARGE_DELAY_SEC: 2.2,
  /** Idle gap after each pattern resolves before next charge begins. */
  BOSS2_PATTERN_GAP_SEC: 2.0,
  BOSS2_MOVE_SPEED_MULT: 0.5,
  BOSS2_ORBIT_DIST_MIN: 210,
  BOSS2_ORBIT_DIST_MAX: 400,
  /** Tangential strafe speed while in orbit band (fraction of chase speed). */
  BOSS2_ORBIT_STRAFE_MULT: 0.38,
  /** Hard cap on concurrent arcane bolts (performance). */
  BOSS2_MAX_ACTIVE_PROJECTILES: 70,
  BOSS2_PROJ_RADIUS: 9,
  BOSS2_PROJ_DAMAGE: 15,
  BOSS2_PROJ_LIFE_SEC: 3.25,
  BOSS2_PROJ_MAX_DIST: 720,
  BOSS2_PROJ_HIT_PLAYER_CD: 0.42,
  /** Pattern 1 — radial burst */
  BOSS2_BURST_COUNT: 10,
  BOSS2_BURST_SPEED: 248,
  /** Pattern 2 — spiral stream */
  BOSS2_SPIRAL_DURATION_SEC: 2.5,
  BOSS2_SPIRAL_TURN_SPEED: 1.35,
  BOSS2_SPIRAL_FIRE_INTERVAL: 0.11,
  BOSS2_SPIRAL_SHOT_SPEED: 255,
  /** Pattern 3 — cone burst */
  BOSS2_CONE_COUNT_MIN: 5,
  BOSS2_CONE_COUNT_MAX: 7,
  /** Cone half-angle (full spread ≈ 2×); ~0.42–0.52 rad ≈ 48–60°. */
  BOSS2_CONE_HALF_ANGLE_MIN_RAD: 0.395,
  BOSS2_CONE_HALF_ANGLE_MAX_RAD: 0.524,
  BOSS2_CONE_SPEED: 340,
  /** Pattern 4 — delayed ring */
  BOSS2_RING_COUNT: 10,
  BOSS2_RING_SPAWN_RADIUS: 58,
  BOSS2_RING_HOLD_SEC: 0.5,
  BOSS2_RING_OUT_SPEED: 270,
  /** If Boss2 sheet uses a flat near-white matte; same key path as slime. */
  BOSS2_KEY_WHITE_BACKGROUND: false,
  /**
   * World-space padding merged into camera bounds while Sentinel lives (solo + MP).
   * Large sprite + orbit need extra framing so attacks don’t sit on the screen rim.
   */
  BOSS2_CAMERA_FRAMING_PAD: 168,
  /** Vertical framing uses pad × mult (floating boss stays fully in view). */
  BOSS2_CAMERA_FRAMING_PAD_Y_MULT: 0.95,

  XP_ORB_RADIUS: 7,
  XP_ORB_MAGNET: 140,
  XP_ORB_PULL: 320,
  /** XP progression: xpToNext = base * level^exp */
  XP_LEVEL_BASE: 22,
  XP_LEVEL_EXPONENT: 1.3,
  /** Magnet pickup expands XP magnet radius but does not pull the whole map. */
  XP_MAGNET_PICKUP_DURATION: 2.0,
  XP_ORB_MAGNET_WHEN_PICKUP: 320,
  XP_ORB_MAGNET_MAX: 420,
  /** Visual only — pickup/magnet use logical x,y */
  XP_ORB_FLOAT_AMP: 3.2,
  XP_ORB_FLOAT_SPEED: 2.65,

  /** XP orb tiers (small=purple Orb.png, medium=Orb-blue.png, large=Orb-red.png) */
  XP_ORB_SMALL_VALUE: 1,
  XP_ORB_MED_VALUE: 3,
  XP_ORB_LARGE_VALUE: 8,
  XP_ORB_DROP_P_SMALL: 0.85,
  XP_ORB_DROP_P_MED: 0.12,
  XP_ORB_DROP_P_LARGE: 0.03,

  /** Pickup drops (on enemy death) */
  PICKUP_DROP_HEART_P: 0.04,
  PICKUP_DROP_MAGNET_P: 0.02,
  PICKUP_DROP_BOMB_P: 0.02,
  /** Heart heal as a fraction of max HP. */
  PICKUP_HEART_HEAL_FRAC: 0.22,
  /**
   * Pickups attraction + grab radius.
   * - Pickups drift toward the player when within magnet radius (but not whole-map).
   * - Actual pickup requires being closer than XP orbs.
   */
  PICKUP_MAGNET_RADIUS: 110,
  PICKUP_MAGNET_PULL: 520,
  /** Extra radius beyond PLAYER_RADIUS required to pick up (XP uses XP_ORB_RADIUS). */
  PICKUP_GRAB_EXTRA_RADIUS: 4,
  /** Bomb: radius and damage; bomb kills do NOT grant XP. */
  PICKUP_BOMB_RADIUS: 420,
  PICKUP_BOMB_DAMAGE_MULT: 2.5,

  // -------------------------
  // Universal weapon: Dagger
  // -------------------------
  DAGGER_DAMAGE: 8,
  DAGGER_COOLDOWN: 0.55,
  DAGGER_PROJECTILE_SPEED: 650,
  // No lifetime despawn: daggers only disappear on hit or when leaving the map.
  DAGGER_LIFETIME: 999,
  // Bigger so the knife hit circle matches the sprite read.
  DAGGER_HIT_RADIUS: 7,
  /** Spawn offset from player origin (player origin is feet; negative Y moves up toward torso). */
  DAGGER_SPAWN_X_OFFSET: 0,
  DAGGER_SPAWN_Y_OFFSET: -56,
  /** Radians for multi-dagger fan. */
  DAGGER_SPREAD_2: (8 * Math.PI) / 180,
  DAGGER_SPREAD_3: (12 * Math.PI) / 180,

  // -------------------------
  // Universal weapon: Throwing Axe
  // -------------------------
  // VS-style lob: axes launch upward, arc, and fall back down.
  THROWING_AXE_DAMAGE: 26,
  THROWING_AXE_COOLDOWN: 1.1,
  /** Base upward launch speed (world units/sec; negative = up). */
  THROWING_AXE_LAUNCH_VY_MIN: -650,
  THROWING_AXE_LAUNCH_VY_MAX: -520,
  /** Horizontal spread velocity for multi-axe (world units/sec). */
  THROWING_AXE_SPREAD_VX_2: 120,
  THROWING_AXE_SPREAD_VX_3: 160,
  /** Mild jitter to avoid perfect stacking (world units/sec). */
  THROWING_AXE_JITTER_VX: 24,
  THROWING_AXE_LIFETIME: 1.85,
  THROWING_AXE_HIT_RADIUS: 12,
  THROWING_AXE_DRAW_SIZE: 72,
  /** Radians/sec: moderate spin (heavy feel). */
  THROWING_AXE_SPIN_SPEED: 7.2,
  /** Downward acceleration (world units/sec^2) for the lob arc. */
  THROWING_AXE_GRAVITY: 1050,
  /** Seconds before the same enemy can be hit again by the same axe. */
  THROWING_AXE_HIT_COOLDOWN: 0.25,
  /** Default pierce count (enemies hit per axe over its lifetime). */
  THROWING_AXE_PIERCE: 6,
  /** Despawn once it falls far enough from its origin (world units). */
  THROWING_AXE_MAX_DISTANCE: 520,

  // -------------------------
  // Universal weapon: Boomerang
  // -------------------------
  BOOMERANG_DAMAGE: 14,
  BOOMERANG_COOLDOWN: 1.0,
  BOOMERANG_PROJECTILE_SPEED: 620,
  /** Return speed multiplier (must be > 1). */
  BOOMERANG_RETURN_SPEED_MULT: 1.4,
  /** Soft auto-aim search radius (world units). */
  BOOMERANG_AUTOAIM_RADIUS: 560,
  /** Seconds spent flying straight outward before returning. */
  BOOMERANG_OUT_DURATION: 0.6,
  /** Max life as a safety (in case it doesn't reach player). */
  BOOMERANG_MAX_LIFETIME: 1.8,
  BOOMERANG_HIT_RADIUS: 10,
  BOOMERANG_DRAW_SIZE: 66,
  /** Moderate-fast spin. */
  BOOMERANG_SPIN_SPEED: 10.5,
  /** Per-enemy hit cooldown (allows re-hit on return after delay). */
  BOOMERANG_HIT_COOLDOWN: 0.15,
  /** Default pierce count (enemies hit per pass). */
  BOOMERANG_PIERCE: 4,
  /** Spread angles for multi-boomerang throws. */
  BOOMERANG_SPREAD_2: (10 * Math.PI) / 180,
  BOOMERANG_SPREAD_3: (15 * Math.PI) / 180,

  // -------------------------
  // Universal weapon: Lightning Strike
  // -------------------------
  LIGHTNING_DAMAGE: 24,
  LIGHTNING_COOLDOWN: 1.35,
  /** World units. */
  LIGHTNING_RADIUS: 55,
  /** Base strikes per cast. */
  LIGHTNING_BASE_STRIKES: 1,
  /** VFX durations (seconds). */
  LIGHTNING_BOLT_DURATION: 0.12,
  LIGHTNING_IMPACT_DURATION: 0.18,
  /** If true, prefer targets currently on screen. */
  LIGHTNING_PREFER_ONSCREEN: true,

  // -------------------------
  // Revenant class special: Soul Push (periodic knockback nova)
  // -------------------------
  SOUL_PUSH_COOLDOWN: 6.2,
  SOUL_PUSH_RADIUS: 240,
  /** Instant push distance applied per cast (world units), away from the player. */
  SOUL_PUSH_STRENGTH: 88,

  // -------------------------
  // Mage-exclusive weapon: Arcane Runes
  // -------------------------
  ARCANE_RUNES_BASE_COUNT: 2,
  /** World px; must remain larger than hammer orbit radius. */
  ARCANE_RUNES_ORBIT_RADIUS: 108,
  /** Radians per second around the player. */
  ARCANE_RUNES_ORBIT_SPEED: 3.1,
  /** Damage per tick (scaled by stats.damageMult + rune damage mult). */
  ARCANE_RUNES_BASE_DAMAGE: 16,
  /** Seconds before the same enemy can be hit again by a rune. */
  ARCANE_RUNES_HIT_COOLDOWN: 0.2,
  /** Rune overlap radius in world px. */
  // World-space hit radius of each rune (increase prevents "looks like it hit but didn't" after visual size buffs).
  ARCANE_RUNES_HIT_RADIUS: 32,
  /** Sprite size in screen px (max dimension). */
  ARCANE_RUNES_DRAW_SIZE: 192,

  /** Difficulty scaling every N seconds. */
  DIFFICULTY_STEP_SECONDS: 30,
  DIFFICULTY_HP_MULT_PER_STEP: 1.15,
  DIFFICULTY_SPAWN_RATE_MULT_PER_STEP: 1.10,

  HIT_FLASH_DURATION: 0.08,
  DAMAGE_NUMBER_DURATION: 0.55,
  /** Shake magnitude decays per second (higher = calmer faster). */
  SCREEN_SHAKE_DECAY: 14,
  /** Added to shake on each enemy death (capped by SCREEN_SHAKE_MAX). */
  SCREEN_SHAKE_PER_KILL: 1,
  SCREEN_SHAKE_MAX: 3,
  /** Extra shake when level-up panel opens (capped by SCREEN_SHAKE_LEVEL_MAX). */
  SCREEN_SHAKE_ON_LEVEL: 1.5,
  SCREEN_SHAKE_LEVEL_MAX: 3.5,
  /** Scales how far the view moves; combined with smooth motion below. */
  SCREEN_SHAKE_AMP: 0.5,

  CAMERA_SMOOTH: 12,
  /** Dynamic zoom: minimum zoom-out (lower = closer). */
  CAMERA_ZOOM_MIN: 1.35,
  /** Dynamic zoom: maximum zoom-out allowed before leash. */
  CAMERA_ZOOM_MAX: 2.35,
  /** Screen padding (px) to keep players away from edges. */
  CAMERA_ZOOM_PADDING_PX: 120,
  /** Zoom smoothing (higher = snappier). */
  CAMERA_ZOOM_SMOOTH: 6.5,
  /**
   * Soft leash strength (per-second). Only applies when spread exceeds CAMERA_ZOOM_MAX coverage.
   * Loose feel = low strength.
   */
  CAMERA_SOFT_LEASH_STRENGTH: 1.25,
  /** Multiplies vertical leash bounds ( > 1 = allow more vertical spread). */
  CAMERA_SOFT_LEASH_VERTICAL_MULT: 1.45,
  /** Max pull speed (world units/sec) so leash never feels like teleporting. */
  CAMERA_SOFT_LEASH_MAX_SPEED: 220,
  /**
   * How many world units wide/tall the camera shows vs logical canvas size (both axes).
   * > 1 zooms out (more map on screen). 1 = legacy 1:1 world pixel to screen pixel.
   */
  VIEW_WORLD_SCALE: 1.65,
};

export const ENEMY_TYPES = {
  skeleton: {
    id: "skeleton",
    radius: 12,
    maxHp: 38,
    speed: 95,
    touchDps: 16,
    color: "#c8d4c4",
    outline: "#6a7a72",
    xpMult: 1,
  },
  goblin: {
    id: "goblin",
    radius: 10,
    maxHp: 24,
    speed: 150,
    touchDps: 12,
    color: "#6eb87a",
    outline: "#2d5c38",
    xpMult: 0.85,
  },
  /** Fast, fragile; movement zig-zags in code — pressure, not a bruiser. */
  bat: {
    id: "bat",
    radius: 8,
    maxHp: 16,
    speed: 198,
    touchDps: 10,
    color: "#6a4a8c",
    outline: "#2a1838",
    xpMult: 0.75,
  },
  /** Slow, wide HP sponge — blocks lanes; not cleared by dev contact-overlap kill. */
  golem: {
    id: "golem",
    /** Footprint for wide lane blocking; scaled with large on-screen sprite. */
    radius: 34,
    maxHp: 340,
    speed: 40,
    touchDps: 20,
    color: "#5a4f72",
    outline: "#1e1828",
    xpMult: 1.55,
    blocksContactClear: true,
    /** Reserved for future knockback; 1 = full resist (currently unused). */
    knockbackResist: 0.72,
  },
  /** Summons skeletons from range; fragile alone — target priority anchor. */
  necromancer: {
    id: "necromancer",
    radius: 16,
    maxHp: 52,
    speed: 76,
    touchDps: 9,
    color: "#4a6a52",
    outline: "#1a2820",
    xpMult: 1.25,
    summoner: true,
  },
  brute: {
    id: "brute",
    radius: 40,
    maxHp: 120,
    speed: 58,
    touchDps: 28,
    color: "#7a6e8c",
    outline: "#3a3248",
    xpMult: 1.4,
  },
  exploder: {
    id: "exploder",
    radius: 11,
    maxHp: 34,
    speed: 72,
    touchDps: 11,
    color: "#c85a4a",
    outline: "#5c2218",
    xpMult: 1.15,
    /** Death AoE: damages player and other enemies (chain possible). */
    explodesOnDeath: true,
    explosionRadius: 50,
    explosionDamage: 22,
  },
  /** Burst threat: pauses, dashes straight at player, recovers, repeats. */
  beast: {
    id: "beast",
    radius: 18,
    maxHp: 70,
    // Base chase speed is low; dash is handled in code.
    speed: 55,
    touchDps: 22,
    color: "#5b4a4a",
    outline: "#241616",
    xpMult: 1.35,
  },
  slime: {
    id: "slime",
    radius: 11,
    maxHp: 32,
    speed: 118,
    touchDps: 14,
    color: "#5cff8a",
    outline: "#0d4d24",
    xpMult: 1,
    organicSlime: true,
    splitsInto: {
      typeId: "slimeSmall",
      count: 2,
      spawnRadius: 15,
      popDuration: 0.24,
    },
  },
  slimeSmall: {
    id: "slimeSmall",
    radius: 7,
    maxHp: 14,
    speed: 142,
    touchDps: 9,
    color: "#7dffb0",
    outline: "#0f5c2e",
    xpMult: 0.32,
    organicSlime: true,
  },
  boss1: {
    id: "boss1",
    radius: 26,
    // Brute is 120 HP; boss starts ~10× brute.
    maxHp: 1200,
    speed: 85,
    touchDps: 42,
    color: "#ff5a2b",
    outline: "#3b0b08",
    xpMult: 8.5,
    isBoss: true,
    name: "Fire Demon",
  },
  boss2: {
    id: "boss2",
    radius: 30,
    maxHp: 1100,
    speed: 72,
    touchDps: 36,
    color: "#9b6dff",
    outline: "#2a1048",
    xpMult: 8.0,
    isBoss: true,
    name: "Arcane Sentinel",
  },
};

export function viewWorldW() {
  return CONFIG.CANVAS_W * (CONFIG.VIEW_WORLD_SCALE ?? 1);
}

export function viewWorldH() {
  return CONFIG.CANVAS_H * (CONFIG.VIEW_WORLD_SCALE ?? 1);
}
