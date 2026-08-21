# Qontrol — YouTube Quality Controller

> Premium Chrome Extension for persistent YouTube playback quality. Futuristic dark UI, Vazirmatn, EN/FA.

![Version](https://img.shields.io/badge/version-1.6.8-3B82F6) ![Manifest](https://img.shields.io/badge/manifest-V3-111318) ![License](https://img.shields.io/badge/license-MIT-9AA1AE)

## Features
- 144p → 4320p (8K) with intelligent fallback
- Auto-enforce on new video / SPA navigation
- Manual override respected per-video
- Persistent via `chrome.storage.local`
- Premium dark UI (360×480), glass, Vazirmatn
- i18n: English / فارسی (RTL) with in-popup switch

## Install (Unpacked)
1. `chrome://extensions` → Developer mode ON
2. Load unpacked → select this folder
3. Refresh YouTube tabs

## Usage
Popup → Preferred Quality → Auto-applies. Manual change in YouTube player overrides for current video. Use `Reset Manual Override` to re-enable.

## Structure
```
manifest.json
background/service-worker.js
content/youtube.js (isolated) + injected.js (page world, player API)
popup/{popup.html,popup.css,popup.js}
_locales/{en,fa}/messages.json
icons/icon.svg + icon16/32/48/128.png
```

## Tech
Manifest V3, `getAvailableQualityLevels` / `setPlaybackQualityRange`, `postMessage` bridge, History API + MutationObserver for SPA, `chrome.storage`.

## License
MIT
