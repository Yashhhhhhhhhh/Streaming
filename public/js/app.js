// ============ MAIN APPLICATION ============
// Globals
window.socket = null;
window.currentUser = null;
window.roomMembers = [];
window.currentRoom = null;

const themes = ['scout', 'wall', 'rumbling', 'coordinate', 'recon'];
const themeLabels = {
  scout: 'Scout Regiment',
  wall: 'Wall Maria',
  rumbling: 'The Rumbling',
  coordinate: 'The Coordinate',
  recon: 'Midnight Recon'
};
let currentThemeIndex = 0;

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  window.player = new VideoPlayerController();
  window.chat = new ChatController();
  window.voiceChat = new VoiceChatController();

  // Populate avatar pickers with bespoke SVG insignia
  document.querySelectorAll('.avatar-btn').forEach(btn => {
    const key = btn.dataset.avatar;
    if (key && typeof getAvatarSvg === 'function') {
      btn.innerHTML = getAvatarSvg(key, 28);
    }
  });

  // Avatar picker selection logic
  document.querySelectorAll('.avatar-picker').forEach(picker => {
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.avatar-btn');
      if (!btn) return;
      picker.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Load saved theme
  const savedTheme = localStorage.getItem('syncwatch-theme');
  if (savedTheme && themes.includes(savedTheme)) {
    currentThemeIndex = themes.indexOf(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    document.documentElement.setAttribute('data-theme', 'scout');
  }
  if (window.particleSystem) {
    window.particleSystem.setTheme(document.documentElement.getAttribute('data-theme') || 'scout');
  }

  // Load saved name
  const savedName = localStorage.getItem('syncwatch-name');
  if (savedName) {
    document.getElementById('create-name').value = savedName;
    document.getElementById('join-name').value = savedName;
  }

  // ============ PERMANENT COUPLE CINEMA AUTO-CONNECT ============
  const urlParams = new URLSearchParams(window.location.search);
  const savedAvatar = localStorage.getItem('syncwatch-avatar') || 'scout';
  const manualLeave = sessionStorage.getItem('syncwatch-manual-leave');

  // Drag and drop
  initDragDrop();

  if (urlParams.has('room')) {
    const requestedRoom = urlParams.get('room').toLowerCase().trim();
    if (requestedRoom) {
      if (savedName && !manualLeave) {
        // Auto-connect when accessing direct room link or bookmark
        connectToRoom(requestedRoom, savedName, savedAvatar);
      } else if (!savedName) {
        // First-time visitor opening the bookmark: prompt once for callsign
        document.getElementById('join-code').value = requestedRoom;
        showJoinModal();
      }
    }
  }
});

// ============ MODAL MANAGEMENT ============
function showCreateModal() {
  document.getElementById('create-modal').classList.add('active');
  document.getElementById('create-name').focus();
}

function showJoinModal() {
  const modal = document.getElementById('join-modal');
  const code = (document.getElementById('join-code').value || 'cinema').trim();
  const title = document.getElementById('join-modal-title');
  if (code.toLowerCase() === 'cinema' && title) {
    title.textContent = 'Enter Private Cinema';
  } else if (code && title) {
    title.textContent = `Join Watch Party (${code.toUpperCase()})`;
  } else if (title) {
    title.textContent = 'Join a Room';
  }
  modal.classList.add('active');
  document.getElementById('join-name').focus();
}

function closeModal(overlay) {
  overlay.classList.remove('active');
}

// ============ ROOM CREATION & JOINING ============
async function createRoom() {
  const nameInput = document.getElementById('create-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.style.borderColor = 'var(--danger)';
    nameInput.focus();
    setTimeout(() => nameInput.style.borderColor = '', 2000);
    return;
  }

  const avatar = document.querySelector('#create-avatars .avatar-btn.selected')?.dataset.avatar || 'scout';

  try {
    const res = await fetch('/api/room/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: name })
    });
    const data = await res.json();

    if (data.success) {
      localStorage.setItem('syncwatch-name', name);
      closeModal(document.getElementById('create-modal'));
      connectToRoom(data.roomId, name, avatar);
    }
  } catch (err) {
    showToast('Failed to create room', 'error');
  }
}

