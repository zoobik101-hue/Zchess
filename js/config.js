/* =============================================
   ZChess - Firebase Configuration & App Constants
   IMPORTANT: Replace Firebase config with your own project values
   Get config at: https://console.firebase.google.com
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

// ==========================================
// FIREBASE CONFIGURATION
// Replace these values with your Firebase project settings
// ==========================================
window.ZChess.firebaseConfig = {
  apiKey: "AIzaSyCQZ8VJYUA9R6n5f-2_G-F7x6mVhg_Bin8",
  authDomain: "zchess-6633a.firebaseapp.com",
  projectId: "zchess-6633a",
  storageBucket: "zchess-6633a.firebasestorage.app",
  messagingSenderId: "782009616625",
  appId: "1:782009616625:web:da477098f57f2f7d46c150",
  measurementId: "G-5V63J817SV"
};

// ==========================================
// APP CONSTANTS
// ==========================================
window.ZChess.BUILD = '154821264522428';
window.ZChess.VERSION = '1.1.5';
window.ZChess.APP_NAME = 'ZChess';
window.ZChess.SITE_URL = 'https://zoobik101-hue.github.io/Zchess/';

// Rating leagues (display only)
window.ZChess.LEAGUES = [
  { id: 'bronze',   min: 0,    max: 999,  icon: '🥉', nameKey: 'league.bronze',   color: '#cd7f32' },
  { id: 'silver',   min: 1000, max: 1199, icon: '🥈', nameKey: 'league.silver',   color: '#b8c0cc' },
  { id: 'gold',     min: 1200, max: 1399, icon: '🥇', nameKey: 'league.gold',     color: '#d4af55' },
  { id: 'platinum', min: 1400, max: 1699, icon: '💎', nameKey: 'league.platinum', color: '#7dd3fc' },
  { id: 'diamond',  min: 1700, max: 99999, icon: '👑', nameKey: 'league.diamond', color: '#c4b5fd' }
];

window.ZChess.getLeague = function(rating) {
  const r = Math.max(0, Number(rating) || ZChess.ELO.INITIAL_RATING);
  return ZChess.LEAGUES.find(l => r >= l.min && r <= l.max) || ZChess.LEAGUES[0];
};

window.ZChess.formatGameOpponent = function(game) {
  if (!game) return typeof t === 'function' ? t('profile.opponent_unknown') : '?';

  if (game.opponentType === 'ai' && game.aiDifficulty) {
    const diff = typeof t === 'function' ? t(`game.difficulty_${game.aiDifficulty}`) : game.aiDifficulty;
    return `${typeof t === 'function' ? t('profile.opponent_ai') : 'AI'} · ${diff}`;
  }

  if (game.opponentUsername) return game.opponentUsername;
  if (game.opponentType === 'human') {
    return typeof t === 'function' ? t('profile.opponent_player') : 'Player';
  }

  if (game.opponent && /^AI\s*\(/i.test(game.opponent)) {
    const m = game.opponent.match(/\((\w+)\)/i);
    if (m) {
      const diff = typeof t === 'function' ? t(`game.difficulty_${m[1]}`) : m[1];
      return `${typeof t === 'function' ? t('profile.opponent_ai') : 'AI'} · ${diff}`;
    }
  }

  return typeof t === 'function' ? t('profile.opponent_unknown') : (game.opponent || '?');
};

window.ZChess.formatDuration = function(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s} ${t('profile.sec_short')}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return `${m} ${t('profile.min_short')}`;
  return `${m} ${t('profile.min_short')} ${r} ${t('profile.sec_short')}`;
};

window.ZChess.serializeMoveHistory = function(history) {
  if (!history || !history.length) return [];
  return history.map(m => ({
    from: { row: m.from.row, col: m.from.col },
    to: { row: m.to.row, col: m.to.col },
    promotion: m.promotion || null,
    castling: m.castling || null,
    notation: m.notation || ''
  }));
};

window.ZChess.leagueBadgeHTML = function(rating, extraClass) {
  const league = ZChess.getLeague(rating);
  const name = typeof t === 'function' ? t(league.nameKey) : league.id;
  const cls = 'league-badge' + (extraClass ? ' ' + extraClass : '');
  return `<span class="${cls}" data-league="${league.id}" style="--league-color:${league.color}">${league.icon} ${name}</span>`;
};

// Elo system constants
window.ZChess.ELO = {
  K_FACTOR_NEW: 40,       // For players with < 30 games
  K_FACTOR_NORMAL: 20,    // Standard K-factor
  K_FACTOR_MASTER: 10,    // For players rated 2400+
  INITIAL_RATING: 1200,
  MIN_RATING: 100
};

// XP system
window.ZChess.XP = {
  WIN: 80,
  LOSS: 20,
  DRAW: 40,
  WIN_VS_AI_MULTIPLIER: {
    beginner: 0.3,
    easy: 0.5,
    medium: 0.8,
    advanced: 1.0,
    expert: 1.3,
    grandmaster: 1.6,
    impossible: 2.0
  },
  DAILY_LOGIN: 25,
  ACHIEVEMENT: 50,
  QUEST_COMPLETION: 30,
  WIN_STREAK_BONUS: 15
};

// Level thresholds - XP required for each level
window.ZChess.LEVELS = (function() {
  const levels = [];
  let xp = 0;
  for (let i = 1; i <= 100; i++) {
    xp += Math.floor(100 * Math.pow(i, 1.5));
    levels.push(xp);
  }
  // Extend for levels beyond 100
  return levels;
})();

window.ZChess.getLevelFromXP = function(xp) {
  for (let i = 0; i < ZChess.LEVELS.length; i++) {
    if (xp < ZChess.LEVELS[i]) return i + 1;
  }
  return ZChess.LEVELS.length + 1;
};

window.ZChess.getXPForNextLevel = function(currentLevel) {
  return ZChess.LEVELS[currentLevel - 1] || ZChess.LEVELS[ZChess.LEVELS.length - 1] * 2;
};

window.ZChess.getXPForCurrentLevel = function(currentLevel) {
  return currentLevel <= 1 ? 0 : ZChess.LEVELS[currentLevel - 2];
};

// Level title keys (translated at display time via t())
window.ZChess.LEVEL_TITLES = {
  1: 'newcomer', 5: 'pawn', 10: 'knight', 15: 'bishop',
  20: 'rook', 25: 'queen', 30: 'king', 40: 'champion',
  50: 'master', 60: 'grandmaster', 75: 'legend', 100: 'immortal'
};

window.ZChess.getTitleKey = function(level) {
  const thresholds = Object.keys(ZChess.LEVEL_TITLES).map(Number).sort((a,b) => b-a);
  for (const th of thresholds) {
    if (level >= th) return 'level_titles.' + ZChess.LEVEL_TITLES[th];
  }
  return 'level_titles.newcomer';
};

// Returns translated title - call this in UI code
window.ZChess.getTitleForLevel = function(level) {
  const key = ZChess.getTitleKey(level);
  return (typeof t === 'function') ? t(key) : key.split('.')[1];
};

// AI difficulty settings
window.ZChess.AI_DIFFICULTIES = {
  beginner:    { depth: 1, name: 'Beginner',    emoji: '🌱' },
  easy:        { depth: 2, name: 'Easy',        emoji: '😊' },
  medium:      { depth: 3, name: 'Medium',      emoji: '🤔' },
  advanced:    { depth: 4, name: 'Advanced',    emoji: '💪' },
  expert:      { depth: 5, name: 'Expert',      emoji: '🔥' },
  grandmaster: { depth: 6, name: 'Grandmaster', emoji: '🏆' },
  impossible:  { depth: 7, name: 'Impossible',  emoji: '👾' }
};

// Piece unicode symbols
window.ZChess.PIECE_SYMBOLS = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

// Default settings
window.ZChess.DEFAULT_SETTINGS = {
  language: 'en',
  theme: 'dark',
  sounds: true,
  animations: true,
  notifications: true,
  showRating: true,
  boardTheme: 'classic',
  showLegalMoves: true,
  showLastMove: true,
  showCheck: true,
  autoFlip: false,
  moveSpeed: 'normal'
};

// Storage keys
window.ZChess.STORAGE = {
  SETTINGS: 'zchess_settings',
  USER_CACHE: 'zchess_user_cache',
  DAILY_TASKS: 'zchess_daily_tasks',
  GAME_STATE: 'zchess_game_state',
  ACHIEVEMENTS: 'zchess_achievements'
};

// News data (static - would come from Firestore in production)
window.ZChess.NEWS = [
  { id: 1, titleKey: 'news.a1_title', excerptKey: 'news.a1_excerpt', tag: 'announcement', emoji: '🎉', date: '2026-05-31', readTime: 3 },
  { id: 2, titleKey: 'news.a2_title', excerptKey: 'news.a2_excerpt', tag: 'feature', emoji: '🤖', date: '2026-05-28', readTime: 4 },
  { id: 3, titleKey: 'news.a3_title', excerptKey: 'news.a3_excerpt', tag: 'feature', emoji: '🏆', date: '2026-05-25', readTime: 2 },
  { id: 4, titleKey: 'news.a4_title', excerptKey: 'news.a4_excerpt', tag: 'feature', emoji: '🎓', date: '2026-06-01', readTime: 3 },
  { id: 5, titleKey: 'news.a5_title', excerptKey: 'news.a5_excerpt', tag: 'update', emoji: '📱', date: '2026-05-20', readTime: 2 },
  { id: 6, titleKey: 'news.a6_title', excerptKey: 'news.a6_excerpt', tag: 'update', emoji: '🌍', date: '2026-05-18', readTime: 2 }
];

console.log('[ZChess] Config loaded v' + ZChess.VERSION);

})();
