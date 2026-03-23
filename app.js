/**
 * VoiceTranslate — Real-time Vietnamese ↔ English/French Translation
 * Uses Soniox WebSocket for STT + Translation
 * Uses ElevenLabs for TTS
 */

// ===== Language Config =====
const LANG_CONFIG = {
  'vi-en': { a: 'vi', b: 'en', flagA: '🇻🇳', flagB: '🇬🇧', nameA: 'Tiếng Việt', nameB: 'English' },
  'vi-fr': { a: 'vi', b: 'fr', flagA: '🇻🇳', flagB: '🇫🇷', nameA: 'Tiếng Việt', nameB: 'Français' },
};

// ===== ElevenLabs Voice IDs =====
const VOICES = {
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

// ===== State =====
const state = {
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
  micReady: false,
};

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const dom = {
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

// ===== Settings =====
function loadSettings() {
  state.sonioxKey = localStorage.getItem('vt_soniox_key') || '0e3690d5c1e0e2df877d3f31d9b306503ecd5df90f86613d967121414ab04d9a';
  state.elevenKey = localStorage.getItem('vt_eleven_key') || 'sk_a2c351511388d19b182e482ec391e4b9a41f588bc0d9e20c';
  state.voiceGender = localStorage.getItem('vt_voice_gender') || 'female';
  state.autoSpeak = localStorage.getItem('vt_auto_speak') === 'true';
  state.langPair = localStorage.getItem('vt_lang_pair') || 'vi-en';
  state.mergeSpeed = parseInt(localStorage.getItem('vt_merge_speed') || '4');
  state.pushToTalk = localStorage.getItem('vt_push_to_talk') === 'true';

  dom.sonioxKey.value = state.sonioxKey;
  dom.elevenKey.value = state.elevenKey;
  dom.voiceGender.value = state.voiceGender;
  dom.autoSpeak.checked = state.autoSpeak;
  if (dom.langPair) dom.langPair.value = state.langPair;
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
  state.mergeSpeed = dom.mergeSpeed ? parseInt(dom.mergeSpeed.value) : 4;
  state.pushToTalk = dom.pushToTalk ? dom.pushToTalk.checked : false;

  localStorage.setItem('vt_soniox_key', state.sonioxKey);
  localStorage.setItem('vt_eleven_key', state.elevenKey);
  localStorage.setItem('vt_voice_gender', state.voiceGender);
  localStorage.setItem('vt_auto_speak', state.autoSpeak);
  localStorage.setItem('vt_lang_pair', state.langPair);
  localStorage.setItem('vt_merge_speed', state.mergeSpeed);
  localStorage.setItem('vt_push_to_talk', state.pushToTalk);

  // Re-setup button listeners for new mode
  setupRecordButton();
  updateLangFlags();

  closeSettings();
  showToast('Đã lưu cài đặt', 'success');
}

function updateLangFlags() {
  const cfg = LANG_CONFIG[state.langPair] || LANG_CONFIG['vi-en'];
  if (dom.langFlagA) dom.langFlagA.textContent = cfg.flagA;
  if (dom.langFlagB) dom.langFlagB.textContent = cfg.flagB;
}

function openSettings() {
  dom.settingsOverlay.classList.add('open');
}

function closeSettings() {
  dom.settingsOverlay.classList.remove('open');
}

// ===== Toast =====
let toastTimer = null;
function showToast(message, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ===== Status =====
function setStatus(text, statusClass = '') {
  dom.statusText.textContent = text;
  dom.statusBar.className = `status-bar ${statusClass}`;
}

// ===== Transcript =====
function createTranscriptEntry(originalText, translatedText, lang, isFinal) {
  const entry = document.createElement('div');
  entry.className = `transcript-entry ${isFinal ? '' : 'entry-interim'}`;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const isVietnamese = lang === 'vi';

  entry.innerHTML = `
    <div class="entry-header">
      <span class="entry-speaker">${isVietnamese ? '🇻🇳' : '🇬🇧'}</span>
      <span class="entry-lang">${isVietnamese ? 'Tiếng Việt' : 'English'}</span>
      <span class="entry-time">${timeStr}</span>
    </div>
    <div class="entry-original">${escapeHtml(originalText)}</div>
    ${translatedText ? `
      <div class="entry-translation">
        <span class="translation-text">${escapeHtml(translatedText)}</span>
        <button class="speak-entry-btn" aria-label="Đọc" data-text="${escapeAttr(translatedText)}" data-lang="${isVietnamese ? 'en' : 'vi'}">
          🔊
        </button>
      </div>
    ` : ''}
  `;

  return entry;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function addTranscript(originalText, translatedText, lang, isFinal) {
  dom.emptyState.classList.add('hidden');
  dom.clearBtn.disabled = false;

  const isVietnamese = lang === 'vi';

  if (!isFinal) {
    // INTERIM: update existing interim entry in-place, or create new one
    if (state.currentInterim) {
      // Update content without removing the element
      const origEl = state.currentInterim.querySelector('.entry-original');
      const transEl = state.currentInterim.querySelector('.entry-translation');
      if (origEl) origEl.textContent = originalText;
      if (transEl && translatedText) {
        transEl.querySelector('.translation-text').textContent = translatedText;
      } else if (!transEl && translatedText) {
        const transDiv = document.createElement('div');
        transDiv.className = 'entry-translation';
        transDiv.innerHTML = `<span class="translation-text">${escapeHtml(translatedText)}</span>`;
        state.currentInterim.appendChild(transDiv);
      }
    } else {
      // Create new interim entry
      const entry = createTranscriptEntry(originalText, translatedText, lang, false);
      dom.transcriptArea.appendChild(entry);
      state.currentInterim = entry;
    }
    // Smooth scroll
    dom.transcriptArea.scrollTo({ top: dom.transcriptArea.scrollHeight, behavior: 'smooth' });
    return;
  }

  // FINAL: remove interim, create final entry
  if (state.currentInterim) {
    state.currentInterim.remove();
    state.currentInterim = null;
  }

  const entry = createTranscriptEntry(originalText, translatedText, lang, true);
  entry.style.opacity = '0';
  entry.style.transform = 'translateY(8px)';
  dom.transcriptArea.appendChild(entry);

  // Animate in
  requestAnimationFrame(() => {
    entry.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    entry.style.opacity = '1';
    entry.style.transform = 'translateY(0)';
  });

  // Smooth scroll
  dom.transcriptArea.scrollTo({ top: dom.transcriptArea.scrollHeight, behavior: 'smooth' });

  // Attach speak button listener
  if (translatedText) {
    const speakBtnEl = entry.querySelector('.speak-entry-btn');
    if (speakBtnEl) {
      speakBtnEl.addEventListener('click', () => {
        const text = speakBtnEl.getAttribute('data-text');
        const targetLang = speakBtnEl.getAttribute('data-lang');
        speakText(text, targetLang);
      });
    }

    // Auto-speak
    if (state.autoSpeak) {
      const targetLang = lang === 'vi' ? 'en' : 'vi';
      enqueueTTS(translatedText, targetLang);
    }
  }
}

function clearTranscripts() {
  // Remove all transcript entries
  const entries = dom.transcriptArea.querySelectorAll('.transcript-entry');
  entries.forEach((e) => e.remove());
  dom.emptyState.classList.remove('hidden');
  dom.clearBtn.disabled = true;
  dom.speakBtn.disabled = true;
  state.currentInterim = null;
}

// ===== Audio Capture =====
async function startAudioCapture() {
  try {
    // Do NOT force sampleRate — iOS Safari ignores it and uses 48kHz
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Resume context (required on iOS after user gesture)
    if (state.audioContext.state === 'suspended') {
      await state.audioContext.resume();
    }

    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    // Store actual sample rate for Soniox config
    state.actualSampleRate = state.audioContext.sampleRate;
    console.log('Actual audio sample rate:', state.actualSampleRate);

    // Try AudioWorklet first, fallback to ScriptProcessor
    try {
      await state.audioContext.audioWorklet.addModule('audio-processor.js');
      const source = state.audioContext.createMediaStreamSource(state.mediaStream);
      state.workletNode = new AudioWorkletNode(state.audioContext, 'audio-capture-processor');

      state.workletNode.port.onmessage = (event) => {
        if (state.isTTSPlaying) return; // Mute mic during TTS playback
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(event.data);
        }
      };

      source.connect(state.workletNode);
      // Don't connect to destination to avoid echo
      // state.workletNode.connect(state.audioContext.destination);
    } catch (workletErr) {
      console.warn('AudioWorklet not supported, using ScriptProcessor', workletErr);
      const source = state.audioContext.createMediaStreamSource(state.mediaStream);
      const processor = state.audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (state.isTTSPlaying) return; // Mute mic during TTS playback
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(int16.buffer);
        }
      };

      source.connect(processor);
      // Connect to destination is required for ScriptProcessor to fire
      processor.connect(state.audioContext.destination);
      state.workletNode = processor;
    }

    return true;
  } catch (err) {
    console.error('Audio capture error:', err);
    if (err.name === 'NotAllowedError') {
      showToast('❌ Không có quyền truy cập microphone', 'error');
    } else {
      showToast('❌ Lỗi microphone: ' + err.message, 'error');
    }
    return false;
  }
}

function stopAudioCapture() {
  if (state.workletNode) {
    state.workletNode.disconnect();
    state.workletNode = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((t) => t.stop());
    state.mediaStream = null;
  }
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
}

// ===== Soniox WebSocket =====
function connectSoniox(sampleRate) {
  return new Promise((resolve, reject) => {
    console.log('Connecting to Soniox with sample rate:', sampleRate);
    const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');

    ws.onopen = () => {
      // Send configuration with actual microphone sample rate
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
      if (state.isRecording) {
        stopRecording();
        if (event.code !== 1000) {
          showToast('⚠️ Mất kết nối Soniox', 'error');
        }
      }
    };
  });
}

// ===== Soniox Response Handler =====
// Current segment being built: original text → then translation text
let seg = {
  original: '',
  translation: '',
  lang: '',
  hasOrigFinal: false,   // original text finalized
  hasTransFinal: false,   // translation text finalized
};

function handleSonioxResponse(data) {
  console.log('Soniox:', JSON.stringify(data).slice(0, 300));

  // Show debug info on mobile
  if (data.tokens && data.tokens.length > 0) {
    const kinds = data.tokens.map(t => (t.translation_status || 'none')[0]).join('');
    setStatus(`🔤 ${data.tokens.length} tokens [${kinds}]`, 'recording');
  }

  if (data.error) {
    const msg = data.error.message || data.error || 'Lỗi';
    showToast(`❌ Soniox: ${msg}`, 'error');
    stopRecording();
    return;
  }

  if (data.finished) return;
  if (!data.tokens || data.tokens.length === 0) return;

  // Temporary text from THIS message (non-final tokens)
  let interimOrig = '';
  let interimTrans = '';

  for (const token of data.tokens) {
    const status = token.translation_status || 'none';
    const text = token.text || '';

    if (status === 'original' || status === 'none') {
      // If we already had a completed segment (orig + trans finalized),
      // and now new original text is arriving → commit the previous segment
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

  // Display logic
  const origDisplay = (seg.original + interimOrig).trim();
  const transDisplay = (seg.translation + interimTrans).trim();
  const lang = seg.lang || 'vi';

  if (seg.hasOrigFinal && seg.hasTransFinal) {
    // Both original and translation are finalized → commit!
    commitSegment();
  } else if (origDisplay) {
    // Show interim update
    addTranscript(origDisplay, transDisplay, lang, false);
  }
}

function commitSegment() {
  const orig = seg.original.trim();
  const trans = seg.translation.trim();
  const lang = seg.lang || 'vi';

  if (!orig) {
    seg = { original: '', translation: '', lang: '', hasOrigFinal: false, hasTransFinal: false };
    return;
  }

  const now = Date.now();
  const MERGE_WINDOW = (state.mergeSpeed || 4) * 1000;

  // In PTT mode → ALWAYS merge into one card
  // In normal mode → merge if within time window & same language
  const shouldMerge = state.lastEntry && state.lastEntryLang === lang && (
    state.pttActive || (now - state.lastEntryTime) < MERGE_WINDOW
  );

  if (shouldMerge) {
    // Append to existing entry
    const origEl = state.lastEntry.querySelector('.entry-original');
    const transEl = state.lastEntry.querySelector('.translation-text');
    if (origEl) origEl.textContent += ' ' + orig;
    if (transEl && trans) transEl.textContent += ' ' + trans;

    // Update speak button data
    const speakBtn = state.lastEntry.querySelector('.speak-entry-btn');
    if (speakBtn && trans) {
      const existing = speakBtn.getAttribute('data-text');
      speakBtn.setAttribute('data-text', existing + ' ' + trans);
    }

    state.lastEntryTime = now;
    state.lastFinalText = trans;
    dom.speakBtn.disabled = !trans;

    // Auto-speak the new part
    if (state.autoSpeak && trans) {
      const targetLang = lang === 'vi' ? 'en' : 'vi';
      enqueueTTS(trans, targetLang);
    }

    dom.transcriptArea.scrollTo({ top: dom.transcriptArea.scrollHeight, behavior: 'smooth' });
  } else {
    // Create new entry
    addTranscript(orig, trans, lang, true);
    state.lastEntryTime = now;
    state.lastEntryLang = lang;
    // addTranscript creates the entry, find it
    state.lastEntry = dom.transcriptArea.querySelector('.transcript-entry:last-child');
  }

  // Reset for next segment
  seg = {
    original: '',
    translation: '',
    lang: '',
    hasOrigFinal: false,
    hasTransFinal: false,
  };
}

// ===== Recording Controls =====
async function startRecording() {
  if (!state.sonioxKey) {
    showToast('⚠️ Vui lòng nhập Soniox API Key', 'error');
    openSettings();
    return;
  }

  try {
    // Start microphone if not already running
    if (!state.micReady) {
      setStatus('Đang khởi động mic...', '');
      const started = await startAudioCapture();
      if (!started) {
        setStatus('Lỗi microphone', 'error');
        return;
      }
      state.micReady = true;
    }

    setStatus('Đang kết nối...', 'connected');

    // Connect Soniox with the ACTUAL sample rate from the microphone
    const sampleRate = state.actualSampleRate || 48000;
    state.ws = await connectSoniox(sampleRate);

    state.isRecording = true;
    dom.recordBtn.classList.add('recording');
    setStatus('Đang nghe... Hãy nói gì đó', 'recording');

    // Reset segment
    seg = { original: '', translation: '', lang: '', hasOrigFinal: false, hasTransFinal: false };
  } catch (err) {
    console.error('Start recording error:', err);
    showToast('❌ Không thể kết nối', 'error');
    setStatus('Lỗi kết nối', 'error');
  }
}

function stopRecording(keepMic = false) {
  state.isRecording = false;
  dom.recordBtn.classList.remove('recording');

  // Send empty frame to signal end
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(new ArrayBuffer(0));
    setTimeout(() => {
      if (state.ws) {
        state.ws.close();
        state.ws = null;
      }
    }, 1000);
  }

  if (!keepMic) {
    stopAudioCapture();
    state.micReady = false;
  }

  setStatus('Đã dừng', 'connected');

  setTimeout(() => {
    if (!state.isRecording) {
      setStatus(state.pushToTalk ? 'Giữ nút để nói' : 'Nhấn nút để bắt đầu', '');
    }
  }, 2000);
}

function toggleRecording() {
  if (state.isRecording) {
    stopRecording(false); // Normal mode: stop mic too
  } else {
    startRecording();
  }
}

// ===== Push to Talk =====
function pttStart() {
  if (state.isRecording) return;
  state.pttActive = true;
  // Reset merge tracking for fresh PTT session
  state.lastEntry = null;
  state.lastEntryLang = '';
  state.lastEntryTime = 0;
  startRecording(); // mic stays alive if already started
}

function pttStop() {
  if (!state.isRecording) return;
  state.pttActive = false;
  stopRecording(true); // PTT mode: KEEP mic alive for next press

  // Force commit any pending segment
  if (seg.original.trim()) {
    const orig = seg.original.trim();
    const trans = seg.translation.trim();
    const lang = seg.lang || 'vi';
    addTranscript(orig, trans, lang, true);
    state.lastEntry = dom.transcriptArea.querySelector('.transcript-entry:last-child');
    state.lastEntryTime = Date.now();
    state.lastEntryLang = lang;

    // Auto-speak translation
    if (trans) {
      state.lastFinalText = trans;
      dom.speakBtn.disabled = false;
      const targetLang = lang === 'vi' ? 'en' : 'vi';
      enqueueTTS(trans, targetLang);
    }

    seg = { original: '', translation: '', lang: '', hasOrigFinal: false, hasTransFinal: false };
  }
}

function setupRecordButton() {
  // Remove all existing listeners by cloning
  const oldBtn = dom.recordBtn;
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  dom.recordBtn = newBtn;

  if (state.pushToTalk) {
    // Push to Talk mode: hold to talk
    newBtn.addEventListener('touchstart', (e) => { e.preventDefault(); pttStart(); }, { passive: false });
    newBtn.addEventListener('touchend', (e) => { e.preventDefault(); pttStop(); });
    newBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); pttStop(); });
    newBtn.addEventListener('mousedown', (e) => { e.preventDefault(); pttStart(); });
    newBtn.addEventListener('mouseup', (e) => { e.preventDefault(); pttStop(); });
    setStatus('Giữ nút để nói', '');
  } else {
    // Normal mode: click to toggle
    newBtn.addEventListener('click', toggleRecording);
    setStatus('Nhấn nút để bắt đầu', '');
  }
}

