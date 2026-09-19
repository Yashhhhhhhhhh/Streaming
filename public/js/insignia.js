// ==========================================================================
// SYNCWATCH — BESPOKE THEMATIC VECTOR INSIGNIA & ICONOGRAPHY
// 100% Zero-Emoji Architecture • Military Precision & Pure Vector Craft
// ==========================================================================

const AVATAR_INSIGNIA = {
  scout: `
    <svg viewBox="0 0 48 54" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <path d="M24 2L4 8V24C4 36.5 12.5 47.8 24 51C35.5 47.8 44 36.5 44 24V8L24 2Z" fill="#101c14" stroke="#c5a059" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M24 6L8 11V24C8 34.2 14.8 43.6 24 46.5C33.2 43.6 40 34.2 40 24V11L24 6Z" fill="#17281d" opacity="0.6"/>
      <path d="M22 13C16 14 12 18 10 24C12 23 15 22 18 22C14 25 12 29 11 34C13 32 16 31 19 31C16 35 15 39 16 42C18 39 21 36 24 33V13H22Z" fill="#f1f5f9"/>
      <path d="M26 13C32 14 36 18 38 24C36 23 33 22 30 22C34 25 36 29 37 34C35 32 32 31 29 31C32 35 33 39 32 42C30 39 27 36 24 33V13H26Z" fill="#1e2b58"/>
      <line x1="24" y1="9" x2="24" y2="44" stroke="#c5a059" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`,

  blades: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <circle cx="24" cy="24" r="22" fill="#13171c" stroke="#64748b" stroke-width="1.8"/>
      <!-- Left Blade -->
      <path d="M12 36L34 10L36 12L14 38L10 38L10 34L12 36Z" fill="#e2e8f0"/>
      <!-- Right Blade -->
      <path d="M36 36L14 10L12 12L34 38L38 38L38 34L36 36Z" fill="#cbd5e1"/>
      <!-- Blade Notches -->
      <line x1="20" y1="18" x2="22" y2="20" stroke="#0f172a" stroke-width="1.5"/>
      <line x1="28" y1="18" x2="26" y2="20" stroke="#0f172a" stroke-width="1.5"/>
      <circle cx="24" cy="24" r="4" fill="#3b8a5a" stroke="#c5a059" stroke-width="1.5"/>
    </svg>`,

  garrison: `
    <svg viewBox="0 0 48 54" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <path d="M24 2L6 8V25C6 37 13.5 47.5 24 51C34.5 47.5 42 37 42 25V8L24 2Z" fill="#181414" stroke="#d97706" stroke-width="2.2" stroke-linejoin="round"/>
      <!-- Left Rose -->
      <circle cx="18" cy="22" r="6.5" fill="#dc2626"/>
      <path d="M18 18C15 19 14 22 16 25C19 25 21 23 20 20C19 19 18 18 18 18Z" fill="#b91c1c"/>
      <!-- Right Rose -->
      <circle cx="30" cy="28" r="6.5" fill="#ef4444"/>
      <path d="M30 24C27 25 26 28 28 31C31 31 33 29 32 26C31 25 30 24 30 24Z" fill="#991b1b"/>
      <!-- Entwined Thorny Vine -->
      <path d="M15 36C18 30 22 28 26 22C28 19 32 16 35 15" stroke="#3b8a5a" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="21" cy="28" r="1.5" fill="#3b8a5a"/>
      <circle cx="27" cy="20" r="1.5" fill="#3b8a5a"/>
    </svg>`,

  police: `
    <svg viewBox="0 0 48 54" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <path d="M24 2L6 8V25C6 37 13.5 47.5 24 51C34.5 47.5 42 37 42 25V8L24 2Z" fill="#0d1b14" stroke="#10b981" stroke-width="2.2" stroke-linejoin="round"/>
      <!-- Unicorn Silhouette -->
      <path d="M23 10L27 16H23L22 18H27L25 24L31 26C31 29 28 34 26 36L29 42H20L19 34C17 31 16 26 18 21L21 16L20 13L23 10Z" fill="#f8fafc"/>
      <path d="M24 10L32 6L28 13L24 10Z" fill="#fbbf24"/>
    </svg>`,

  wall: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <rect x="4" y="8" width="40" height="34" rx="4" fill="#11151c" stroke="#d97706" stroke-width="2"/>
      <!-- Rampart Crenellations -->
      <path d="M4 14H10V8H16V14H22V8H26V14H32V8H38V14H44" stroke="#d97706" stroke-width="2" stroke-linecap="round"/>
      <!-- Wall Gate -->
      <path d="M19 42V26C19 23.2 21.2 21 24 21C26.8 21 29 23.2 29 26V42H19Z" fill="#242c38" stroke="#d97706" stroke-width="1.8"/>
      <!-- Stone Brick Rows -->
      <line x1="8" y1="20" x2="16" y2="20" stroke="#475569" stroke-width="1.2"/>
      <line x1="32" y1="20" x2="40" y2="20" stroke="#475569" stroke-width="1.2"/>
      <line x1="8" y1="28" x2="15" y2="28" stroke="#475569" stroke-width="1.2"/>
      <line x1="33" y1="28" x2="40" y2="28" stroke="#475569" stroke-width="1.2"/>
    </svg>`,

  flare: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <circle cx="24" cy="24" r="22" fill="#08140c" stroke="#22c55e" stroke-width="2"/>
      <!-- Starburst Flare -->
      <path d="M24 6V42M6 24H42M11 11L37 37M11 37L37 11" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="24" cy="24" r="8" fill="#4ade80" opacity="0.9"/>
      <circle cx="24" cy="24" r="4" fill="#ffffff"/>
    </svg>`,

  anchor: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <circle cx="24" cy="24" r="22" fill="#0d1117" stroke="#38bdf8" stroke-width="2"/>
      <!-- Grapple Hook Anchor -->
      <circle cx="24" cy="11" r="3.5" stroke="#e2e8f0" stroke-width="2"/>
      <line x1="24" y1="14.5" x2="24" y2="39" stroke="#e2e8f0" stroke-width="2.5"/>
      <line x1="16" y1="20" x2="32" y2="20" stroke="#e2e8f0" stroke-width="2.2" stroke-linecap="round"/>
      <!-- Curved Anchor Flukes -->
      <path d="M10 27C10 36 17 41 24 41C31 41 38 36 38 27" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
      <polygon points="10,23 6,29 14,29" fill="#38bdf8"/>
      <polygon points="38,23 34,29 42,29" fill="#38bdf8"/>
    </svg>`,

  titan: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <circle cx="24" cy="24" r="22" fill="#140a08" stroke="#ea580c" stroke-width="2"/>
      <!-- Flame Core -->
      <path d="M24 8C27 15 35 20 35 29C35 36 29.5 40 24 40C18.5 40 13 36 13 29C13 22 21 16 24 8Z" fill="#ea580c"/>
      <path d="M24 16C26 21 30 24 30 30C30 34 27 37 24 37C21 37 18 34 18 30C18 25 22 22 24 16Z" fill="#f59e0b"/>
      <path d="M24 24C25 27 27 29 27 32C27 35 25 36 24 36C23 36 21 35 21 32C21 29 23 27 24 24Z" fill="#fef08a"/>
    </svg>`,

  recon: `
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <circle cx="24" cy="24" r="22" fill="#0a0e14" stroke="#64748b" stroke-width="2"/>
      <circle cx="24" cy="24" r="14" stroke="#38bdf8" stroke-width="1.6" stroke-dasharray="4 3"/>
      <circle cx="24" cy="24" r="6" stroke="#f1f5f9" stroke-width="1.8"/>
      <circle cx="24" cy="24" r="2" fill="#ef4444"/>
      <!-- Crosshairs -->
      <line x1="24" y1="4" x2="24" y2="14" stroke="#38bdf8" stroke-width="2"/>
      <line x1="24" y1="34" x2="24" y2="44" stroke="#38bdf8" stroke-width="2"/>
      <line x1="4" y1="24" x2="14" y2="24" stroke="#38bdf8" stroke-width="2"/>
      <line x1="34" y1="24" x2="44" y2="24" stroke="#38bdf8" stroke-width="2"/>
    </svg>`,

  heart: `
    <svg viewBox="0 0 48 54" fill="none" xmlns="http://www.w3.org/2000/svg" class="insignia-svg">
      <path d="M24 2L6 8V25C6 37 13.5 47.5 24 51C34.5 47.5 42 37 42 25V8L24 2Z" fill="#17120a" stroke="#c5a059" stroke-width="2.2" stroke-linejoin="round"/>
      <!-- Armored Gauntlet / Fist over Heart -->
      <path d="M24 14C20 14 16 17 16 22C16 29 24 36 24 36C24 36 32 29 32 22C32 17 28 14 24 14Z" fill="#991b1b"/>
      <!-- Fist Armor Plating -->
      <rect x="20" y="22" width="8" height="9" rx="2" fill="#c5a059" stroke="#fef08a" stroke-width="1"/>
      <line x1="20" y1="25" x2="28" y2="25" stroke="#78350f" stroke-width="1"/>
      <line x1="20" y1="28" x2="28" y2="28" stroke="#78350f" stroke-width="1"/>
    </svg>`
};

const TACTICAL_REACTIONS = {
  hearts: {
    label: 'Offer Your Hearts',
    svg: `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c5a059" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="rgba(197, 160, 89, 0.2)"/>
        <circle cx="12" cy="11" r="2.5" fill="#c5a059"/>
      </svg>`
  },
  flare: {
    label: 'Signal Flare',
    svg: `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="rgba(34, 197, 94, 0.2)"/>
      </svg>`
  },
  blades: {
    label: 'Crossed Blades',
    svg: `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
        <circle cx="12" cy="12" r="3" fill="#3b8a5a" stroke="#c5a059"/>
      </svg>`
  },
  fire: {
    label: 'Titan Heat',
    svg: `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="rgba(234, 88, 12, 0.2)"/>
      </svg>`
  },
  shield: {
    label: 'Iron Wall',
    svg: `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(56, 189, 248, 0.2)"/>
      </svg>`
  },
  sync: {
    label: 'Frame Lock',
    svg: `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        <circle cx="12" cy="12" r="2.5" fill="#a855f7"/>
      </svg>`
  }
};

const TOAST_ICONS = {
  success: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>`,
  error: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>`,
  info: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
    </svg>`,
  warning: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`
};

// ============ HELPER EXPORTS ============
function getAvatarSvg(avatarKey, size = 32) {
  const key = (avatarKey && AVATAR_INSIGNIA[avatarKey]) ? avatarKey : 'scout';
  const svg = AVATAR_INSIGNIA[key];
  return `<span class="insignia-badge" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;">${svg}</span>`;
}

function getReactionSvg(reactionKey, size = 22) {
  const rec = TACTICAL_REACTIONS[reactionKey] || TACTICAL_REACTIONS.hearts;
  return `<span class="reaction-icon" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;">${rec.svg}</span>`;
}

function getToastIconSvg(type = 'info') {
  return TOAST_ICONS[type] || TOAST_ICONS.info;
}

// Global exposure
window.AVATAR_INSIGNIA = AVATAR_INSIGNIA;
window.TACTICAL_REACTIONS = TACTICAL_REACTIONS;
window.TOAST_ICONS = TOAST_ICONS;
window.getAvatarSvg = getAvatarSvg;
window.getReactionSvg = getReactionSvg;
window.getToastIconSvg = getToastIconSvg;
