/* =============================================
   ZChess - Game setup arena layout (sidebars + footer)
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const GameSetupPage = {

  _coinIconHtml() {
    return '<img class="arena-coin-icon" src="assets/Image/money.svg" width="16" height="16" alt="" aria-hidden="true">';
  },

  init() {
    this.renderDailySidebar();
    this.renderStatsSidebar();
    this.refreshFooter();
  },

  refresh() {
    this.renderDailySidebar();
    this.renderStatsSidebar();
    this.refreshFooter();
  },

  refreshFooter() {
    const el = document.getElementById('arena-footer-online-count');
    if (!el) return;
    const n = ZChess.Presence?._players?.length ?? 0;
    el.textContent = String(n);
  },

  renderDailySidebar() {
    const el = document.getElementById('arena-daily-tasks');
    if (!el || !ZChess.DailyTasks) return;

    const DT = ZChess.DailyTasks;
    if (!DT.tasksState) DT.loadState();

    const items = DT.TASK_DEFINITIONS.slice(0, 3);

    el.innerHTML = items.map(def => {
      const state = DT.getTaskState(def.id) || { progress: 0, completed: false, claimed: false };
      const pct = Math.min(100, Math.round((state.progress / def.target) * 100));
      const name = t(`daily_tasks.tasks.${def.id}_name`);
      const coin = def.xp;
      const done = state.completed || state.claimed;
      const reward = done
        ? '<span class="arena-task-reward arena-task-done" aria-label="Done">✓</span>'
        : `<span class="arena-task-reward">${this._coinIconHtml()}+${coin}</span>`;

      return `
        <div class="arena-task ${done ? 'is-done' : ''}">
          <div class="arena-task-row-top">
            <span class="arena-task-name">${this._esc(name)}</span>
            ${reward}
          </div>
          <div class="arena-task-progress-row">
            <div class="arena-task-bar">
              <div class="arena-task-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="arena-task-count">${state.progress}/${def.target}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderStatsSidebar() {
    const ratingEl = document.getElementById('arena-stat-rating');
    const winsEl = document.getElementById('arena-stat-wins');
    const lossEl = document.getElementById('arena-stat-losses');
    const drawEl = document.getElementById('arena-stat-draws');
    const streakEl = document.getElementById('arena-stat-streak');
    const guestEl = document.getElementById('arena-stats-guest');

    const user = ZChess.Auth?.currentUser;
    const loggedIn = ZChess.Auth?.isLoggedIn?.();

    if (guestEl) guestEl.hidden = !!loggedIn;

    const rating = loggedIn ? (user?.rating || 1200) : '-';
    const wins = loggedIn ? (user?.wins || 0) : '-';
    const losses = loggedIn ? (user?.losses || 0) : '-';
    const draws = loggedIn ? (user?.draws || 0) : '-';
    const streak = loggedIn ? (user?.maxWinStreak || user?.winStreak || 0) : '-';

    if (ratingEl) ratingEl.textContent = rating;
    if (winsEl) winsEl.textContent = wins;
    if (lossEl) lossEl.textContent = losses;
    if (drawEl) drawEl.textContent = draws;
    if (streakEl) streakEl.textContent = streak;

    const chart = document.getElementById('arena-rating-chart');
    if (chart) this._renderRatingChart(chart, loggedIn, user);
  },

  _renderRatingChart(chartEl, loggedIn, user) {
    const games = user?.gamesPlayed || 0;
    const wr = games > 0 ? (user?.wins || 0) / games : 0.5;
    const points = loggedIn
      ? [0.28, 0.34, 0.32, 0.4, 0.38, 0.46, 0.5, Math.min(0.82, 0.36 + wr * 0.42)]
      : [0.3, 0.32, 0.31, 0.34, 0.33, 0.35, 0.34, 0.33];

    const w = 120;
    const h = 44;
    const padX = 4;
    const padY = 6;
    const lineColor = 'rgba(95, 173, 106, 0.72)';
    const dotColor = 'rgba(95, 173, 106, 0.85)';
    const endDotColor = 'rgba(120, 196, 130, 0.95)';
    const coords = points.map((v, i) => {
      const x = padX + (i / (points.length - 1)) * (w - padX * 2);
      const y = h - padY - v * (h - padY * 2);
      return { x, y };
    });
    const poly = coords.map(p => `${p.x},${p.y}`).join(' ');
    const fillPoly = `${poly} ${coords[coords.length - 1].x},${h - padY} ${coords[0].x},${h - padY}`;
    const dots = coords.map((p, i) => {
      const last = i === coords.length - 1;
      return `<circle cx="${p.x}" cy="${p.y}" r="${last ? 2.8 : 1.8}" fill="${last ? endDotColor : dotColor}"${last ? ' class="arena-sparkline-dot-end"' : ''}/>`;
    }).join('');

    chartEl.innerHTML = `
      <svg class="arena-rating-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="arenaSparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(95, 173, 106, 0.14)"/>
            <stop offset="100%" stop-color="rgba(95, 173, 106, 0)"/>
          </linearGradient>
        </defs>
        <line class="arena-sparkline-axis" x1="${w - padX}" y1="${padY - 1}" x2="${w - padX}" y2="${h - padY}" />
        <polygon points="${fillPoly}" fill="url(#arenaSparkFill)"/>
        <polyline points="${poly}" fill="none" stroke="${lineColor}" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>`;
  },

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

window.ZChess.GameSetupPage = GameSetupPage;

})();