async function joinRoom() {
  const nameInput = document.getElementById('join-name');
  const codeInput = document.getElementById('join-code');
  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toLowerCase();

  if (!name) {
    nameInput.style.borderColor = 'var(--danger)';
    nameInput.focus();
    setTimeout(() => nameInput.style.borderColor = '', 2000);
    return;
  }
  if (!code) {
    codeInput.style.borderColor = 'var(--danger)';
    codeInput.focus();
    setTimeout(() => codeInput.style.borderColor = '', 2000);
    return;
  }

  const avatar = document.querySelector('#join-avatars .avatar-btn.selected')?.dataset.avatar || 'blades';

  localStorage.setItem('syncwatch-name', name);
  closeModal(document.getElementById('join-modal'));
  connectToRoom(code, name, avatar);
}

function connectToRoom(roomId, userName, avatar) {
  sessionStorage.removeItem('syncwatch-manual-leave');
  if (userName) localStorage.setItem('syncwatch-name', userName);
  if (avatar) localStorage.setItem('syncwatch-avatar', avatar);

  window.currentUser = { name: userName, avatar };
  window.currentRoom = roomId;

  // Disconnect existing socket to prevent duplicate event handlers
  if (window.socket) {
    window.socket.disconnect();
    window.socket = null;
  }

  // Connect socket
  window.socket = io({ transports: ['websocket', 'polling'] });

  window.socket.on('connect', () => {
    window.socket.emit('join-room', { roomId, userName, avatar });
  });

  // Room state
  window.socket.on('room-state', (state) => {
    // Update URL
    window.history.replaceState({}, '', `?room=${state.roomId}`);
    document.getElementById('room-code-display').textContent = state.roomId.toUpperCase();

    // Update members
    window.roomMembers = state.members;
    updateMembersDisplay(state.members);
    updatePeopleList(state.members);

    // Update playlist
    updatePlaylistUI(state.playlist);

    // Load current media
    if (state.currentMedia) {
      player.loadMedia(state.currentMedia);
      // Sync to current position as soon as metadata is ready
      const applyState = () => {
        if (typeof state.currentTime === 'number' && !isNaN(state.currentTime)) {
          try {
            player.video.currentTime = state.currentTime;
          } catch (e) {}
        }
        if (state.isPlaying) {
          const p = player.video.play();
          if (p !== undefined) {
            p.catch(() => {
              player.showNotification('Click screen to allow synchronized playback', 'warning');
            });
          }
        }
        if (state.playbackRate) {
          player.syncPlaybackRate(state.playbackRate);
        }
      };

      if (player.video.readyState >= 1) {
        applyState();
      } else {
        player.video.addEventListener('loadedmetadata', applyState, { once: true });
        setTimeout(() => {
          if (player.video.paused && state.isPlaying) {
            applyState();
          }
        }, 1200);
      }
    }

    // Load chat history
    if (state.chat?.length) {
      chat.loadHistory(state.chat);
    }

    // Load subtitles
    if (state.subtitles) {
      player.loadSubtitles(state.subtitles);
    }

    // Room host flag
    window.isHost = state.isHost;

    // Switch to room page
    showPage('room-page');
    showToast(`Welcome to room ${state.roomId.toUpperCase()}!`, 'success');
    startPingMeasurement();
  });

  // ---- SYNC EVENTS ----
  window.socket.on('sync-play', ({ time, by }) => {
    player.syncPlay(time);
    player.showNotification(`${by} pressed play`);
  });

  window.socket.on('sync-pause', ({ time, by }) => {
    player.syncPause(time);
    player.showNotification(`${by} paused`);
  });

  window.socket.on('sync-seek', ({ time, by }) => {
    player.syncSeek(time);
    player.showNotification(`${by} seeked to ${player.formatTime(time)}`);
  });

  window.socket.on('sync-playback-rate', ({ rate, by }) => {
    player.syncPlaybackRate(rate);
    player.showNotification(`${by} changed speed to ${rate}x`);
  });

  // Continuous heartbeat for smooth drift-free synchronization
  window.socket.on('sync-heartbeat', (data) => {
    if (!window.isHost) {
      player.handleSyncHeartbeat(data);
    }
  });

  // Partner synchronized subtitles
  window.socket.on('subtitles-updated', (path) => {
    if (path && window.player) {
      window.player.loadSubtitles(path);
      window.player.showNotification('Subtitles synchronized by partner');
    }
  });

  // Media changed
  window.socket.on('media-changed', ({ media }) => {
    player.loadMedia(media);
    updatePlaylistActive(media.id);
    showToast(`Now playing: ${media.filename}`, 'info');
  });

  // Playlist updated
  window.socket.on('playlist-updated', (playlist) => {
    updatePlaylistUI(playlist);
  });

  // ---- CHAT EVENTS ----
  window.socket.on('chat-message', (msg) => {
    chat.addMessage(msg);
    player.showFullscreenChatMessage(msg);
  });

  window.socket.on('user-typing', ({ userName }) => {
    chat.showTyping(userName);
  });

  // Reactions
  window.socket.on('reaction', ({ emoji, userName }) => {
    player.showFloatingReaction(emoji);
    const label = window.TACTICAL_REACTIONS?.[emoji]?.label || emoji;
    player.showNotification(`${userName}: ${label}`);
  });

  // ---- MEMBER EVENTS ----
  window.socket.on('member-joined', ({ member, members }) => {
    window.roomMembers = members;
    updateMembersDisplay(members);
    updatePeopleList(members);
  });

  window.socket.on('member-left', ({ memberId, members }) => {
    window.roomMembers = members;
    updateMembersDisplay(members);
    updatePeopleList(members);
    voiceChat.removePeer(memberId);
  });

  window.socket.on('promoted-to-host', () => {
    window.isHost = true;
    if (window.player?.video) {
      window.player.video.playbackRate = window.player.currentSpeed;
    }
    showToast('You are now the host!', 'success');
  });

  // Local media sync event
  window.socket.on('member-local-media-loaded', ({ by, filename }) => {
    showToast(`${by} loaded local copy: ${filename} (0 Bandwidth Sync Active)`, 'success');
    player.showNotification(`${by} loaded local file`);
  });

  // ---- WEBRTC EVENTS ----
  window.socket.on('webrtc-offer', async ({ from, offer }) => {
    await voiceChat.handleOffer(from, offer);
  });

  window.socket.on('webrtc-answer', async ({ from, answer }) => {
    await voiceChat.handleAnswer(from, answer);
  });

  window.socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
    await voiceChat.handleIceCandidate(from, candidate);
  });

  // ---- ERROR & DISCONNECT ----
  window.socket.on('error', (err) => {
    showToast(err.message || 'An error occurred', 'error');
    showPage('landing-page');
  });

  window.socket.on('disconnect', () => {
    showToast('Disconnected from server', 'error');
  });

  window.socket.on('reconnect', () => {
    showToast('Reconnected!', 'success');
    window.socket.emit('join-room', { roomId, userName, avatar });
  });
}

