# 🎬 SyncWatch — Watch Together

A premium synchronized watch-together streaming platform. Watch movies, series, and anime with your loved ones in perfect sync, no matter where you are.

![SyncWatch](https://img.shields.io/badge/SyncWatch-Premium-6366f1?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?style=for-the-badge&logo=socket.io)
![WebRTC](https://img.shields.io/badge/WebRTC-Voice_Chat-333333?style=for-the-badge&logo=webrtc)

## ✨ Features

### 🎥 Synchronized Playback
- **Zero-lag sync** — Play, pause, seek, and speed changes are instantly mirrored
- **HD streaming** — Full quality video with HTTP range-based seeking
- **Subtitle support** — Upload SRT/VTT subtitles that sync for both viewers
- **Playback controls** — Custom player with keyboard shortcuts

### 💬 Communication
- **Real-time chat** — Send messages, emojis, and reactions
- **Voice chat** — WebRTC-based voice communication with echo cancellation
- **Typing indicators** — See when your partner is typing
- **Floating reactions** — Send emoji reactions that float across the screen

### 🎨 Premium UI/UX
- **5 stunning themes** — Midnight, Aurora, Sakura, Emerald, Sunset
- **Glassmorphism design** — Beautiful frosted glass effects
- **Particle backgrounds** — Interactive animated particles
- **Smooth animations** — Polished transitions and micro-interactions

### 📺 Video Player
- **Custom controls** — Progress bar with buffer indicator, volume slider, speed control
- **Keyboard shortcuts** — Space/K (play/pause), J/L (±10s), F (fullscreen), M (mute), T (theater), P (PiP)
- **Theater mode** — Expand video to fill the screen
- **Picture-in-Picture** — Watch while doing other things
- **Drag & drop** — Drop video files directly into the browser

### 🔧 Technical
- **Room system** — Create rooms with shareable codes/links
- **Auto-cleanup** — Empty rooms are cleaned up after 30 minutes
- **10GB file support** — Upload large video files
- **Responsive design** — Works on any screen size

## 🚀 Quick Start (Watch Together From Anywhere)

### Option A: 1-Click Remote Watch Party (Recommended for Laptop + Remote Partner)
Simply double-click `start-watch-party.bat` or run:

```bash
npm run watch
```

This single command:
1. Starts the local video streaming server on `http://localhost:3000` (for you).
2. Spawns an encrypted, zero-config **Cloudflare Remote Tunnel** giving you a public HTTPS link (e.g. `https://random-id.trycloudflare.com`).
3. Automatically copies the remote link to your clipboard!
4. Automatically opens `http://localhost:3000` in your browser.
5. Just send the copied link to your partner — she opens it on her laptop anywhere in the world and joins instantly!

---

### Option B: Standard Local Server
```bash
npm start
```
Runs the server locally at `http://localhost:3000`.

---

## ⚡ Two Streaming Modes: Zero Compromise Quality

1. **Host Stream Mode**:
   - You upload a video file from your laptop.
   - It streams to your partner over the secure tunnel with HTTP 206 range seeking.
   - 0s local upload transfer for you on localhost, up to 10GB+.

2. **Dual-Local Sync Mode (Zero Bandwidth / Pure 4K 60fps)**:
   - If both of you have the video file downloaded on your laptops (or shared beforehand via Google Drive/Telegram), both of you click **"Local File"**.
   - The browser plays the file directly from each laptop's SSD with **0 network bandwidth and 0 buffering**.
   - The room perfectly synchronizes play, pause, seek, speed, real-time chat, and WebRTC voice chat!

## 🎹 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `J` / `←` | Rewind 10 seconds |
| `L` / `→` | Forward 10 seconds |
| `↑` / `↓` | Volume up / down |
| `F` | Toggle fullscreen |
| `M` | Toggle mute |
| `T` | Toggle theater mode |
| `P` | Toggle Picture-in-Picture |

## 🎨 Themes

Switch themes by clicking the 🎨 button in the room header:

- **Midnight** — Deep indigo with purple accents
- **Aurora** — Dark cyan with blue tones
- **Sakura** — Dark rose with pink accents
- **Emerald** — Forest green with mint highlights
- **Sunset** — Warm amber with orange glow

## 🏗️ Tech Stack

- **Backend**: Node.js + Express
- **Real-time sync**: Socket.IO (WebSocket)
- **Voice chat**: WebRTC with STUN servers
- **Video streaming**: HTTP Range Requests
- **File upload**: Multer
- **Frontend**: Vanilla HTML/CSS/JS (no framework bloat!)
- **Styling**: CSS Custom Properties, Glassmorphism, CSS Animations

## 📁 Project Structure

```
├── server.js            # Express + Socket.IO server
├── package.json
├── .gitignore
├── public/
│   ├── index.html       # Main HTML (SPA)
│   ├── css/
│   │   ├── themes.css   # 5 color themes with CSS variables
│   │   ├── app.css      # Layout, modals, sidebar, general UI
│   │   ├── player.css   # Custom video player styles
│   │   ├── chat.css     # Chat bubbles, reactions, input
│   │   └── animations.css # Keyframe animations
│   └── js/
│       ├── app.js       # Main app controller, socket events, room management
│       ├── player.js    # Video player controller with sync
│       ├── chat.js      # Chat system with formatting
│       ├── voicechat.js # WebRTC voice chat
│       └── particles.js # Animated background particles
└── uploads/             # Uploaded media files (auto-created)
```

## 📝 License

MIT License — feel free to use, modify, and share!

---

Made with ❤️ for watching together, apart.
