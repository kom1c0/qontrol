# qontrol — YouTube Quality Controller

**qontrol** is a lightweight Chrome extension that automatically sets your preferred YouTube video quality — every time, on every video — and politely steps aside when you make a manual change.

No more manually selecting 1080p/4K for every single video. Pick your preferred quality once, and qontrol applies it to all YouTube videos while respecting your manual adjustments.

---

## ✨ Features

- **Automatic quality enforcement** — your preferred quality is applied on every video automatically
- **Smart fallback** — if the preferred quality isn't available, the best available quality *at or below* it is selected (never upscales)
- **Respects manual changes** — when you change quality yourself, qontrol detects it and stops overriding; a one-click **Reset Manual Override** button brings automation back
- **Live status indicator** — the popup shows at a glance whether control is Active, in Standby, or in Manual Override mode, plus the currently enforced quality
- **Bilingual UI** — English and فارسی (Persian) with full RTL layout support; auto-detects your browser language
- **Works everywhere on YouTube** — regular videos, Shorts, embedded players, and live streams
- **SPA-aware** — correctly handles YouTube's single-page navigation (next video, related videos, history) without reloads
- **Zero data collection** — all settings are stored locally in your browser (`chrome.storage.local`); no analytics, no network calls to third parties

### Supported qualities

| Quality | Label |
|---|---|
| 144p | Tiny |
| 240p | Small |
| 360p | SD |
| 480p | SD |
| 720p | HD |
| **1080p** | **Full HD (default)** |
| 1440p | 2K QHD |
| 2160p | 4K UHD |
| 4320p | 8K UHD |

---

## 📦 Installation

### From source (unpacked)

1. Clone the repository:
   ```bash
   git clone https://github.com/kom1c0/qontrol.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `qontrol` folder
5. Pin the extension's icon and open the popup to set your preferred quality

> The extension is Manifest V3 and runs a background **service worker** — no persistent background page.

---

## 🚀 Usage

1. Open any YouTube video page and click the **qontrol** icon
2. Use the **Preferred Quality** selector to pick from 144p up to 4320p (8K)
3. The selection is saved instantly and enforced on the current and all future videos
4. If you manually change the quality in YouTube's settings, qontrol switches to **Manual override** mode and stops interfering
5. To resume automation, click **Reset Manual Override** in the popup

### Status states

| State | Meaning |
|---|---|
| **Active** | qontrol is enforcing your preferred quality |
| **Standby** | Not on a YouTube video page (no video to control) |
| **Manual override** | You changed quality manually — automation paused until you reset |

---

## 🏗️ Architecture

qontrol follows the standard three-tier Manifest V3 model, with a page-context bridge to reach YouTube's internal player:

```
┌────────────────────────────────────────────────────────────┐
│ popup/                    UI (preferred quality, status)   │
│   popup.html / .css / .js                                  │
│        │ chrome.storage.local  ·  chrome.tabs.sendMessage  │
├────────┼───────────────────────────────────────────────────┤
│ background/               Service worker (MV3)             │
│   service-worker.js       defaults, message relay          │
├────────┼───────────────────────────────────────────────────┤
│ content/youtube.js        Content script (isolated world)  │
│                           SPA navigation watch, bridge     │
│        │ window.postMessage (cross-world)                  │
├────────┼───────────────────────────────────────────────────┤
│ content/injected.js       Page context (MAIN world)        │
│                           YouTube player API control       │
└────────────────────────────────────────────────────────────┘
```

- **Popup** — the user interface. Reads/writes the preferred quality and language, and polls the active tab for live status.
- **Service worker** — initializes storage defaults and relays runtime messages.
- **Content script (`youtube.js`)** — injected at `document_start` on all `youtube.com` URLs. Detects SPA navigation (`MutationObserver` + `history.pushState/replaceState` + `popstate`), injects the page script, and bridges messages between the extension and the page.
- **Page script (`injected.js`)** — runs in the page's own JS context so it can access YouTube's internal player object. It:
  - locates the player API (`window.ytplayer`, `#movie_player`, or an embedded iframe),
  - waits until quality levels are fully loaded (adaptive streaming ramps up gradually),
  - resolves the best available level at or below the preference,
  - applies it via `setPlaybackQualityRange` / `setPlaybackQuality`,
  - monitors playback quality every second to detect **manual user changes**,
  - resets its state when the video changes (next video, Shorts, live), including on tab visibility change.