function enterCinema() {
  const savedName = localStorage.getItem('syncwatch-name');
  if (savedName) {
    connectToRoom('cinema', savedName, localStorage.getItem('syncwatch-avatar') || 'scout');
  } else {
    document.getElementById('join-code').value = 'cinema';
    showJoinModal();
  }
}

function leaveRoom() {
  sessionStorage.setItem('syncwatch-manual-leave', 'true');
  if (window.socket) {
    window.socket.disconnect();
    window.socket = null;
  }
  if (player) {
    player.reset();
  }
  if (voiceChat) {
    voiceChat.stop();
  }
  stopPingMeasurement();
  window.currentRoom = null;
  window.roomMembers = [];
  window.isHost = false;
  if (chat && chat.messages) {
    chat.messages.innerHTML = '';
  }
  window.history.replaceState({}, '', '/');
  showPage('landing-page');
  showToast('Returned to Outpost Hub', 'info');
}

// ============ PING & LATENCY MEASUREMENT ============
let pingInterval = null;

function startPingMeasurement() {
  stopPingMeasurement();
  const measure = async () => {
    if (!window.currentRoom) return;
    const start = Date.now();
    try {
      const res = await fetch('/api/ping');
      if (res.ok) {
        const rtt = Date.now() - start;
        const pingVal = document.getElementById('ping-value');
        const pingBadge = document.getElementById('ping-badge');
        if (pingVal) pingVal.textContent = `${rtt} ms`;
        if (pingBadge) {
          pingBadge.className = 'ping-badge' + (rtt > 250 ? ' high' : rtt > 100 ? ' med' : '');
        }
      }
    } catch (e) {
      // Ignore ping error
    }
  };
  measure();
  pingInterval = setInterval(measure, 4000);
}

