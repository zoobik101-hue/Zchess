/* =============================================
   ZChess - Achievement System
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Achievements = {

  DEFINITIONS: [
    { id: 'first_win', icon: '⚔️', condition: u => u.wins >= 1 },
    { id: 'win_5', icon: '🔥', condition: u => u.wins >= 5 },
    { id: 'win_50', icon: '🏆', condition: u => u.wins >= 50 },
    { id: 'win_100', icon: '👑', condition: u => u.wins >= 100 },
    { id: 'win_streak_3', icon: '⚡', condition: u => u.maxWinStreak >= 3 },
    { id: 'win_streak_5', icon: '🌪️', condition: u => u.maxWinStreak >= 5 },
    { id: 'beat_hard_ai', icon: '🤖', condition: u => u.beatenAI?.grandmaster },
    { id: 'beat_impossible', icon: '🌟', condition: u => u.beatenAI?.impossible },
    { id: 'play_100', icon: '♟️', condition: u => u.gamesPlayed >= 100 },
    { id: 'level_10', icon: '⭐', condition: u => (u.level || 1) >= 10 },
    { id: 'level_25', icon: '💎', condition: u => (u.level || 1) >= 25 },
    { id: 'level_50', icon: '🎖️', condition: u => (u.level || 1) >= 50 },
    { id: 'daily_login_7', icon: '📅', condition: u => u.loginStreak >= 7 },
    { id: 'daily_login_30', icon: '🗓️', condition: u => u.loginStreak >= 30 },
    { id: 'rating_1200', icon: '📈', condition: u => u.rating >= 1200 },
    { id: 'rating_1500', icon: '📊', condition: u => u.rating >= 1500 },
    { id: 'rating_1800', icon: '🎯', condition: u => u.rating >= 1800 },
    { id: 'rating_2000', icon: '🏅', condition: u => u.rating >= 2000 },
    { id: 'checkmate_queen', icon: '👸', condition: u => u.checkmateWith?.Q },
    { id: 'checkmate_knight', icon: '🐴', condition: u => u.checkmateWith?.N }
  ],

  // Check all achievements for a user
  checkAll(user) {
    const unlocked = new Set(user.achievements || []);
    const newlyUnlocked = [];

    for (const def of this.DEFINITIONS) {
      if (!unlocked.has(def.id)) {
        try {
          if (def.condition(user)) {
            unlocked.add(def.id);
            newlyUnlocked.push(def);
          }
        } catch (e) {}
      }
    }

    if (newlyUnlocked.length > 0) {
      this.unlock(newlyUnlocked, Array.from(unlocked));
    }

    return Array.from(unlocked);
  },

  unlock(achievements, allUnlocked) {
    // Update user profile
    if (ZChess.Auth.isLoggedIn()) {
      ZChess.Auth.updateProfile({
        achievements: allUnlocked,
        xp: ZChess.Auth.currentUser.xp + ZChess.XP.ACHIEVEMENT * achievements.length
      });
    }

    // Show notifications with delay
    achievements.forEach((ach, i) => {
      setTimeout(() => {
        const name = t(`achievements.list.${ach.id}_name`);
        const desc = t(`achievements.list.${ach.id}_desc`);
        ZChess.Notifications.achievement(name, desc);
        if (ZChess.Sound) ZChess.Sound.playAchievement();
      }, i * 1500);
    });
  },

  checkGameAchievements(outcome, stats, isAI, aiDifficulty) {
    if (!ZChess.Auth.isLoggedIn()) return;
    const user = { ...ZChess.Auth.currentUser, ...stats };

    if (outcome === 'win' && isAI) {
      user.beatenAI = { ...(user.beatenAI || {}), [aiDifficulty]: true };
    }

    this.checkAll(user);
  },

  checkLevelAchievements(level) {
    if (!ZChess.Auth.isLoggedIn()) return;
    const user = { ...ZChess.Auth.currentUser, level };
    this.checkAll(user);
  },

  checkLoginStreakAchievements(streak) {
    if (!ZChess.Auth.isLoggedIn()) return;
    const user = { ...ZChess.Auth.currentUser, loginStreak: streak };
    this.checkAll(user);
  },

  recordCheckmate(pieceType) {
    if (!ZChess.Auth.isLoggedIn()) return;
    const user = ZChess.Auth.currentUser;
    const checkmateWith = { ...(user.checkmateWith || {}), [pieceType]: true };
    ZChess.Auth.updateProfile({ checkmateWith });
    this.checkAll({ ...user, checkmateWith });
  },

  // Render achievements page
  renderAchievementsGrid(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const unlocked = new Set(ZChess.Auth.currentUser?.achievements || []);

    el.innerHTML = this.DEFINITIONS.map(def => {
      const isUnlocked = unlocked.has(def.id);
      const name = t(`achievements.list.${def.id}_name`);
      const desc = t(`achievements.list.${def.id}_desc`);

      return `
        <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <span class="achievement-icon">${def.icon}</span>
          <div class="achievement-name">${name}</div>
          <div class="achievement-desc">${desc}</div>
          ${isUnlocked ? '<div class="achievement-unlocked-date">✓ Unlocked</div>' : ''}
        </div>
      `;
    }).join('');
  }
};

window.ZChess.Achievements = Achievements;

console.log('[ZChess] Achievements module loaded');

})();
