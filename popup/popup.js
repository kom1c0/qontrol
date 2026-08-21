const DEFAULT_QUALITY = '1080p';
const STORAGE_KEY = 'youtube-quality-preference';
const LANG_STORAGE_KEY = 'youtube-quality-language';

let currentTab = null;
let statusCheckInterval = null;
let currentLang = 'en';
let messages = {};

// Premium quality metadata
const QUALITY_META = {
  '144p': { sub: 'Tiny', badge: 'LD' },
  '240p': { sub: 'Small', badge: 'SD' },
  '360p': { sub: 'SD', badge: 'SD' },
  '480p': { sub: 'SD', badge: 'SD' },
  '720p': { sub: 'HD', badge: 'HD' },
  '1080p': { sub: 'Full HD', badge: 'FHD' },
  '1440p': { sub: '2K QHD', badge: '2K' },
  '2160p': { sub: '4K UHD', badge: '4K' },
  '4320p': { sub: '8K UHD', badge: '8K' }
};

async function loadMessages(lang) {
  return new Promise((resolve) => {
    fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`))
      .then(r => r.json())
      .then(data => {
        messages = data;
        resolve(data);
      })
      .catch(() => {
        messages = {};
        resolve({});
      });
  });
}

function t(key, substitutions) {
  const msg = messages[key];
  if (!msg || !msg.message) return key;
  let text = msg.message;
  if (substitutions) {
    substitutions.forEach((sub, i) => {
      text = text.replace(`$${i + 1}`, sub);
    });
  }
  return text;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated !== key) {
      if (el.tagName === 'OPTION') {
        el.textContent = translated;
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translated;
      } else {
        el.textContent = translated;
      }
    }
  });
  
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.querySelectorAll('option').forEach(opt => {
      if (opt.value === 'en') opt.textContent = 'English';
      if (opt.value === 'fa') opt.textContent = 'فارسی';
    });
  }
  
  const isRTL = currentLang === 'fa';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
}

async function initLanguage() {
  const stored = await chrome.storage.local.get(LANG_STORAGE_KEY);
  currentLang = stored[LANG_STORAGE_KEY] || (chrome.i18n.getUILanguage().startsWith('fa') ? 'fa' : 'en');
  await loadMessages(currentLang);
  applyTranslations();
  
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.value = currentLang;
    langSelect.addEventListener('change', async () => {
      currentLang = langSelect.value;
      await chrome.storage.local.set({ [LANG_STORAGE_KEY]: currentLang });
      await loadMessages(currentLang);
      applyTranslations();
      updateStatus();
      // Re-render quality labels after language change
      syncTrigger();
      renderQualityOptions();
    });
  }
}

// --- Premium Custom Selector ---

function syncTrigger() {
  const qualitySelect = document.getElementById('quality-select');
  const valueEl = document.getElementById('quality-value');
  const labelEl = document.getElementById('quality-label');
  const badgeEl = document.getElementById('quality-badge');
  if (!qualitySelect || !valueEl) return;
  const val = qualitySelect.value || DEFAULT_QUALITY;
  const meta = QUALITY_META[val] || { sub: '', badge: '' };
  valueEl.textContent = val;
  if (labelEl) labelEl.textContent = meta.sub;
  if (badgeEl) badgeEl.textContent = meta.badge;
}

function renderQualityOptions() {
  const popover = document.getElementById('quality-popover');
  const qualitySelect = document.getElementById('quality-select');
  if (!popover || !qualitySelect) return;
  const current = qualitySelect.value;
  popover.innerHTML = '';
  const order = ['144p','240p','360p','480p','720p','1080p','1440p','2160p','4320p'];
  order.forEach(val => {
    const meta = QUALITY_META[val] || { sub: '', badge: '' };
    const opt = document.createElement('div');
    opt.className = 'quality-option' + (val === current ? ' is-selected' : '');
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', val === current ? 'true' : 'false');
    opt.setAttribute('data-value', val);
    opt.tabIndex = 0;
    opt.innerHTML = `
      <div class="quality-option-left">
        <span class="quality-option-value">${val}</span>
        <span class="quality-option-label">${meta.sub}</span>
      </div>
      <div class="quality-option-right">
        <span class="quality-option-badge">${meta.badge}</span>
        <span class="check" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 5L4.2 6.7L7.5 3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
    `;
    const select = () => {
      qualitySelect.value = val;
      qualitySelect.dispatchEvent(new Event('change', { bubbles: true }));
      syncTrigger();
      renderQualityOptions();
      closePopover();
      document.getElementById('quality-trigger')?.focus();
    };
    opt.addEventListener('click', select);
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); }
      if (e.key === 'Escape') { closePopover(); document.getElementById('quality-trigger')?.focus(); }
    });
    popover.appendChild(opt);
  });
}

function openPopover() {
  const trigger = document.getElementById('quality-trigger');
  const popover = document.getElementById('quality-popover');
  if (!trigger || !popover) return;
  trigger.setAttribute('aria-expanded', 'true');
  popover.classList.add('is-open');
  // Focus selected or first
  const sel = popover.querySelector('.is-selected');
  if (sel) sel.focus();
}

function closePopover() {
  const trigger = document.getElementById('quality-trigger');
  const popover = document.getElementById('quality-popover');
  if (!trigger || !popover) return;
  trigger.setAttribute('aria-expanded', 'false');
  popover.classList.remove('is-open');
}

document.addEventListener('DOMContentLoaded', async () => {
  await initLanguage();
  
  const qualitySelect = document.getElementById('quality-select');
  const qualityTrigger = document.getElementById('quality-trigger');
  const qualityPopover = document.getElementById('quality-popover');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const resetBtn = document.getElementById('reset-override');
  const currentQualityEl = document.getElementById('current-quality');

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const preferredQuality = stored[STORAGE_KEY] || DEFAULT_QUALITY;

  qualitySelect.value = preferredQuality;
  syncTrigger();
  renderQualityOptions();

  // Custom trigger events
  if (qualityTrigger && qualityPopover) {
    qualityTrigger.addEventListener('click', () => {
      const isOpen = qualityPopover.classList.contains('is-open');
      if (isOpen) closePopover(); else openPopover();
    });
    qualityTrigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPopover();
      }
      if (e.key === 'Escape') closePopover();
    });
    document.addEventListener('click', (e) => {
      if (!qualityTrigger.contains(e.target) && !qualityPopover.contains(e.target)) {
        closePopover();
      }
    });
  }

  qualitySelect.addEventListener('change', async () => {
    const newQuality = qualitySelect.value;
    await chrome.storage.local.set({ [STORAGE_KEY]: newQuality });
    syncTrigger();
    renderQualityOptions();
    updateStatus(true);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      await chrome.tabs.sendMessage(currentTab.id, { type: 'RESET_OVERRIDE' });
      resetBtn.textContent = t('resetOverrideSent');
      resetBtn.disabled = true;
      setTimeout(() => {
        resetBtn.textContent = t('resetOverrideButton');
        resetBtn.disabled = false;
        checkContentScriptStatus();
      }, 1000);
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  checkContentScriptStatus();
  startStatusPolling();
  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'QUALITY_STATUS') {
      updateStatus(message.active, message);
    }
  });
});

// Preserve sync on language change: also update quality labels if needed
function updateStatus(active, details = null) {
  const statusPill = document.getElementById('status-pill');
  const statusCard = document.getElementById('status-card');
  const statusCardValue = document.getElementById('status-card-value');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const currentQualityEl = document.getElementById('current-quality');
  const resetBtn = document.getElementById('reset-override');
  
  // Legacy dot for compat
  if (statusIndicator) statusIndicator.className = 'pill-dot';
  
  let state = 'standby';
  let pillText = t('statusInactive');
  let cardValue = '';
  let cardDesc = '';
  
  if (details) {
    if (details.userOverride) {
      state = 'overridden';
      pillText = t('statusManualOverride');
      cardValue = details.currentQuality || 'unknown';
      cardDesc = t('currentQualityLabel', [details.currentQuality || 'unknown']);
      if (resetBtn) resetBtn.style.display = 'block';
    } else if (active) {
      state = 'active';
      pillText = t('statusActive');
      cardValue = details.preferredQuality || '';
      cardDesc = t('preferredQualityDisplay', [details.preferredQuality]) + ' • ' + t('statusActive');
      // Simplify desc for card: show enforced
      cardDesc = t('statusActive');
      if (resetBtn) resetBtn.style.display = 'none';
    } else {
      state = 'standby';
      pillText = t('statusInactive');
      cardValue = details.preferredQuality || '';
      cardDesc = t('statusInactive');
      if (resetBtn) resetBtn.style.display = 'none';
    }
  } else {
    state = active ? 'active' : 'standby';
    pillText = active ? t('statusActive') : t('statusInactive');
    cardValue = '';
    cardDesc = pillText;
    if (resetBtn) resetBtn.style.display = 'none';
  }
  
  if (statusPill) statusPill.setAttribute('data-state', state);
  if (statusCard) statusCard.setAttribute('data-state', state);
  if (statusText) statusText.textContent = pillText;
  if (statusCardValue) statusCardValue.textContent = cardValue || document.getElementById('quality-value')?.textContent || '';
  if (currentQualityEl) currentQualityEl.textContent = cardDesc;
  // Keep legacy currentQualityEl in sync for tests
}

async function checkContentScriptStatus() {
  if (!currentTab?.id) {
    updateStatus(false);
    return;
  }
  const isYouTubeVideo = /youtube\.com\/(watch|shorts|embed|live)/.test(currentTab.url || '');
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'PING' });
    if (response?.ready) {
      updateStatus(true, response);
      return;
    }
    // PING returned not-ready but we are on a YouTube video page -> show standby with preferred quality
    if (isYouTubeVideo) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      updateStatus(true, { preferredQuality: stored[STORAGE_KEY] || DEFAULT_QUALITY, active: true });
    } else {
      updateStatus(false);
    }
  } catch {
    if (isYouTubeVideo) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      updateStatus(true, { preferredQuality: stored[STORAGE_KEY] || DEFAULT_QUALITY, active: true });
    } else {
      updateStatus(false);
    }
  }
}

function startStatusPolling() {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
  statusCheckInterval = setInterval(checkContentScriptStatus, 3000);
}

window.addEventListener('beforeunload', () => {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
});