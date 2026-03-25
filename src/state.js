/**
 * state.js — Application state and DOM references
 */

const $ = (sel) => document.querySelector(sel);

// Reactive application state
export const state = {
  isRecording: false,
  sonioxKey: '',
  elevenKey: '',
  voiceGender: 'female',
  autoSpeak: false,
  pushToTalk: false,
  langPair: 'vi-en',
  mergeSpeed: 4,
  ws: null,
  audioContext: null,
  mediaStream: null,
  workletNode: null,
  currentInterim: null,
  ttsQueue: [],
  isSpeaking: false,
  isTTSPlaying: false,
  lastFinalText: '',
  pttActive: false,
  pttConnected: false,
  micReady: false,
  actualSampleRate: null,
  lastEntry: null,
  lastEntryLang: '',
  lastEntryTime: 0,
};

// Cached DOM element references
export const dom = {
  settingsOverlay: $('#settingsOverlay'),
  openSettings: $('#openSettings'),
  closeSettings: $('#closeSettings'),
  saveSettings: $('#saveSettings'),
  sonioxKey: $('#sonioxKey'),
  elevenKey: $('#elevenKey'),
  voiceGender: $('#voiceGender'),
  autoSpeak: $('#autoSpeak'),
  pushToTalk: $('#pushToTalk'),
  langPair: $('#langPair'),
  mergeSpeed: $('#mergeSpeed'),
  mergeSpeedValue: $('#mergeSpeedValue'),
  statusBar: $('#statusBar'),
  statusText: $('#statusText'),
  transcriptArea: $('#transcriptArea'),
  emptyState: $('#emptyState'),
  recordBtn: $('#recordBtn'),
  clearBtn: $('#clearBtn'),
  speakBtn: $('#speakBtn'),
  langFlagA: $('#langFlagA'),
  langFlagB: $('#langFlagB'),
};
