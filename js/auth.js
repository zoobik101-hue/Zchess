/* =============================================
   ZChess - Firebase Authentication Manager
   Handles: Login, Register, Google Auth, Logout
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Auth = {
  currentUser: null,
  firebase: null,
  auth: null,
  db: null,
  listeners: [],
  _guestSignInPending: false,

  async init() {
    // Initialize Firebase if config is provided
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[Auth] Firebase SDK not loaded. Running in offline mode.');
        this.initOfflineMode();
        return;
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(ZChess.firebaseConfig);
      }

      this.firebase = firebase;
      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Listen for auth state changes
      this.auth.onAuthStateChanged(user => this.handleAuthChange(user));

      console.log('[Auth] Firebase initialized');
    } catch (err) {
      console.error('[Auth] Firebase init failed:', err);
      this.initOfflineMode();
    }
  },

  initOfflineMode() {
    // Load cached user for offline display
    try {
      const cached = localStorage.getItem(ZChess.STORAGE.USER_CACHE);
      if (cached) {
        const user = JSON.parse(cached);
        this.currentUser = user;
        this.handleAuthChange(user);
      } else {
        this.handleAuthChange(null);
      }
    } catch (e) {
      this.handleAuthChange(null);
    }
  },

  async handleAuthChange(firebaseUser) {
    if (firebaseUser) {
      if (firebaseUser.isAnonymous) {
        this.currentUser = this._buildGuestUser(firebaseUser.uid);
        this.notifyListeners();
        this.updateNavUI();
        return;
      }

      // Load user profile from Firestore
      try {
        if (this.db) {
          const doc = await this.db.collection('users').doc(firebaseUser.uid).get();
          if (doc.exists) {
            this.currentUser = { uid: firebaseUser.uid, email: firebaseUser.email, isGuest: false, ...doc.data() };
          } else {
            // Create profile for new user
            this.currentUser = await this.createUserProfile(firebaseUser);
          }
        } else {
          this.currentUser = {
            uid: firebaseUser.uid || 'local',
            username: firebaseUser.username || firebaseUser.email?.split('@')[0] || 'Player',
            email: firebaseUser.email || '',
            rating: firebaseUser.rating || ZChess.ELO.INITIAL_RATING,
            xp: firebaseUser.xp || 0,
            wins: firebaseUser.wins || 0,
            losses: firebaseUser.losses || 0,
            draws: firebaseUser.draws || 0,
            gamesPlayed: firebaseUser.gamesPlayed || 0,
            createdAt: firebaseUser.createdAt || new Date().toISOString(),
            avatar: firebaseUser.avatar || null,
            achievements: firebaseUser.achievements || []
          };
        }

        // Cache user data
        localStorage.setItem(ZChess.STORAGE.USER_CACHE, JSON.stringify(this.currentUser));

        // Check daily login
        this.checkDailyLogin();

      } catch (err) {
        console.error('[Auth] Failed to load user profile:', err);
        this.currentUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: firebaseUser.email?.split('@')[0] || 'Player',
          isGuest: false,
          rating: ZChess.ELO.INITIAL_RATING,
          xp: 0, wins: 0, losses: 0, draws: 0, gamesPlayed: 0,
          createdAt: new Date().toISOString(),
          achievements: []
        };
      }
    } else {
      await this.ensureGuestSession();
      if (!this.auth?.currentUser) {
        this.currentUser = null;
        localStorage.removeItem(ZChess.STORAGE.USER_CACHE);
        this.notifyListeners();
        this.updateNavUI();
      }
      return;
    }

    // Notify listeners
    this.notifyListeners();

    // Update UI
    this.updateNavUI();
  },

  _buildGuestUser(uid) {
    const suffix = (uid || '').slice(-4).toUpperCase() || String(1000 + Math.floor(Math.random() * 9000));
    const guestLabel = typeof t === 'function' ? t('common.guest') : 'Guest';
    return {
      uid,
      username: `${guestLabel} ${suffix}`,
      isGuest: true,
      email: '',
      rating: ZChess.ELO.INITIAL_RATING,
      xp: 0,
      level: 1,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesPlayed: 0,
      avatar: null,
      achievements: []
    };
  },

  async ensureGuestSession() {
    if (!this.auth || this._guestSignInPending) return;
    if (this.auth.currentUser) return;

    this._guestSignInPending = true;
    try {
      await this.auth.signInAnonymously();
      console.log('[Auth] Guest session started (anonymous)');
    } catch (err) {
      console.warn('[Auth] Anonymous sign-in failed. Enable Anonymous auth in Firebase Console.', err);
    } finally {
      this._guestSignInPending = false;
    }
  },

  async createUserProfile(firebaseUser) {
    const profile = {
      uid: firebaseUser.uid,
      username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Player',
      email: firebaseUser.email || '',
      rating: ZChess.ELO.INITIAL_RATING,
      xp: 0,
      level: 1,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesPlayed: 0,
      winStreak: 0,
      maxWinStreak: 0,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      avatar: null,
      achievements: [],
      recentGames: [],
      loginStreak: 1
    };

    if (this.db) {
      await this.db.collection('users').doc(firebaseUser.uid).set(profile);
    }

    return profile;
  },

  async register(email, password, username) {
    if (!this.auth) {
      // Offline mode - create local user
      return this.registerOffline(email, password, username);
    }

    try {
      // Check username uniqueness
      const usernameCheck = await this.db.collection('users')
        .where('username', '==', username).limit(1).get();

      if (!usernameCheck.empty) {
        throw { code: 'username-taken' };
      }

      const credential = await this.auth.createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({ displayName: username });

      // Create Firestore profile
      const profile = await this.createUserProfile({
        uid: credential.user.uid,
        email,
        displayName: username
      });

      ZChess.Notifications.success(t('notifications.register_success', { name: username }));
      return { success: true, user: profile };

    } catch (err) {
      let msg = t('notifications.error_generic');
      if (err.code === 'auth/email-already-in-use') msg = t('notifications.error_email_taken');
      if (err.code === 'username-taken') msg = t('notifications.error_username_taken');
      if (err.code === 'auth/weak-password') msg = 'Password must be at least 6 characters.';
      ZChess.Notifications.error(msg);
      return { success: false, error: err };
    }
  },

  registerOffline(email, password, username) {
    // Create offline user
    const user = {
      uid: 'local_' + Date.now(),
      username,
      email,
      rating: ZChess.ELO.INITIAL_RATING,
      xp: 0, level: 1, wins: 0, losses: 0, draws: 0, gamesPlayed: 0,
      winStreak: 0, maxWinStreak: 0,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      achievements: [], recentGames: [], loginStreak: 1
    };

    this.currentUser = user;
    localStorage.setItem(ZChess.STORAGE.USER_CACHE, JSON.stringify(user));
    this.notifyListeners();
    this.updateNavUI();

    ZChess.Notifications.success(t('notifications.register_success', { name: username }));
    return { success: true, user };
  },

  async login(email, password) {
    if (!this.auth) {
      return this.loginOffline(email, password);
    }

    try {
      await this.auth.signInWithEmailAndPassword(email, password);
      ZChess.Notifications.success(t('notifications.login_success', { name: this.currentUser?.username || '' }));
      return { success: true };
    } catch (err) {
      let msg = t('notifications.error_auth');
      ZChess.Notifications.error(msg);
      return { success: false, error: err };
    }
  },

  loginOffline(email, password) {
    // Try to find cached user
    try {
      const cached = localStorage.getItem(ZChess.STORAGE.USER_CACHE);
      if (cached) {
        const user = JSON.parse(cached);
        if (user.email === email) {
          this.currentUser = user;
          this.notifyListeners();
          this.updateNavUI();
          ZChess.Notifications.success(t('notifications.login_success', { name: user.username }));
          return { success: true };
        }
      }
    } catch (e) {}

    ZChess.Notifications.error(t('notifications.error_auth'));
    return { success: false };
  },

  async loginWithGoogle() {
    if (!this.auth) {
      ZChess.Notifications.error('Google sign-in requires Firebase configuration.');
      return { success: false };
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await this.auth.signInWithPopup(provider);
      return { success: true };
    } catch (err) {
      ZChess.Notifications.error(t('notifications.error_generic'));
      return { success: false, error: err };
    }
  },

  async logout() {
    if (this.auth) {
      await this.auth.signOut();
    } else {
      this.currentUser = null;
      localStorage.removeItem(ZChess.STORAGE.USER_CACHE);
      this.notifyListeners();
      this.updateNavUI();
    }
    ZChess.Notifications.info(t('notifications.logout_success'));
  },

  // Update user profile data
  async updateProfile(data) {
    if (!this.currentUser) return;

    this.currentUser = { ...this.currentUser, ...data };
    localStorage.setItem(ZChess.STORAGE.USER_CACHE, JSON.stringify(this.currentUser));

    if (this.db && this.currentUser.uid) {
      try {
        await this.db.collection('users').doc(this.currentUser.uid).update(data);
      } catch (e) {
        console.error('[Auth] Failed to update profile in Firestore:', e);
      }
    }

    this.notifyListeners();
  },

  // Save game result and update stats
  async saveGameResult(result) {
    if (!this.currentUser) return;

    const { outcome, opponentRating, isAI, aiDifficulty } = result;
    const user = this.currentUser;

    // Calculate rating change (only for rated games)
    let ratingChange = 0;
    if (!isAI || ['advanced', 'expert', 'grandmaster', 'impossible'].includes(aiDifficulty)) {
      ratingChange = this.calculateEloChange(user.rating, opponentRating || 1200, outcome);
    }

    // Calculate XP
    let xpGain = ZChess.XP[outcome.toUpperCase()] || ZChess.XP.LOSS;
    if (isAI && aiDifficulty) {
      const mult = ZChess.XP.WIN_VS_AI_MULTIPLIER[aiDifficulty] || 1;
      xpGain = Math.round(xpGain * mult);
    }

    // Win streak bonus
    let newStreak = outcome === 'win' ? (user.winStreak || 0) + 1 : 0;
    if (outcome === 'win' && newStreak > 1) {
      xpGain += ZChess.XP.WIN_STREAK_BONUS * Math.min(newStreak, 5);
    }

    const oldLevel = ZChess.getLevelFromXP(user.xp);
    const newXP = user.xp + xpGain;
    const newLevel = ZChess.getLevelFromXP(newXP);
    const newRating = Math.max(ZChess.ELO.MIN_RATING, user.rating + ratingChange);

    const gameRecord = {
      id: result.id || ('g_' + Date.now()),
      date: new Date().toISOString(),
      outcome,
      opponentType: result.opponentType || (isAI ? 'ai' : result.opponentUsername ? 'human' : 'unknown'),
      opponentUsername: result.opponentUsername || null,
      opponentUid: result.opponentUid || null,
      aiDifficulty: isAI ? aiDifficulty : null,
      opponentRating: opponentRating || null,
      ratingChange,
      moves: result.moves || result.moveHistory?.length || 0,
      durationSec: result.durationSec ?? 0,
      playerColor: result.playerColor || 'w',
      mode: result.mode || (isAI ? 'ai' : 'local'),
      moveHistory: result.moveHistory || []
    };

    const updates = {
      rating: newRating,
      xp: newXP,
      level: newLevel,
      wins: (user.wins || 0) + (outcome === 'win' ? 1 : 0),
      losses: (user.losses || 0) + (outcome === 'loss' ? 1 : 0),
      draws: (user.draws || 0) + (outcome === 'draw' ? 1 : 0),
      gamesPlayed: (user.gamesPlayed || 0) + 1,
      winStreak: newStreak,
      maxWinStreak: Math.max(user.maxWinStreak || 0, newStreak),
      recentGames: [gameRecord, ...(user.recentGames || [])].slice(0, 20)
    };

    await this.updateProfile(updates);

    // Level up notification
    if (newLevel > oldLevel) {
      ZChess.Notifications.levelUp(newLevel);
      if (ZChess.Sound) ZChess.Sound.playLevelUp();

      // Check level achievements
      if (ZChess.Achievements) {
        ZChess.Achievements.checkLevelAchievements(newLevel);
      }
    }

    // Check game achievements
    if (ZChess.Achievements) {
      ZChess.Achievements.checkGameAchievements(outcome, updates, isAI, aiDifficulty);
    }

    // Update daily tasks
    if (ZChess.DailyTasks) {
      ZChess.DailyTasks.recordGame(outcome, isAI);
    }

    return { xpGain, ratingChange, newLevel, oldLevel };
  },

  calculateEloChange(myRating, opponentRating, outcome) {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
    const actualScore = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;

    const gamesPlayed = this.currentUser?.gamesPlayed || 0;
    const K = gamesPlayed < 30 ? ZChess.ELO.K_FACTOR_NEW :
              myRating >= 2400 ? ZChess.ELO.K_FACTOR_MASTER :
              ZChess.ELO.K_FACTOR_NORMAL;

    return Math.round(K * (actualScore - expectedScore));
  },

  checkDailyLogin() {
    if (!this.currentUser) return;

    const today = new Date().toDateString();
    const lastLogin = this.currentUser.lastLoginDate;

    if (lastLogin !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const streak = lastLogin === yesterday ? (this.currentUser.loginStreak || 0) + 1 : 1;

      this.updateProfile({
        lastLoginDate: today,
        loginStreak: streak,
        xp: (this.currentUser.xp || 0) + ZChess.XP.DAILY_LOGIN
      });

      setTimeout(() => {
        ZChess.Notifications.success(t('notifications.daily_reward', { xp: ZChess.XP.DAILY_LOGIN }));
      }, 2000);

      if (ZChess.Achievements) {
        ZChess.Achievements.checkLoginStreakAchievements(streak);
      }
    }
  },

  // Auth state listeners
  onAuthChange(callback) {
    this.listeners.push(callback);
    // Call immediately with current state
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  },

  validateUsername(name) {
    const s = (name || '').trim();
    if (s.length < 3 || s.length > 20) return { ok: false, code: 'length' };
    if (!/^[a-zA-Z0-9_\u0400-\u04FF\u0500-\u052F]+$/.test(s)) return { ok: false, code: 'chars' };
    return { ok: true, value: s };
  },

  async changeUsername(newUsername) {
    if (!this.currentUser) throw { code: 'not-logged-in' };

    const v = this.validateUsername(newUsername);
    if (!v.ok) throw { code: 'invalid-username', reason: v.code };

    if (v.value === this.currentUser.username) return { success: true };

    if (this.db) {
      const snap = await this.db.collection('users')
        .where('username', '==', v.value)
        .limit(1)
        .get();
      if (!snap.empty && snap.docs[0].id !== this.currentUser.uid) {
        throw { code: 'username-taken' };
      }
    }

    if (this.auth?.currentUser) {
      try {
        await this.auth.currentUser.updateProfile({ displayName: v.value });
      } catch (e) {
        console.warn('[Auth] Firebase displayName update:', e);
      }
    }

    await this.updateProfile({ username: v.value });

    if (ZChess.Multiplayer?.syncPublicProfile) {
      await ZChess.Multiplayer.syncPublicProfile();
    }

    if (ZChess.UserDisplay) ZChess.UserDisplay.refreshAll();
    if (ZChess.Presence?.pulse) await ZChess.Presence.pulse();

    return { success: true };
  },

  async resizeAvatarFile(file) {
    const maxBytes = 280000;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);

        let quality = 0.88;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > maxBytes && quality > 0.45) {
          quality -= 0.07;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        URL.revokeObjectURL(url);

        if (dataUrl.length > 900000) {
          reject(new Error('too-large'));
          return;
        }
        resolve(dataUrl);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('bad-image'));
      };

      img.src = url;
    });
  },

  async setAvatarFromFile(file) {
    if (!this.currentUser) throw { code: 'not-logged-in' };
    if (!file || !file.type.startsWith('image/')) throw { code: 'not-image' };
    if (file.size > 5 * 1024 * 1024) throw { code: 'file-too-big' };

    const avatar = await this.resizeAvatarFile(file);
    await this.updateProfile({ avatar });

    if (ZChess.Multiplayer?.syncPublicProfile) {
      await ZChess.Multiplayer.syncPublicProfile();
    }

    if (ZChess.UserDisplay) ZChess.UserDisplay.refreshAll();
    if (ZChess.Presence?.pulse) await ZChess.Presence.pulse();

    return { success: true };
  },

  async removeAvatar() {
    if (!this.currentUser) return;
    await this.updateProfile({ avatar: null });
    if (ZChess.UserDisplay) ZChess.UserDisplay.refreshAll();
    if (ZChess.Presence?.pulse) await ZChess.Presence.pulse();
  },

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.currentUser));
    if (ZChess.UserDisplay) ZChess.UserDisplay.refreshAll();
  },

  updateNavUI() {
    const guestBtns = document.getElementById('nav-guest-btns');
    const userMenu = document.getElementById('nav-user-menu');
    const userNameNav = document.getElementById('user-name-nav');
    const userAvatarNav = document.getElementById('user-avatar-nav');

    if (this.currentUser) {
      if (guestBtns) guestBtns.style.display = 'none';
      if (userMenu) userMenu.style.display = 'flex';
      if (userNameNav) userNameNav.textContent = this.currentUser.username || 'Player';
      if (ZChess.UserDisplay) {
        ZChess.UserDisplay.renderAvatar(userAvatarNav, ZChess.UserDisplay.fromUser(this.currentUser));
      } else if (userAvatarNav) {
        userAvatarNav.textContent = (this.currentUser.username || 'P')[0].toUpperCase();
      }
    } else {
      if (guestBtns) guestBtns.style.display = 'flex';
      if (userMenu) userMenu.style.display = 'none';
    }
  },

  isLoggedIn() {
    return !!this.currentUser && !this.currentUser.isGuest;
  },

  isGuestSession() {
    return !!this.currentUser?.isGuest;
  }
};

window.ZChess.Auth = Auth;

console.log('[ZChess] Auth module loaded');

})();
