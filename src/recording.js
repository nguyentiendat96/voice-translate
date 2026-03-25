/**
 * recording.js — Recording controls and Push-to-Talk mode
 */

import { state, dom } from './state.js';
import { getTargetLang } from './config.js';
import { setStatus, showToast, openSettings, addTranscript } from './ui.js';
import { startAudioCapture, stopAudioCapture } from './audio-capture.js';
import { connectSoniox, resetSegment, seg, resetSpeakerTracking } from './soniox.js';
import { enqueueTTS } from './tts.js';

// ===== Finalize Pending =====
// Converts interim text to final so it stays visible after stopping
function finalizePending() {
  // Commit any pending segment data
  if (seg.original.trim()) {
    const orig = seg.original.trim();
    const trans = seg.translation.trim();
    const lang = seg.lang || 'vi';
    addTranscript(orig, trans, lang, true);
    state.lastEntry = dom.transcriptArea.querySelector('.transcript-entry:last-child');
    state.lastEntryTime = Date.now();
    state.lastEntryLang = lang;

    if (trans) {
      state.lastFinalText = trans;
      dom.speakBtn.disabled = false;
      if (state.autoSpeak) {
        const targetLang = getTargetLang(lang, state.langPair);
        enqueueTTS(trans, targetLang);
      }
    }
    resetSegment();
  }

  // Convert any visible interim entry to final
  if (state.currentInterim) {
    state.currentInterim.classList.remove('entry-interim');
    state.currentInterim.style.transition = 'opacity 0.3s ease';
    state.currentInterim.style.opacity = '1';
    state.currentInterim = null;
  }
}

// ===== Normal Recording =====
export async function startRecording() {
  if (!state.sonioxKey) {
    showToast('⚠️ Vui lòng nhập Soniox API Key', 'error');
    openSettings();
    return;
  }

  resetSpeakerTracking(); // Reset speaker lock for new session

  try {
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

    const sampleRate = state.actualSampleRate || 48000;
    state.ws = await connectSoniox(sampleRate, {
      onDisconnect: (event) => {
        if (state.isRecording) {
          stopRecording();
          if (event.code !== 1000) {
            showToast('⚠️ Mất kết nối Soniox', 'error');
          }
        }
      },
    });

    state.isRecording = true;
    dom.recordBtn.classList.add('recording');
    setStatus('Đang nghe... Hãy nói gì đó', 'recording');

    resetSegment();
  } catch (err) {
    console.error('Start recording error:', err);
    showToast('❌ Không thể kết nối', 'error');
    setStatus('Lỗi kết nối', 'error');
  }
}

export function stopRecording(keepMic = false) {
  // Finalize any pending text BEFORE closing connection
  finalizePending();

  state.isRecording = false;
  dom.recordBtn.classList.remove('recording');

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

export function toggleRecording() {
  if (state.isRecording) {
    stopRecording(false);
  } else {
    startRecording();
  }
}

// ===== Push to Talk =====
export async function initPTTMode() {
  if (!state.sonioxKey) {
    showToast('⚠️ Vui lòng nhập Soniox API Key', 'error');
    return;
  }

  setStatus('Đang kết nối sẵn...', 'connected');

  try {
    if (!state.micReady) {
      const started = await startAudioCapture();
      if (!started) {
        setStatus('Lỗi microphone', 'error');
        return;
      }
      state.micReady = true;
    }

    const sampleRate = state.actualSampleRate || 48000;
    state.ws = await connectSoniox(sampleRate);
    state.pttConnected = true;

    setStatus('✅ Sẵn sàng — Giữ nút để nói', '');
    showToast('Đã kết nối sẵn', 'success');
  } catch (err) {
    console.error('PTT init error:', err);
    setStatus('⚠️ Lỗi kết nối, thử lại...', 'error');
  }
}

export function cleanupPTTMode() {
  state.pttConnected = false;
  state.pttActive = false;
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.close();
    state.ws = null;
  }
  stopAudioCapture();
  state.micReady = false;
}

export function pttStart() {
  if (state.pttActive) return;
  state.pttActive = true;

  state.lastEntry = null;
  state.lastEntryLang = '';
  state.lastEntryTime = 0;

  dom.recordBtn.classList.add('recording');
  setStatus('Đang nghe... Hãy nói gì đó', 'recording');

  resetSegment();

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    initPTTMode();
  }
}

export function pttStop() {
  if (!state.pttActive) return;
  state.pttActive = false;

  dom.recordBtn.classList.remove('recording');
  setStatus('✅ Sẵn sàng — Giữ nút để nói', '');

  // Finalize any pending text
  finalizePending();
}

// ===== Button Setup =====
export function setupRecordButton() {
  const oldBtn = dom.recordBtn;
  const newBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(newBtn, oldBtn);
  dom.recordBtn = newBtn;

  if (state.pushToTalk) {
    if (state.isRecording) stopRecording(false);

    newBtn.addEventListener('touchstart', (e) => { e.preventDefault(); pttStart(); }, { passive: false });
    newBtn.addEventListener('touchend', (e) => { e.preventDefault(); pttStop(); });
    newBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); pttStop(); });
    newBtn.addEventListener('mousedown', (e) => { e.preventDefault(); pttStart(); });
    newBtn.addEventListener('mouseup', (e) => { e.preventDefault(); pttStop(); });

    initPTTMode();
  } else {
    if (state.pttConnected) cleanupPTTMode();

    newBtn.addEventListener('click', toggleRecording);
    setStatus('Nhấn nút để bắt đầu', '');
  }
}