// ===== ElevenLabs TTS =====
async function speakText(text, lang) {
  if (!state.elevenKey || !text) return;

  const voiceId = VOICES[state.voiceGender]?.[lang] || VOICES.female.en;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': state.elevenKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs error:', err);
      showToast('❌ Lỗi TTS: ' + response.status, 'error');
      return;
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    state.isTTSPlaying = true; // Mute mic during TTS
    return new Promise((resolve) => {
      audio.onended = () => {
        state.isTTSPlaying = false;
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = () => {
        state.isTTSPlaying = false;
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.play().catch((err) => {
        console.error('Audio play error:', err);
        state.isTTSPlaying = false;
        resolve();
      });
    });
  } catch (err) {
    console.error('TTS error:', err);
  }
}

// TTS Queue — prevents overlapping speech
function enqueueTTS(text, lang) {
  if (!state.elevenKey) return;

  state.ttsQueue.push({ text, lang });
  if (!state.isSpeaking) {
    processQueue();
  }
}

async function processQueue() {
  if (state.ttsQueue.length === 0) {
    state.isSpeaking = false;
    return;
  }

  state.isSpeaking = true;
  const { text, lang } = state.ttsQueue.shift();
  await speakText(text, lang);
  processQueue();
}

// ===== Event Listeners =====
function init() {
  loadSettings();

  // Settings
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

  // Record button (setup based on mode)
  setupRecordButton();

  // Clear
  dom.clearBtn.addEventListener('click', clearTranscripts);

  // Speak last translation
  dom.speakBtn.addEventListener('click', () => {
    if (state.lastFinalText) {
      const lastEntry = dom.transcriptArea.querySelector('.transcript-entry:last-of-type .speak-entry-btn');
      if (lastEntry) {
        const text = lastEntry.getAttribute('data-text');
        const lang = lastEntry.getAttribute('data-lang');
        speakText(text, lang);
      }
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
document.addEventListener('DOMContentLoaded', init);
