// ============ VIDEO PLAYER CONTROLLER ============
class VideoPlayerController {
  constructor() {
    this.video = document.getElementById('video-player');
    this.wrapper = document.getElementById('player-wrapper');
    this.controls = document.getElementById('controls-overlay');
    this.progressContainer = document.getElementById('progress-container');
    this.progressBar = document.getElementById('progress-bar');
    this.progressBuffer = document.getElementById('progress-buffer');
    this.progressHover = document.getElementById('progress-hover');
    this.hoverTime = document.getElementById('hover-time');
    this.centerPlayBtn = document.getElementById('center-play-btn');
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.currentTimeEl = document.getElementById('current-time');
    this.durationEl = document.getElementById('duration');
    this.volumeSlider = document.getElementById('volume-slider');
    this.volumeBtn = document.getElementById('volume-btn');
    this.speedBtn = document.getElementById('speed-btn');
    this.playerEmpty = document.getElementById('player-empty');
    this.npTitle = document.getElementById('np-title');
    this.notifications = document.getElementById('player-notifications');
    this.floatingReactions = document.getElementById('floating-reactions');

    this.isPlaying = false;
    this.isSeeking = false;
    this.syncLock = false;
    this.hideControlsTimer = null;
    this.currentSpeed = 1;
    this.speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    this.lastVolume = 1;
    this.keyHintTimer = null;

    this.initEvents();
  }

