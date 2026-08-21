// Content script - runs in isolated world, injects the page script
(function() {
  'use strict';
  
  const YOUTUBE_QUALITY_EVENT = 'yt-quality-control-event';
  const YOUTUBE_QUALITY_REQUEST = 'yt-quality-control-request';
  const STORAGE_KEY = 'youtube-quality-preference';
  
  let injected = false;
  let isYouTubeWatchPage = false;
  
  function injectScript() {
    if (injected) return;
    injected = true;
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/injected.js');
    script.onload = () => {
      script.remove();
      // Send current preference to injected script after it loads
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const quality = result[STORAGE_KEY] || '1080p';
        window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'setPreference', quality }, '*');
      });
    };
    script.onerror = () => { injected = false; };
    (document.head || document.documentElement).appendChild(script);
  }
  
  function checkYouTubePage() {
    const hn = location.hostname, pn = location.pathname;
    isYouTubeWatchPage = (hn.includes('youtube.com') || hn === 'youtube.com') &&
      (pn.includes('/watch') || pn.includes('/shorts/') || pn.includes('/embed/') || pn.includes('/live/') || pn === '/');
    return isYouTubeWatchPage;
  }
  
  if (checkYouTubePage()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectScript);
    else injectScript();
  }
  
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      checkYouTubePage();
      if (isYouTubeWatchPage && !injected) injectScript();
    }
  }).observe(document, { subtree: true, childList: true });
  
  function forwardStatus(detail) {
    chrome.runtime.sendMessage({ type: 'QUALITY_STATUS', ...detail }).catch(() => {});
  }
  window.addEventListener(YOUTUBE_QUALITY_EVENT, (e) => {
    if (e.detail) forwardStatus(e.detail);
  });
  // Also handle postMessage-based status (for cross-world compatibility)
  window.addEventListener('message', (e) => {
    if (e.data?.type === YOUTUBE_QUALITY_EVENT && e.data.detail) {
      forwardStatus(e.data.detail);
      return;
    }
    if (e.data?.type !== YOUTUBE_QUALITY_REQUEST) return;
    if (e.data.action === 'getPreference') {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const quality = result[STORAGE_KEY] || '1080p';
        window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'preferenceResponse', quality }, '*');
      });
    }
  });
  
  chrome.runtime.onMessage.addListener((msg, _, send) => {
    if (msg.type === 'PING') {
      window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'getStatus' }, '*');
      const t = setTimeout(() => { cleanup(); send({ ready: false }); }, 800);
      const onEvent = (e) => { cleanup(); send({ ready: e.detail.ready }); };
      const onMessage = (e) => { if (e.data?.type === YOUTUBE_QUALITY_EVENT) { cleanup(); send({ ready: e.data.detail.ready }); } };
      const cleanup = () => { clearTimeout(t); window.removeEventListener(YOUTUBE_QUALITY_EVENT, onEvent); window.removeEventListener('message', onMessage); };
      window.addEventListener(YOUTUBE_QUALITY_EVENT, onEvent);
      window.addEventListener('message', onMessage);
      return true;
    }
    if (msg.type === 'PREFERENCE_CHANGED') {
      window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'setPreference', quality: msg.quality }, '*');
      send({ sent: true }); return true;
    }
    if (msg.type === 'RESET_OVERRIDE') {
      window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'resetOverride' }, '*');
      send({ sent: true }); return true;
    }
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      window.postMessage({ 
        type: YOUTUBE_QUALITY_REQUEST, 
        action: 'setPreference', 
        quality: changes[STORAGE_KEY].newValue 
      }, '*');
    }
  });
})();