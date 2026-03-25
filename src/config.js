/**
 * config.js — Constants, language config, voice IDs
 */

// Language pair configurations
export const LANG_CONFIG = {
  'vi-en': { a: 'vi', b: 'en', flagA: '🇻🇳', flagB: '🇬🇧', nameA: 'Tiếng Việt', nameB: 'English' },
  'vi-fr': { a: 'vi', b: 'fr', flagA: '🇻🇳', flagB: '🇫🇷', nameA: 'Tiếng Việt', nameB: 'Français' },
};

// Language display helpers
export const LANG_FLAGS = { vi: '🇻🇳', en: '🇬🇧', fr: '🇫🇷' };
export const LANG_NAMES = { vi: 'Tiếng Việt', en: 'English', fr: 'Français' };

// ElevenLabs Voice IDs
export const VOICES = {
  female: {
    vi: 'jBpfAIEEVEdMwaNBLmUR',  // Vietnamese female (Gigi)
    en: 'EXAVITQu4vr4xnSDxMaL',  // English female (Sarah)
    fr: 'XB0fDUnXU5powFXDhCwa',  // French female (Charlotte)
  },
  male: {
    vi: 'onwK4e9ZLuTAKqWW03F9',  // Vietnamese male (Daniel)
    en: 'pNInz6obpgDQGcFmaJgB',  // English male (Adam)
    fr: 'IKne3meq5aSn9XLyUdCD',  // French male (Charlie)
  },
};

/**
 * Get the target language for translation based on source language and current pair.
 */
export function getTargetLang(sourceLang, langPair) {
  const cfg = LANG_CONFIG[langPair] || LANG_CONFIG['vi-en'];
  return sourceLang === cfg.a ? cfg.b : cfg.a;
}
