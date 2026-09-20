const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const {
  checkFfmpeg,
  probeMedia,
  prepareUniversalMedia,
  extractEmbeddedSubtitles,
  streamTranscodeOnTheFly
} = require('./lib/transcoder');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  cors: { origin: '*' },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes session recovery buffer
    skipMiddlewares: true
  },
  pingTimeout: 30000,
  pingInterval: 25000
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
    const allowedExtensions = [
      '.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.ts', '.m4v', '.m2ts', '.mts', '.wmv', '.ogv', '.3gp', '.vob',
      '.srt', '.vtt', '.ass', '.ssa',
      '.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.opus', '.wma'
    ];
    
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

function syncRoomDiskPlaylist(room) {
  if (!room || !room.id) return;
  const safeRoomId = path.basename(room.id);
  const roomDir = path.join(uploadsDir, safeRoomId);
  if (!fs.existsSync(roomDir)) return;

  try {
    const files = fs.readdirSync(roomDir);
    for (const file of files) {
      if (file.endsWith('.web.mp4') || file.includes('.tmp-') || file.endsWith('.vtt') || file.endsWith('.srt') || file.endsWith('.ass') || file.endsWith('.ssa')) {
        continue;
      }
      const fullPath = path.join(roomDir, file);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;

      const baseName = path.parse(file).name;
      const webMp4Name = `${baseName}.web.mp4`;
      const hasOptimized = fs.existsSync(path.join(roomDir, webMp4Name));

      const existing = room.playlist.find(m => m.rawFilename === file || m.filename === file.replace(/^\d+-/, ''));
      if (!existing) {
        const streamFile = hasOptimized ? webMp4Name : file;
        room.playlist.push({
          id: uuidv4().substring(0, 8),
          filename: file.replace(/^\d+-/, ''),
          rawFilename: file,
          path: `/api/stream/${safeRoomId}/${streamFile}`,
          size: stat.size,
          mimeType: mime.lookup(file) || 'video/mp4',
          uploadedAt: stat.mtimeMs,
          isOptimized: hasOptimized
        });
      } else if (hasOptimized && !existing.isOptimized) {
        existing.isOptimized = true;
        existing.path = `/api/stream/${safeRoomId}/${webMp4Name}`;
      }
    }
  } catch (err) {
    console.warn('[Playlist] Error reading room directory:', err.message);
  }
}

function getOrCreateRoom(roomId, hostName = 'Host') {
  const id = (roomId || 'cinema').toLowerCase().trim();
  let room = rooms.get(id);
  if (!room) {
    createRoom(hostName, id);
    room = rooms.get(id);
  }
  syncRoomDiskPlaylist(room);
  return room;
}

function cleanMember(m) {
  if (!m) return null;
  const { disconnectTimer, ...clean } = m;
  return clean;
}

function finalizeMemberLeave(roomId, identifier, userName) {
  const room = rooms.get(roomId);
  if (!room) return;

  let targetSocketId = null;
  let member = null;

  for (const [sId, m] of room.members.entries()) {
    if (sId === identifier || m.userId === identifier) {
      targetSocketId = sId;
      member = m;
      break;
    }
  }

  if (!member) return;

  if (member.disconnectTimer) {
    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
  }

  room.members.delete(targetSocketId);

  // Transfer host if necessary to next active member
  if (room.host === targetSocketId && room.members.size > 0) {
    let newHostId = null;
    for (const [sId, m] of room.members.entries()) {
      if (!m.isAway) {
        newHostId = sId;
        break;
      }
    }
    if (!newHostId) newHostId = room.members.keys().next().value;

    if (newHostId && room.members.has(newHostId)) {
      room.host = newHostId;
      room.members.get(newHostId).isHost = true;
      io.to(newHostId).emit('promoted-to-host');
    }
  }

  // Clean up empty temporary rooms after 30 minutes (permanently preserve 'cinema' room)
  if (room.members.size === 0 && roomId && roomId.toLowerCase() !== 'cinema') {
    const cleanupTimer = setTimeout(() => {
      const r = rooms.get(roomId);
      if (r && r.members.size === 0 && roomId.toLowerCase() !== 'cinema') {
        rooms.delete(roomId);
        const roomDir = path.join(uploadsDir, roomId);
        if (fs.existsSync(roomDir)) {
          fs.rmSync(roomDir, { recursive: true, force: true });
        }
      }
    }, 30 * 60 * 1000);
    if (cleanupTimer && cleanupTimer.unref) cleanupTimer.unref();
  }

  const sysMsg = {
    id: uuidv4(),
    type: 'system',
    text: `${userName || member.name || 'Someone'} left the room`,
    timestamp: Date.now()
  };
  room.chat.push(sysMsg);
  io.to(roomId).emit('chat-message', sysMsg);

  io.to(roomId).emit('member-left', {
    memberId: targetSocketId,
    userId: member.userId,
    members: Array.from(room.members.values()).map(cleanMember)
  });
}

