/**
 * ui.js — UI utilities: toast, status, settings, transcript display
 */

import { state, dom } from './state.js';
import { LANG_CONFIG, LANG_FLAGS, LANG_NAMES } from './config.js';

// ===== Toast =====
let toastTimer = null;

export function showToast(message, type = '') {
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

// ===== Status Bar =====
export function setStatus(text, statusClass = '') {
  dom.statusText.textContent = text;
  dom.statusBar.className = `status-bar ${statusClass}`;
}

// ===== Language Flags =====
export function updateLangFlags() {
  const cfg = LANG_CONFIG[state.langPair] || LANG_CONFIG['vi-en'];
  if (dom.langFlagA) dom.langFlagA.textContent = cfg.flagA;
  if (dom.langFlagB) dom.langFlagB.textContent = cfg.flagB;
}

// ===== Settings Panel =====
export function openSettings() {
  dom.settingsOverlay.classList.add('open');
}

export function closeSettings() {
  dom.settingsOverlay.classList.remove('open');
}

// ===== HTML Helpers =====
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Transcript Display =====
export function createTranscriptEntry(originalText, translatedText, lang, isFinal) {
  const entry = document.createElement('div');
  entry.className = `transcript-entry ${isFinal ? '' : 'entry-interim'}`;

  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const flag = LANG_FLAGS[lang] || '🌐';
  const langName = LANG_NAMES[lang] || lang;
  const cfg = LANG_CONFIG[state.langPair] || LANG_CONFIG['vi-en'];
  const targetLang = lang === cfg.a ? cfg.b : cfg.a;

  entry.innerHTML = `
    <div class="entry-header">
      <span class="entry-speaker">${flag}</span>
      <span class="entry-lang">${langName}</span>
      <span class="entry-time">${timeStr}</span>
    </div>
    <div class="entry-original">${escapeHtml(originalText)}</div>
    ${translatedText ? `
      <div class="entry-translation">
        <span class="translation-text">${escapeHtml(translatedText)}</span>
        <button class="speak-entry-btn" aria-label="Đọc" data-text="${escapeAttr(translatedText)}" data-lang="${targetLang}">
          🔊
        </button>
      </div>
    ` : ''}
  `;

  return entry;
}

export function addTranscript(originalText, translatedText, lang, isFinal) {
  dom.emptyState.classList.add('hidden');
  dom.clearBtn.disabled = false;

  if (!isFinal) {
    // INTERIM: update in-place or create new
    if (state.currentInterim) {
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
      const entry = createTranscriptEntry(originalText, translatedText, lang, false);
      dom.transcriptArea.appendChild(entry);
      state.currentInterim = entry;
    }
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

  dom.transcriptArea.scrollTo({ top: dom.transcriptArea.scrollHeight, behavior: 'smooth' });
}

export function clearTranscripts() {
  const entries = dom.transcriptArea.querySelectorAll('.transcript-entry');
  entries.forEach((e) => e.remove());
  dom.emptyState.classList.remove('hidden');
  dom.clearBtn.disabled = true;
  dom.speakBtn.disabled = true;
  state.currentInterim = null;
}
