/**
 * audio-capture.js — Microphone capture (AudioWorklet + ScriptProcessor fallback)
 */

import { state } from './state.js';
import { showToast } from './ui.js';

export async function startAudioCapture() {
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
        if (state.isTTSPlaying) return;
        if (state.pushToTalk && !state.pttActive) return;
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(event.data);
        }
      };

      source.connect(state.workletNode);
    } catch (workletErr) {
      console.warn('AudioWorklet not supported, using ScriptProcessor', workletErr);
      const source = state.audioContext.createMediaStreamSource(state.mediaStream);
      const processor = state.audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (state.isTTSPlaying) return;
        if (state.pushToTalk && !state.pttActive) return;
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

export function stopAudioCapture() {
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
