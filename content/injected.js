// Injected script - runs in page context to access YouTube player API
(function() {
  'use strict';
  
  const YOUTUBE_QUALITY_EVENT = 'yt-quality-control-event';
  const YOUTUBE_QUALITY_REQUEST = 'yt-quality-control-request';
  
  let player = null;
  let playerReady = false;
  let currentVideoId = null;
  let preferredQuality = '1080p';
  let userOverride = false;
  let isApplyingQuality = false;
  let qualityCheckInterval = null;
  let lastAppliedQuality = null;
  let pendingQualityChange = false;
  let consecutiveFailures = 0;
  const MAX_FAILURES = 10;
  let pendingPreferenceChange = null;
  
  const YT_QUALITY_MAP = {
    'hd2160': '2160p', 'hd1440': '1440p', 'hd1080': '1080p', 'hd720': '720p',
    'large': '480p', 'medium': '360p', 'small': '240p', 'tiny': '144p',
    'auto': 'auto', 'highres': '2160p', 'hd2880': '2880p', 'hd4320': '4320p'
  };
  
  const REVERSE_YT_QUALITY_MAP = Object.fromEntries(
    Object.entries(YT_QUALITY_MAP).map(([k, v]) => [v, k])
  );
  
  const QUALITY_ORDER = [
    '144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', '4320p'
  ];
  
  function qualityToIndex(quality) {
    return QUALITY_ORDER.indexOf(quality);
  }
  
  function ytToStandard(ytQuality) {
    return YT_QUALITY_MAP[ytQuality] || ytQuality;
  }
  
  function standardToYt(standardQuality) {
    return REVERSE_YT_QUALITY_MAP[standardQuality] || standardQuality;
  }
  
  function findBestAvailableQuality(availableQualities, targetQuality) {
    if (!availableQualities || availableQualities.length === 0) return null;
    const standardAvailable = availableQualities.map(ytToStandard).filter(q => QUALITY_ORDER.includes(q));
    if (standardAvailable.length === 0) return null;
    const targetIndex = qualityToIndex(targetQuality);
    if (targetIndex === -1) {
      const bestStd = standardAvailable.reduce((a, b) => qualityToIndex(a) > qualityToIndex(b) ? a : b);
      return availableQualities.find(q => ytToStandard(q) === bestStd) || availableQualities[0];
    }
    let bestMatch = null, bestIndex = -1;
    for (const q of availableQualities) {
      const std = ytToStandard(q);
      const idx = qualityToIndex(std);
      if (idx <= targetIndex && idx > bestIndex) {
        bestIndex = idx;
        bestMatch = q;
      }
    }
    if (!bestMatch) {
      bestMatch = availableQualities.reduce((a, b) => qualityToIndex(ytToStandard(a)) < qualityToIndex(ytToStandard(b)) ? a : b);
    }
    return bestMatch;
  }
  
  function getPlayerAPI() {
    if (window.ytplayer && typeof window.ytplayer.getAvailableQualityLevels === 'function') {
      return window.ytplayer;
    }
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && typeof moviePlayer.getAvailableQualityLevels === 'function') {
      return moviePlayer;
    }
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el && typeof el.getAvailableQualityLevels === 'function') {
        return el;
      }
    }
    const iframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
    for (const iframe of iframes) {
      try {
        if (iframe.contentWindow && iframe.contentWindow.ytplayer) {
          return iframe.contentWindow.ytplayer;
        }
      } catch (e) {}
    }
    return null;
  }
  
  function getVideoElement() {
    return document.querySelector('video.html5-main-video') || 
           document.querySelector('video[class*="html5"]') || 
           document.querySelector('video');
  }
  
  function waitForPlayer(maxAttempts = 150, interval = 200) {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        const api = getPlayerAPI();
        const video = getVideoElement();
        const hasPlayerAPI = api && typeof api.getAvailableQualityLevels === 'function';
        const videoReady = video && video.readyState >= 1;
        if (hasPlayerAPI || videoReady) {
          player = api;
          playerReady = true;
          resolve(player);
        } else if (attempts >= maxAttempts) {
          resolve(null);
        } else {
          attempts++;
          setTimeout(check, interval);
        }
      };
      check();
    });
  }
  
  function waitForQualitiesReady(maxAttempts = 30, interval = 200) {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        const q = getAvailableQualities();
        if (q && q.length > 0) {
          const targetIndex = qualityToIndex(preferredQuality);
          if (targetIndex >= qualityToIndex('720p')) {
            const standardQ = q.map(ytToStandard);
            const hasTargetOrHigher = standardQ.some(sq => qualityToIndex(sq) >= targetIndex);
            const hasAtLeast720p = standardQ.some(sq => qualityToIndex(sq) >= qualityToIndex('720p'));
            if (hasTargetOrHigher || hasAtLeast720p || attempts >= maxAttempts) {
              resolve(q);
            } else {
              attempts++;
              setTimeout(check, interval);
            }
          } else {
            resolve(q);
          }
        } else if (attempts >= maxAttempts) {
          resolve([]);
        } else {
          attempts++;
          setTimeout(check, interval);
        }
      };
      check();
    });
  }
  
  function getAvailableQualities() {
    if (!player) return [];
    try {
      if (typeof player.getAvailableQualityLevels === 'function') {
        const q = player.getAvailableQualityLevels();
        if (q && q.length) return q;
      }
    } catch (e) {}
    try {
      const video = getVideoElement();
      if (video && video.getVideoQualityData) {
        const data = video.getVideoQualityData();
        if (data && data.qualityLevels) {
          return data.qualityLevels.map(l => l.quality);
        }
      }
    } catch (e) {}
    return [];
  }
  
  function getCurrentQuality() {
    if (!player) return null;
    try {
      if (typeof player.getPlaybackQuality === 'function') {
        const q = player.getPlaybackQuality();
        return q ? ytToStandard(q) : null;
      }
    } catch (e) {}
    return null;
  }
  
  function setPlaybackQuality(quality) {
    if (!player) return false;
    const ytQuality = standardToYt(quality);
    try {
      if (typeof player.setPlaybackQualityRange === 'function') {
        player.setPlaybackQualityRange(ytQuality, ytQuality);
        return true;
      }
      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(ytQuality);
        return true;
      }
    } catch (e) {}
    return false;
  }
  
  function handlePreferenceChange(newQuality) {
    preferredQuality = newQuality;
    userOverride = false;
    pendingPreferenceChange = null;
    applyPreferredQuality();
  }
  
  function applyPreferredQuality() {
    if (isApplyingQuality || userOverride) return false;
    
    if (!playerReady) {
      pendingPreferenceChange = preferredQuality;
      return false;
    }
    
    const available = getAvailableQualities();
    if (!available.length) {
      consecutiveFailures++;
      return false;
    }
    consecutiveFailures = 0;
    
    const bestYt = findBestAvailableQuality(available, preferredQuality);
    if (!bestYt) return false;
    const bestStd = ytToStandard(bestYt);
    
    const current = getCurrentQuality();
    if (current && current === bestStd) {
      lastAppliedQuality = bestStd;
      return true;
    }
    
    const targetIndex = qualityToIndex(preferredQuality);
    const bestIndex = qualityToIndex(bestStd);
    if (targetIndex >= qualityToIndex('720p') && bestIndex < targetIndex - 1 && consecutiveFailures < 2) {
      consecutiveFailures++;
      setTimeout(applyPreferredQuality, 1000);
      return false;
    }
    
    isApplyingQuality = true;
    pendingQualityChange = true;
    
    const ok = setPlaybackQuality(bestStd);
    
    setTimeout(() => {
      isApplyingQuality = false;
      setTimeout(() => {
        pendingQualityChange = false;
        const now = getCurrentQuality();
        if (now) lastAppliedQuality = now;
      }, 2000);
    }, 1000);
    return ok;
  }
  
  function retryApplyOnCurrentVideo() {
    if (!playerReady || userOverride) return;
    applyPreferredQuality();
  }
  
  function checkQualityChange() {
    if (!playerReady || isApplyingQuality || pendingQualityChange) return;
    const current = getCurrentQuality();
    if (!current || current === 'unknown') return;
    const available = getAvailableQualities();
    if (!available.length) return;
    
    if (lastAppliedQuality && lastAppliedQuality !== 'unknown' && current !== lastAppliedQuality) {
      userOverride = true;
      notifyStatus();
    }
    if (current && current !== 'unknown') lastAppliedQuality = current;
  }
  
  function resetForNewVideo(videoId) {
    currentVideoId = videoId;
    userOverride = false;
    lastAppliedQuality = null;
    pendingQualityChange = false;
    isApplyingQuality = false;
    consecutiveFailures = 0;
    if (qualityCheckInterval) clearInterval(qualityCheckInterval);
    playerReady = false;
    player = null;
    
    // Ask content script for latest preference (proxy to storage)
    window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'getPreference' }, '*');
    
    waitForPlayer().then(() => {
      if (player) {
        waitForQualitiesReady().then(() => {
          if (playerReady) {
            qualityCheckInterval = setInterval(checkQualityChange, 1000);
            if (pendingPreferenceChange !== null) {
              preferredQuality = pendingPreferenceChange;
              pendingPreferenceChange = null;
            }
            applyPreferredQuality();
          }
        });
      }
    });
  }
  
  function detectVideoId() {
    const v = new URLSearchParams(location.search).get('v');
    if (v) return v;
    const parts = location.pathname.split('/');
    for (const key of ['watch', 'shorts', 'embed', 'live']) {
      const i = parts.indexOf(key);
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
    }
    if (window.ytInitialData) {
      try {
        const m = JSON.stringify(window.ytInitialData).match(/"videoId":"([^"]+)"/);
        if (m) return m[1];
      } catch {}
    }
    return null;
  }
  
  function notifyStatus() {
    const detail = { ready: playerReady, active: playerReady && !userOverride, currentVideo: currentVideoId, preferredQuality, userOverride, currentQuality: getCurrentQuality() };
    window.dispatchEvent(new CustomEvent(YOUTUBE_QUALITY_EVENT, { detail }));
    // Also postMessage for isolated world listeners that don't catch CustomEvent
    try { window.postMessage({ type: YOUTUBE_QUALITY_EVENT, detail }, '*'); } catch {}
  }
  
  window.addEventListener('message', (e) => {
    if (e.data?.type !== YOUTUBE_QUALITY_REQUEST) return;
    const { action, quality } = e.data;
    if (action === 'setPreference') { 
      handlePreferenceChange(quality);
    }
    else if (action === 'getStatus') notifyStatus();
    else if (action === 'resetOverride') { userOverride = false; applyPreferredQuality(); }
    else if (action === 'preferenceResponse') {
      if (quality) {
        preferredQuality = quality;
        if (pendingPreferenceChange !== null) {
          preferredQuality = pendingPreferenceChange;
          pendingPreferenceChange = null;
        }
      }
    }
  });
  
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) { lastHref = location.href; const v = detectVideoId(); if (v && v !== currentVideoId) resetForNewVideo(v); }
  }).observe(document, { subtree: true, childList: true });
  
  ['pushState', 'replaceState'].forEach(k => {
    const orig = history[k];
    history[k] = function(...a) { orig.apply(this, a); setTimeout(() => { const v = detectVideoId(); if (v && v !== currentVideoId) resetForNewVideo(v); }, 0); };
  });
  addEventListener('popstate', () => setTimeout(() => { const v = detectVideoId(); if (v && v !== currentVideoId) resetForNewVideo(v); }, 0));
  addEventListener('visibilitychange', () => { if (!document.hidden && playerReady) { const v = detectVideoId(); if (v && v !== currentVideoId) resetForNewVideo(v); else retryApplyOnCurrentVideo(); } });
  
  // Init - request preference from content script (which reads storage)
  window.postMessage({ type: YOUTUBE_QUALITY_REQUEST, action: 'getPreference' }, '*');
  
  const vid = detectVideoId();
  if (vid) {
    waitForPlayer().then(() => {
      if (player) {
        waitForQualitiesReady().then(() => {
          if (playerReady) {
            qualityCheckInterval = setInterval(checkQualityChange, 1000);
            if (pendingPreferenceChange !== null) {
              preferredQuality = pendingPreferenceChange;
              pendingPreferenceChange = null;
            }
            applyPreferredQuality();
          }
        });
      }
    });
  }
  
  notifyStatus();
})();