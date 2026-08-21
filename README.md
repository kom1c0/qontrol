# qontrol — YouTube Quality Controller

A lightweight Chrome extension that automatically enforces your preferred YouTube video quality and politely respects your manual changes. Set it once — it applies to every video.

## Features

- Automatic quality enforcement on every video (default: 1080p)
- Smart fallback — best available quality **at or below** your preference; never upscales
- Detects manual quality changes and pauses automation; one-click **Reset Manual Override**
- Live status in the popup: Active / Standby / Manual override
- Works on regular videos, Shorts, embedded players, and live streams; handles YouTube's SPA navigation
- Bilingual UI — English and فارسی with full RTL support; auto-detects browser language
- No data collection — everything is stored locally (`chrome.storage.local`)

**Supported qualities:** 144p – 4320p (8K)

## Installation

1. Clone this repository (or download the source)
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `qontrol` folder
4. Pin the icon and set your preferred quality

## Usage

- Pick your preferred quality in the popup — it is saved instantly and enforced on the current and all future videos
- Manually change quality in YouTube's settings → qontrol switches to **Manual override** and stops interfering
- Click **Reset Manual Override** to resume automation

## Architecture

Three-tier Manifest V3 design with a page-context bridge to reach YouTube's player:

| Layer | File | Role |
|---|---|---|
| Popup | `popup/` | UI — reads/writes preference and language, polls active tab for live status |
| Service worker | `background/service-worker.js` | MV3 worker — storage defaults, message relay |
| Content script | `content/youtube.js` | Isolated world — watches SPA navigation, injects page script, bridges messages |
| Page script | `content/injected.js` | Page context — accesses the YouTube player API (`getAvailableQualityLevels`, `setPlaybackQualityRange`…), applies quality, detects manual changes, resets per video |

Cross-world messaging uses `window.postMessage` + `CustomEvent`; extension-to-extension uses `chrome.runtime` / `chrome.tabs` messaging.

## Tech Stack

- **Chrome Extension — Manifest V3** (service worker, no persistent background page)
- **Vanilla JavaScript (ES2020+)** — no frameworks, no build step
- **Chrome APIs** — `runtime`, `storage.local`, `tabs`, `scripting`, `i18n`
- **YouTube player API** — resolved across main page, `#movie_player`, and embedded iframes
- **SPA handling** — `MutationObserver`, `pushState/replaceState` hooks, `popstate`, `visibilitychange`
- **UI** — HTML5 + CSS3, custom popover selector (no libraries), dark theme
- **Typography** — Vazirmatn (self-hosted woff2)
- **i18n** — `chrome.i18n` + `_locales/{en,fa}`, runtime language switching with RTL

## Permissions

| Permission | Why |
|---|---|
| `storage` | Persist preferred quality and language locally |
| `tabs` | Live status of the active tab in the popup |
| `scripting` | MV3 content-script control |
| `https://*.youtube.com/*` | Inject only on YouTube pages |

## Browser Support

Chrome and Chromium-based browsers (Edge, Brave, Opera, Vivaldi) — version 88+. Firefox is not supported.

## Localization

Ships with **English** and **Persian**. Browser language is auto-detected and can be changed from the popup. To add a language, create `_locales/<code>/messages.json` mirroring the English keys.