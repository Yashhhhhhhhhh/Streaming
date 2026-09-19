# SyncWatch — Project Architecture & Agent Guidelines

## 🎯 Mission & Core Directives
SyncWatch is an ultra-premium, zero-lag synchronized streaming platform designed for long-distance watch parties (films, anime, serials) with studio-grade audio/video fidelity.

- **Zero-Emoji Rule**: 100% SVG vector insignia only. Never inject unicode emojis anywhere in HTML, CSS, JS, or user-facing strings.
- **Cinema Room Sanctuary**: The `cinema` room is the permanent couple room. It must NEVER be deleted during empty room cleanups, and `uploads/cinema/` must always be preserved.
- **Dual-Local 4K Philosophy**: Users can pick the same local file on both ends to watch in uncompressed 4K/60fps with 0 server bandwidth, locked in sync over WebSockets.
- **Strictly Debugging & Craft**: Prioritize deep reliability, zero memory leaks, smooth 60fps animations, and military-precision design over bloat.

---

## 📂 Codebase File Map

```
server.js          - Express + Socket.IO server; handles room state, 206 partial streaming, upload sanitation, and permanent cinema room
watch.js           - Cloudflare tunnel runner; writes tunnel-status.json, manages processes via taskkill on Windows
public/
  index.html       - Single-page application DOM; landing page, modals, video player wrapper, telemetry capsule, sidebar
  css/
    themes.css     - Token architecture for 5 AOT themes (Scout, Wall Maria, Rumbling, Coordinate, Recon) in Obsidian Slate Glass
    player.css     - Video player overlay, optical shadow vignette (no backdrop blur), custom controls, subtitles, ambient glow
    app.css        - Global layout, room header, telemetry capsule, media-info-bar, responsive containers
    chat.css       - Sidebar comms deck, segmented pill tabs, tactical status chips, micro-reaction bar, Gemini AI panel
    animations.css - Keyframe animations (pulse, float, slide, fade, glow)
  js/
    app.js         - Room join/create, socket event dispatch, drag & drop media router, Gemini AI companion, theme cycler, sidebar toggle
    player.js      - Video player engine: drift-sync protocol (2.5s heartbeat), Web Audio 200% booster, wake lock, subtitles, hotkeys
    chat.js        - Comms controller: Markdown parser, tactical chips, typing indicators, auto-scroll
    voicechat.js   - WebRTC voice comms with ICE candidate buffering and graceful teardown
    particles.js   - Canvas particle engine; auto-pauses when tab is hidden or inside room page
    insignia.js    - Pure SVG vector insignia library for avatars, reactions, badges, toasts
docs/
  index.html       - GitHub Pages permanent redirect gateway (polls tunnel-status.json for live partner tunnel)
```

---

## 🎨 Attack on Titan Design System & Themes

| Theme Key | Visual Mood | Accents |
| :--- | :--- | :--- |
| `scout` (Default) | Deep Obsidian Charcoal (`#080a0c`, `#0d1115`) | Tactical Emerald (`#22c55e`), Antique Brass (`#c5a059`), Survey Navy (`#1e2b58`) |
| `wall` | Weathered Basalt Monolith (`#0d0f12`, `#13171c`) | Distressed Amber Bronze (`#d97706`), Cold Granite (`#78716c`) |
| `rumbling` | Volcanic Obsidian Ash (`#0a0808`, `#140f0f`) | Molten Magma Core (`#ea580c`), Smoldering Ember (`#f97316`) |
| `coordinate` | Infinite Starlit Cosmic Void (`#040711`, `#080f21`) | Celestial Paths Cyan (`#0284c7`, `#38bdf8`), Aurora Violet |
| `recon` | Stealth Carbon Matte (`#070709`, `#0f1014`) | Precision Blade Steel (`#94a3b8`), Scout Neon Green (`#22c55e`) |

---

## ⌨️ Primary Keyboard Shortcuts

- `Space` / `K`: Play / Pause toggle
- `Left` / `Right`: Rewind / Fast-forward 10s
- `Up` / `Down`: Volume +/- 10%
- `M`: Mute / Unmute
- `F`: Fullscreen toggle
- `T`: Theater mode toggle
- `C`: Sidebar collapse / expand toggle
- `P`: Picture-in-Picture (PiP)
- `B`: Audio Booster (100% &rarr; 150% &rarr; 200%)
- `[` / `]`: Subtitle delay offset (-0.5s / +0.5s)

---

## 🧪 Verification Standard

Always run before finalizing any changes:
```bash
node --check server.js watch.js public/js/*.js
```
All files must exit with code `0`.
