/* =============================================
   ZChess - Public player profile viewer
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const PublicProfile = {
  _current: null,
  _returnToGame: false,

  /** Active game on board page (multiplayer, AI, local) */
  hasActiveGameSession() {
    const board = ZChess.ChessBoard;
    if (!board?.gameState || board.gameOver) return false;
    if (ZChess.App?.currentPage !== 'play') return false;
    return true;
  },

  isOpen() {
    return document.getElementById('public-profile-overlay')?.classList.contains('open') || false;
  },

  sanitize(data, uid) {
    if (!data) return null;
    const gamesPlayed = data.gamesPlayed || 0;
    const wins = data.wins || 0;
    return {
      uid,
      username: data.username || 'Player',
      avatar: data.avatar || null,
      rating: data.rating ?? ZChess.ELO.INITIAL_RATING,
      xp: data.xp || 0,
      level: data.level || ZChess.getLevelFromXP?.(data.xp || 0) || 1,
      wins,
      losses: data.losses || 0,
      draws: data.draws || 0,
      gamesPlayed,
      winRate: gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0,
      winStreak: data.winStreak || 0,
      maxWinStreak: data.maxWinStreak || 0,
      createdAt: data.createdAt || null,
      recentGames: (data.recentGames || []).slice(0, 8)
    };
  },

  async fetchUser({ uid, username }) {
    const db = ZChess.Auth?.db;
    if (!db) return null;

    try {
      if (uid) {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) return this.sanitize(doc.data(), doc.id);
      }

      const name = (username || '').trim();
      if (name) {
        const snap = await db.collection('users')
          .where('username', '==', name)
          .limit(1)
          .get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          return this.sanitize(doc.data(), doc.id);
        }
      }
    } catch (e) {
      console.warn('[PublicProfile] fetch failed:', e);
    }

    return null;
  },

  isSelf(user) {
    const me = ZChess.Auth?.currentUser;
    if (!me || !user) return false;
    return (user.uid && me.uid === user.uid) || (user.username && me.username === user.username);
  },

  open(opts = {}) {
    if (!opts.uid && !opts.username) return;

    const me = ZChess.Auth?.currentUser;
    const isSelf = me && (
      (opts.uid && me.uid === opts.uid) ||
      (opts.username && me.username === opts.username)
    );

    this._returnToGame = this.hasActiveGameSession();

    if (isSelf && !this._returnToGame) {
      if (ZChess.App) ZChess.App.navigate('profile');
      return;
    }

    const overlay = document.getElementById('public-profile-overlay');
    if (!overlay) return;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    const body = document.getElementById('public-profile-body');
    if (body) {
      body.innerHTML = `<div class="public-profile-loading">${t('public_profile.loading')}</div>`;
    }

    this.fetchUser(opts).then(user => {
      if (!user) {
        if (body) {
          body.innerHTML = `<div class="public-profile-empty">${t('public_profile.not_found')}</div>`;
        }
        return;
      }
      this._current = user;
      this.render(user);
    });
  },

  close() {
    const overlay = document.getElementById('public-profile-overlay');
    overlay?.classList.remove('open', 'pp-during-game');
    document.body.style.overflow = '';
    document.body.classList.remove('public-profile-game-pause');
    this._current = null;
    this._returnToGame = false;
  },

  returnToGame() {
    this.close();
  },

  render(user) {
    const body = document.getElementById('public-profile-body');
    if (!body) return;

    const level = user.level || 1;
    const title = ZChess.getTitleForLevel ? ZChess.getTitleForLevel(level) : '';
    const league = ZChess.leagueBadgeHTML ? ZChess.leagueBadgeHTML(user.rating, 'league-badge-lg') : '';
    const memberSince = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString()
      : '-';

    body.innerHTML = `
      ${this._returnToGame ? `<p class="pp-game-hint">${t('public_profile.game_continues_hint')}</p>` : ''}
      <div class="pp-hero">
        <div class="pp-avatar" id="pp-avatar"></div>
        <div class="pp-hero-info">
          <h2 class="pp-username">${this._esc(user.username)}</h2>
          <p class="pp-title">${this._esc(title)}</p>
          <div class="pp-league">${league}</div>
          <p class="pp-meta">${t('public_profile.member_since')}: ${memberSince}</p>
        </div>
      </div>
      <div class="pp-stats-grid">
        <div class="pp-stat highlight"><span class="pp-stat-val">${user.rating}</span><span class="pp-stat-lbl">${t('profile.rating')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">${user.wins}</span><span class="pp-stat-lbl">${t('profile.wins')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">${user.losses}</span><span class="pp-stat-lbl">${t('profile.losses')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">${user.draws}</span><span class="pp-stat-lbl">${t('profile.draws')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">${user.winRate}%</span><span class="pp-stat-lbl">${t('profile.win_rate')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">${user.gamesPlayed}</span><span class="pp-stat-lbl">${t('profile.games_played')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">Lvl ${level}</span><span class="pp-stat-lbl">${t('profile.level')}</span></div>
        <div class="pp-stat"><span class="pp-stat-val">${user.maxWinStreak}</span><span class="pp-stat-lbl">${t('public_profile.best_streak')}</span></div>
      </div>
      <div class="pp-recent">
        <h3 class="pp-recent-title">${t('public_profile.recent_games')}</h3>
        <div class="pp-recent-list" id="pp-recent-list"></div>
      </div>
    `;

    if (ZChess.UserDisplay) {
      ZChess.UserDisplay.renderAvatar(document.getElementById('pp-avatar'), {
        username: user.username,
        avatar: user.avatar
      });
    }

    this._renderRecent(user.recentGames || []);

    document.getElementById('pp-back-to-game')?.addEventListener('click', () => this.returnToGame());
  },

  _renderRecent(games) {
    const el = document.getElementById('pp-recent-list');
    if (!el) return;

    if (!games.length) {
      el.innerHTML = `<p class="pp-recent-empty">${t('public_profile.no_games')}</p>`;
      return;
    }

    el.innerHTML = games.map((g, idx) => {
      const outcome = g.outcome || 'draw';
      const oc = outcome === 'win' ? 'success' : outcome === 'loss' ? 'error' : 'primary';
      const label = t(`profile.outcome_${outcome}`);
      const opp = ZChess.formatGameOpponent ? ZChess.formatGameOpponent(g) : (g.opponentUsername || '-');
      const dateStr = g.date ? new Date(g.date).toLocaleDateString() : '';
      const dur = g.durationSec != null && ZChess.formatDuration
        ? ZChess.formatDuration(g.durationSec) : '';
      const meta = [dateStr, dur, `${g.moves || 0} ${t('profile.moves_label')}`].filter(Boolean).join(' · ');
      const oppUid = g.opponentUid || '';
      const oppName = g.opponentUsername || '';
      const oppClass = oppUid ? ' pp-recent-opp player-profile-link' : ' pp-recent-opp';
      const oppAttrs = oppUid
        ? ` data-player-uid="${oppUid}"${oppName ? ` data-player-username="${this._esc(oppName)}"` : ''}`
        : '';

      return `
        <div class="pp-recent-item">
          <div class="pp-recent-main">
            <span class="${oppClass.trim()}" id="pp-recent-opp-${idx}"${oppAttrs}>${this._esc(opp)}</span>
            <span class="pp-recent-meta">${this._esc(meta)}</span>
          </div>
          <span class="badge badge-${oc}">${label}</span>
        </div>
      `;
    }).join('');

    games.forEach((g, idx) => {
      if (!g.opponentUid) return;
      const oppEl = document.getElementById(`pp-recent-opp-${idx}`);
      if (oppEl) {
        this.bindClick(oppEl, { uid: g.opponentUid, username: g.opponentUsername });
      }
    });
  },

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /** Attach click-to-open on element (avatar, name, row) */
  bindClick(el, opts = {}) {
    if (!el) return;

    const uid = opts.uid || el.dataset.playerUid || null;
    const username = opts.username || el.dataset.playerUsername || null;
    if (!uid && !username) return;

    el.classList.add('player-profile-link');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    if (uid) el.dataset.playerUid = uid;
    if (username) el.dataset.playerUsername = username;
    el.title = t('public_profile.view_profile');

    const open = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      this.open({ uid, username });
    };

    if (el._ppBound) return;
    el._ppBound = true;
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
    });
  },

  init() {
    document.getElementById('public-profile-close')?.addEventListener('click', () => this.close());
    document.getElementById('public-profile-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'public-profile-overlay') this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }
};

window.ZChess.PublicProfile = PublicProfile;

document.addEventListener('DOMContentLoaded', () => PublicProfile.init());

console.log('[ZChess] PublicProfile loaded');

})();