  initEvents() {
    // Video events
    this.video.addEventListener('loadedmetadata', () => {
      this.durationEl.textContent = this.formatTime(this.video.duration);
      this.controls.classList.add('visible');
      this.centerPlayBtn.classList.add('show');
    });

    this.video.addEventListener('timeupdate', () => {
      if (!this.isSeeking) {
        const pct = (this.video.currentTime / this.video.duration) * 100;
        this.progressBar.style.width = pct + '%';
        this.currentTimeEl.textContent = this.formatTime(this.video.currentTime);

        // Send time update to server (throttled)
        if (window.socket && !this.syncLock) {
          if (!this._lastTimeUpdate || Date.now() - this._lastTimeUpdate > 2000) {
            window.socket.emit('time-update', { time: this.video.currentTime });
            this._lastTimeUpdate = Date.now();
          }
        }
      }
    });

    this.video.addEventListener('progress', () => {
      if (this.video.buffered.length > 0) {
        const buffered = this.video.buffered.end(this.video.buffered.length - 1);
        const pct = (buffered / this.video.duration) * 100;
        this.progressBuffer.style.width = pct + '%';
      }
    });

    this.video.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayButton();
      this.centerPlayBtn.classList.remove('show');
    });

    this.video.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayButton();
      this.centerPlayBtn.classList.add('show');
    });

    this.video.addEventListener('ended', () => {
      this.isPlaying = false;
      this.updatePlayButton();
      this.centerPlayBtn.classList.add('show');
      this.showNotification('Video ended');
    });

    this.video.addEventListener('waiting', () => {
      this.showNotification('Buffering...');
    });

    this.video.addEventListener('error', () => {
      this.showNotification('Error loading video', 'error');
    });

    // Progress bar interactions
    this.progressContainer.addEventListener('click', (e) => {
      const rect = this.progressContainer.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const time = pct * this.video.duration;
      this.seekTo(time, true);
    });

    this.progressContainer.addEventListener('mousemove', (e) => {
      const rect = this.progressContainer.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const time = pct * this.video.duration;
      this.hoverTime.textContent = this.formatTime(time);
      this.progressHover.style.left = (e.clientX - rect.left) + 'px';
    });

    // Progress drag
    let isDragging = false;
    this.progressContainer.addEventListener('mousedown', (e) => {
      isDragging = true;
      this.isSeeking = true;
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const rect = this.progressContainer.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        this.progressBar.style.width = (pct * 100) + '%';
        this.currentTimeEl.textContent = this.formatTime(pct * this.video.duration);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        this.isSeeking = false;
        const rect = this.progressContainer.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        this.seekTo(pct * this.video.duration, true);
      }
    });

    // Volume
    this.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseFloat(e.target.value));
    });

    // Controls auto-hide
    let mouseMoveTimer;
    this.wrapper.addEventListener('mousemove', () => {
      this.controls.classList.add('force-show');
      this.wrapper.style.cursor = 'default';
      clearTimeout(this.hideControlsTimer);
      this.hideControlsTimer = setTimeout(() => {
        if (this.isPlaying) {
          this.controls.classList.remove('force-show');
          this.wrapper.style.cursor = 'none';
        }
      }, 3000);
    });

    this.wrapper.addEventListener('mouseleave', () => {
      if (this.isPlaying) {
        this.controls.classList.remove('force-show');
      }
    });

    // Double click to fullscreen
    this.video.addEventListener('dblclick', () => this.toggleFullscreen());

    // Click to play/pause
    this.video.addEventListener('click', () => this.togglePlay());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't intercept when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!document.getElementById('room-page').classList.contains('active')) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.skip(-10);
          this.showKeyHint('⏪ -10s');
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.skip(10);
          this.showKeyHint('⏩ +10s');
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolume(Math.min(1, this.video.volume + 0.1));
          this.showKeyHint(`🔊 ${Math.round(this.video.volume * 100)}%`);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolume(Math.max(0, this.video.volume - 0.1));
          this.showKeyHint(`🔉 ${Math.round(this.video.volume * 100)}%`);
          break;
        case 'f':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'j':
          e.preventDefault();
          this.skip(-10);
          this.showKeyHint('⏪ -10s');
          break;
        case 'l':
          e.preventDefault();
          this.skip(10);
          this.showKeyHint('⏩ +10s');
          break;
        case 't':
          e.preventDefault();
          this.toggleTheater();
          break;
        case 'p':
          e.preventDefault();
          this.togglePiP();
          break;
      }
    });
  }

  loadMedia(media) {
    this.video.src = media.path;
    this.video.load();
    this.video.classList.add('visible');
    this.playerEmpty.style.display = 'none';
    this.npTitle.textContent = media.filename;
    this.controls.classList.add('visible');

    const modeBadge = document.getElementById('mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'Host Stream';
      modeBadge.className = 'mode-badge';
    }

    this.showNotification(`Now playing: ${media.filename}`);
  }

  loadLocalMedia(file) {
    const objectUrl = URL.createObjectURL(file);
    this.video.src = objectUrl;
    this.video.load();
    this.video.classList.add('visible');
    this.playerEmpty.style.display = 'none';
    this.npTitle.textContent = file.name;
    this.controls.classList.add('visible');

    const modeBadge = document.getElementById('mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'Dual-Local (0 Lag)';
      modeBadge.className = 'mode-badge dual-local';
    }

    this.showNotification(`Loaded local file: ${file.name}`);
    showToast(`Loaded ${file.name} locally (0 Bandwidth / Max 4K Quality)`, 'success');

    if (window.socket) {
      window.socket.emit('local-media-loaded', {
        filename: file.name,
        size: file.size
      });
    }
  }

  togglePlay() {
    if (!this.video.src) return;
    if (this.video.paused) {
      this.video.play();
      if (window.socket) {
        window.socket.emit('play', { time: this.video.currentTime });
      }
    } else {
      this.video.pause();
      if (window.socket) {
        window.socket.emit('pause', { time: this.video.currentTime });
      }
    }
  }

  seekTo(time, broadcast = false) {
    this.video.currentTime = time;
    if (broadcast && window.socket) {
      window.socket.emit('seek', { time });
    }
  }

  skip(seconds) {
    if (!this.video.src) return;
    const newTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
    this.seekTo(newTime, true);
  }

  setVolume(val) {
    this.video.volume = val;
    this.volumeSlider.value = val;
    this.updateVolumeIcon();
    if (val > 0) this.lastVolume = val;
  }

  toggleMute() {
    if (this.video.volume > 0) {
      this.lastVolume = this.video.volume;
      this.setVolume(0);
    } else {
      this.setVolume(this.lastVolume || 0.5);
    }
  }

  cycleSpeed() {
    const idx = this.speeds.indexOf(this.currentSpeed);
    this.currentSpeed = this.speeds[(idx + 1) % this.speeds.length];
    this.video.playbackRate = this.currentSpeed;
    this.speedBtn.textContent = this.currentSpeed + 'x';
    if (window.socket) {
      window.socket.emit('playback-rate', { rate: this.currentSpeed });
    }
    this.showKeyHint(`Speed: ${this.currentSpeed}x`);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.wrapper.requestFullscreen();
    }
  }

  toggleTheater() {
    document.querySelector('.room-layout').classList.toggle('theater');
  }

  async togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video.src) {
        await this.video.requestPictureInPicture();
      }
    } catch (e) {
      this.showNotification('PiP not supported', 'error');
    }
  }

  updatePlayButton() {
    const playIcon = this.playPauseBtn.querySelector('.icon-play');
    const pauseIcon = this.playPauseBtn.querySelector('.icon-pause');
    if (this.isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  }

  updateVolumeIcon() {
    const high = this.volumeBtn.querySelector('.icon-vol-high');
    const muted = this.volumeBtn.querySelector('.icon-vol-muted');
    if (this.video.volume === 0) {
      high.style.display = 'none';
      muted.style.display = 'block';
    } else {
      high.style.display = 'block';
      muted.style.display = 'none';
    }
  }

  // Sync methods (called from socket events)
  syncPlay(time) {
    this.syncLock = true;
    this.video.currentTime = time;
    this.video.play();
    setTimeout(() => this.syncLock = false, 500);
  }

  syncPause(time) {
    this.syncLock = true;
    this.video.currentTime = time;
    this.video.pause();
    setTimeout(() => this.syncLock = false, 500);
  }

  syncSeek(time) {
    this.syncLock = true;
    this.video.currentTime = time;
    setTimeout(() => this.syncLock = false, 500);
  }

  syncPlaybackRate(rate) {
    this.currentSpeed = rate;
    this.video.playbackRate = rate;
    this.speedBtn.textContent = rate + 'x';
  }

  loadSubtitles(path) {
    // Remove existing tracks
    const existing = this.video.querySelectorAll('track');
    existing.forEach(t => t.remove());

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'Subtitles';
    track.srclang = 'en';
    track.src = path;
    track.default = true;
    this.video.appendChild(track);

    // Enable the track
    this.video.addEventListener('loadedmetadata', () => {
      if (this.video.textTracks.length > 0) {
        this.video.textTracks[0].mode = 'showing';
      }
    }, { once: true });

    if (this.video.textTracks.length > 0) {
      this.video.textTracks[0].mode = 'showing';
    }
    this.showNotification('Subtitles loaded');
  }

  showNotification(text, type = 'info') {
    const el = document.createElement('div');
    el.className = 'player-notification';
    el.innerHTML = `<span>${type === 'error' ? '⚠️' : 'ℹ️'}</span><span>${text}</span>`;
    this.notifications.appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  showKeyHint(text) {
    let hint = this.wrapper.querySelector('.shortcuts-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'shortcuts-hint';
      this.wrapper.appendChild(hint);
    }
    hint.textContent = text;
    hint.classList.add('show');

    clearTimeout(this.keyHintTimer);
    this.keyHintTimer = setTimeout(() => {
      hint.classList.remove('show');
    }, 800);
  }

  showFloatingReaction(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;
    el.style.left = (20 + Math.random() * 60) + '%';
    this.floatingReactions.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  formatTime(s) {
    if (isNaN(s) || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}

// Global instance
let player;

// Global functions for HTML onclick handlers
function togglePlay() { player?.togglePlay(); }
function skip(s) { player?.skip(s); }
function toggleMute() { player?.toggleMute(); }
function cycleSpeed() { player?.cycleSpeed(); }
function toggleFullscreen() { player?.toggleFullscreen(); }
function toggleTheater() { player?.toggleTheater(); }
function togglePiP() { player?.togglePiP(); }
function toggleSubtitlesPanel() {
  const sub = document.getElementById('subtitle-upload-input');
  sub.click();
}
