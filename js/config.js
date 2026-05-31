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
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-zchess-project.firebaseapp.com",
  projectId: "your-zchess-project",
  storageBucket: "your-zchess-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxx",
  measurementId: "G-XXXXXXXXXX"
};

// ==========================================
// APP CONSTANTS
// ==========================================
window.ZChess.VERSION = '1.0.0';
window.ZChess.APP_NAME = 'ZChess';

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

// Level titles
window.ZChess.LEVEL_TITLES = {
  1: 'Newcomer', 5: 'Pawn', 10: 'Knight', 15: 'Bishop',
  20: 'Rook', 25: 'Queen', 30: 'King', 40: 'Champion',
  50: 'Master', 60: 'Grandmaster', 75: 'Legend', 100: 'Immortal'
};

window.ZChess.getTitleForLevel = function(level) {
  const thresholds = Object.keys(ZChess.LEVEL_TITLES).map(Number).sort((a,b) => b-a);
  for (const t of thresholds) {
    if (level >= t) return ZChess.LEVEL_TITLES[t];
  }
  return 'Newcomer';
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
  {
    id: 1,
    title: 'ZChess 1.0 - Platform Launch!',
    excerpt: 'We are thrilled to announce the official launch of ZChess. Play chess against AI or real players, track your progress, and climb the leaderboard.',
    content: 'Today marks a historic day for the ZChess platform. After months of development, we are proud to present a fully-featured chess experience...',
    tag: 'announcement',
    emoji: '🎉',
    date: '2026-05-31',
    readTime: 3
  },
  {
    id: 2,
    title: 'Introducing the AI Grandmaster Mode',
    excerpt: 'Our new Grandmaster AI uses a 6-ply minimax search with alpha-beta pruning and piece-square tables for near-master level play.',
    content: 'The Grandmaster AI represents our most challenging opponent yet...',
    tag: 'feature',
    emoji: '🤖',
    date: '2026-05-28',
    readTime: 4
  },
  {
    id: 3,
    title: 'Achievement System is Live',
    excerpt: 'Unlock over 20 achievements as you play, win, and improve on ZChess. Each achievement grants XP and brings you closer to the next level.',
    content: 'We have designed a comprehensive achievement system...',
    tag: 'feature',
    emoji: '🏆',
    date: '2026-05-25',
    readTime: 2
  },
  {
    id: 4,
    title: 'First Monthly Tournament - June 2026',
    excerpt: 'Join our first community tournament starting June 15th. All skill levels welcome. Top 3 players win exclusive titles and badges.',
    content: 'We are excited to announce our first monthly tournament...',
    tag: 'event',
    emoji: '⚔️',
    date: '2026-05-22',
    readTime: 3
  },
  {
    id: 5,
    title: 'PWA Support - Install ZChess on Your Device',
    excerpt: 'ZChess is now installable as a Progressive Web App. Get the native app experience on any device - mobile, tablet, or desktop.',
    content: 'ZChess now supports installation as a PWA...',
    tag: 'update',
    emoji: '📱',
    date: '2026-05-20',
    readTime: 2
  },
  {
    id: 6,
    title: 'Multilingual Support: English, Russian & Ukrainian',
    excerpt: 'ZChess now supports three languages. Switch between English, Russian, and Ukrainian instantly from any page.',
    content: 'We believe chess is for everyone, regardless of language...',
    tag: 'update',
    emoji: '🌍',
    date: '2026-05-18',
    readTime: 2
  }
];

console.log('[ZChess] Config loaded v' + ZChess.VERSION);

})();
