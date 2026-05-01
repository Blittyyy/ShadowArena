/** @typedef {{ musicVolume: number; sfxVolume: number }} AudioSettings */

export const AUDIO_SETTINGS_STORAGE_KEY = "shadowArenaAudioV2";
const LEGACY_AUDIO_KEY = "shadowArenaAudioV1";

function clamp01(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/** @returns {AudioSettings} */
function defaultAudioSettings() {
  return { musicVolume: 1, sfxVolume: 1 };
}

/** @returns {AudioSettings} */
export function loadAudioSettings() {
  try {
    let raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_AUDIO_KEY);
      if (raw) {
        const lo = JSON.parse(raw);
        const migrated = {
          musicVolume: lo.music === false ? 0 : 1,
          sfxVolume: lo.sfx === false ? 0 : 1,
        };
        localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return defaultAudioSettings();
    }
    const o = JSON.parse(raw);
    return {
      musicVolume: clamp01(Number(o.musicVolume)),
      sfxVolume: clamp01(Number(o.sfxVolume)),
    };
  } catch {
    return defaultAudioSettings();
  }
}

/**
 * @param {Partial<AudioSettings>} patch
 * @returns {AudioSettings}
 */
export function saveAudioSettings(patch) {
  const next = { ...loadAudioSettings(), ...patch };
  next.musicVolume = clamp01(Number(next.musicVolume));
  next.sfxVolume = clamp01(Number(next.sfxVolume));
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / quota)
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("shadowArenaAudioSettingsChanged", { detail: next }));
  }
  return next;
}

/** Replace stored audio prefs with defaults (e.g. new run after Play Again). */
export function resetAudioSettingsToDefaults() {
  const d = defaultAudioSettings();
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(d));
  } catch {
    // ignore (private mode / quota)
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("shadowArenaAudioSettingsChanged", { detail: d }));
  }
  return d;
}
