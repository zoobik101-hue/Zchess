/* =============================================
   ZChess - PWA Install & Mobile prompts
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const DISMISS_KEY = 'zchess_pwa_install_dismiss';
const DISMISS_DAYS = 5;

function translate(key) {
  if (window.ZChess.I18n && typeof ZChess.I18n.t === 'function') {
    return ZChess.I18n.t(key);
  }
  if (typeof window.t === 'function') return window.t(key);
  return key;
}

const PwaInstall = {

  deferredPrompt: null,
  isIOS: false,
  isAndroid: false,
  isMobile: false,
  isStandalone: false,
  bannerVisible: false,

  init() {
    this.isStandalone = this._checkStandalone();
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.isAndroid = /Android/i.test(navigator.userAgent);
    this.isMobile = this.isIOS || this.isAndroid ||
      (window.matchMedia('(max-width: 768px)').matches && 'ontouchstart' in window);

    if (this.isStandalone) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this._maybeShowBanner();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this._hideBanner();
      ZChess.Notifications?.success(translate('pwa.installed'));
    });

    this._bindBanner();

    document.addEventListener('langchange', () => {
      if (this.bannerVisible) this._refreshBannerCopy();
      this._refreshHeroBtn();
    });

    this._showMobileInstallUi();
    setTimeout(() => this._maybeShowBanner(), 2500);
  },

  _showMobileInstallUi() {
    if (this.isStandalone || !this.isMobile) return;
    const hero = document.getElementById('pwa-hero-install');
    if (hero) hero.style.display = 'inline-flex';
    this._refreshHeroBtn();
    const settingsBlock = document.getElementById('settings-pwa-section');
    if (settingsBlock) settingsBlock.style.display = '';
  },

  _refreshHeroBtn() {
    const hero = document.getElementById('pwa-hero-install');
    if (!hero || hero.style.display === 'none') return;
    hero.textContent = translate(this._getInstallBtnKey());
  },

  forceShowBanner() {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch (_) {}
    this._maybeShowBanner();
  },

  _checkStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
  },

  _wasDismissed() {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const ts = parseInt(raw, 10);
      return Date.now() - ts < DISMISS_DAYS * 86400000;
    } catch (_) {
      return false;
    }
  },

  _dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_) {}
    this._hideBanner();
  },

  _getDescKey() {
    if (this.isIOS) return 'pwa.ios_desc';
    if (this.deferredPrompt) return 'pwa.android_desc';
    if (this.isAndroid) return 'pwa.android_manual';
    return 'pwa.generic_desc';
  },

  _getInstallBtnKey() {
    if (window.matchMedia('(max-width: 520px)').matches) {
      return 'pwa.install_btn_short';
    }
    return 'pwa.install_btn';
  },

  _refreshBannerCopy() {
    const title = document.getElementById('pwa-install-title');
    const desc = document.getElementById('pwa-install-desc');
    const btn = document.getElementById('pwa-btn-install');
    const later = document.getElementById('pwa-btn-later');
    const iosSteps = document.getElementById('pwa-ios-steps');

    if (title) title.textContent = translate('pwa.title');
    if (desc) desc.textContent = translate(this._getDescKey());
    if (later) later.textContent = translate('pwa.later');
    if (btn && btn.style.display !== 'none') {
      btn.textContent = translate(this._getInstallBtnKey());
    }

    if (this.isIOS) {
      if (iosSteps) iosSteps.classList.add('active');
      if (btn) btn.style.display = 'none';
    } else if (this.deferredPrompt) {
      if (iosSteps) iosSteps.classList.remove('active');
      if (btn) btn.style.display = '';
    } else {
      if (iosSteps) iosSteps.classList.remove('active');
      if (btn) btn.style.display = 'none';
    }

    document.querySelectorAll('[data-pwa-step]').forEach(el => {
      const key = el.dataset.pwaStep;
      if (key) el.textContent = translate(key);
    });

    this._refreshHeroBtn();
  },

  _maybeShowBanner() {
    if (this.isStandalone || this._wasDismissed() || !this.isMobile) return;

    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    this._refreshBannerCopy();
    banner.classList.add('visible');
    document.body.classList.add('pwa-banner-visible');
    this.bannerVisible = true;
  },

  _hideBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('visible');
    document.body.classList.remove('pwa-banner-visible');
    this.bannerVisible = false;
  },

  _bindBanner() {
    document.getElementById('pwa-btn-install')?.addEventListener('click', () => this._triggerInstall());
    document.getElementById('pwa-btn-later')?.addEventListener('click', () => this._dismiss());
    document.getElementById('pwa-install-close')?.addEventListener('click', () => this._dismiss());
    document.getElementById('pwa-hero-install')?.addEventListener('click', () => {
      if (this.isStandalone) return;
      if (this.deferredPrompt) {
        this._triggerInstall();
      } else {
        this.forceShowBanner();
      }
    });
    document.getElementById('pwa-settings-install')?.addEventListener('click', () => {
      if (this.isStandalone) return;
      if (this.deferredPrompt) {
        this._triggerInstall();
      } else {
        this.forceShowBanner();
      }
    });
  },

  async _triggerInstall() {
    if (!this.deferredPrompt) {
      this._maybeShowBanner();
      return;
    }
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    if (outcome === 'accepted') {
      this._hideBanner();
    }
  }
};

window.ZChess.PwaInstall = PwaInstall;
window.ZChess.getBasePath = function getBasePath() {
  const p = window.location.pathname || '';
  const lower = p.toLowerCase();
  const idx = lower.indexOf('/zchess');
  if (idx >= 0) return '/Zchess';
  return '';
};

console.log('[ZChess] PWA Install module loaded');

})();
