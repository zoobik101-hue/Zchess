/* =============================================
   ZChess - Leaderboard
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Leaderboard = {
  currentTab: 'rating',
  data: [],

  async load(tab = 'rating') {
    this.currentTab = tab;
    const el = document.getElementById('leaderboard-body');
    if (!el) return;

    el.innerHTML = `
      <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
        <div class="animate-spin" style="display:inline-block;font-size:24px;margin-bottom:8px">⏳</div><br>
        ${t('leaderboard.loading')}
      </td></tr>
    `;

    // Try to load from Firestore
    if (ZChess.Auth.db) {
      try {
        let query = ZChess.Auth.db.collection('users').limit(50);

        if (tab === 'rating') query = query.orderBy('rating', 'desc');
        else if (tab === 'wins') query = query.orderBy('wins', 'desc');
        else if (tab === 'month') query = query.orderBy('monthlyRating', 'desc');

        const snapshot = await query.get();
        this.data = snapshot.docs.map((doc, i) => ({
          rank: i + 1,
          ...doc.data(),
          uid: doc.id
        }));

        this.render();
        return;
      } catch (e) {
        console.warn('[Leaderboard] Firestore load failed, using mock data');
      }
    }

    // Use mock data if offline
    this.data = this.getMockData();
    this.render();
  },

  getMockData() {
    const names = [
      'KnightRider42', 'QueenOfSpades', 'ChessWizard', 'GrandMaster99',
      'PawnStar', 'RookieKing', 'BishopStrike', 'CastlingPro',
      'ZenChess', 'EndgameMaster', 'OpeningTheory', 'TacticsKing',
      'BlindFoldGM', 'SpeedChess', 'EndgameSpecial', 'MidgameHero',
      'CheckMatePro', 'AlphaZero2', 'StockfishSlayer', 'GrandPrix'
    ];

    return names.map((name, i) => ({
      rank: i + 1,
      username: name,
      rating: 2400 - i * 60 + Math.floor(Math.random() * 40),
      wins: 200 - i * 8 + Math.floor(Math.random() * 20),
      losses: 50 + i * 5 + Math.floor(Math.random() * 10),
      draws: 20 + Math.floor(Math.random() * 15),
      gamesPlayed: 270 - i * 10 + Math.floor(Math.random() * 30),
      level: Math.max(1, 50 - i * 2)
    })).map(u => ({
      ...u,
      winRate: Math.round((u.wins / Math.max(1, u.gamesPlayed)) * 100)
    }));
  },

  render() {
    const el = document.getElementById('leaderboard-body');
    if (!el) return;

    if (!this.data.length) {
      el.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">${t('leaderboard.no_data')}</td></tr>`;
      return;
    }

    const currentUid = ZChess.Auth.currentUser?.uid;

    el.innerHTML = this.data.map((player, i) => {
      const rank = i + 1;
      const isCurrentUser = player.uid === currentUid || player.username === ZChess.Auth.currentUser?.username;
      const winRate = player.winRate ?? (player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0);

      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
      const initial = (player.username || '?')[0].toUpperCase();

      return `
        <tr class="${isCurrentUser ? 'current-user' : ''}">
          <td><div class="rank-badge ${rankClass}">${rank}</div></td>
          <td>
            <div class="leaderboard-player">
              <div class="lb-avatar">${initial}</div>
              <div>
                <div class="lb-name">${player.username || 'Unknown'}</div>
                <div class="lb-title" style="font-size:11px;color:var(--text-muted)">Lvl ${player.level || 1}</div>
              </div>
            </div>
          </td>
          <td style="font-weight:700;color:var(--text-primary)">${player.rating || 1200}</td>
          <td style="color:var(--color-success)">${player.wins || 0}</td>
          <td>${player.gamesPlayed || 0}</td>
          <td style="color:var(--accent-secondary)">${winRate}%</td>
        </tr>
      `;
    }).join('');

    // Update current user's rank
    this.updateUserRank();
  },

  updateUserRank() {
    const el = document.getElementById('user-rank-display');
    if (!el || !ZChess.Auth.currentUser) return;

    const user = ZChess.Auth.currentUser;
    const rank = this.data.findIndex(p =>
      p.uid === user.uid || p.username === user.username
    ) + 1;

    if (rank > 0) {
      el.textContent = `Your Rank: #${rank}`;
    } else {
      el.textContent = `Your Rating: ${user.rating || ZChess.ELO.INITIAL_RATING}`;
    }
  },

  setTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.leaderboard-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.load(tab);
  }
};

window.ZChess.Leaderboard = Leaderboard;

console.log('[ZChess] Leaderboard module loaded');

})();
