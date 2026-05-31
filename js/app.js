/* =============================================
   ZChess - Main Application Controller
   SPA Router + Page Rendering + Event Handling
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const App = {
  currentPage: null,
  gameSetupOptions: {},

  // --- Initialization ---

  async init() {
    console.log('[ZChess] Initializing...');

    // Init modules in order
    ZChess.Settings.init();
    ZChess.Notifications.init();
    ZChess.Sound.init();
    ZChess.DailyTasks.init();

    // Init i18n (loads current language)
    await ZChess.I18n.init();

    // Init Firebase auth
    await ZChess.Auth.init();

    // Init multiplayer module
    if (ZChess.Multiplayer) ZChess.Multiplayer.init();

    // Bind global events
    this.bindEvents();

    // Setup navbar scroll effect
    this.initNavbar();

    // Setup close-on-outside-click for dropdowns
    this.initDropdowns();

    // Register service worker
    this.registerSW();

    // Navigate to initial page
    this.handleRoute();

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());

    // Listen for auth changes to update UI
    ZChess.Auth.onAuthChange((user) => {
      this.updateAuthDependentUI();
      // Auto-close auth modal when user successfully signs in
      if (user) {
        const authModal = document.getElementById('auth-modal-overlay');
        if (authModal && authModal.classList.contains('open')) {
          this.closeModal('auth-modal-overlay');
        }
      }
    });

    // Listen for language changes
    document.addEventListener('langchange', () => {
      this.rerenderCurrentPage();
    });

    console.log('[ZChess] App initialized');
  },

  // --- Routing ---

  handleRoute() {
    const hash = window.location.hash.slice(1) || '';
    const parts = hash.split('/').filter(Boolean);
    const page = parts[0] || 'home';

    this.navigate(page, parts.slice(1));
  },

  navigate(page, params = []) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
    });

    const pageEl = document.getElementById(`page-${page}`);
    if (!pageEl) {
      this.navigate('home');
      return;
    }

    this.currentPage = page;
    pageEl.classList.add('active');

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Stop particles when leaving home page to free CPU
    if (page !== 'home' && ZChess.Particles) {
      ZChess.Particles.stop();
    }

    // Page-specific initialization
    this.onPageEnter(page, params);

    // Update URL (without triggering hashchange)
    const hash = params.length ? `#${page}/${params.join('/')}` : `#${page}`;
    if (window.location.hash !== hash) {
      history.pushState(null, '', hash);
    }

    // Scroll to top
    window.scrollTo(0, 0);
  },

  onPageEnter(page, params) {
    switch (page) {
      case 'home':
        this.initHomePage();
        break;
      case 'game':
        this.initGameSetupPage();
        break;
      case 'play':
        // Board was already set up before navigating
        break;
      case 'profile':
        this.initProfilePage();
        break;
      case 'leaderboard':
        this.initLeaderboardPage();
        break;
      case 'news':
        this.initNewsPage();
        break;
      case 'settings':
        this.initSettingsPage();
        break;
      case 'faq':
        this.initFAQPage();
        break;
      case 'rules':
        this.initRulesPage();
        break;
    }
  },

  // --- Page Initializers ---

  initHomePage() {
    // Start particles
    ZChess.Particles.init('hero-canvas');

    // Animate hero stat counters
    this.animateCounters();
  },

  animateCounters() {
    document.querySelectorAll('[data-counter]').forEach(el => {
      const target = parseInt(el.dataset.counter);
      const duration = 2000;
      const start = performance.now();

      const update = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(target * eased);

        if (target >= 1000000) {
          el.textContent = (value / 1000000).toFixed(1) + 'M+';
        } else if (target >= 1000) {
          el.textContent = (value / 1000).toFixed(1) + 'K+';
        } else {
          el.textContent = value + '+';
        }

        if (progress < 1) requestAnimationFrame(update);
      };

      requestAnimationFrame(update);
    });
  },

  initGameSetupPage() {
    // Reset setup
    this.gameSetupOptions = {
      mode: 'ai',
      difficulty: 'medium',
      playerColor: 'w',
      timeControl: 'unlimited'
    };

    this.renderGameSetup();
  },

  renderGameSetup() {
    // Mode selection
    document.querySelectorAll('.game-mode-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.mode === this.gameSetupOptions.mode);
    });

    // Difficulty selector - show/hide based on mode
    const diffEl = document.getElementById('difficulty-section');
    if (diffEl) {
      diffEl.style.display = this.gameSetupOptions.mode === 'ai' ? 'block' : 'none';
    }

    // Highlight selected difficulty
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.diff === this.gameSetupOptions.difficulty);
    });

    // Highlight play-as
    document.querySelectorAll('.play-as-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.color === this.gameSetupOptions.playerColor);
    });
  },

  startGame() {
    const opts = this.gameSetupOptions;

    // Determine player color
    let playerColor = opts.playerColor;
    if (playerColor === 'r') {
      playerColor = Math.random() < 0.5 ? 'w' : 'b';
    }

    // Navigate to play page
    this.navigate('play');

    // Small delay to let page render
    setTimeout(() => {
      ZChess.ChessBoard.startGame({
        mode: opts.mode,
        difficulty: opts.difficulty,
        playerColor
      });
    }, 100);
  },

  initProfilePage() {
    const user = ZChess.Auth.currentUser;
    if (!user) {
      this.showAuthModal('login');
      this.navigate('home');
      return;
    }

    ZChess.Profile.renderProfile(user);
    ZChess.Profile.renderStatsChart(user);
    ZChess.DailyTasks.renderTasks();
  },

  initLeaderboardPage() {
    ZChess.Leaderboard.load('rating');
  },

  initNewsPage() {
    const el = document.getElementById('news-grid');
    if (!el) return;

    el.innerHTML = ZChess.NEWS.map(article => `
      <div class="news-card animate-fade-in-up">
        <div class="news-thumbnail">${article.emoji}</div>
        <div class="news-body">
          <div class="news-tags">
            <span class="news-tag">${t(`news.tags.${article.tag}`)}</span>
          </div>
          <div class="news-title">${article.title}</div>
          <div class="news-excerpt">${article.excerpt}</div>
          <div class="news-footer">
            <span>${t('news.posted')} ${new Date(article.date).toLocaleDateString()}</span>
            <span>${article.readTime} ${t('news.min_read')}</span>
          </div>
        </div>
      </div>
    `).join('');
  },

  initSettingsPage() {
    const settings = ZChess.Settings.getAll();

    // Populate form fields
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.value = val;
    };

    setVal('setting-language', settings.language);
    setVal('setting-theme', settings.theme);
    setVal('setting-board-theme', settings.boardTheme);

    // Toggle switches
    const toggles = ['sounds', 'animations', 'notifications', 'showRating', 'showLegalMoves', 'showLastMove', 'showCheck', 'autoFlip'];
    toggles.forEach(key => {
      const el = document.getElementById(`setting-${key}`);
      if (el) el.classList.toggle('on', settings[key] !== false);
    });
  },

  initFAQPage() {
    const el = document.getElementById('faq-list');
    if (!el) return;

    const items = t('faq.items');
    if (!Array.isArray(items)) return;

    el.innerHTML = items.map((item, i) => `
      <div class="faq-item" onclick="ZChess.App.toggleFAQ(this)">
        <div class="faq-question">
          <span>${item.q}</span>
          <span class="faq-icon">+</span>
        </div>
        <div class="faq-answer">${item.a}</div>
      </div>
    `).join('');
  },

  toggleFAQ(el) {
    const isOpen = el.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(item => {
      if (item !== el) item.classList.remove('open');
    });
    el.classList.toggle('open', !isOpen);
  },

  initRulesPage() {
    const el = document.getElementById('rules-sections');
    if (!el) return;

    const sections = t('rules.sections');
    if (!Array.isArray(sections)) return;

    const icons = ['🎯', '♟️', '🏃', '⭐', '👑'];

    el.innerHTML = sections.map((section, i) => `
      <div class="rules-card animate-fade-in-up delay-${i + 1}">
        <div class="rules-card-title">
          ${icons[i] || '♟️'} ${section.title}
        </div>
        <div class="rules-card-content">${section.content}</div>
      </div>
    `).join('');
  },

  rerenderCurrentPage() {
    if (this.currentPage) {
      ZChess.I18n.updateDOM();
      this.onPageEnter(this.currentPage, []);
    }
  },

  updateAuthDependentUI() {
    // Update nav
    ZChess.Auth.updateNavUI();

    // If on profile page without being logged in, redirect
    if (this.currentPage === 'profile' && !ZChess.Auth.isLoggedIn()) {
      this.navigate('home');
    }
  },

  // --- Events Binding ---

  bindEvents() {
    // Nav links
    document.querySelectorAll('.nav-link, [data-nav]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const page = el.dataset.page || el.dataset.nav;
        if (page) this.navigate(page);
      });
    });

    // Logo click
    const logo = document.getElementById('nav-logo');
    if (logo) logo.addEventListener('click', () => this.navigate('home'));

    // Language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ZChess.I18n.setLanguage(btn.dataset.lang);
        ZChess.Settings.set('language', btn.dataset.lang);
      });
    });

    // Auth modal triggers
    document.getElementById('btn-login')?.addEventListener('click', () => this.showAuthModal('login'));
    document.getElementById('btn-register')?.addEventListener('click', () => this.showAuthModal('register'));

    // Auth modal tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        this.showAuthModal(mode);
      });
    });

    // Auth form submission
    document.getElementById('login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('register-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleRegister();
    });

    // Google auth - close modal on success
    const handleGoogleAuth = async () => {
      const result = await ZChess.Auth.loginWithGoogle();
      if (result && result.success !== false) {
        this.closeModal('auth-modal-overlay');
      }
    };
    document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleAuth);
    document.getElementById('btn-google-register')?.addEventListener('click', handleGoogleAuth);

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      this.closeAllModals();
      ZChess.Auth.logout();
    });

    // User avatar dropdown toggle
    document.getElementById('user-avatar-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-dropdown')?.classList.toggle('open');
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeModal(overlay.id);
      });
    });

    // Close buttons
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.closest('.modal-overlay')?.id || btn.dataset.closeModal;
        if (modalId) this.closeModal(modalId);
      });
    });

    // Game setup
    document.querySelectorAll('.game-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        // Quick match → open multiplayer lobby (just show it, user picks from 3 options)
        if (mode === 'quick') {
          if (!ZChess.Auth.isLoggedIn()) { this.showAuthModal('login'); return; }
          ZChess.Multiplayer?.showLobby('lobby-choose');
          return;
        }
        this.gameSetupOptions.mode = mode;
        this.renderGameSetup();
      });
    });

    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.gameSetupOptions.difficulty = btn.dataset.diff;
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    document.querySelectorAll('.play-as-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.gameSetupOptions.playerColor = btn.dataset.color;
        document.querySelectorAll('.play-as-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    document.getElementById('btn-start-game')?.addEventListener('click', () => this.startGame());

    // Chess board controls
    document.getElementById('btn-flip-board')?.addEventListener('click', () => ZChess.ChessBoard.flipBoard());
    document.getElementById('btn-undo-move')?.addEventListener('click', () => ZChess.ChessBoard.undoMove());
    document.getElementById('btn-resign')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to resign?')) ZChess.ChessBoard.resign();
    });
    document.getElementById('btn-new-game')?.addEventListener('click', () => {
      this.navigate('game');
    });

    // Game result modal actions
    document.getElementById('btn-result-new-game')?.addEventListener('click', () => {
      this.closeModal('game-result-overlay');
      this.navigate('game');
    });
    document.getElementById('btn-result-menu')?.addEventListener('click', () => {
      this.closeModal('game-result-overlay');
      this.navigate('home');
    });

    // Promotion modal close
    document.getElementById('promotion-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) document.getElementById('promotion-overlay').classList.remove('open');
    });

    // Settings
    document.getElementById('btn-save-settings')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
      ZChess.Settings.reset();
      this.initSettingsPage();
      ZChess.Notifications.info('Settings reset to defaults.');
    });

    // Leaderboard tabs
    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
      tab.addEventListener('click', () => ZChess.Leaderboard.setTab(tab.dataset.tab));
    });

    // Mobile menu
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      document.getElementById('mobile-nav').classList.toggle('open');
    });

    // Hero CTA
    document.getElementById('btn-hero-play')?.addEventListener('click', () => this.navigate('game'));
    document.getElementById('btn-hero-how')?.addEventListener('click', () => this.navigate('rules'));
    document.getElementById('btn-cta-start')?.addEventListener('click', () => {
      if (ZChess.Auth.isLoggedIn()) this.navigate('game');
      else this.showAuthModal('register');
    });

    // ---- Multiplayer lobby ----
    this.bindLobbyEvents();

    // Profile nav link
    document.getElementById('nav-profile-link')?.addEventListener('click', () => this.navigate('profile'));
  },

  // --- Auth Modal ---

  showAuthModal(mode = 'login') {
    const overlay = document.getElementById('auth-modal-overlay');
    const loginForm = document.getElementById('login-form-wrap');
    const registerForm = document.getElementById('register-form-wrap');

    if (!overlay) return;

    overlay.classList.add('open');

    if (mode === 'login') {
      if (loginForm) loginForm.style.display = 'flex';
      if (registerForm) registerForm.style.display = 'none';
    } else {
      if (loginForm) loginForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'flex';
    }

    // Update tab states
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
  },

  async handleLogin() {
    const email = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;

    if (!email || !password) {
      ZChess.Notifications.error('Please fill in all fields.');
      return;
    }

    const btn = document.getElementById('login-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('auth.logging_in'); }

    const result = await ZChess.Auth.login(email, password);

    if (btn) { btn.disabled = false; btn.textContent = t('auth.login'); }

    if (result.success) {
      this.closeModal('auth-modal-overlay');
    }
  },

  async handleRegister() {
    const username = document.getElementById('register-username')?.value?.trim();
    const email = document.getElementById('register-email')?.value?.trim();
    const password = document.getElementById('register-password')?.value;

    if (!username || !email || !password) {
      ZChess.Notifications.error('Please fill in all fields.');
      return;
    }

    if (username.length < 3) {
      ZChess.Notifications.error('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 6) {
      ZChess.Notifications.error('Password must be at least 6 characters.');
      return;
    }

    const btn = document.getElementById('register-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('auth.registering'); }

    const result = await ZChess.Auth.register(email, password, username);

    if (btn) { btn.disabled = false; btn.textContent = t('auth.register'); }

    if (result.success) {
      this.closeModal('auth-modal-overlay');
    }
  },

  // --- Modal Management ---

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  },

  // --- Settings ---

  saveSettings() {
    const updates = {};

    const selects = ['language', 'theme', 'boardTheme'];
    selects.forEach(key => {
      const el = document.getElementById(`setting-${key}`);
      if (el) updates[key] = el.value;
    });

    const toggles = ['sounds', 'animations', 'notifications', 'showRating', 'showLegalMoves', 'showLastMove', 'showCheck', 'autoFlip'];
    toggles.forEach(key => {
      const el = document.getElementById(`setting-${key}`);
      if (el) updates[key] = el.classList.contains('on');
    });

    ZChess.Settings.setMultiple(updates);
    ZChess.Settings.save();
  },

  // Toggle settings switch
  toggleSetting(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on');
  },

  // --- Navbar ---

  initNavbar() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  },

  initDropdowns() {
    document.addEventListener('click', (e) => {
      // Close user dropdown if clicked outside
      const dropdown = document.getElementById('user-dropdown');
      const avatarBtn = document.getElementById('user-avatar-btn');
      if (dropdown && !dropdown.contains(e.target) && !avatarBtn?.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  },

  // --- Service Worker ---

  registerSW() {
    if (!('serviceWorker' in navigator)) return;

    const swPath = '/Zchess/sw.js';

    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swPath).then(reg => {
        console.log('[ZChess] Service Worker registered');

        // When a new SW is waiting, activate it immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

      }).catch(err => {
        console.warn('[ZChess] SW registration failed:', err);
      });

      // When SW sends SW_UPDATED - reload the page
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') {
          console.log('[ZChess] New version detected - reloading...');
          window.location.reload();
        }
      });
    });

    // Auto-check version.json every 30 seconds
    this.startVersionCheck();
  },

  startVersionCheck() {
    const VERSION_KEY = 'zchess_version';
    const CHECK_INTERVAL = 30000;

    const checkVersion = () => {
      fetch('/Zchess/version.json?t=' + Date.now(), { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          const newVer = data.build || data.version || '';
          if (!newVer) return;

          const savedVer = localStorage.getItem(VERSION_KEY);

          if (savedVer && savedVer !== newVer) {
            console.log('[ZChess] New version detected:', newVer, '(was:', savedVer, ')');
            localStorage.setItem(VERSION_KEY, newVer);

            // Clear all SW caches before reload
            if ('caches' in window) {
              caches.keys().then(keys => {
                Promise.all(keys.map(k => caches.delete(k))).then(() => {
                  window.location.reload();
                });
              });
            } else {
              window.location.reload();
            }
          } else {
            localStorage.setItem(VERSION_KEY, newVer);
          }
        })
        .catch(() => {});
    };

    // First check after 5 seconds (let page load first)
    setTimeout(checkVersion, 5000);
    // Then every 30 seconds
    setInterval(checkVersion, CHECK_INTERVAL);
  },

  // =========================================
  // MULTIPLAYER LOBBY
  // =========================================

  bindLobbyEvents() {
    const MP = ZChess.Multiplayer;
    if (!MP) return;

    const showState = (id) => MP._showLobbyState(id);
    const requireLogin = () => {
      if (!ZChess.Auth.isLoggedIn()) {
        this.showAuthModal('login');
        return false;
      }
      return true;
    };

    // Close lobby
    document.getElementById('btn-lobby-close')?.addEventListener('click', async () => {
      if (MP.status === 'waiting') await MP.leave();
      this.closeModal('room-lobby-overlay');
    });

    // ---- Quick match ----
    document.getElementById('btn-lob-quick')?.addEventListener('click', async () => {
      if (!requireLogin()) return;
      if (MP.status !== 'idle') return; // prevent double-click
      showState('lobby-searching');
      try {
        const res = await MP.findQuickMatch();
        if (res.found) {
          // Joined existing room → onSnapshot fires → countdown starts automatically
        } else {
          // Created public room, waiting for someone to join
          // Show waiting state with invite code (so user can also share it)
          const codeEl = document.getElementById('lobby-invite-code');
          if (codeEl) codeEl.textContent = res.code || '------';
          showState('lobby-waiting');
        }
      } catch (e) {
        console.error('[Lobby] findQuickMatch error:', e);
        ZChess.Notifications.error('Не удалось начать поиск. Попробуй ещё раз.');
        showState('lobby-choose');
      }
    });

    document.getElementById('btn-cancel-search')?.addEventListener('click', async () => {
      await MP.leave();
      showState('lobby-choose');
    });

    // ---- Create room ----
    document.getElementById('btn-lob-create')?.addEventListener('click', async () => {
      if (!requireLogin()) return;
      showState('lobby-searching'); // temp spinner
      try {
        const res = await MP.createRoom(false);
        document.getElementById('lobby-invite-code').textContent = res.code;
        showState('lobby-waiting');
      } catch (e) {
        ZChess.Notifications.error('Ошибка создания комнаты.');
        showState('lobby-choose');
      }
    });

    document.getElementById('btn-cancel-room')?.addEventListener('click', async () => {
      await MP.leave();
      showState('lobby-choose');
    });

    // Copy invite link
    document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
      const code = document.getElementById('lobby-invite-code')?.textContent || '';
      const link = `${window.location.origin}${window.location.pathname}#play?room=${code}`;
      navigator.clipboard.writeText(link).then(() => {
        ZChess.Notifications.success('Ссылка скопирована!');
      }).catch(() => {
        navigator.clipboard.writeText(code).then(() => {
          ZChess.Notifications.success(`Код скопирован: ${code}`);
        });
      });
    });

    // ---- Join by code ----
    document.getElementById('btn-lob-join')?.addEventListener('click', () => {
      if (!requireLogin()) return;
      document.getElementById('room-code-input').value = '';
      document.getElementById('join-error').style.display = 'none';
      showState('lobby-join-code');
    });

    document.getElementById('btn-back-from-join')?.addEventListener('click', () => {
      showState('lobby-choose');
    });

    document.getElementById('btn-submit-join')?.addEventListener('click', async () => {
      const code = document.getElementById('room-code-input')?.value?.trim();
      if (!code || code.length < 6) return;
      const errEl = document.getElementById('join-error');
      errEl.style.display = 'none';
      try {
        await MP.joinByCode(code);
        // Status update → onSnapshot fires → countdown starts
      } catch (e) {
        console.error('[Lobby] joinByCode error:', e);
        errEl.textContent = e.message === 'own_room'      ? 'Это ваша собственная комната' :
                            e.message === 'room_not_found'? 'Комната не найдена' :
                            e.message === 'not_logged_in' ? 'Войди в аккаунт' :
                            'Ошибка: ' + (e.message || 'неизвестно');
        errEl.style.display = '';
      }
    });

    // Enter key in code input
    document.getElementById('room-code-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-submit-join')?.click();
    });

    // Auto-reconnect to in-progress multiplayer game after login
    ZChess.Auth.onAuthChange(async (user) => {
      if (user && MP.status === 'idle') {
        await MP.tryReconnect();
      }
    });

    // Check for invite code in URL
    const urlRoom = new URLSearchParams(window.location.hash.split('?')[1] || '').get('room');
    if (urlRoom && urlRoom.length === 6) {
      setTimeout(() => {
        if (!requireLogin()) return;
        MP.showLobby('lobby-join-code');
        const inp = document.getElementById('room-code-input');
        if (inp) inp.value = urlRoom.toUpperCase();
      }, 1000);
    }
  }
};

window.ZChess.App = App;

// Bootstrap the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => console.error('[ZChess] App init failed:', err));
});

console.log('[ZChess] App module loaded');

})();
