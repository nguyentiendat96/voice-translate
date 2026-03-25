/**
 * VoiceTranslate — Real-time Vietnamese ↔ English/French Translation
 *
 * app.js — Main orchestrator (init + event wiring)
 *
 * Module structure:
 *   config.js        → Constants, language config, voice IDs
 *   state.js         → Application state, DOM references
 *   ui.js            → Toast, status, settings panel, transcript display
 *   tts.js           → ElevenLabs TTS + queue
 *   soniox.js        → Soniox WebSocket STT + translation handler
 *   audio-capture.js → Microphone capture (AudioWorklet / ScriptProcessor)
 *   recording.js     → Recording controls, Push-to-Talk mode
 *   app.js           → This file (init + event wiring)
 */

import { state, dom } from './state.js';
import { LANG_CONFIG } from './config.js';
import { showToast, setStatus, updateLangFlags, openSettings, closeSettings, clearTranscripts } from './ui.js';
import { speakText } from './tts.js';
import { setupRecordButton } from './recording.js';
import { resetSpeakerTracking } from './soniox.js';

// ===== Settings =====
function loadSettings() {
  state.sonioxKey = localStorage.getItem('vt_soniox_key') || '0e3690d5c1e0e2df877d3f31d9b306503ecd5df90f86613d967121414ab04d9a';
  state.elevenKey = localStorage.getItem('vt_eleven_key') || 'sk_a2c351511388d19b182e482ec391e4b9a41f588bc0d9e20c';
  state.voiceGender = localStorage.getItem('vt_voice_gender') || 'female';
  state.autoSpeak = localStorage.getItem('vt_auto_speak') === 'true';
  state.langPair = localStorage.getItem('vt_lang_pair') || 'vi-en';
  state.speakerFilter = localStorage.getItem('vt_speaker_filter') || '1';
  state.mergeSpeed = parseInt(localStorage.getItem('vt_merge_speed') || '4');
  state.pushToTalk = localStorage.getItem('vt_push_to_talk') === 'true';

  dom.sonioxKey.value = state.sonioxKey;
  dom.elevenKey.value = state.elevenKey;
  dom.voiceGender.value = state.voiceGender;
  dom.autoSpeak.checked = state.autoSpeak;
  if (dom.langPair) dom.langPair.value = state.langPair;
  if (dom.speakerFilter) dom.speakerFilter.value = state.speakerFilter;
  if (dom.pushToTalk) dom.pushToTalk.checked = state.pushToTalk;
  if (dom.mergeSpeed) {
    dom.mergeSpeed.value = state.mergeSpeed;
    dom.mergeSpeedValue.textContent = state.mergeSpeed + 's';
  }
  updateLangFlags();
}

function saveSettings() {
  state.sonioxKey = dom.sonioxKey.value.trim();
  state.elevenKey = dom.elevenKey.value.trim();
  state.voiceGender = dom.voiceGender.value;
  state.autoSpeak = dom.autoSpeak.checked;
  state.langPair = dom.langPair ? dom.langPair.value : 'vi-en';
  state.speakerFilter = dom.speakerFilter ? dom.speakerFilter.value : '1';
  state.mergeSpeed = dom.mergeSpeed ? parseInt(dom.mergeSpeed.value) : 4;
  state.pushToTalk = dom.pushToTalk ? dom.pushToTalk.checked : false;

  localStorage.setItem('vt_soniox_key', state.sonioxKey);
  localStorage.setItem('vt_eleven_key', state.elevenKey);
  localStorage.setItem('vt_voice_gender', state.voiceGender);
  localStorage.setItem('vt_auto_speak', state.autoSpeak);
  localStorage.setItem('vt_lang_pair', state.langPair);
  localStorage.setItem('vt_speaker_filter', state.speakerFilter);
  localStorage.setItem('vt_merge_speed', state.mergeSpeed);
  localStorage.setItem('vt_push_to_talk', state.pushToTalk);

  setupRecordButton();
  updateLangFlags();
  resetSpeakerTracking();

  closeSettings();
  showToast('Đã lưu cài đặt', 'success');
}

// ===== Init =====
function init() {
  loadSettings();

  // Settings panel
  dom.openSettings.addEventListener('click', openSettings);
  dom.closeSettings.addEventListener('click', closeSettings);
  dom.saveSettings.addEventListener('click', saveSettings);

  // Merge speed slider live update
  if (dom.mergeSpeed) {
    dom.mergeSpeed.addEventListener('input', () => {
      dom.mergeSpeedValue.textContent = dom.mergeSpeed.value + 's';
    });
  }

  // Close settings on overlay click
  dom.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === dom.settingsOverlay) closeSettings();
  });

  // Record button
  setupRecordButton();

  // Clear transcripts
  dom.clearBtn.addEventListener('click', clearTranscripts);

  // Speak last translation
  dom.speakBtn.addEventListener('click', () => {
    if (state.lastFinalText) {
      const lastEntry = dom.transcriptArea.querySelector('.transcript-entry:last-of-type .speak-entry-btn');
      if (lastEntry) {
        speakText(lastEntry.getAttribute('data-text'), lastEntry.getAttribute('data-lang'));
      }
    }
  });

  // Delegated speak button listener (handles all transcript speak buttons)
  dom.transcriptArea.addEventListener('click', (e) => {
    const btn = e.target.closest('.speak-entry-btn');
    if (btn) {
      speakText(btn.dataset.text, btn.dataset.lang);
    }
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }

  // Show settings if no API keys
  if (!state.sonioxKey || !state.elevenKey) {
    setTimeout(() => openSettings(), 600);
  }
}

// ===== Boot =====
init();
