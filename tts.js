/**
 * tts.js — ElevenLabs Text-to-Speech service
 */

import { state } from './state.js';
import { VOICES } from './config.js';
import { showToast } from './ui.js';

// ===== Speak Text =====
export async function speakText(text, lang) {
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
          text,
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

// ===== TTS Queue =====
export function enqueueTTS(text, lang) {
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
