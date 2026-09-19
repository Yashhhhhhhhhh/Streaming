// ============ VOICE CHAT (WebRTC) ============
class VoiceChatController {
  constructor() {
    this.localStream = null;
    this.peerConnections = new Map();
    this.isActive = false;
    this.isMuted = false;
    this.btn = document.getElementById('voice-chat-btn');

    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];
  }

  async toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      await this.start();
    }
  }

  async start() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      this.isActive = true;
      this.btn.classList.add('active');
      this.btn.title = 'Voice chat (active)';

      // Connect to all existing members
      if (window.roomMembers) {
        for (const member of window.roomMembers) {
          if (member.id !== window.socket?.id) {
            await this.createOffer(member.id);
          }
        }
      }

      showToast('Voice chat started', 'success');
    } catch (err) {
      console.error('Mic access failed:', err);
      showToast('Could not access microphone', 'error');
    }
  }

  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    // Remove all remote audio elements
    document.querySelectorAll('.remote-audio').forEach(el => el.remove());

    this.isActive = false;
    this.btn.classList.remove('active');
    this.btn.title = 'Voice chat';
    showToast('Voice chat ended', 'info');
  }

  async createOffer(peerId) {
    const pc = this.createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    window.socket.emit('webrtc-offer', {
      to: peerId,
      offer: pc.localDescription
    });
  }

  async handleOffer(from, offer) {
    if (!this.isActive) await this.start();

    const pc = this.createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    window.socket.emit('webrtc-answer', {
      to: from,
      answer: pc.localDescription
    });
  }

  async handleAnswer(from, answer) {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleIceCandidate(from, candidate) {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  createPeerConnection(peerId) {
    if (this.peerConnections.has(peerId)) {
      this.peerConnections.get(peerId).close();
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    // Add local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        window.socket.emit('webrtc-ice-candidate', {
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    // Remote stream
    pc.ontrack = (event) => {
      let audio = document.getElementById(`audio-${peerId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${peerId}`;
        audio.className = 'remote-audio';
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
      }
      audio.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId);
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  removePeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    const audio = document.getElementById(`audio-${peerId}`);
    if (audio) audio.remove();
  }

  toggleMute() {
    if (!this.localStream) return;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(t => {
      t.enabled = !this.isMuted;
    });
    showToast(this.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
  }
}

// Global instance
let voiceChat;

function toggleVoiceChat() {
  voiceChat?.toggle();
}
