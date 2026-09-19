const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  cors: { origin: '*' }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const safeRoom = path.basename(req.params.roomId || 'default');
    const roomDir = path.join(uploadsDir, safeRoom);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    cb(null, roomDir);
  },
  filename: (req, file, cb) => {
    // Sanitize originalname removing illegal Windows filename characters: \ / : * ? " < > |
    const safeOriginalName = path.basename(file.originalname).replace(/[/\\?%*:|"<>]/g, '_');
    const uniqueName = `${Date.now()}-${safeOriginalName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = mime.lookup(file.originalname) || '';
    const allowedExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.ts', '.m4v', '.m2ts', '.wmv', '.ogv', '.srt', '.vtt', '.ass', '.ssa', '.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg'];
    
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/') || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported: ${ext}. Supported: video, audio, and subtitles`), false);
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============ ROOM MANAGEMENT ============
const rooms = new Map();

function createRoom(hostName, customId = null) {
  const roomId = customId ? customId.toLowerCase().trim() : uuidv4().substring(0, 8);
  const room = {
    id: roomId,
    host: null,
    hostName: hostName || 'Host',
    members: new Map(),
    playlist: [],
    currentMedia: null,
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    createdAt: Date.now(),
    chat: [],
    subtitles: null
  };
  rooms.set(roomId, room);
  return roomId;
}

function getOrCreateRoom(roomId, hostName = 'Host') {
  const id = (roomId || 'cinema').toLowerCase().trim();
  let room = rooms.get(id);
  if (!room) {
    createRoom(hostName, id);
    room = rooms.get(id);
  }
  return room;
}

// Pre-initialize permanent couple cinema room
getOrCreateRoom('cinema', 'Yash');

// ============ API ROUTES ============

// Create room
app.post('/api/room/create', (req, res) => {
  const { hostName, customRoomId } = req.body;
  const roomId = createRoom(hostName, customRoomId);
  res.json({ roomId, success: true });
});

// Get room info
app.get('/api/room/:roomId', (req, res) => {
  const room = getOrCreateRoom(req.params.roomId);
  res.json({
    id: room.id,
    hostName: room.hostName,
    memberCount: room.members.size,
    playlist: room.playlist,
    currentMedia: room.currentMedia,
    isPlaying: room.isPlaying
  });
});

// Upload media
app.post('/api/room/:roomId/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const room = getOrCreateRoom(req.params.roomId);

  const mediaItem = {
    id: uuidv4().substring(0, 8),
    filename: req.file.originalname,
    path: `/api/stream/${req.params.roomId}/${req.file.filename}`,
    size: req.file.size,
    mimeType: mime.lookup(req.file.originalname) || 'video/mp4',
    uploadedAt: Date.now()
  };

  room.playlist.push(mediaItem);
  io.to(req.params.roomId).emit('playlist-updated', room.playlist);

  res.json({ success: true, media: mediaItem });
});

// Upload subtitles
app.post('/api/room/:roomId/subtitles', upload.single('media'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const room = getOrCreateRoom(req.params.roomId);

  const subtitlePath = `/api/stream/${req.params.roomId}/${req.file.filename}`;
  room.subtitles = subtitlePath;
  io.to(req.params.roomId).emit('subtitles-updated', subtitlePath);

  res.json({ success: true, path: subtitlePath });
});

// Latency ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ pong: Date.now() });
});

// ============ HYBRID AI COMPANION (Local Neural Core + Gemini Cloud) ============
const https = require('https');

function checkLocalLlmStatus(port = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    };

    const timer = setTimeout(() => {
      try { req.destroy(); } catch {}
      done({ available: false });
    }, 350);

    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/health'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          done({ available: true, model: json.model || 'local-llm', engine: json.engine || 'llama-cpp' });
        } catch {
          done({ available: true, model: 'local-llm', engine: 'llama-cpp' });
        }
      });
    });

    req.on('error', () => done({ available: false }));
  });
}

function queryLocalLlm({ prompt, mediaTitle, port = 8000, systemInstruction }) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'qwen2.5-3b-instruct',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `[Context: Watching "${mediaTitle || 'Anime / Movie'}"]\n\nQuestion: ${prompt}` }
      ],
      temperature: 0.7,
      max_tokens: 512
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const answer = json.choices?.[0]?.message?.content;
          if (answer) {
            resolve({ answer, model: json.model || 'qwen2.5-3b-instruct', speed: json.speed });
          } else {
            reject(new Error(json.error?.message || 'Empty response from local LLM'));
          }
        } catch {
          reject(new Error('Failed to parse local LLM response'));
        }
      });
    });

    req.on('error', (e) => reject(new Error('Local LLM connection error: ' + e.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Local LLM request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

function queryGemini({ prompt, mediaTitle, apiKey, systemInstruction }) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [
        {
          parts: [
            { text: `[Context: Watching "${mediaTitle || 'Anime / Movie'}"]\n\nQuestion: ${prompt}` }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 20000
    };

    const gReq = https.request(options, (gRes) => {
      let body = '';
      gRes.on('data', (d) => body += d);
      gRes.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            resolve({ answer: data.candidates[0].content.parts[0].text, model: 'gemini-2.5-flash' });
          } else {
            reject(new Error(data.error?.message || 'Failed to retrieve response from Gemini'));
          }
        } catch {
          reject(new Error('Error parsing Gemini response'));
        }
      });
    });

    gReq.on('error', (e) => reject(new Error('Connection error to Gemini API: ' + e.message)));
    gReq.on('timeout', () => {
      gReq.destroy();
      reject(new Error('Gemini request timed out'));
    });

    gReq.write(postData);
    gReq.end();
  });
}

