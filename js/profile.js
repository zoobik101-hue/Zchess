/* =============================================
   ZChess - Player Profile Manager
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Profile = {

  renderProfile(user) {
    if (!user) return;

    const level = ZChess.getLevelFromXP(user.xp || 0);
    const xpCurrent = ZChess.getXPForCurrentLevel(level);
    const xpNext = ZChess.getXPForNextLevel(level);
    const xpProgress = ((user.xp - xpCurrent) / (xpNext - xpCurrent)) * 100;
    const winRate = user.gamesPlayed > 0
      ? Math.round((user.wins / user.gamesPlayed) * 100)
      : 0;

    const title = ZChess.getTitleForLevel(level);

    // Avatar
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    const setHTML = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = val;
    };

    setEl('profile-username', user.username || 'Player');
    setEl('profile-title', title);
    setEl('profile-avatar-text', (user.username || 'P')[0].toUpperCase());
    setEl('profile-level-text', `Lvl ${level}`);
    setEl('profile-rating-val', user.rating || ZChess.ELO.INITIAL_RATING);
    setEl('profile-wins-val', user.wins || 0);
    setEl('profile-losses-val', user.losses || 0);
    setEl('profile-draws-val', user.draws || 0);
    setEl('profile-winrate-val', `${winRate}%`);
    setEl('profile-games-val', user.gamesPlayed || 0);
    setEl('profile-xp-current', `${user.xp || 0} XP`);
    setEl('profile-xp-next', `${xpNext} XP`);

    const memberDate = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString()
      : '-';
    setEl('profile-member-since', memberDate);

    // XP bar
    const xpFill = document.getElementById('profile-xp-fill');
    if (xpFill) {
      setTimeout(() => {
        xpFill.style.width = `${Math.min(100, Math.max(0, xpProgress))}%`;
      }, 100);
    }

    // Recent games
    this.renderRecentGames(user.recentGames || []);

    // Achievements
    if (ZChess.Achievements) {
      ZChess.Achievements.renderAchievementsGrid('profile-achievements-grid');
    }
  },

  renderRecentGames(games) {
    const el = document.getElementById('profile-recent-games');
    if (!el) return;

    if (!games || games.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">♟️</div>
          <div class="empty-state-title">${t('profile.no_games')}</div>
        </div>
      `;
      return;
    }

    el.innerHTML = games.slice(0, 10).map(game => {
      const dateStr = game.date ? new Date(game.date).toLocaleDateString() : '';
      const outcomeClass = game.outcome === 'win' ? 'success' : game.outcome === 'loss' ? 'error' : '';
      const outcomeLabel = game.outcome === 'win' ? '✓ Win' : game.outcome === 'loss' ? '✕ Loss' : '= Draw';
      const ratingStr = game.ratingChange !== undefined
        ? (game.ratingChange >= 0 ? `+${game.ratingChange}` : game.ratingChange)
        : '';
      const ratingClass = game.ratingChange > 0 ? 'text-success' : game.ratingChange < 0 ? 'text-error' : '';

      return `
        <div class="task-item" style="padding:12px 16px;margin-bottom:6px">
          <div style="flex:1">
            <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${game.opponent || 'Unknown'}</div>
            <div style="font-size:12px;color:var(--text-muted)">${dateStr} · ${game.moves || 0} moves</div>
          </div>
          <div style="text-align:right">
            <div class="badge badge-${outcomeClass || 'primary'}" style="margin-bottom:4px">${outcomeLabel}</div>
            ${ratingStr ? `<div class="text-sm ${ratingClass}">${ratingStr}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  renderStatsChart(user) {
    // Simple text-based stats - would use Chart.js in production
    const el = document.getElementById('profile-stats-chart');
    if (!el || !user) return;

    const total = (user.wins || 0) + (user.losses || 0) + (user.draws || 0);
    if (total === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><div>${t('profile.no_games')}</div></div>`;
      return;
    }

    const wPct = Math.round(((user.wins || 0) / total) * 100);
    const lPct = Math.round(((user.losses || 0) / total) * 100);
    const dPct = 100 - wPct - lPct;

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="color:var(--color-success)">Wins</span>
            <span style="color:var(--color-success)">${user.wins || 0} (${wPct}%)</span>
          </div>
          <div class="task-progress-bar" style="height:8px">
            <div class="task-progress-fill" style="width:${wPct}%;background:var(--color-success)"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="color:var(--color-error)">Losses</span>
            <span style="color:var(--color-error)">${user.losses || 0} (${lPct}%)</span>
          </div>
          <div class="task-progress-bar" style="height:8px">
            <div class="task-progress-fill" style="width:${lPct}%;background:var(--color-error)"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="color:var(--text-muted)">Draws</span>
            <span style="color:var(--text-muted)">${user.draws || 0} (${dPct}%)</span>
          </div>
          <div class="task-progress-bar" style="height:8px">
            <div class="task-progress-fill" style="width:${dPct}%;background:var(--text-muted)"></div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
          Max Win Streak: ${user.maxWinStreak || 0} · Current: ${user.winStreak || 0}
        </div>
      </div>
    `;
  }
};

window.ZChess.Profile = Profile;

console.log('[ZChess] Profile module loaded');

})();
