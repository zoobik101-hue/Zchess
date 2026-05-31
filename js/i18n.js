/* =============================================
   ZChess - Internationalization System
   Supports: EN, RU, UK
   Instant switching without page reload
   ============================================= */

(function() {
'use strict';

window.ZChess = window.ZChess || {};

const I18n = {
  currentLang: 'en',
  translations: {},
  loaded: {},

  // Load a language file
  async load(lang) {
    if (this.loaded[lang]) return this.translations[lang];

    try {
      const response = await fetch(`data/i18n/${lang}.json?v=${ZChess.VERSION}`);
      if (!response.ok) throw new Error(`Failed to load ${lang}`);
      const data = await response.json();
      this.translations[lang] = data;
      this.loaded[lang] = true;
      return data;
    } catch (err) {
      console.error(`[i18n] Could not load language: ${lang}`, err);
      return null;
    }
  },

  // Initialize with saved or default language
  async init() {
    const saved = localStorage.getItem('zchess_lang') || 'en';
    await this.setLanguage(saved);
  },

  // Switch language
  async setLanguage(lang) {
    if (!['en', 'ru', 'uk'].includes(lang)) lang = 'en';

    // Load if not cached
    if (!this.loaded[lang]) {
      const data = await this.load(lang);
      if (!data) {
        // Fallback to English
        if (lang !== 'en') return this.setLanguage('en');
        return;
      }
    }

    this.currentLang = lang;
    localStorage.setItem('zchess_lang', lang);

    // Update all DOM elements
    this.updateDOM();

    // Update lang attribute
    document.documentElement.lang = lang;

    // Update lang switcher buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // Emit event for components to react
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  },

  // Get a translation string by dot-notation key
  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations[this.currentLang];

    if (!value) {
      value = this.translations['en'];
    }

    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English
    if (value === undefined && this.currentLang !== 'en') {
      let enValue = this.translations['en'];
      if (enValue) {
        for (const k of keys) {
          if (enValue && typeof enValue === 'object') {
            enValue = enValue[k];
          } else {
            enValue = undefined;
            break;
          }
        }
      }
      value = enValue;
    }

    if (value === undefined) return key;

    // Handle arrays and objects
    if (typeof value !== 'string') return value;

    // Replace {param} placeholders
    return value.replace(/\{(\w+)\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  },

  // Update all elements with data-i18n attributes
  updateDOM() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const translation = this.t(key);
      if (typeof translation === 'string') {
        el.innerHTML = translation;
      }
    });

    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const translation = this.t(key);
      if (typeof translation === 'string') {
        el.placeholder = translation;
      }
    });

    // Titles (tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      const translation = this.t(key);
      if (typeof translation === 'string') {
        el.title = translation;
      }
    });

    // Aria labels
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.dataset.i18nAria;
      const translation = this.t(key);
      if (typeof translation === 'string') {
        el.setAttribute('aria-label', translation);
      }
    });
  },

  // Shorthand for convenience
  get lang() {
    return this.currentLang;
  }
};

window.ZChess.I18n = I18n;

// Global shorthand
window.t = function(key, params) {
  return I18n.t(key, params);
};

console.log('[ZChess] I18n module loaded');

})();