### How quality selection works

1. The available levels from YouTube (e.g. `hd2160`, `hd1080`, `medium`) are mapped to a standard scale (`2160p`, `1080p`, `360p`, …).
2. The highest available level **≤ preferred quality** is chosen — the extension never raises the quality above your preference.
3. If the target level is still buffering / not yet offered by YouTube (common on 720p+), it retries briefly before settling on the best current level.
4. Any quality change made by the user is detected within ~1 second and pauses automation until you reset.

---

## 📁 Project Structure

```
qontrol/
├── manifest.json             # Manifest V3 definition
├── background/
│   └── service-worker.js     # MV3 service worker
├── content/
│   ├── youtube.js            # Content script (isolated world)
│   └── injected.js           # Page-context player controller
├── popup/
│   ├── popup.html            # Popup UI
│   ├── popup.css             # Dark theme, RTL support
│   ├── popup.js              # Popup logic
│   └── fonts/                # Self-hosted Vazirmatn (woff2)
├── _locales/
│   ├── en/messages.json      # English strings
│   └── fa/messages.json      # Persian strings
└── icons/                    # 16 / 32 / 48 / 128 / 256 + SVG source
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Platform | **Chrome Extension — Manifest V3** (service worker, no persistent background) |
| Language | **Vanilla JavaScript (ES2020+)** — no frameworks, no build step |
| Chrome APIs | `chrome.runtime` (messaging, lifecycle), `chrome.storage.local` (persistence), `chrome.tabs` (active-tab status), `chrome.scripting`, `chrome.i18n` |
| YouTube integration | YouTube's internal **player API** — `getAvailableQualityLevels()`, `getPlaybackQuality()`, `setPlaybackQualityRange()`, `setPlaybackQuality()` (resolved across main page, `#movie_player`, and embedded iframes) |
| Cross-world communication | `window.postMessage` + `CustomEvent` between isolated world and page context; `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` between extension contexts |
| SPA navigation handling | `MutationObserver`, `history.pushState/replaceState` hooks, `popstate`, `visibilitychange` |
| UI | **HTML5 + CSS3** — custom-built popover selector (no libraries), CSS custom properties, dark "premium" theme |
| Typography | **Vazirmatn** (self-hosted, woff2) — Regular / Medium / SemiBold / Bold |
| Internationalization | `chrome.i18n` + `_locales/{en,fa}/messages.json`, runtime language switching with **RTL** layout |
| Packaging | Unpacked distribution (no bundler, no dependencies) |

---

## 🔐 Permissions

| Permission | Why |
|---|---|
| `storage` | Persist your preferred quality and UI language locally |
| `tabs` | Query the active tab to show live status in the popup |
| `scripting` | Programmatic content-script control (MV3) |
| `https://*.youtube.com/*` (host) | Inject the quality controller only on YouTube pages |

No other sites are accessed. No data leaves your browser.

---

## 🌍 Browser Support

- **Google Chrome** and **Chromium-based browsers** (Edge, Brave, Opera, Vivaldi…) — version 88+ (Manifest V3 requires 88+, recommended 102+)
- Firefox is not supported (requires WebExtension MV3 + `browser` API shims)

---

## 🌐 Localization

The UI ships with **English** and **Persian (فارسی)**. The browser UI language is auto-detected, and the language can be changed at any time from the popup. To add a language, create `_locales/<code>/messages.json` mirroring the English keys and add the code to the popup's language selector.

---

## 📄 License

© kom1c0. All rights reserved.