// Status check for available AI providers (Local Neural Core vs Gemini Cloud)
app.get('/api/ai/status', async (req, res) => {
  const localStatus = await checkLocalLlmStatus(8000);
  const hasServerGeminiKey = !!process.env.GEMINI_API_KEY;
  res.json({
    localAvailable: localStatus.available,
    localModel: localStatus.model || null,
    hasServerGeminiKey,
    activeRecommendation: localStatus.available ? 'local' : (hasServerGeminiKey ? 'gemini' : 'none')
  });
});

// Unified ask endpoint with automatic fallback
app.post(['/api/ai/ask', '/api/gemini/ask'], async (req, res) => {
  const { prompt, mediaTitle, apiKey: userKey, provider } = req.body;
  const apiKey = userKey || process.env.GEMINI_API_KEY;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  const systemInstruction = "You are SyncWatch AI, an engaging, knowledgeable, and spoiler-free movie & anime watch companion. You answer questions about characters, lore, plot context, Japanese anime idioms/culture, and cinematic trivia while viewers watch together. Keep answers conversational, helpful, and concise.";

  const preferredProvider = provider || 'auto'; // 'auto' | 'local' | 'gemini'

  // If local is explicitly requested or auto-mode with local available:
  if (preferredProvider === 'local' || preferredProvider === 'auto') {
    const local = await checkLocalLlmStatus(8000);
    if (local.available) {
      try {
        const result = await queryLocalLlm({ prompt, mediaTitle, systemInstruction });
        return res.json({
          answer: result.answer,
          provider: 'local',
          model: result.model,
          speed: result.speed
        });
      } catch (err) {
        if (preferredProvider === 'local') {
          return res.status(500).json({ error: err.message });
        }
        // If auto mode, fall through to Gemini below
      }
    } else if (preferredProvider === 'local') {
      return res.status(503).json({
        error: 'Local Neural Core is offline. Run "npm run llm" to start local GPU inference.'
      });
    }
  }

  // Fallback to Gemini Cloud
  if (apiKey) {
    try {
      const result = await queryGemini({ prompt, mediaTitle, apiKey, systemInstruction });
      return res.json({
        answer: result.answer,
        provider: 'gemini',
        model: result.model
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({
    error: 'No active AI intelligence provider. Either start the Local Neural Core ("npm run llm") for free offline AI, or configure your Gemini API Key.'
  });
});

// Stream media with range support for seeking and tunnel chunk optimization
app.get('/api/stream/:roomId/:filename', (req, res) => {
  const safeRoomId = path.basename(req.params.roomId);
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safeRoomId, safeFilename);
  if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) return res.status(404).send('File not found');

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = mime.lookup(filePath) || 'video/mp4';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  // Handle subtitle files
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.vtt') || lowerPath.endsWith('.srt') || lowerPath.endsWith('.ass') || lowerPath.endsWith('.ssa')) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    
    if (lowerPath.endsWith('.srt')) {
      // Convert SRT to VTT on the fly, strip UTF-8 BOM
      let srtContent = fs.readFileSync(filePath, 'utf-8');
      srtContent = srtContent.replace(/^\uFEFF/, '');
      const vttContent = 'WEBVTT\n\n' + srtContent
        .replace(/\r\n/g, '\n')
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      return res.send(vttContent);
    }
    return fs.createReadStream(filePath).pipe(res);
  }

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : undefined;

    if (isNaN(start)) {
      // Suffix byte range: bytes=-500 (requesting last 500 bytes)
      const suffix = end || 0;
      start = Math.max(0, fileSize - suffix);
      end = fileSize - 1;
    } else if (isNaN(end) || end === undefined) {
      // Chunked streaming: default to 3MB chunks if range end not provided
      const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunk
      end = Math.min(start + CHUNK_SIZE, fileSize - 1);
    }

    if (start >= fileSize || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }

    const contentLength = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': contentLength,
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Remove from playlist
app.delete('/api/room/:roomId/playlist/:mediaId', (req, res) => {
  const room = getOrCreateRoom(req.params.roomId);
  room.playlist = room.playlist.filter(m => m.id !== req.params.mediaId);
  io.to(req.params.roomId).emit('playlist-updated', room.playlist);
  res.json({ success: true });
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Join room
  socket.on('join-room', ({ roomId, userName, avatar }) => {
    const room = getOrCreateRoom(roomId, userName);

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;
    socket.avatar = avatar || 'scout';

    const isHost = room.members.size === 0;
    if (isHost) room.host = socket.id;

    room.members.set(socket.id, {
      id: socket.id,
      name: userName,
      avatar: avatar || 'scout',
      isHost,
      joinedAt: Date.now()
    });

    // Send room state to new member
    socket.emit('room-state', {
      roomId: room.id,
      isHost,
      members: Array.from(room.members.values()),
      playlist: room.playlist,
      currentMedia: room.currentMedia,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      playbackRate: room.playbackRate,
      chat: room.chat.slice(-100),
      subtitles: room.subtitles
    });

    // Notify others
    socket.to(roomId).emit('member-joined', {
      member: room.members.get(socket.id),
      members: Array.from(room.members.values())
    });

    // System message
    const sysMsg = {
      id: uuidv4(),
      type: 'system',
      text: `${userName} joined the room`,
      timestamp: Date.now()
    };
    room.chat.push(sysMsg);
    io.to(roomId).emit('chat-message', sysMsg);
  });

  // ---- PLAYBACK SYNC ----
  socket.on('play', ({ time }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.isPlaying = true;
    room.currentTime = time;
    socket.to(socket.roomId).emit('sync-play', { time, by: socket.userName });
  });

  socket.on('pause', ({ time }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.isPlaying = false;
    room.currentTime = time;
    socket.to(socket.roomId).emit('sync-pause', { time, by: socket.userName });
  });

  socket.on('seek', ({ time }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.currentTime = time;
    socket.to(socket.roomId).emit('sync-seek', { time, by: socket.userName });
  });

  socket.on('playback-rate', ({ rate }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.playbackRate = rate;
    socket.to(socket.roomId).emit('sync-playback-rate', { rate, by: socket.userName });
  });

  socket.on('time-update', ({ time }) => {
    const room = rooms.get(socket.roomId);
    if (room) room.currentTime = time;
  });

  // Local media sync event
  socket.on('local-media-loaded', ({ filename, size }) => {
    socket.to(socket.roomId).emit('member-local-media-loaded', {
      by: socket.userName,
      filename,
      size
    });
  });

  // Continuous sync heartbeat (prevents drift over remote networks)
  socket.on('sync-heartbeat', ({ time, isPlaying, rate }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    room.currentTime = time;
    room.isPlaying = isPlaying;
    room.playbackRate = rate;
    socket.to(socket.roomId).emit('sync-heartbeat', {
      time,
      isPlaying,
      rate,
      from: socket.userName
    });
  });

  // Select media from playlist
  socket.on('select-media', ({ mediaId }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const media = room.playlist.find(m => m.id === mediaId);
    if (media) {
      room.currentMedia = media;
      room.currentTime = 0;
      room.isPlaying = false;
      io.to(socket.roomId).emit('media-changed', { media });
    }
  });

  // ---- CHAT ----
  socket.on('chat-message', ({ text }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const msg = {
      id: uuidv4(),
      type: 'user',
      userName: socket.userName,
      avatar: socket.avatar,
      text,
      timestamp: Date.now()
    };
    room.chat.push(msg);
    if (room.chat.length > 500) room.chat = room.chat.slice(-300);
    io.to(socket.roomId).emit('chat-message', msg);
  });

  // ---- REACTIONS ----
  socket.on('reaction', ({ emoji }) => {
    socket.to(socket.roomId).emit('reaction', {
      emoji,
      userName: socket.userName,
      id: uuidv4()
    });
  });

  // ---- TYPING ----
  socket.on('typing', () => {
    socket.to(socket.roomId).emit('user-typing', { userName: socket.userName });
  });

  // ---- WEBRTC SIGNALING ----
  socket.on('webrtc-offer', ({ to, offer }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.members.delete(socket.id);

    // Transfer host
    if (room.host === socket.id && room.members.size > 0) {
      const newHost = room.members.keys().next().value;
      room.host = newHost;
      room.members.get(newHost).isHost = true;
      io.to(newHost).emit('promoted-to-host');
    }

    // Clean up empty temporary rooms after 30 minutes (permanently preserve 'cinema' room)
    if (room.members.size === 0 && socket.roomId && socket.roomId.toLowerCase() !== 'cinema') {
      setTimeout(() => {
        const r = rooms.get(socket.roomId);
        if (r && r.members.size === 0 && socket.roomId.toLowerCase() !== 'cinema') {
          rooms.delete(socket.roomId);
          // Clean up uploaded files
          const roomDir = path.join(uploadsDir, socket.roomId);
          if (fs.existsSync(roomDir)) {
            fs.rmSync(roomDir, { recursive: true, force: true });
          }
        }
      }, 30 * 60 * 1000);
    }

    const sysMsg = {
      id: uuidv4(),
      type: 'system',
      text: `${socket.userName || 'Someone'} left the room`,
      timestamp: Date.now()
    };
    room.chat.push(sysMsg);
    io.to(socket.roomId).emit('chat-message', sysMsg);

    socket.to(socket.roomId).emit('member-left', {
      memberId: socket.id,
      members: Array.from(room.members.values())
    });
  });
});

// Global error handling middleware for Multer and API routes
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  next();
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n[SyncWatch] Server active at http://localhost:${PORT}\n`);
  });
}

module.exports = { app, server, io };
