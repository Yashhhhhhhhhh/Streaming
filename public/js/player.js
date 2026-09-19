// ============ VIDEO PLAYER CONTROLLER (HARDENED & FEATURE-RICH) ============
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
    this.isHoveringControls = false;
    this.isPopoverOpen = false;
    this.hudTimer = null;
    this.currentSpeed = 1;
    this.speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    this.lastVolume = parseFloat(localStorage.getItem('syncwatch-volume') || '1');
    this.keyHintTimer = null;
    this.wakeLock = null;

    // Audio booster via Web Audio API (for laptop speakers)
    this.audioContext = null;
    this.gainNode = null;
    this.audioBoostLevel = 1.0; // 1.0 = normal, 1.5 = boost, 2.0 = super boost

    // Subtitles
    this.subtitleTrack = null;
    this.subtitleOffset = 0; // In seconds
    this.rawCues = [];

    // Fullscreen chat overlay container
    this.initFullscreenChatOverlay();

    // Cinema Ambient Glow
    this.initAmbientGlow();

    // Heartbeat timer for host
    this.heartbeatTimer = null;

    this.initEvents();
    this.setVolume(this.lastVolume);
  }

  initAmbientGlow() {
    this.ambientCanvas = document.getElementById('ambient-glow-canvas');
    if (!this.ambientCanvas) return;
    this.ambientCtx = this.ambientCanvas.getContext('2d', { willReadFrequently: false });
    this.ambientCanvas.width = 16;
    this.ambientCanvas.height = 9;
    this.ambientEnabled = localStorage.getItem('syncwatch-ambient') !== 'false';
    this.ambientLoopRunning = false;

    const sampleFrame = () => {
      if (!this.ambientEnabled || !this.isPlaying || this.video.paused || this.video.ended || this.video.readyState < 2) {
        this.ambientLoopRunning = false;
        return;
      }
      try {
        if (this.ambientCtx) {
          this.ambientCtx.drawImage(this.video, 0, 0, 16, 9);
        }
      } catch (err) {
        // Suppress potential cross-origin taint
      }
      setTimeout(() => {
        if (this.ambientLoopRunning) requestAnimationFrame(sampleFrame);
      }, 120);
    };

    const startAmbient = () => {
      if (!this.ambientLoopRunning) {
        this.ambientLoopRunning = true;
        sampleFrame();
      }
    };

    this.video.addEventListener('play', startAmbient);
    this.video.addEventListener('playing', startAmbient);
    this.video.addEventListener('pause', () => { this.ambientLoopRunning = false; });
    this.video.addEventListener('ended', () => {
      this.ambientLoopRunning = false;
      if (this.ambientCtx) this.ambientCtx.clearRect(0, 0, 16, 9);
    });
  }

  initFullscreenChatOverlay() {
    let overlay = document.getElementById('fullscreen-chat-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fullscreen-chat-overlay';
      overlay.className = 'fullscreen-chat-overlay';
      this.wrapper.appendChild(overlay);
    }
    this.fullscreenChatOverlay = overlay;
  }

  initEvents() {
    // Video metadata
    this.video.addEventListener('loadedmetadata', () => {
      this.durationEl.textContent = this.formatTime(this.video.duration);
      this.showControls();
      this.centerPlayBtn.classList.add('show');
    });

    // Time update & drift synchronization
    this.video.addEventListener('timeupdate', () => {
      if (!this.isSeeking) {
        const pct = (this.video.currentTime / (this.video.duration || 1)) * 100;
        this.progressBar.style.width = pct + '%';
        this.currentTimeEl.textContent = this.formatTime(this.video.currentTime);

        // Host emits periodic sync heartbeat to keep all viewers in sync
        if (window.isHost && this.isPlaying && window.socket && !this.syncLock) {
          if (!this._lastHeartbeat || Date.now() - this._lastHeartbeat > 2500) {
            window.socket.emit('sync-heartbeat', {
              time: this.video.currentTime,
              isPlaying: this.isPlaying,
              rate: this.currentSpeed
            });
            this._lastHeartbeat = Date.now();
          }
        }
      }
    });

    // Buffering progress
    this.video.addEventListener('progress', () => {
      if (this.video.buffered.length > 0) {
        const buffered = this.video.buffered.end(this.video.buffered.length - 1);
        const pct = (buffered / (this.video.duration || 1)) * 100;
        this.progressBuffer.style.width = pct + '%';
      }
    });

    // Play event
    this.video.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayButton();
      this.centerPlayBtn.classList.remove('show');
      this.requestWakeLock();
      this.showCenterHud('<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>', 'Play');
      this.showControls();
    });

    // Pause event
    this.video.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayButton();
      this.centerPlayBtn.classList.add('show');
      this.releaseWakeLock();
      this.showCenterHud('<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>', 'Pause');
      this.showControls();
    });

    this.video.addEventListener('ended', () => {
      this.isPlaying = false;
      this.updatePlayButton();
      this.centerPlayBtn.classList.add('show');
      this.releaseWakeLock();
      this.showNotification('Video finished');
      this.showControls();
    });

    this.video.addEventListener('waiting', () => {
      this.showNotification('Buffering...', 'info');
    });

    this.video.addEventListener('error', () => {
      const err = this.video.error;
      let msg = 'Error decoding video format';
      if (err?.code === 4) {
        msg = 'Video codec not natively supported by browser. Try converting to MP4/H.264 or use Dual-Local mode.';
      }
      this.showNotification(msg, 'error');
    });

    // Progress bar interactions with edge clamping
    this.progressContainer.addEventListener('click', (e) => {
      const rect = this.progressContainer.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = pct * (this.video.duration || 0);
      this.seekTo(time, true);
    });

    this.progressContainer.addEventListener('mousemove', (e) => {
      const rect = this.progressContainer.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const clampedX = Math.max(30, Math.min(rect.width - 30, rawX));
      const pct = Math.max(0, Math.min(1, rawX / rect.width));
      const time = pct * (this.video.duration || 0);
      this.hoverTime.textContent = this.formatTime(time);
      this.progressHover.style.left = clampedX + 'px';
    });

    // Dragging seekbar
    let isDragging = false;
    this.progressContainer.addEventListener('mousedown', () => {
      isDragging = true;
      this.isSeeking = true;
      this.progressContainer.classList.add('scrubbing');
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const rect = this.progressContainer.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        this.progressBar.style.width = (pct * 100) + '%';
        this.currentTimeEl.textContent = this.formatTime(pct * (this.video.duration || 0));
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        this.isSeeking = false;
        this.progressContainer.classList.remove('scrubbing');
        const rect = this.progressContainer.getBoundingClientRect();
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        this.seekTo(pct * (this.video.duration || 0), true);
      }
    });

    // Volume slider & dynamic track fill
    this.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseFloat(e.target.value));
    });

    // Controls auto-hide lifecycle with active retention guard
    const controlsBar = this.wrapper.querySelector('.controls-bar');
    if (controlsBar) {
      controlsBar.addEventListener('mouseenter', () => {
        this.isHoveringControls = true;
        clearTimeout(this.hideControlsTimer);
      });
      controlsBar.addEventListener('mouseleave', () => {
        this.isHoveringControls = false;
        if (this.isPlaying) {
          this.scheduleHideControls();
        }
      });
    }

    this.wrapper.addEventListener('mousemove', () => {
      this.showControls();
    });

    this.wrapper.addEventListener('mouseleave', () => {
      if (this.isPlaying && !this.isPopoverOpen) {
        this.hideControls();
      }
    });

    // Click outside to dismiss subtitle popover
    document.addEventListener('click', (e) => {
      if (this.isPopoverOpen) {
        const popover = document.getElementById('subtitles-popover');
        const trigger = document.getElementById('subtitles-btn');
        if (popover && !popover.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
          this.closeSubtitlesPopover();
        }
      }
    });

    // Click debounce to eliminate double-click play/pause accidental toggle
    let clickTimer = null;
    this.video.addEventListener('click', (e) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      clickTimer = setTimeout(() => {
        this.togglePlay();
        clickTimer = null;
      }, 250);
    });

    this.video.addEventListener('dblclick', (e) => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      this.toggleFullscreen();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!document.getElementById('room-page')?.classList.contains('active')) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          this.skip(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          this.skip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolume(Math.min(1, this.video.volume + 0.05));
          this.showCenterHud('<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>', `Volume: ${Math.round(this.video.volume * 100)}%`);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolume(Math.max(0, this.video.volume - 0.05));
          this.showCenterHud('<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>', `Volume: ${Math.round(this.video.volume * 100)}%`);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          this.toggleMute();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          this.toggleTheater();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          this.togglePiP();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          this.cycleAudioBoost();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          if (typeof toggleSidebar === 'function') toggleSidebar();
          break;
        case '[':
          e.preventDefault();
          this.adjustSubtitleDelay(-0.5);
          break;
        case ']':
          e.preventDefault();
          this.adjustSubtitleDelay(0.5);
          break;
        case 'Escape':
          this.closeSubtitlesPopover();
          if (typeof closeDropModal === 'function') closeDropModal();
          break;
        case '1':
          if (document.getElementById('drop-action-modal')?.classList.contains('active')) {
            e.preventDefault();
            if (typeof handleDropChoice === 'function') handleDropChoice('local');
          }
          break;
        case '2':
          if (document.getElementById('drop-action-modal')?.classList.contains('active')) {
            e.preventDefault();
            if (typeof handleDropChoice === 'function') handleDropChoice('upload');
          }
          break;
      }
    });

    // Screen visibility change (re-request wake lock if playing)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isPlaying) {
        this.requestWakeLock();
      }
    });

    // Fullscreen state change
    document.addEventListener('fullscreenchange', () => {
      const isFs = !!document.fullscreenElement;
      const fsBtn = document.getElementById('fullscreen-btn');
      if (fsBtn) {
        fsBtn.title = isFs ? 'Exit Fullscreen (Press F)' : 'Fullscreen (Press F)';
        fsBtn.innerHTML = isFs
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,14 10,14 10,20"/><polyline points="20,10 14,10 14,4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,3 21,3 21,9"/><polyline points="9,21 3,21 3,15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
      }
    });
  }

  // ---- MEDIA LOADING ----
  loadMedia(media) {
    this.video.src = media.path;
    this.video.load();
    this.video.classList.add('visible');
    this.playerEmpty.style.display = 'none';
    this.npTitle.textContent = media.filename;
    this.npTitle.title = media.filename;
    this.controls.classList.add('visible');

    const modeBadge = document.getElementById('mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'Host Stream';
      modeBadge.className = 'mode-badge';
    }

    this.showNotification(`Now playing: ${media.filename}`);
  }

  loadLocalMedia(file) {
    if (this.currentMediaBlobUrl) {
      URL.revokeObjectURL(this.currentMediaBlobUrl);
      this.currentMediaBlobUrl = null;
    }
    const objectUrl = URL.createObjectURL(file);
    this.currentMediaBlobUrl = objectUrl;
    this.video.src = objectUrl;
    this.video.load();
    this.video.classList.add('visible');
    this.playerEmpty.style.display = 'none';
    this.npTitle.textContent = file.name;
    this.npTitle.title = file.name;
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

  // ---- PLAY / PAUSE / SEEK ----
  togglePlay() {
    if (!this.video.src) return;
    if (this.video.paused) {
      const p = this.video.play();
      if (p !== undefined) {
        p.catch(err => {
          console.warn('Playback prevented by browser autoplay policy:', err);
          this.showNotification('Click screen to allow audio/video playback', 'warning');
        });
      }
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
    const newTime = Math.max(0, Math.min(this.video.duration || 0, this.video.currentTime + seconds));
    this.seekTo(newTime, true);
    const sign = seconds > 0 ? '+' : '';
    const icon = seconds > 0 
      ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-5.64-8.36L23 10"/></svg>'
      : '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>';
    this.showCenterHud(icon, `${sign}${seconds}s`);
  }

  // ---- CONTROLS VISIBILITY LIFECYCLE ----
  showControls() {
    this.wrapper.classList.add('controls-visible');
    this.wrapper.classList.remove('hide-cursor');
    clearTimeout(this.hideControlsTimer);
    if (this.isPlaying && !this.isHoveringControls && !this.isPopoverOpen && !this.isSeeking) {
      this.scheduleHideControls();
    }
  }

  scheduleHideControls() {
    clearTimeout(this.hideControlsTimer);
    this.hideControlsTimer = setTimeout(() => {
      if (this.isPlaying && !this.isHoveringControls && !this.isPopoverOpen && !this.isSeeking) {
        this.hideControls();
      }
    }, 2500);
  }

  hideControls() {
    this.wrapper.classList.remove('controls-visible');
    this.wrapper.classList.add('hide-cursor');
  }

  // ---- CENTRAL TRANSIENT HUD FEEDBACK ----
  showCenterHud(iconSvg, text) {
    const hud = document.getElementById('player-hud-flash');
    const iconWrap = document.getElementById('hud-icon-wrap');
    const label = document.getElementById('hud-label');
    if (!hud || !iconWrap || !label) return;

    iconWrap.innerHTML = iconSvg;
    label.textContent = text;
    hud.classList.add('active');

    clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => {
      hud.classList.remove('active');
    }, 550);
  }

  // ---- VOLUME & AUDIO BOOST ----
  setVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    this.video.volume = v;
    this.volumeSlider.value = v;
    this.volumeSlider.style.setProperty('--volume-pct', `${Math.round(v * 100)}%`);
    this.updateVolumeIcon(v);
    if (v > 0) {
      this.lastVolume = v;
      localStorage.setItem('syncwatch-volume', v.toString());
    }
  }

  updateVolumeIcon(v = this.video.volume) {
    const high = this.volumeBtn.querySelector('.icon-vol-high');
    const muted = this.volumeBtn.querySelector('.icon-vol-muted');
    if (high && muted) {
      const isMuted = v === 0;
      high.style.display = isMuted ? 'none' : 'block';
      muted.style.display = isMuted ? 'block' : 'none';
    }
  }

  toggleMute() {
    if (this.video.volume > 0) {
      this.lastVolume = this.video.volume;
      this.setVolume(0);
      this.showCenterHud('<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>', 'Muted');
    } else {
      const targetVol = this.lastVolume || 0.8;
      this.setVolume(targetVol);
      this.showCenterHud('<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>', `Volume: ${Math.round(targetVol * 100)}%`);
    }
  }

  initAudioBooster() {
    if (this.audioContext) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaElementSource(this.video);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.audioBoostLevel;
      source.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    } catch (e) {
      console.warn('Audio booster unsupported or restricted:', e);
    }
  }

  cycleAudioBoost() {
    this.initAudioBooster();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.audioBoostLevel === 1.0) {
      this.audioBoostLevel = 1.5;
    } else if (this.audioBoostLevel === 1.5) {
      this.audioBoostLevel = 2.0;
    } else {
      this.audioBoostLevel = 1.0;
    }

    if (this.gainNode) {
      this.gainNode.gain.value = this.audioBoostLevel;
    }

    const pct = Math.round(this.audioBoostLevel * 100);
    const badge = document.getElementById('boost-badge');
    const btn = document.getElementById('boost-btn');
    if (badge) badge.textContent = `${pct}%`;
    if (btn) btn.classList.toggle('boosted', this.audioBoostLevel > 1.0);

    const boostIcon = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    this.showCenterHud(boostIcon, `Audio Boost: ${pct}%`);
  }

  // ---- SPEED & FULLSCREEN ----
  cycleSpeed() {
    const idx = this.speeds.indexOf(this.currentSpeed);
    this.currentSpeed = this.speeds[(idx + 1) % this.speeds.length];
    this.video.playbackRate = this.currentSpeed;
    const badge = document.getElementById('speed-badge');
    if (badge) badge.textContent = `${this.currentSpeed}x`;
    if (window.socket) {
      window.socket.emit('playback-rate', { rate: this.currentSpeed });
    }
    const speedIcon = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    this.showCenterHud(speedIcon, `Speed: ${this.currentSpeed}x`);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.wrapper.requestFullscreen().catch(() => {});
    }
  }

  toggleTheater() {
    const layout = document.querySelector('.room-layout');
    if (layout) {
      const isTheater = layout.classList.toggle('theater');
      const btn = document.getElementById('theater-btn');
      if (btn) btn.classList.toggle('active', isTheater);
    }
  }

  reset() {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.classList.remove('visible');
    if (this.playerEmpty) this.playerEmpty.style.display = '';
    if (this.npTitle) this.npTitle.textContent = 'Nothing';
    this.isPlaying = false;
    this.isSeeking = false;
    this.currentSpeed = 1;
    this.video.playbackRate = 1;
    this.releaseWakeLock();
    if (this.ambientCtx) this.ambientCtx.clearRect(0, 0, 16, 9);
    const speedBadge = document.getElementById('speed-badge');
    if (speedBadge) speedBadge.textContent = '1.0x';
    const modeBadge = document.getElementById('mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'Ready';
      modeBadge.className = 'mode-badge';
    }
    if (this.progressBar) this.progressBar.style.width = '0%';
    if (this.progressBuffer) this.progressBuffer.style.width = '0%';
    if (this.currentTimeEl) this.currentTimeEl.textContent = '0:00';
    if (this.durationEl) this.durationEl.textContent = '0:00';

    // Subtitles cleanup
    this.subtitleOffset = 0;
    const subOffsetEl = document.getElementById('popover-sub-offset');
    if (subOffsetEl) subOffsetEl.textContent = '0.0s';
    const subStatusEl = document.getElementById('popover-sub-status');
    if (subStatusEl) subStatusEl.textContent = 'No subtitles active';
    this.video.querySelectorAll('track').forEach(t => {
      try { if (t.track) t.track.mode = 'disabled'; } catch (e) {}
      t.remove();
    });

    // Revoke blob URLs
    if (this.currentMediaBlobUrl) {
      URL.revokeObjectURL(this.currentMediaBlobUrl);
      this.currentMediaBlobUrl = null;
    }
    if (this.currentSubtitleBlobUrl) {
      URL.revokeObjectURL(this.currentSubtitleBlobUrl);
      this.currentSubtitleBlobUrl = null;
    }

    this.updatePlayButton();
  }

  async togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video.src) {
        await this.video.requestPictureInPicture();
      }
    } catch (e) {
      this.showNotification('Picture-in-Picture not supported on this browser', 'error');
    }
  }

  // ---- SCREEN WAKE LOCK (Laptops) ----
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch (err) {
      // Ignore wake lock restrictions
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // ---- SUBTITLES & POPOVER ----
  loadSubtitles(pathOrBlobUrl, filename = 'Subtitles loaded') {
    if (this.currentSubtitleBlobUrl && this.currentSubtitleBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.currentSubtitleBlobUrl);
      this.currentSubtitleBlobUrl = null;
    }
    if (typeof pathOrBlobUrl === 'string' && pathOrBlobUrl.startsWith('blob:')) {
      this.currentSubtitleBlobUrl = pathOrBlobUrl;
    }

    const existing = this.video.querySelectorAll('track');
    existing.forEach(t => {
      try { if (t.track) t.track.mode = 'disabled'; } catch (e) {}
      t.remove();
    });

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'Subtitles';
    track.srclang = 'en';
    track.src = pathOrBlobUrl;
    track.default = true;

    // Track load event fires when the VTT/SRT resource is parsed
    track.addEventListener('load', () => {
      if (track.track) {
        track.track.mode = 'showing';
      }
    });

    this.video.appendChild(track);

    if (track.track) {
      track.track.mode = 'showing';
    }

    const statusEl = document.getElementById('popover-sub-status');
    if (statusEl) statusEl.textContent = `Active: ${filename}`;
    this.showNotification('Subtitles loaded');
  }

  loadLocalSubtitleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      let content = e.target.result;
      content = content.replace(/^\uFEFF/, ''); // Strip BOM

      let vttContent = content;
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.srt')) {
        vttContent = 'WEBVTT\n\n' + content
          .replace(/\r\n/g, '\n')
          .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, (_match, p1, p2) => {
            const parts = p1.split(':');
            const hh = parts[0].padStart(2, '0');
            return `${hh}:${parts[1]}:${parts[2]}.${p2}`;
          });
      } else if (lower.endsWith('.ass') || lower.endsWith('.ssa')) {
        vttContent = this.convertAssToVtt(content);
      }

      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);
      this.loadSubtitles(blobUrl, file.name);
      showToast(`Loaded subtitle: ${file.name}`, 'success');
      this.closeSubtitlesPopover();
    };
    reader.readAsText(file);
  }

  convertAssToVtt(assContent) {
    const lines = assContent.replace(/\r\n/g, '\n').split('\n');
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

      // Clean ASS override tags like {\an8}, {\pos(100,200)}, etc.
      text = text.replace(/\{[^}]+\}/g, '');
      text = text.replace(/\\N/g, '\n').replace(/\\n/g, '\n');
      text = text.trim();
      if (!text) continue;

      cues.push(`${cueIndex++}\n${formatTime(start)} --> ${formatTime(end)}\n${text}\n`);
    }

    return cues.join('\n');
  }

  adjustSubtitleDelay(deltaSeconds) {
    this.subtitleOffset = Math.round((this.subtitleOffset + deltaSeconds) * 10) / 10;
    if (this.video.textTracks) {
      for (let t = 0; t < this.video.textTracks.length; t++) {
        const track = this.video.textTracks[t];
        if (track && track.mode !== 'disabled' && track.cues) {
          for (let i = 0; i < track.cues.length; i++) {
            const cue = track.cues[i];
            cue.startTime = Math.max(0, cue.startTime + deltaSeconds);
            cue.endTime = Math.max(0, cue.endTime + deltaSeconds);
          }
        }
      }
    }
    const sign = this.subtitleOffset > 0 ? '+' : '';
    const text = `${sign}${this.subtitleOffset.toFixed(1)}s`;
    const badge = document.getElementById('sub-delay-badge');
    if (badge) badge.textContent = text;
    const clockIcon = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    this.showCenterHud(clockIcon, `Sub Delay: ${text}`);
  }

  resetSubtitleDelay() {
    const delta = -this.subtitleOffset;
    this.adjustSubtitleDelay(delta);
    this.subtitleOffset = 0;
    const badge = document.getElementById('sub-delay-badge');
    if (badge) badge.textContent = '0.0s';
  }

  toggleSubtitlesPopover(e) {
    if (e) e.stopPropagation();
    const popover = document.getElementById('subtitles-popover');
    if (!popover) return;
    const isOpen = popover.classList.toggle('open');
    this.isPopoverOpen = isOpen;
    if (isOpen) {
      this.showControls();
    }
  }

  closeSubtitlesPopover() {
    const popover = document.getElementById('subtitles-popover');
    if (popover) {
      popover.classList.remove('open');
      this.isPopoverOpen = false;
    }
  }

  // ---- SYNC PROTOCOL METHODS ----
  syncPlay(time) {
    if (!this.video.src) return;
    this.syncLock = true;
    if (Math.abs(this.video.currentTime - time) > 0.3) {
      this.video.currentTime = time;
    }
    const p = this.video.play();
    if (p !== undefined) {
      p.catch(() => {
        this.showNotification('Click screen to allow synchronized playback', 'warning');
      });
    }
    setTimeout(() => this.syncLock = false, 500);
  }

  syncPause(time) {
    if (!this.video.src) return;
    this.syncLock = true;
    if (Math.abs(this.video.currentTime - time) > 0.3) {
      this.video.currentTime = time;
    }
    this.video.pause();
    setTimeout(() => this.syncLock = false, 500);
  }

  syncSeek(time) {
    if (!this.video.src) return;
    this.syncLock = true;
    this.video.currentTime = time;
    setTimeout(() => this.syncLock = false, 500);
  }

  syncPlaybackRate(rate) {
    this.currentSpeed = rate;
    this.video.playbackRate = rate;
    const badge = document.getElementById('speed-badge');
    if (badge) {
      badge.textContent = rate + 'x';
    } else if (this.speedBtn) {
      this.speedBtn.textContent = rate + 'x';
    }
  }

  // Gentle drift correction from host heartbeat
  handleSyncHeartbeat({ time, isPlaying, rate }) {
    if (!this.video.src || this.syncLock) return;
    if (isPlaying && this.video.paused) {
      this.syncPlay(time);
      return;
    }
    if (!isPlaying && !this.video.paused) {
      this.syncPause(time);
      return;
    }

    const drift = this.video.currentTime - time; // Positive = ahead, negative = behind
    const absDrift = Math.abs(drift);

    if (absDrift > 2.0) {
      // Hard seek if drift is large (e.g. Wi-Fi paused for 2+ seconds)
      this.video.currentTime = time;
      this.video.playbackRate = rate;
    } else if (absDrift > 0.3) {
      // Gentle pitch-free catch-up
      if (drift > 0) {
        this.video.playbackRate = rate * 0.95; // Slightly slow down
      } else {
        this.video.playbackRate = rate * 1.05; // Slightly speed up to catch up
      }
    } else {
      // Perfectly in sync
      if (this.video.playbackRate !== rate) {
        this.video.playbackRate = rate;
      }
    }
  }

  // ---- FULLSCREEN CHAT OVERLAY ----
  showFullscreenChatMessage(msg) {
    if (!document.fullscreenElement) return;

    const el = document.createElement('div');
    el.className = 'fs-chat-bubble';
    const avatarHtml = typeof getAvatarSvg === 'function' ? getAvatarSvg(msg.avatar, 24) : '';
    el.innerHTML = `
      <span class="fs-chat-avatar">${avatarHtml}</span>
      <span class="fs-chat-name">${this.escapeHtml(msg.userName)}:</span>
      <span class="fs-chat-text">${this.escapeHtml(msg.text)}</span>
    `;

    this.fullscreenChatOverlay.appendChild(el);
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 400);
    }, 4500);
  }

  // ---- UI HELPERS ----
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

  showNotification(text, type = 'info') {
    const el = document.createElement('div');
    el.className = 'player-notification';
    const iconSvg = typeof getToastIconSvg === 'function' ? getToastIconSvg(type) : '';
    el.innerHTML = `<span class="player-notif-icon">${iconSvg}</span><span>${this.escapeHtml(text)}</span>`;
    this.notifications.appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, 3500);
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

  showFloatingReaction(reactionKey) {
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    const svgHtml = typeof getReactionSvg === 'function' ? getReactionSvg(reactionKey, 38) : '';
    el.innerHTML = svgHtml;
    el.style.left = (20 + Math.random() * 60) + '%';
    this.floatingReactions.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  formatTime(s) {
    if (isNaN(s) || !isFinite(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global HTML onclick handlers (delegated to window.player)
function togglePlay() { window.player?.togglePlay(); }
function skip(s) { window.player?.skip(s); }
function toggleMute() { window.player?.toggleMute(); }
function cycleSpeed() { window.player?.cycleSpeed(); }
function toggleFullscreen() { window.player?.toggleFullscreen(); }
function toggleTheater() { window.player?.toggleTheater(); }
function togglePiP() { window.player?.togglePiP(); }
function cycleAudioBoost() { window.player?.cycleAudioBoost(); }
function toggleSubtitlesPopover(e) { window.player?.toggleSubtitlesPopover(e); }
function closeSubtitlesPopover() { window.player?.closeSubtitlesPopover(); }
function adjustSubtitleDelay(s) { window.player?.adjustSubtitleDelay(s); }
function resetSubtitleDelay() { window.player?.resetSubtitleDelay(); }
function toggleSubtitlesPanel() {
  const sub = document.getElementById('subtitle-upload-input');
  sub?.click();
}
