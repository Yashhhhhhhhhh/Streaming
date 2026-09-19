// ============ CHAT CONTROLLER ============
class ChatController {
  constructor() {
    this.messages = document.getElementById('chat-messages');
    this.input = document.getElementById('chat-input');
    this.typingIndicator = document.getElementById('typing-indicator');
    this.typingTimeout = null;
    this.typingUsers = new Set();

    this.initEvents();
  }

  initEvents() {
    // Send on Enter
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Typing indicator
    this.input.addEventListener('input', () => {
      if (window.socket) {
        window.socket.emit('typing');
      }
    });
  }

  sendMessage() {
    const text = this.input.value.trim();
    if (!text || !window.socket) return;

    window.socket.emit('chat-message', { text });
    this.input.value = '';
    this.input.focus();
  }

  addMessage(msg) {
    if (msg.type === 'system') {
      this.addSystemMessage(msg.text);
      return;
    }

    const isSelf = msg.userName === window.currentUser?.name;
    const el = document.createElement('div');
    el.className = `chat-msg ${isSelf ? 'self' : ''}`;

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const avatarHtml = typeof getAvatarSvg === 'function' ? getAvatarSvg(msg.avatar, 28) : '';

    el.innerHTML = `
      <div class="chat-msg-avatar">${avatarHtml}</div>
      <div class="chat-msg-bubble">
        <div class="chat-msg-name">${this.escapeHtml(msg.userName)}</div>
        <div class="chat-msg-text">${this.formatMessage(msg.text)}</div>
        <div class="chat-msg-time">${time}</div>
      </div>
    `;

    this.messages.appendChild(el);
    this.scrollToBottom();
  }

  addSystemMessage(text) {
    const el = document.createElement('div');
    el.className = 'chat-msg-system';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isLeave = text.toLowerCase().includes('left');
    const dotColor = isLeave ? '#ef4444' : '#22c55e';
    el.innerHTML = `
      <div class="system-chip">
        <span class="system-dot" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}"></span>
        <span class="system-text">${this.escapeHtml(text)}</span>
        <span class="system-time">${time}</span>
      </div>
    `;
    this.messages.appendChild(el);
    this.scrollToBottom();
  }

  showTyping(userName) {
    this.typingUsers.add(userName);
    this.updateTypingIndicator();

    // Clear after 3 seconds
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.typingUsers.delete(userName);
      this.updateTypingIndicator();
    }, 3000);
  }

  updateTypingIndicator() {
    if (this.typingUsers.size === 0) {
      this.typingIndicator.innerHTML = '';
      return;
    }

    const names = Array.from(this.typingUsers);
    const text = names.length === 1
      ? `${names[0]} is typing`
      : `${names.join(', ')} are typing`;

    this.typingIndicator.innerHTML = `
      ${text}
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
  }

  loadHistory(messages) {
    this.messages.innerHTML = '';
    messages.forEach(msg => this.addMessage(msg));
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messages.scrollTop = this.messages.scrollHeight;
    });
  }

  formatMessage(text) {
    // Escape HTML first, then apply formatting
    text = this.escapeHtml(text);
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Links (strict URL pattern without quotes or brackets)
    text = text.replace(/(https?:\/\/[^\s"'<>]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color: var(--accent-primary)">$1</a>');
    return text;
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

// Global functions (delegated to window controllers)
function sendChatMessage() { window.chat?.sendMessage(); }
function sendReaction(emoji) {
  if (window.socket) {
    window.socket.emit('reaction', { emoji });
    window.player?.showFloatingReaction(emoji);
  }
}