function stopPingMeasurement() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// ============ LOCAL FILE SELECTION (DUAL LOCAL SYNC) ============
function handleLocalFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (player) {
    player.loadLocalMedia(file);
  }
  input.value = '';
}

// ============ UI UPDATES ============
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function updateMembersDisplay(members) {
  const container = document.getElementById('members-display');
  container.innerHTML = members.map(m => `
    <div class="member-avatar ${m.isHost ? 'host' : ''}" title="${escapeHtml(m.name)}">
      ${typeof getAvatarSvg === 'function' ? getAvatarSvg(m.avatar, 26) : ''}
      <div class="tooltip">${escapeHtml(m.name)}${m.isHost ? ' (Host)' : ''}</div>
    </div>
  `).join('');
}

function updatePeopleList(members) {
  const container = document.getElementById('people-list');
  container.innerHTML = members.map(m => `
    <div class="person-item">
      <div class="person-avatar">${typeof getAvatarSvg === 'function' ? getAvatarSvg(m.avatar, 30) : ''}</div>
      <div class="person-info">
        <div class="person-name">${escapeHtml(m.name)}</div>
        <div class="person-role">${m.isHost ? 'Host' : 'Viewer'}</div>
      </div>
      ${m.isHost ? '<span class="host-badge">HOST</span>' : ''}
    </div>
  `).join('');
}

