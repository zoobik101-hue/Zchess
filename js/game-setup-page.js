/* =============================================
   ZChess - Game setup arena layout (sidebars + footer)
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const GameSetupPage = {

  init() {
    this.initAtmosphere();
    this.renderDailySidebar();
    this.renderStatsSidebar();
  },

  refresh() {
    this.renderDailySidebar();
    this.renderStatsSidebar();
  },

  initAtmosphere() {
    this._spawnParticles();
    this._bindParallax();
  },

  _spawnParticles() {
    const host = document.getElementById('arena-particles');
    if (!host || host.dataset.ready === '1') return;
    const root = document.documentElement;
    if (root.classList.contains('perf-lite') || root.classList.contains('perf-touch')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const count = 28;
    let html = '';
    for (let i = 0; i < count; i++) {
      const left = Math.random() * 100;
      const delay = (Math.random() * 12).toFixed(2);
      const dur = (8 + Math.random() * 10).toFixed(2);
      const size = 2 + Math.random() * 3;
      html += `<span class="arena-particle" style="left:${left}%;bottom:${Math.random() * 30}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s"></span>`;
    }
    host.innerHTML = html;
    host.dataset.ready = '1';
  },

  _bindParallax() {
    const page = document.getElementById('page-game');
    if (!page || page.dataset.parallax === '1') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

    page.dataset.parallax = '1';
    let raf = 0;
    let tx = 0;
    let ty = 0;

    const apply = () => {
      raf = 0;
      page.style.setProperty('--arena-px', `${tx}px`);
      page.style.setProperty('--arena-py', `${ty}px`);
    };

    page.addEventListener('mousemove', (e) => {
      const nx = ((e.clientX / window.innerWidth) - 0.5) * 18;
      const ny = ((e.clientY / window.innerHeight) - 0.5) * 12;
      tx = nx;
      ty = ny;
      if (!raf) raf = requestAnimationFrame(apply);
    });

    page.addEventListener('mouseleave', () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    });
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
        : `<span class="arena-task-reward"><span class="arena-coin-icon" aria-hidden="true">🪙</span>+${coin}</span>`;

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
    if (chart && loggedIn) {
      const games = user?.gamesPlayed || 0;
      const wr = games > 0 ? (user.wins || 0) / games : 0.5;
      const h = [0.35, 0.45, 0.4, 0.55, 0.5, 0.6, Math.min(0.95, 0.45 + wr * 0.5)];
      chart.innerHTML = h.map(v =>
        `<span class="arena-chart-bar" style="height:${Math.round(v * 100)}%"></span>`
      ).join('');
    } else if (chart) {
      chart.innerHTML = '<span class="arena-chart-bar" style="height:30%"></span>'.repeat(7);
    }
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
