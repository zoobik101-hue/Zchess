/* =============================================
   ZChess - Player Profile Manager
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Profile = {
  _recentGames: [],
  _editBound: false,

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

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('profile-username', user.username || 'Player');
    setEl('profile-title', title);

    if (ZChess.UserDisplay) {
      ZChess.UserDisplay.renderAvatar(
        document.getElementById('profile-avatar-large'),
        ZChess.UserDisplay.fromUser(user)
      );
    } else {
      setEl('profile-avatar-text', (user.username || 'P')[0].toUpperCase());
    }

    const usernameInput = document.getElementById('profile-username-input');
    if (usernameInput) usernameInput.value = user.username || '';

    const removeBtn = document.getElementById('btn-remove-avatar');
    if (removeBtn) removeBtn.style.display = user.avatar ? '' : 'none';

    this.bindProfileEdit();

    const leagueEl = document.getElementById('profile-league-badge');
    if (leagueEl && ZChess.leagueBadgeHTML) {
      leagueEl.innerHTML = ZChess.leagueBadgeHTML(user.rating || ZChess.ELO.INITIAL_RATING, 'profile-league-badge');
    }

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

    const xpFill = document.getElementById('profile-xp-fill');
    if (xpFill) {
      setTimeout(() => {
        xpFill.style.width = `${Math.min(100, Math.max(0, xpProgress))}%`;
      }, 100);
    }

    this.renderRecentGames(user.recentGames || []);

    if (ZChess.Achievements) {
      ZChess.Achievements.renderAchievementsGrid('profile-achievements-grid');
    }
  },

  _modeLabel(mode) {
    const key = `profile.mode_${mode || 'local'}`;
    return t(key) !== key ? t(key) : mode;
  },

  _hasReplay(game) {
    return Array.isArray(game.moveHistory) && game.moveHistory.length > 0;
  },

  renderRecentGames(games) {
    const el = document.getElementById('profile-recent-games');
    if (!el) return;

    this._recentGames = games || [];

    if (!this._recentGames.length) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">♟️</div>
          <div class="empty-state-title">${t('profile.no_games')}</div>
        </div>
      `;
      return;
    }

    el.innerHTML = this._recentGames.slice(0, 12).map((game, index) => {
      const dateStr = game.date
        ? new Date(game.date).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      const outcome = game.outcome || 'draw';
      const outcomeClass = outcome === 'win' ? 'success' : outcome === 'loss' ? 'error' : 'primary';
      const outcomeLabel = t(`profile.outcome_${outcome}`);
      const opponent = ZChess.formatGameOpponent ? ZChess.formatGameOpponent(game) : (game.opponent || t('profile.opponent_unknown'));
      const oppUid = game.opponentUid || null;
      const oppName = game.opponentUsername || null;
      const oppClickClass = oppUid ? ' player-profile-link' : '';
      const oppDataAttrs = oppUid
        ? ` data-player-uid="${oppUid}"${oppName ? ` data-player-username="${this._escapeAttr(oppName)}"` : ''}`
        : '';
      const moveCount = game.moves || game.moveHistory?.length || 0;
      const duration = game.durationSec != null && ZChess.formatDuration
        ? ZChess.formatDuration(game.durationSec)
        : '';
      const colorLabel = game.playerColor === 'w'
        ? t('profile.you_white')
        : game.playerColor === 'b'
          ? t('profile.you_black')
          : '';
      const modeLabel = this._modeLabel(game.mode);
      const canReplay = this._hasReplay(game);
      const ratingStr = game.ratingChange !== undefined && game.ratingChange !== 0
        ? (game.ratingChange > 0 ? `+${game.ratingChange}` : `${game.ratingChange}`)
        : '';
      const ratingClass = game.ratingChange > 0 ? 'positive' : game.ratingChange < 0 ? 'negative' : '';

      const metaParts = [dateStr, duration, `${moveCount} ${t('profile.moves_label')}`, colorLabel].filter(Boolean);

      return `
        <button type="button" class="recent-game-card${canReplay ? ' can-replay' : ' no-replay'}" data-game-index="${index}" ${canReplay ? '' : 'disabled'}>
          <div class="recent-game-main">
            <span class="recent-game-opponent${oppClickClass}"${oppDataAttrs}>${this._escapeHtml(opponent)}</span>
            <div class="recent-game-meta">${metaParts.map(p => this._escapeHtml(p)).join(' · ')}</div>
            <div class="recent-game-tags">
              <span class="recent-game-mode">${this._escapeHtml(modeLabel)}</span>
              ${canReplay ? `<span class="recent-game-replay-hint">${t('profile.view_replay')}</span>` : `<span class="recent-game-replay-hint muted">${t('profile.no_replay_data')}</span>`}
            </div>
          </div>
          <div class="recent-game-side">
            <span class="badge badge-${outcomeClass}">${outcomeLabel}</span>
            ${ratingStr ? `<span class="recent-game-rating ${ratingClass}">${ratingStr}</span>` : ''}
            ${canReplay ? '<span class="recent-game-arrow" aria-hidden="true">›</span>' : ''}
          </div>
        </button>
      `;
    }).join('');

    if (ZChess.PublicProfile) {
      el.querySelectorAll('.recent-game-opponent.player-profile-link').forEach(elOpp => {
        ZChess.PublicProfile.bindClick(elOpp, {
          uid: elOpp.dataset.playerUid,
          username: elOpp.dataset.playerUsername
        });
      });
    }

    el.querySelectorAll('.recent-game-card.can-replay').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.gameIndex, 10);
        const game = this._recentGames[idx];
        if (game && ZChess.GameReplay) ZChess.GameReplay.open(game);
      });
    });
  },

  bindProfileEdit() {
    if (this._editBound) return;
    this._editBound = true;

    const avatarBtn = document.getElementById('profile-avatar-large');
    const fileInput = document.getElementById('profile-avatar-file');
    const saveBtn = document.getElementById('btn-save-username');
    const removeBtn = document.getElementById('btn-remove-avatar');
    const errEl = document.getElementById('profile-edit-error');

    const showErr = (msg) => {
      if (!errEl) return;
      if (!msg) { errEl.style.display = 'none'; errEl.textContent = ''; return; }
      errEl.textContent = msg;
      errEl.style.display = 'block';
    };

    const openFile = () => fileInput?.click();

    avatarBtn?.addEventListener('click', openFile);
    avatarBtn?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFile(); }
    });

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      showErr('');
      try {
        await ZChess.Auth.setAvatarFromFile(file);
        ZChess.Notifications?.success(t('profile.avatar_saved'));
        if (removeBtn) removeBtn.style.display = '';
        if (ZChess.Auth.currentUser) this.renderProfile(ZChess.Auth.currentUser);
      } catch (e) {
        const msg = e.code === 'file-too-big' ? t('profile.avatar_too_big')
          : e.code === 'not-image' ? t('profile.avatar_not_image')
          : t('profile.avatar_error');
        showErr(msg);
      }
    });

    removeBtn?.addEventListener('click', async () => {
      showErr('');
      await ZChess.Auth.removeAvatar();
      removeBtn.style.display = 'none';
      ZChess.Notifications?.info(t('profile.avatar_removed'));
      if (ZChess.Auth.currentUser) this.renderProfile(ZChess.Auth.currentUser);
    });

    saveBtn?.addEventListener('click', async () => {
      const input = document.getElementById('profile-username-input');
      const name = input?.value?.trim();
      showErr('');
      saveBtn.disabled = true;
      try {
        await ZChess.Auth.changeUsername(name);
        ZChess.Notifications?.success(t('profile.username_saved'));
        const unEl = document.getElementById('profile-username');
        if (unEl) unEl.textContent = ZChess.Auth.currentUser?.username || name;
        if (ZChess.Auth.currentUser) this.renderProfile(ZChess.Auth.currentUser);
      } catch (e) {
        const msg = e.code === 'username-taken' ? t('notifications.error_username_taken')
          : e.code === 'invalid-username' && e.reason === 'length' ? t('profile.username_length')
          : e.code === 'invalid-username' ? t('profile.username_chars')
          : t('profile.username_error');
        showErr(msg);
      } finally {
        saveBtn.disabled = false;
      }
    });
  },

  _escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  },

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderStatsChart(user) {
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
            <span style="color:var(--color-success)">${t('profile.wins')}</span>
            <span style="color:var(--color-success)">${user.wins || 0} (${wPct}%)</span>
          </div>
          <div class="task-progress-bar" style="height:8px">
            <div class="task-progress-fill" style="width:${wPct}%;background:var(--color-success)"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="color:var(--color-error)">${t('profile.losses')}</span>
            <span style="color:var(--color-error)">${user.losses || 0} (${lPct}%)</span>
          </div>
          <div class="task-progress-bar" style="height:8px">
            <div class="task-progress-fill" style="width:${lPct}%;background:var(--color-error)"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="color:var(--text-muted)">${t('profile.draws')}</span>
            <span style="color:var(--text-muted)">${user.draws || 0} (${dPct}%)</span>
          </div>
          <div class="task-progress-bar" style="height:8px">
            <div class="task-progress-fill" style="width:${dPct}%;background:var(--text-muted)"></div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
          ${t('profile.max_streak', { max: user.maxWinStreak || 0, current: user.winStreak || 0 })}
        </div>
      </div>
    `;
  }
};

window.ZChess.Profile = Profile;

console.log('[ZChess] Profile module loaded');

})();