function updatePlaylistUI(playlist) {
  const container = document.getElementById('playlist-items');

  if (!playlist || playlist.length === 0) {
    container.innerHTML = `
      <div class="playlist-empty">
        <p>No videos yet</p>
        <label class="btn-primary btn-sm" for="file-upload-input">Upload Video</label>
      </div>
    `;
    return;
  }

  container.innerHTML = playlist.map(item => `
    <div class="playlist-item ${window.currentMedia?.id === item.id ? 'active' : ''}" onclick="selectMedia('${item.id}')">
      <div class="playlist-item-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
      </div>
      <div class="playlist-item-info">
        <div class="playlist-item-name">${escapeHtml(item.filename)}</div>
        <div class="playlist-item-size">${formatFileSize(item.size)}</div>
      </div>
      <button class="playlist-item-remove" onclick="event.stopPropagation(); removeFromPlaylist('${item.id}')" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');
}

function updatePlaylistActive(mediaId) {
  document.querySelectorAll('.playlist-item').forEach(item => {
    item.classList.toggle('active', item.onclick?.toString().includes(mediaId));
  });
}

function selectMedia(mediaId) {
  if (window.socket) {
    window.socket.emit('select-media', { mediaId });
  }
}

async function removeFromPlaylist(mediaId) {
  try {
    await fetch(`/api/room/${window.currentRoom}/playlist/${mediaId}`, { method: 'DELETE' });
  } catch (err) {
    showToast('Failed to remove', 'error');
  }
}

// ============ FILE UPLOAD ============
async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const overlay = document.getElementById('upload-overlay');
  const filename = document.getElementById('upload-filename');
  const progressFill = document.getElementById('upload-progress-fill');
  const percent = document.getElementById('upload-percent');

  overlay.classList.add('active');
  filename.textContent = file.name;
  progressFill.style.width = '0%';
  percent.textContent = '0%';

  const formData = new FormData();
  formData.append('media', file);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/room/${window.currentRoom}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        percent.textContent = pct + '%';
      }
    };

    xhr.onload = () => {
      overlay.classList.remove('active');
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          showToast(`Uploaded: ${file.name}`, 'success');
          // Auto-play if first media
          if (data.media) {
            selectMedia(data.media.id);
          }
        } catch (e) {
          showToast(`Uploaded: ${file.name}`, 'success');
        }
      } else {
        let errorMsg = 'Upload failed';
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) errorMsg = errData.error;
        } catch (e) {}
        showToast(errorMsg, 'error');
      }
      input.value = '';
    };

    xhr.onerror = () => {
      overlay.classList.remove('active');
      showToast('Network error during upload', 'error');
      input.value = '';
    };

    xhr.send(formData);
  } catch (err) {
    overlay.classList.remove('active');
    showToast('Upload failed', 'error');
    input.value = '';
  }
}

async function handleSubtitleUpload(input) {
  const file = input.files[0];
  if (!file) return;

  // 1. Immediately load locally for instant zero-latency rendering
  if (window.player) {
    window.player.loadLocalSubtitleFile(file);
  }

  // 2. If inside a networked room, synchronize with partner
  if (window.currentRoom && window.currentRoom !== 'offline') {
    const formData = new FormData();
    formData.append('media', file);

    try {
      const res = await fetch(`/api/room/${window.currentRoom}/subtitles`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast('Subtitles synchronized to room', 'success');
      }
    } catch (_err) {
      // Local subtitles already active; network error is non-fatal
    }
  }
  input.value = '';
}

// ============ DRAG & DROP ============
function initDragDrop() {
  let dragCounter = 0;

  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    document.body.classList.add('drop-zone-active');
  });

  document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      document.body.classList.remove('drop-zone-active');
    }
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('drop-zone-active');

    if (!window.currentRoom) {
      showToast('Enter Cinema or a room before loading video files', 'info');
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const lower = file.name.toLowerCase();
      // Intelligent drop detection: if subtitle dropped, load as subtitles directly
      if (lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa')) {
        if (player) {
          player.loadLocalSubtitleFile(file);
        }
      } else {
        promptMediaDropAction(file);
      }
    }
  });
}

let pendingDroppedFile = null;

function promptMediaDropAction(file) {
  pendingDroppedFile = file;
  const modal = document.getElementById('drop-action-modal');
  const filenameEl = document.getElementById('drop-modal-filename');
  if (filenameEl) filenameEl.textContent = file.name;
  if (modal) {
    modal.classList.add('active');
  } else {
    // Fallback if modal not rendered: load locally for instant playback
    if (player) player.loadLocalMedia(file);
  }
}

function handleDropChoice(choice) {
  const modal = document.getElementById('drop-action-modal');
  if (modal) modal.classList.remove('active');
  if (!pendingDroppedFile) return;

  const file = pendingDroppedFile;
  pendingDroppedFile = null;

  if (choice === 'local') {
    if (player) player.loadLocalMedia(file);
  } else if (choice === 'upload') {
    const fileInput = document.getElementById('file-upload-input');
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    handleFileUpload(fileInput);
  }
}

function closeDropModal() {
  const modal = document.getElementById('drop-action-modal');
  if (modal) modal.classList.remove('active');
  pendingDroppedFile = null;
}

// ============ SIDEBAR ============
function switchSidebarTab(tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('.sidebar-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });
}

function togglePlaylist() {
  switchSidebarTab('playlist');
}

// ============ THEMES ============
function cycleTheme() {
  currentThemeIndex = (currentThemeIndex + 1) % themes.length;
  const theme = themes[currentThemeIndex];
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('syncwatch-theme', theme);
  if (window.particleSystem) {
    window.particleSystem.setTheme(theme);
  }
  showToast(`Theme: ${themeLabels[theme] || theme}`, 'info');
}

// ============ UTILITIES ============
function copyRoomCode() {
  const code = document.getElementById('room-code-display').textContent;
  const url = `${window.location.origin}?room=${code.toLowerCase()}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Room link copied!', 'success');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('Room link copied!', 'success');
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const iconSvg = typeof getToastIconSvg === 'function' ? getToastIconSvg(type) : '';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============ HYBRID AI COMPANION (Local Neural Core + Gemini Cloud) ============
let _localAiStatus = { localAvailable: false, localModel: null, hasServerGeminiKey: false };

async function checkAiStatus() {
  try {
    const res = await fetch('/api/ai/status');
    const data = await res.json();
    _localAiStatus = data;
    updateAiBadge(data);
    updateAiModalStatus(data);
  } catch (_err) {
    updateAiBadge({ localAvailable: false });
    updateAiModalStatus({ localAvailable: false });
  }
}

function updateAiBadge(status) {
  const badge = document.getElementById('ai-provider-badge');
  if (!badge) return;

  const pref = localStorage.getItem('syncwatch-ai-provider') || 'auto';
  const hasGemini = !!(localStorage.getItem('gemini-api-key') || status.hasServerGeminiKey);

  if (pref === 'local') {
    if (status.localAvailable) {
      badge.className = 'ai-provider-badge local';
      badge.innerHTML = '<span class="pulse-dot"></span> Local Core';
      badge.title = `Local GPU Core Active (${status.localModel || 'RTX 2050'}) - 0ms latency, zero API tokens`;
    } else {
      badge.className = 'ai-provider-badge none';
      badge.innerHTML = 'Local Offline';
      badge.title = 'Local Core is offline. Run "npm run llm" to start.';
    }
  } else if (pref === 'gemini') {
    if (hasGemini) {
      badge.className = 'ai-provider-badge gemini';
      badge.innerHTML = 'Gemini Cloud';
      badge.title = 'Google Gemini Cloud Active';
    } else {
      badge.className = 'ai-provider-badge none';
      badge.innerHTML = 'No Key';
      badge.title = 'Configure Gemini API Key in settings';
    }
  } else {
    // Auto mode
    if (status.localAvailable) {
      badge.className = 'ai-provider-badge local';
      badge.innerHTML = '<span class="pulse-dot"></span> Local Core';
      badge.title = `Auto-routed to Local GPU Core (${status.localModel || 'RTX 2050'})`;
    } else if (hasGemini) {
      badge.className = 'ai-provider-badge gemini';
      badge.innerHTML = 'Gemini Cloud';
      badge.title = 'Auto-routed to Gemini Cloud (Local core offline)';
    } else {
      badge.className = 'ai-provider-badge none';
      badge.innerHTML = 'No Provider';
      badge.title = 'No active AI engine. Click to configure.';
    }
  }
}

function updateAiModalStatus(status) {
  const pill = document.getElementById('local-core-status-pill');
  if (!pill) return;

  if (status.localAvailable) {
    pill.className = 'status-pill online';
    pill.textContent = 'ONLINE (GPU ACTIVE)';
  } else {
    pill.className = 'status-pill offline';
    pill.textContent = 'OFFLINE (PORT 8000)';
  }
}

function saveAiProviderPreference(val) {
  localStorage.setItem('syncwatch-ai-provider', val);
  checkAiStatus();
}

async function askGeminiCompanion() {
  const input = document.getElementById('gemini-input');
  const prompt = input?.value.trim();
  if (!prompt) return;

  const msgList = document.getElementById('gemini-messages');
  if (!msgList) return;

  // Render user prompt
  const userEl = document.createElement('div');
  userEl.className = 'gemini-msg user';
  userEl.innerHTML = `<div class="gemini-bubble user">${escapeHtml(prompt)}</div>`;
  msgList.appendChild(userEl);
  input.value = '';
  msgList.scrollTop = msgList.scrollHeight;

  // Render thinking bubble
  const aiEl = document.createElement('div');
  aiEl.className = 'gemini-msg ai';
  aiEl.innerHTML = '<div class="gemini-bubble ai thinking">Querying tactical database...</div>';
  msgList.appendChild(aiEl);
  msgList.scrollTop = msgList.scrollHeight;

  const apiKey = localStorage.getItem('gemini-api-key') || '';
  const currentTitle = document.getElementById('np-title')?.textContent || '';
  const provider = localStorage.getItem('syncwatch-ai-provider') || 'auto';

  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, mediaTitle: currentTitle, apiKey, provider })
    });
    const data = await res.json();
    if (data.answer) {
      let perfInfo = '';
      if (data.provider === 'local' && data.speed) {
        perfInfo = `<div class="ai-perf-tag">[Local Core: ${data.speed.tokens_per_second} t/s | ${data.speed.elapsed_seconds}s]</div>`;
      } else if (data.provider === 'gemini') {
        perfInfo = '<div class="ai-perf-tag">[Gemini Cloud 2.5 Flash]</div>';
      }
      aiEl.querySelector('.gemini-bubble').innerHTML = formatMarkdown(data.answer) + perfInfo;
      aiEl.querySelector('.gemini-bubble').classList.remove('thinking');
    } else {
      aiEl.querySelector('.gemini-bubble').innerHTML = `<span style="color:var(--danger)">${escapeHtml(data.error || 'Failed to get response')}</span>`;
      aiEl.querySelector('.gemini-bubble').classList.remove('thinking');
      if (data.error && (data.error.includes('API key') || data.error.includes('provider') || data.error.includes('offline'))) {
        showGeminiKeyModal();
      }
    }
  } catch (err) {
    aiEl.querySelector('.gemini-bubble').innerHTML = '<span style="color:var(--danger)">Connection error</span>';
    aiEl.querySelector('.gemini-bubble').classList.remove('thinking');
  }
  msgList.scrollTop = msgList.scrollHeight;
}