// Pre-initialize permanent couple cinema room
getOrCreateRoom('cinema', 'Yash');

// ============ API ROUTES ============

// Create room
app.post('/api/room/create', (req, res) => {
  const { hostName, customRoomId } = req.body || {};
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

// Upload media with Universal Media Transcoder and Subtitle Extraction
app.post('/api/room/:roomId/upload', upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const room = getOrCreateRoom(req.params.roomId);

  const safeRoomId = path.basename(req.params.roomId);
  const roomDir = path.join(uploadsDir, safeRoomId);
  const filePath = path.join(roomDir, req.file.filename);

  // Probe media format and codecs
  const probe = await probeMedia(filePath);

  const mediaItem = {
    id: uuidv4().substring(0, 8),
    filename: req.file.originalname,
    rawFilename: req.file.filename,
    path: `/api/stream/${safeRoomId}/${req.file.filename}`,
    size: req.file.size,
    mimeType: mime.lookup(req.file.originalname) || 'video/mp4',
    uploadedAt: Date.now(),
    isOptimized: probe.isWebNative,
    probe
  };

  room.playlist.push(mediaItem);
  io.to(req.params.roomId).emit('playlist-updated', room.playlist);

  // Auto-extract embedded subtitles if present in file (e.g. MKV)
  if (probe.subtitles && probe.subtitles.length > 0) {
    const baseName = path.parse(req.file.filename).name;
    const vttName = `${baseName}.vtt`;
    const vttPath = path.join(roomDir, vttName);
    extractEmbeddedSubtitles(filePath, vttPath).then((extracted) => {
      if (extracted) {
        const subPath = `/api/stream/${safeRoomId}/${vttName}`;
        room.subtitles = subPath;
        io.to(req.params.roomId).emit('subtitles-updated', subPath);
      }
    }).catch(console.warn);
  }

  // If not web-native, trigger universal remux/transcode in background
  if (!probe.isWebNative) {
    prepareUniversalMedia(filePath, roomDir).then((result) => {
      if (result && result.isOptimized && result.filename) {
        mediaItem.path = `/api/stream/${safeRoomId}/${result.filename}`;
        mediaItem.isOptimized = true;
        io.to(req.params.roomId).emit('playlist-updated', room.playlist);
        if (room.currentMedia && room.currentMedia.id === mediaItem.id) {
          room.currentMedia.path = mediaItem.path;
          room.currentMedia.isOptimized = true;
          io.to(req.params.roomId).emit('media-changed', { media: room.currentMedia });
        }
      }
    }).catch(console.warn);
  }

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
  const { prompt, mediaTitle, apiKey: userKey, provider } = req.body || {};
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

function convertAssToVtt(assContent) {
  const lines = assContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const cues = ['WEBVTT\n'];
  let cueIndex = 1;

  const formatTime = (t) => {
    const segs = t.split(':');
    if (segs.length < 3) return t;
    const hh = segs[0].padStart(2, '0');
    const mm = segs[1].padStart(2, '0');
    const parts = segs[2].split('.');
    const ssPad = parts[0].padStart(2, '0');
    const mmm = (parts[1] || '00').padEnd(3, '0').slice(0, 3);
    return `${hh}:${mm}:${ssPad}.${mmm}`;
  };

  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue;
    const colonIndex = line.indexOf(':');
    const csv = line.substring(colonIndex + 1);
    const parts = csv.split(',');
    if (parts.length < 10) continue;

    const start = parts[1].trim();
    const end = parts[2].trim();
    let text = parts.slice(9).join(',').trim();

    text = text.replace(/\{[^}]+\}/g, '');
    text = text.replace(/\\N/g, '\n').replace(/\\n/g, '\n');
    text = text.trim();
    if (!text) continue;

    cues.push(`${cueIndex++}\n${formatTime(start)} --> ${formatTime(end)}\n${text}\n`);
  }

  return cues.join('\n');
}

// Stream media with range support for seeking, transparent universal routing, and on-the-fly live transcoding
app.get('/api/stream/:roomId/:filename', (req, res) => {
  const safeRoomId = path.basename(req.params.roomId);
  const safeFilename = path.basename(req.params.filename);
  const roomDir = path.join(uploadsDir, safeRoomId);
  let filePath = path.join(roomDir, safeFilename);

  if (!filePath.startsWith(uploadsDir)) return res.status(403).send('Forbidden');

  // Transparent routing to universal web-optimized MP4 if available
  const baseName = path.parse(safeFilename).name;
  const webMp4Path = path.join(roomDir, `${baseName}.web.mp4`);

  if (!safeFilename.endsWith('.web.mp4') && fs.existsSync(webMp4Path) && fs.statSync(webMp4Path).size > 0) {
    filePath = webMp4Path;
  } else if (!fs.existsSync(filePath) && fs.existsSync(webMp4Path) && fs.statSync(webMp4Path).size > 0) {
    filePath = webMp4Path;
  }

  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  // On-the-fly live fragmented MP4 stream if requested via ?live=1 or ?transcode=1
  if (req.query.live === '1' || req.query.transcode === '1') {
    const startTime = parseFloat(req.query.start || req.query.t || 0) || 0;
    const handled = streamTranscodeOnTheFly(filePath, startTime, res);
    if (handled) return;
  }

  // Trigger background universal transcode if requested file is not yet web-optimized
  if (!safeFilename.endsWith('.web.mp4') && !fs.existsSync(webMp4Path)) {
    prepareUniversalMedia(filePath, roomDir).catch(() => {});
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  let mimeType = mime.lookup(filePath) || 'video/mp4';
  if (filePath.endsWith('.web.mp4')) {
    mimeType = 'video/mp4';
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

  // Handle subtitle files
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.vtt') || lowerPath.endsWith('.srt') || lowerPath.endsWith('.ass') || lowerPath.endsWith('.ssa')) {
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    
    if (lowerPath.endsWith('.srt')) {
      // Convert SRT to VTT on the fly, strip UTF-8 BOM, normalize timestamps
      let srtContent = fs.readFileSync(filePath, 'utf-8');
      srtContent = srtContent.replace(/^\uFEFF/, '');
      const vttContent = 'WEBVTT\n\n' + srtContent
        .replace(/\r\n/g, '\n')
        .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, (_match, p1, p2) => {
          const parts = p1.split(':');
          const hh = parts[0].padStart(2, '0');
          return `${hh}:${parts[1]}:${parts[2]}.${p2}`;
        });
      return res.send(vttContent);
    }

    if (lowerPath.endsWith('.ass') || lowerPath.endsWith('.ssa')) {
      // Convert ASS/SSA to standard WebVTT on the fly
      const assContent = fs.readFileSync(filePath, 'utf-8');
      return res.send(convertAssToVtt(assContent));
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

  // Join room (with mobile session recovery)
  socket.on('join-room', ({ roomId, userName, avatar, userId }) => {
    const room = getOrCreateRoom(roomId, userName);
    const effectiveUserId = userId || socket.id;

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;
    socket.userId = effectiveUserId;
    socket.avatar = avatar || 'scout';

    // Check if this member is reconnecting (e.g. mobile app switch, Wi-Fi blip, or tab reload)
    let existingMember = null;
    let oldSocketId = null;

    for (const [sId, m] of room.members.entries()) {
      if (m.userId === effectiveUserId || (m.name === userName && (m.isAway || sId === socket.id))) {
        existingMember = m;
        oldSocketId = sId;
        break;
      }
    }

    if (existingMember) {
      if (existingMember.disconnectTimer) {
        clearTimeout(existingMember.disconnectTimer);
        existingMember.disconnectTimer = null;
      }

      if (oldSocketId && oldSocketId !== socket.id) {
        room.members.delete(oldSocketId);
      }

      existingMember.id = socket.id;
      existingMember.userId = effectiveUserId;
      existingMember.name = userName;
      existingMember.avatar = avatar || existingMember.avatar || 'scout';
      existingMember.isAway = false;

      if (room.host === oldSocketId) {
        room.host = socket.id;
      }
      room.members.set(socket.id, existingMember);

      // Send authoritative room state directly to reconnecting member
      socket.emit('room-state', {
        roomId: room.id,
        isHost: existingMember.isHost,
        members: Array.from(room.members.values()).map(cleanMember),
        playlist: room.playlist,
        currentMedia: room.currentMedia,
        currentTime: room.currentTime,
        isPlaying: room.isPlaying,
        playbackRate: room.playbackRate,
        chat: room.chat.slice(-100),
        subtitles: room.subtitles,
        isReconnection: true
      });

      // Notify others that member has resumed active status without chat spam
      socket.to(roomId).emit('member-status-changed', {
        member: cleanMember(existingMember),
        members: Array.from(room.members.values()).map(cleanMember)
      });
      return;
    }

    // New member joining for the first time
    const isHost = room.members.size === 0;
    if (isHost) room.host = socket.id;

    const newMember = {
      id: socket.id,
      userId: effectiveUserId,
      name: userName,
      avatar: avatar || 'scout',
      isHost,
      isAway: false,
      joinedAt: Date.now()
    };
    room.members.set(socket.id, newMember);

    // Send room state to new member
    socket.emit('room-state', {
      roomId: room.id,
      isHost,
      members: Array.from(room.members.values()).map(cleanMember),
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
      member: cleanMember(newMember),
      members: Array.from(room.members.values()).map(cleanMember)
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

  // Real-time Tactical Telestrator / Laser Pointer relay
  socket.on('laser-pointer', (data) => {
    if (!socket.roomId) return;
    socket.to(socket.roomId).emit('laser-pointer', {
      x: data.x,
      y: data.y,
      isDown: !!data.isDown,
      by: socket.userName
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

  // ---- DISCONNECT (With 45s Grace Period for Mobile Tab Switching) ----
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const member = room.members.get(socket.id);
    if (!member) return;

    // Mark as away/reconnecting
    member.isAway = true;

    // Notify others in room immediately of away status
    socket.to(roomId).emit('member-status-changed', {
      member: cleanMember(member),
      members: Array.from(room.members.values()).map(cleanMember)
    });

    // Start 45s grace period timer
    if (member.disconnectTimer) {
      clearTimeout(member.disconnectTimer);
    }

    const effectiveUserId = member.userId || socket.id;
    const effectiveUserName = socket.userName || member.name;

    member.disconnectTimer = setTimeout(() => {
      finalizeMemberLeave(roomId, effectiveUserId, effectiveUserName);
    }, 45000);

    if (member.disconnectTimer && member.disconnectTimer.unref) {
      member.disconnectTimer.unref();
    }
  });

  // Explicit deliberate leave (user clicked Leave Room in UI)
  socket.on('leave-room', () => {
    if (!socket.roomId) return;
    finalizeMemberLeave(socket.roomId, socket.userId || socket.id, socket.userName);
    socket.leave(socket.roomId);
    socket.roomId = null;
  });

  // Request room sync on mobile tab resume / wake
  socket.on('request-room-sync', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    socket.emit('room-sync-update', {
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      playbackRate: room.playbackRate,
      currentMedia: room.currentMedia,
      subtitles: room.subtitles,
      members: Array.from(room.members.values()).map(cleanMember),
      isHost: room.host === socket.id
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
