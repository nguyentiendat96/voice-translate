/**
 * soniox.js — Soniox WebSocket STT + Translation service
 */

import { state } from './state.js';
import { LANG_CONFIG, getTargetLang } from './config.js';
import { setStatus, showToast, addTranscript } from './ui.js';
import { enqueueTTS } from './tts.js';
import { dom } from './state.js';

// ===== Segment State =====
export let seg = {
  original: '',
  translation: '',
  lang: '',
  hasOrigFinal: false,
  hasTransFinal: false,
};

let primarySpeaker = null; // First detected speaker = user
let allowedSpeakers = new Set(); // Set of allowed speaker IDs

export function resetSegment() {
  seg = { original: '', translation: '', lang: '', hasOrigFinal: false, hasTransFinal: false };
}

export function resetSpeakerTracking() {
  primarySpeaker = null;
  allowedSpeakers = new Set();
}

// ===== WebSocket Connection =====
/**
 * Connect to Soniox WebSocket.
 * @param {number} sampleRate - Audio sample rate
 * @param {object} options
 * @param {function} [options.onDisconnect] - Called when WS closes unexpectedly (non-PTT mode)
 */
export function connectSoniox(sampleRate, { onDisconnect } = {}) {
  return new Promise((resolve, reject) => {
    console.log('Connecting to Soniox with sample rate:', sampleRate);
    const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');

    ws.onopen = () => {
      const langCfg = LANG_CONFIG[state.langPair] || LANG_CONFIG['vi-en'];
      const config = {
        api_key: state.sonioxKey,
        model: 'stt-rt-preview',
        audio_format: 'pcm_s16le',
        sample_rate: sampleRate,
        num_channels: 1,
        language_hints: [langCfg.a, langCfg.b],
        enable_speaker_diarization: true,
        enable_language_identification: true,
        translation: {
          type: 'two_way',
          language_a: langCfg.a,
          language_b: langCfg.b,
        },
      };
      console.log('Soniox config:', JSON.stringify(config));
      ws.send(JSON.stringify(config));
      resolve(ws);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleSonioxResponse(data);
      } catch (err) {
        console.error('Soniox parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('Soniox WS error:', err);
      reject(err);
    };

    ws.onclose = (event) => {
      console.log('Soniox WS closed:', event.code, event.reason);
      if (state.pushToTalk && state.pttConnected) {
        // PTT mode: auto-reconnect
        console.log('PTT: auto-reconnecting Soniox...');
        state.ws = null;
        setTimeout(() => {
          if (state.pushToTalk && state.pttConnected) {
            const sr = state.actualSampleRate || 48000;
            connectSoniox(sr).then(newWs => {
              state.ws = newWs;
              console.log('PTT: reconnected');
            }).catch(err => {
              console.error('PTT reconnect failed:', err);
              setStatus('⚠️ Mất kết nối, nhấn Settings để thử lại', 'error');
            });
          }
        }, 1000);
      } else if (onDisconnect) {
        onDisconnect(event);
      }
    };
  });
}

// ===== Response Handler =====
function handleSonioxResponse(data) {
  console.log('Soniox:', JSON.stringify(data).slice(0, 300));

  if (data.tokens && data.tokens.length > 0) {
    const kinds = data.tokens.map(t => (t.translation_status || 'none')[0]).join('');
    setStatus(`🔤 ${data.tokens.length} tokens [${kinds}]`, 'recording');
  }

  if (data.error) {
    const msg = data.error.message || data.error || 'Lỗi';
    showToast(`❌ Soniox: ${msg}`, 'error');
    return;
  }

  if (data.finished) return;
  if (!data.tokens || data.tokens.length === 0) return;

  // Speaker filtering based on speakerFilter setting
  const maxSpeakers = state.speakerFilter === 'all' ? Infinity : parseInt(state.speakerFilter) || 1;

  if (maxSpeakers < Infinity) {
    const speakerTokens = data.tokens.filter(t => {
      const status = t.translation_status || 'none';
      // Translation tokens don't have speaker info, always keep them
      if (status === 'translation') return true;
      // Track allowed speakers up to maxSpeakers
      if (t.speaker !== undefined && t.speaker !== null) {
        if (allowedSpeakers.size < maxSpeakers) {
          allowedSpeakers.add(t.speaker);
          console.log(`Speaker ${t.speaker} allowed (${allowedSpeakers.size}/${maxSpeakers})`);
        }
        return allowedSpeakers.has(t.speaker);
      }
      return true; // No speaker info = keep
    });

    // If all original tokens were filtered out, skip
    if (speakerTokens.length === 0) return;
    data = { ...data, tokens: speakerTokens };
  }

  let interimOrig = '';
  let interimTrans = '';

  for (const token of data.tokens) {
    const status = token.translation_status || 'none';
    const text = token.text || '';

    if (status === 'original' || status === 'none') {
      if (seg.hasOrigFinal && seg.hasTransFinal) {
        commitSegment();
      }

      if (token.is_final) {
        seg.original += text;
        seg.hasOrigFinal = true;
      } else {
        interimOrig += text;
      }
      if (token.language) seg.lang = token.language;

    } else if (status === 'translation') {
      if (token.is_final) {
        seg.translation += text;
        seg.hasTransFinal = true;
      } else {
        interimTrans += text;
      }
    }
  }

  const origDisplay = (seg.original + interimOrig).trim();
  const transDisplay = (seg.translation + interimTrans).trim();
  const lang = seg.lang || 'vi';

  if (seg.hasOrigFinal && seg.hasTransFinal) {
    commitSegment();
  } else if (origDisplay) {
    addTranscript(origDisplay, transDisplay, lang, false);
  }
}

// ===== Commit Segment =====
function commitSegment() {
  const orig = seg.original.trim();
  const trans = seg.translation.trim();
  const lang = seg.lang || 'vi';

  if (!orig) {
    resetSegment();
    return;
  }

  const now = Date.now();
  const MERGE_WINDOW = (state.mergeSpeed || 4) * 1000;

  const shouldMerge = state.lastEntry && state.lastEntryLang === lang && (
    state.pttActive || (now - state.lastEntryTime) < MERGE_WINDOW
  );

  if (shouldMerge) {
    // Append to existing entry
    const origEl = state.lastEntry.querySelector('.entry-original');
    const transEl = state.lastEntry.querySelector('.translation-text');
    if (origEl) origEl.textContent += ' ' + orig;
    if (transEl && trans) transEl.textContent += ' ' + trans;

    const speakBtn = state.lastEntry.querySelector('.speak-entry-btn');
    if (speakBtn && trans) {
      const existing = speakBtn.getAttribute('data-text');
      speakBtn.setAttribute('data-text', existing + ' ' + trans);
    }

    state.lastEntryTime = now;
    state.lastFinalText = trans;
    dom.speakBtn.disabled = !trans;

    if (state.autoSpeak && trans) {
      const targetLang = getTargetLang(lang, state.langPair);
      enqueueTTS(trans, targetLang);
    }

    dom.transcriptArea.scrollTo({ top: dom.transcriptArea.scrollHeight, behavior: 'smooth' });
  } else {
    // Create new entry
    addTranscript(orig, trans, lang, true);
    state.lastEntryTime = now;
    state.lastEntryLang = lang;
    state.lastEntry = dom.transcriptArea.querySelector('.transcript-entry:last-child');

    // Auto-speak for new entries
    if (state.autoSpeak && trans) {
      const targetLang = getTargetLang(lang, state.langPair);
      enqueueTTS(trans, targetLang);
    }
  }

  resetSegment();
}