function showGeminiKeyModal() {
  const modal = document.getElementById('gemini-key-modal');
  if (!modal) return;
  modal.classList.add('active');

  const prefSelect = document.getElementById('ai-provider-select');
  if (prefSelect) {
    prefSelect.value = localStorage.getItem('syncwatch-ai-provider') || 'auto';
  }

  const keyInput = document.getElementById('gemini-api-key-input');
  if (keyInput) {
    keyInput.value = localStorage.getItem('gemini-api-key') || '';
  }

  checkAiStatus();
}

function saveGeminiApiKey() {
  const keyInput = document.getElementById('gemini-api-key-input');
  if (keyInput) {
    const val = keyInput.value.trim();
    if (val) {
      localStorage.setItem('gemini-api-key', val);
      showToast('AI configuration saved', 'success');
    } else {
      localStorage.removeItem('gemini-api-key');
      showToast('AI configuration saved', 'info');
    }
  }
  const prefSelect = document.getElementById('ai-provider-select');
  if (prefSelect) {
    localStorage.setItem('syncwatch-ai-provider', prefSelect.value);
  }
  closeModal(document.getElementById('gemini-key-modal'));
  checkAiStatus();
}

// Check AI provider status on load and periodically
setTimeout(checkAiStatus, 1000);
setInterval(checkAiStatus, 15000);

function formatMarkdown(text) {
  text = escapeHtml(text);
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

// ============ PREVENT ACCIDENTAL NAVIGATION ============
window.addEventListener('beforeunload', (e) => {
  if (window.socket) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ============ SIDEBAR COLLAPSE / EXPAND ============
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  if (btn) btn.classList.toggle('active', !isCollapsed);
  if (window.player && typeof window.player.resizeAmbientGlow === 'function') {
    setTimeout(() => window.player.resizeAmbientGlow(), 300);
  }
  showToast(isCollapsed ? 'Sidebar collapsed (Press C to expand)' : 'Sidebar expanded', 'info');
}
window.toggleSidebar = toggleSidebar;

