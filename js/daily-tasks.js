/* =============================================
   ZChess - Daily Tasks System
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const DailyTasks = {

  TASK_DEFINITIONS: [
    { id: 'play_game', icon: '♟️', xp: 30, target: 1, type: 'play' },
    { id: 'win_game', icon: '🏆', xp: 50, target: 1, type: 'win' },
    { id: 'beat_ai', icon: '🤖', xp: 40, target: 1, type: 'win_ai' },
    { id: 'win_streak', icon: '⚡', xp: 80, target: 3, type: 'streak' },
    { id: 'play_5', icon: '📆', xp: 60, target: 5, type: 'play' }
  ],

  tasksState: null,

  getStorageKey() {
    return ZChess.STORAGE.DAILY_TASKS;
  },

  getTodayKey() {
    return new Date().toDateString();
  },

  init() {
    this.loadState();
  },

  loadState() {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) {
        this.resetTasks();
        return;
      }

      const state = JSON.parse(raw);
      if (state.date !== this.getTodayKey()) {
        this.resetTasks();
      } else {
        this.tasksState = state;
      }
    } catch (e) {
      this.resetTasks();
    }
  },

  resetTasks() {
    this.tasksState = {
      date: this.getTodayKey(),
      tasks: this.TASK_DEFINITIONS.map(def => ({
        id: def.id,
        progress: 0,
        completed: false,
        claimed: false
      }))
    };
    this.save();
  },

  save() {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.tasksState));
    } catch (e) {}
  },

  getTaskState(id) {
    return this.tasksState?.tasks.find(t => t.id === id);
  },

  getDefinition(id) {
    return this.TASK_DEFINITIONS.find(d => d.id === id);
  },

  // Record a game result and update task progress
  recordGame(outcome, isAI) {
    if (!this.tasksState) this.loadState();

    let changed = false;

    for (const def of this.TASK_DEFINITIONS) {
      const state = this.getTaskState(def.id);
      if (!state || state.completed) continue;

      let increment = 0;
      switch (def.type) {
        case 'play':
          increment = 1;
          break;
        case 'win':
          if (outcome === 'win') increment = 1;
          break;
        case 'win_ai':
          if (outcome === 'win' && isAI) increment = 1;
          break;
        case 'streak': {
          const streak = ZChess.Auth.currentUser?.winStreak || 0;
          state.progress = Math.min(streak, def.target);
          if (state.progress >= def.target) state.completed = true;
          changed = true;
          continue;
        }
      }

      if (increment > 0) {
        state.progress = Math.min(state.progress + increment, def.target);
        if (state.progress >= def.target) {
          state.completed = true;
          this.onTaskCompleted(def);
        }
        changed = true;
      }
    }

    if (changed) {
      this.save();
      this.renderTasks();
    }
  },

  onTaskCompleted(def) {
    const name = t(`daily_tasks.tasks.${def.id}_name`);
    ZChess.Notifications.success(t('notifications.quest_complete', { name }));
  },

  claimReward(taskId) {
    const state = this.getTaskState(taskId);
    const def = this.getDefinition(taskId);

    if (!state || !def || !state.completed || state.claimed) return;

    state.claimed = true;
    this.save();

    if (ZChess.Auth.isLoggedIn()) {
      ZChess.Auth.updateProfile({
        xp: (ZChess.Auth.currentUser.xp || 0) + def.xp
      });
    }

    ZChess.Notifications.success(t('notifications.daily_reward', { xp: def.xp }));
    if (ZChess.Sound) ZChess.Sound.playLevelUp();

    this.renderTasks();
  },

  getTimeUntilReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  },

  renderTasks() {
    const el = document.getElementById('daily-tasks-list');
    if (!el) return;

    if (!this.tasksState) this.loadState();

    el.innerHTML = this.TASK_DEFINITIONS.map(def => {
      const state = this.getTaskState(def.id) || { progress: 0, completed: false, claimed: false };
      const pct = Math.round((state.progress / def.target) * 100);
      const name = t(`daily_tasks.tasks.${def.id}_name`);
      const desc = t(`daily_tasks.tasks.${def.id}_desc`);

      let actionBtn = '';
      if (state.claimed) {
        actionBtn = `<span class="badge badge-success">${t('daily_tasks.claimed')}</span>`;
      } else if (state.completed) {
        actionBtn = `<button class="btn btn-primary btn-sm" onclick="ZChess.DailyTasks.claimReward('${def.id}')">${t('daily_tasks.claim')}</button>`;
      }

      return `
        <div class="task-item ${state.completed ? 'completed' : ''} ${state.claimed ? 'claimed' : ''}">
          <div class="task-icon">${def.icon}</div>
          <div class="task-info">
            <div class="task-name">${name}</div>
            <div class="task-desc">${desc}</div>
            <div class="task-progress">
              <div class="task-progress-bar">
                <div class="task-progress-fill" style="width:${pct}%"></div>
              </div>
              <span class="task-progress-text">${state.progress}/${def.target}</span>
            </div>
          </div>
          <div class="task-reward">
            <div class="task-xp">+${def.xp} ${t('daily_tasks.xp_reward')}</div>
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');
  }
};

window.ZChess.DailyTasks = DailyTasks;

console.log('[ZChess] DailyTasks module loaded');

})();
