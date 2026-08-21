const STORAGE_KEY = 'youtube-quality-preference';
const DEFAULT_QUALITY = '1080p';

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored[STORAGE_KEY]) await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_QUALITY });
});

chrome.runtime.onMessage.addListener((msg, _, send) => {
  if (msg.type === 'PING') { send({ ready: true }); return true; }
  return false;
});