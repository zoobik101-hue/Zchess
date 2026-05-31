/* =============================================
   ZChess - Settings Manager
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const Settings = {
  data: { ...ZChess.DEFAULT_SETTINGS },

  init() {
    try {
      const saved = localStorage.getItem(ZChess.STORAGE.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.data = { ...ZChess.DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      this.data = { ...ZChess.DEFAULT_SETTINGS };
    }
    this.applySettings();
  },

  get(key) {
    return this.data[key];
  },

  set(key, value) {
    this.data[key] = value;
    this.applySettings();
  },

  setMultiple(updates) {
    this.data = { ...this.data, ...updates };
    this.applySettings();
  },

  save() {
    try {
      localStorage.setItem(ZChess.STORAGE.SETTINGS, JSON.stringify(this.data));
      ZChess.Notifications.show(t('settings.saved'), '', 'success');
    } catch (e) {
      console.error('[Settings] Failed to save:', e);
    }
  },

  reset() {
    this.data = { ...ZChess.DEFAULT_SETTINGS };
    localStorage.removeItem(ZChess.STORAGE.SETTINGS);
    this.applySettings();
  },

  applySettings() {
    // Theme
    document.documentElement.setAttribute('data-theme', this.data.theme || 'dark');

    // Board theme
    document.documentElement.setAttribute('data-board-theme', this.data.boardTheme || 'classic');

    // Language
    if (ZChess.I18n && ZChess.I18n.currentLang !== this.data.language) {
      ZChess.I18n.setLanguage(this.data.language);
    }

    // Animations
    document.documentElement.setAttribute('data-no-animations', !this.data.animations);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('settingschange', { detail: { ...this.data } }));
  },

  // Get all settings for display in settings page
  getAll() {
    return { ...this.data };
  }
};

window.ZChess.Settings = Settings;

console.log('[ZChess] Settings module loaded');

})();
