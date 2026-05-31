/* =============================================
   ZChess - Toast Notification System
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Notifications = {
  container: null,
  queue: [],
  maxVisible: 5,
  defaultDuration: 4000,

  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(title, message = '', type = 'info', duration = this.defaultDuration) {
    if (!ZChess.Settings || ZChess.Settings.get('notifications') === false) return;

    const toast = this.createToast(title, message, type, duration);
    this.container.appendChild(toast);

    if (ZChess.Sound) {
      if (type === 'achievement') {
        ZChess.Sound.playAchievement();
      } else if (type !== 'info') {
        ZChess.Sound.playNotification();
      }
    }

    // Auto-remove
    setTimeout(() => this.remove(toast), duration);

    return toast;
  },

  createToast(title, message, type, duration) {
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠',
      achievement: '🏆',
      levelup: '⬆'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    // Click to dismiss
    toast.addEventListener('click', () => this.remove(toast));

    return toast;
  },

  remove(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('leaving');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  },

  success(title, message = '') {
    return this.show(title, message, 'success');
  },

  error(title, message = '') {
    return this.show(title, message, 'error');
  },

  info(title, message = '') {
    return this.show(title, message, 'info');
  },

  warning(title, message = '') {
    return this.show(title, message, 'warning');
  },

  achievement(name, desc = '') {
    return this.show(t('achievements.new_unlock'), name + (desc ? ': ' + desc : ''), 'achievement', 6000);
  },

  levelUp(level) {
    return this.show(t('notifications.level_up', { level }), '', 'levelup', 5000);
  }
};

window.ZChess.Notifications = Notifications;

console.log('[ZChess] Notifications module loaded');

})();
