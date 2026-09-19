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
    const roomDir = path.join(uploadsDir, req.params.roomId || 'default');
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    cb(null, roomDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /video|audio|subtitle/;
    const mimeType = mime.lookup(file.originalname) || '';
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/') ||
        file.originalname.endsWith('.srt') || file.originalname.endsWith('.vtt') ||
        file.originalname.endsWith('.ass') || file.originalname.endsWith('.ssa')) {
      cb(null, true);
    } else {
      cb(new Error('Only video, audio, and subtitle files are allowed'), false);
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============ ROOM MANAGEMENT ============
const rooms = new Map();

function createRoom(hostName) {
  const roomId = uuidv4().substring(0, 8);
  rooms.set(roomId, {
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
  });
  return roomId;
}

// ============ API ROUTES ============

// Create room
app.post('/api/room/create', (req, res) => {
  const { hostName } = req.body;
  const roomId = createRoom(hostName);
  res.json({ roomId, success: true });
});

// Get room info
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
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
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

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
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const subtitlePath = `/api/stream/${req.params.roomId}/${req.file.filename}`;
  room.subtitles = subtitlePath;
  io.to(req.params.roomId).emit('subtitles-updated', subtitlePath);

  res.json({ success: true, path: subtitlePath });
});

// Latency ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ pong: Date.now() });
});

// Stream media with range support for seeking and tunnel chunk optimization
app.get('/api/stream/:roomId/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.roomId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = mime.lookup(filePath) || 'video/mp4';

  // Handle subtitle files
  if (filePath.endsWith('.vtt') || filePath.endsWith('.srt')) {
    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (filePath.endsWith('.srt')) {
      // Convert SRT to VTT on the fly
      const srtContent = fs.readFileSync(filePath, 'utf-8');
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
    const start = parseInt(parts[0], 10);
    // Optimized chunk size for tunnel streaming: default to 3MB chunks if range end not provided
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunk
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE, fileSize - 1);
    const contentLength = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': contentLength,
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Remove from playlist
app.delete('/api/room/:roomId/playlist/:mediaId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  room.playlist = room.playlist.filter(m => m.id !== req.params.mediaId);
  io.to(req.params.roomId).emit('playlist-updated', room.playlist);
  res.json({ success: true });
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Join room
  socket.on('join-room', ({ roomId, userName, avatar }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;
    socket.avatar = avatar || '👤';

    const isHost = room.members.size === 0;
    if (isHost) room.host = socket.id;

    room.members.set(socket.id, {
      id: socket.id,
      name: userName,
      avatar: avatar || '👤',
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

    // Clean up empty rooms after 30 minutes
    if (room.members.size === 0) {
      setTimeout(() => {
        const r = rooms.get(socket.roomId);
        if (r && r.members.size === 0) {
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

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎬 SyncWatch is running at http://localhost:${PORT}\n`);
});
