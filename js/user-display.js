/* =============================================
   ZChess - Public user display (avatar + name)
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const UserDisplay = {
  /**
   * Render avatar into a circular container (replaces content).
   * @param {HTMLElement} el
   * @param {{ username?: string, avatar?: string|null }} user
   */
  renderAvatar(el, user) {
    if (!el) return;

    const name = user?.username || '?';
    const letter = name.charAt(0).toUpperCase();
    const avatar = user?.avatar;

    el.classList.remove('has-avatar-img');
    el.removeAttribute('data-initial');

    if (avatar && typeof avatar === 'string' && avatar.startsWith('data:image')) {
      el.innerHTML = `<img src="${avatar}" alt="" class="avatar-img" draggable="false" loading="lazy">`;
      el.classList.add('has-avatar-img');
      el.setAttribute('aria-label', name);
      return;
    }

    el.innerHTML = '';
    el.textContent = letter;
    el.setAttribute('data-initial', letter);
    el.setAttribute('aria-label', name);
  },

  /** User object from Auth or Firestore row */
  fromUser(user) {
    if (!user) return { username: t('common.guest'), avatar: null };
    return {
      username: user.username || user.displayName || 'Player',
      avatar: user.avatar || null
    };
  },

  refreshAll() {
    const user = ZChess.Auth?.currentUser;
    if (!user) return;

    const pub = this.fromUser(user);

    this.renderAvatar(document.getElementById('user-avatar-nav'), pub);
    this.renderAvatar(document.getElementById('profile-avatar-large'), pub);

    if (ZChess.ChessBoard?.multiplayerMode) {
      ZChess.ChessBoard.updatePlayerBars?.();
    }
  }
};

window.ZChess.UserDisplay = UserDisplay;

console.log('[ZChess] UserDisplay loaded');

})();
