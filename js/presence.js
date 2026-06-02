/* =============================================
   ZChess - Site-wide online presence
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const LOGOUT_FLAG = 'zchess_explicit_logout';

const Presence = {
  HEARTBEAT_MS: 20000,
  ONLINE_MS: 50000,
  MAX_SHOW: 32,

  _heartbeat: null,
  _guestHeartbeat: null,
  _unsub: null,
  _players: [],
  _boundUnload: null,
  _localUid: null,
  _guestUid: null,
  _guestUsername: null,

  init() {
    this._boundUnload = () => this._markOffline();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (ZChess.Auth?.isLoggedIn()) this.pulse();
      else if (this._guestUid) this._pulseGuest();
    });
    document.addEventListener('langchange', () => this.render());

    const navPill = document.getElementById('nav-online-pill');
    if (navPill) {
      navPill.addEventListener('click', () => {
        if (ZChess.App?.currentPage !== 'home') {
          ZChess.App.navigate('home');
          setTimeout(() => this._scrollToLounge(), 400);
        } else {
          this._scrollToLounge();
        }
      });
    }

    ZChess.Auth?.onAuthChange((user) => {
      if (user) {
        this.stopGuestPresence();
        this.startRegistered();
      } else {
        this.stopRegistered();
        this.maybeStartGuestPresence();
      }
    });

    this.subscribe();
    if (ZChess.Auth?.isLoggedIn()) {
      this.startRegistered();
    } else {
      this.maybeStartGuestPresence();
    }
  },

  _scrollToLounge() {
    document.getElementById('online-lounge')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  db() {
    return ZChess.Auth?.db || null;
  },

  _status() {
    const MP = ZChess.Multiplayer;
    if (!MP) return 'online';
    if (MP.status === 'playing') return 'playing';
    if (MP.status === 'waiting' || MP.status === 'searching') return 'lobby';
    return 'online';
  },

  _guestDisplayName(uid) {
    const suffix = (uid || '').slice(-4).toUpperCase() || String(1000 + Math.floor(Math.random() * 9000));
    const guestLabel = typeof t === 'function' ? t('common.guest') : 'Guest';
    return `${guestLabel} ${suffix}`;
  },

  _wantsGuestPresence() {
    if (ZChess.Auth?._authBusy) return false;
    try {
      if (sessionStorage.getItem(LOGOUT_FLAG)) return false;
    } catch (_) { /* ignore */ }
    return !ZChess.Auth?.isLoggedIn();
  },

  async maybeStartGuestPresence() {
    if (!this._wantsGuestPresence()) return;
    await this.startGuestPresence();
  },

  async startGuestPresence() {
    if (!this._wantsGuestPresence()) return;

    const auth = ZChess.Auth?.auth;
    const db = this.db();
    if (!auth || !db) return;

    try {
      if (!auth.currentUser?.isAnonymous) {
        await auth.signInAnonymously();
      }
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      this._guestUid = uid;
      this._guestUsername = this._guestDisplayName(uid);
      this.stopGuestHeartbeat();
      await this._pulseGuest();
      this._guestHeartbeat = setInterval(() => this._pulseGuest(), this.HEARTBEAT_MS);
      window.addEventListener('beforeunload', this._boundUnload);
    } catch (e) {
      console.warn('[Presence] guest session failed:', e);
    }
  },

  async _pulseGuest() {
    const db = this.db();
    if (!db || !this._guestUid) return;

    try {
      await db.collection('presence').doc(this._guestUid).set({
        uid: this._guestUid,
        username: this._guestUsername || this._guestDisplayName(this._guestUid),
        avatar: null,
        rating: ZChess.ELO?.INITIAL_RATING ?? 1200,
        level: 1,
        isGuest: true,
        lastSeen: Date.now(),
        status: this._status()
      }, { merge: true });
    } catch (e) {
      console.warn('[Presence] guest pulse failed:', e);
    }
  },

  stopGuestHeartbeat() {
    if (this._guestHeartbeat) {
      clearInterval(this._guestHeartbeat);
      this._guestHeartbeat = null;
    }
  },

  async stopGuestPresence() {
    this.stopGuestHeartbeat();
    const db = this.db();
    const uid = this._guestUid;
    if (db && uid) {
      await db.collection('presence').doc(uid).update({ lastSeen: 0, status: 'offline' }).catch(() => {});
    }
    this._guestUid = null;
    this._guestUsername = null;

    const auth = ZChess.Auth?.auth;
    if (auth?.currentUser?.isAnonymous) {
      try { await auth.signOut(); } catch (_) { /* ignore */ }
    }
  },

  async pulse() {
    const db = this.db();
    const user = ZChess.Auth?.currentUser;
    if (!db || !user?.uid || user.isGuest) return;

    const level = user.level || (ZChess.getLevelFromXP ? ZChess.getLevelFromXP(user.xp || 0) : 1);

    try {
      await db.collection('presence').doc(user.uid).set({
        uid: user.uid,
        username: user.username || 'Player',
        avatar: user.avatar || null,
        rating: user.rating ?? ZChess.ELO?.INITIAL_RATING ?? 1200,
        level,
        isGuest: false,
        lastSeen: Date.now(),
        status: this._status()
      }, { merge: true });
    } catch (e) {
      console.warn('[Presence] pulse failed:', e);
    }
  },

  _markOffline() {
    const db = this.db();
    const uid = this._localUid || this._guestUid;
    if (!db || !uid) return;
    db.collection('presence').doc(uid).update({ lastSeen: 0, status: 'offline' }).catch(() => {});
  },

  startRegistered() {
    if (!ZChess.Auth?.isLoggedIn()) return;

    this._localUid = ZChess.Auth.currentUser.uid;
    this.stopHeartbeat();
    this.pulse();
    this._heartbeat = setInterval(() => this.pulse(), this.HEARTBEAT_MS);
    window.addEventListener('beforeunload', this._boundUnload);
  },

  stopHeartbeat() {
    if (this._heartbeat) {
      clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
    if (!this._guestUid) {
      window.removeEventListener('beforeunload', this._boundUnload);
    }
  },

  stopRegistered() {
    this.stopHeartbeat();
    const uid = this._localUid;
    const db = this.db();
    if (db && uid) {
      db.collection('presence').doc(uid).update({ lastSeen: 0, status: 'offline' }).catch(() => {});
    }
    this._localUid = null;
  },

  async stopAll() {
    this.stopRegistered();
    await this.stopGuestPresence();
  },

  unsubscribe() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },

  subscribe() {
    this.unsubscribe();
    const db = this.db();
    if (!db) {
      this._players = [];
      this.render();
      return;
    }

    const apply = (snap) => {
      const cutoff = Date.now() - this.ONLINE_MS;
      this._players = snap.docs
        .map(d => d.data())
        .filter(p => p && p.uid && p.username && (p.lastSeen || 0) > cutoff);

      const rank = { playing: 0, lobby: 1, online: 2 };
      this._players.sort((a, b) => {
        const ra = rank[a.status] ?? 2;
        const rb = rank[b.status] ?? 2;
        if (ra !== rb) return ra - rb;
        return (b.lastSeen || 0) - (a.lastSeen || 0);
      });

      this._updateNavPill();
      if (ZChess.App?.currentPage === 'home') {
        this.render();
      }
    };

    const onErr = (err) => {
      console.warn('[Presence] subscribe:', err);
      this._players = [];
      this.render();
    };

    try {
      const cutoff = Date.now() - this.ONLINE_MS;
      this._unsub = db.collection('presence')
        .where('lastSeen', '>', cutoff)
        .limit(60)
        .onSnapshot(apply, onErr);
    } catch (e) {
      onErr(e);
    }
  },

  _updateNavPill() {
    const n = this._players.length;
    const countEl = document.getElementById('nav-online-count');
    const pill = document.getElementById('nav-online-pill');
    if (countEl) countEl.textContent = String(n);
    if (pill) {
      pill.classList.toggle('has-players', n > 0);
      pill.setAttribute('aria-label', typeof t === 'function' ? t('online.nav_aria', { count: n }) : `${n} online`);
    }
  },

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _statusLabel(status) {
    if (status === 'playing') return t('online.status_playing');
    if (status === 'lobby') return t('online.status_lobby');
    return t('online.status_online');
  },

  render() {
    const strip = document.getElementById('online-players-strip');
    const empty = document.getElementById('online-empty');
    const countEl = document.getElementById('online-count');
    const statPlaying = document.getElementById('online-stat-playing');

    if (!strip) return;

    const list = this._players;
    const playingN = list.filter(p => p.status === 'playing').length;

    if (countEl) countEl.textContent = String(list.length);
    if (statPlaying) statPlaying.textContent = String(playingN);

    if (!list.length) {
      strip.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        strip.appendChild(empty);
      }
      return;
    }

    if (empty) empty.hidden = true;

    const show = list.slice(0, this.MAX_SHOW);
    const extra = list.length - show.length;
    const guestLbl = typeof t === 'function' ? t('online.guest_badge') : 'Guest';

    strip.innerHTML = show.map((p, i) => {
      const status = p.status || 'online';
      const statusClass = status === 'playing' ? 'is-playing' : status === 'lobby' ? 'is-lobby' : 'is-online';
      const isGuest = !!(p.isGuest || /^guest\s/i.test(p.username || '') || /^гость\s/i.test(p.username || ''));
      const meta = isGuest ? guestLbl : `Lvl ${p.level || 1}`;
      return `
        <button type="button" class="online-chip player-profile-link ${statusClass}${isGuest ? ' is-guest' : ''}"
          data-player-uid="${this._esc(p.uid)}"
          data-player-username="${this._esc(p.username)}"
          id="online-chip-${i}"
          title="${this._esc(this._statusLabel(status))}">
          <span class="online-chip-ring" aria-hidden="true"></span>
          <span class="online-chip-avatar" id="online-chip-av-${i}"></span>
          <span class="online-chip-name">${this._esc(p.username)}</span>
          <span class="online-chip-meta">${this._esc(meta)}</span>
        </button>
      `;
    }).join('') + (extra > 0
      ? `<div class="online-chip-more" aria-hidden="true">+${extra}</div>`
      : '');

    const PP = ZChess.PublicProfile;
    show.forEach((p, i) => {
      const av = document.getElementById(`online-chip-av-${i}`);
      if (ZChess.UserDisplay && av) {
        ZChess.UserDisplay.renderAvatar(av, { username: p.username, avatar: p.avatar });
      }
      const chip = document.getElementById(`online-chip-${i}`);
      if (PP && chip) PP.bindClick(chip, { uid: p.uid, username: p.username });
    });
  }
};

window.ZChess.Presence = Presence;

console.log('[ZChess] Presence loaded');

})();
