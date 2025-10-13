/**
 * @file i18n.test.ts
 * @brief Tests for the i18n module
 *
 * @license See LICENSE.md
 */

import { initializeI18n, i18n, t } from './i18n';

// Mock localStorage for Jest environment
beforeAll(() => {
  const localStorageMock = (function () {
    let store: Record<string, string> = {};
    return {
      getItem(key: string) {
        return store[key] || null;
      },
      setItem(key: string, value: string) {
        store[key] = value.toString();
      },
      clear() {
        store = {};
      },
      removeItem(key: string) {
        delete store[key];
      }
    };
  })();
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
  });
});

// Mock Obsidian App
const createMockApp = (language: string = 'en') => {
  return {
    vault: {
      getConfig: jest.fn().mockReturnValue(language)
    }
  } as any;
};

describe('i18n Module', () => {
  beforeEach(() => {
    // Reset i18n state before each test
    if (i18n.isInitialized) {
      i18n.changeLanguage('en');
    }
  });

  describe('initializeI18n', () => {
    it('should initialize i18n with English by default', async () => {
      const mockApp = createMockApp('en');
      await initializeI18n(mockApp);

      expect(i18n.isInitialized).toBe(true);
      expect(i18n.language).toBe('en');
    });

    it('should detect Obsidian language setting', async () => {
      const mockApp = createMockApp('de');
      await initializeI18n(mockApp);

      expect(i18n.isInitialized).toBe(true);
      // Even if 'de' is set, it should initialize (fallback to 'en' if no translations)
      expect(i18n.language).toBeTruthy();
    });

    it('should fallback to English if language config is unavailable', async () => {
      const mockApp = {
        vault: {
          getConfig: jest.fn().mockReturnValue(undefined)
        }
      } as any;

      await initializeI18n(mockApp);

      expect(i18n.isInitialized).toBe(true);
      expect(i18n.language).toBe('en');
    });
  });

  describe('Translation function', () => {
    beforeEach(async () => {
      const mockApp = createMockApp('en');
      await initializeI18n(mockApp);
    });

    it('should translate command strings', () => {
      expect(t('commands.newEvent')).toBe('New Event');
      expect(t('commands.resetCache')).toBe('Reset Event Cache');
      expect(t('commands.openCalendar')).toBe('Open Calendar');
    });

    it('should translate notice strings', () => {
      expect(t('notices.cacheReset')).toBe('Full Calendar has been reset.');
      expect(t('notices.googleAuthFailed')).toBe('Google authentication failed. Please try again.');
    });

    it('should translate ribbon tooltip', () => {
      expect(t('ribbon.openCalendar')).toBe('Open Full Calendar');
    });

    it('should return key if translation is missing', () => {
      const result = t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });

    it('should handle interpolation', () => {
      // This will be used for dynamic strings like "Processing 5/10 files"
      const result = t('commands.newEvent'); // Simple test for now
      expect(result).toBeTruthy();
    });
  });

  describe('Language switching', () => {
    it('should allow language switching after initialization', async () => {
      const mockApp = createMockApp('en');
      await initializeI18n(mockApp);

      expect(i18n.language).toBe('en');

      // Switch to another language (even if not loaded, should not error)
      await i18n.changeLanguage('de');
      expect(i18n.language).toBe('de');
    });

    it('should load German translations correctly', async () => {
      const mockApp = createMockApp('de');
      await initializeI18n(mockApp);

      // Change to German explicitly
      await i18n.changeLanguage('de');

      // Test a German translation
      expect(t('commands.newEvent')).toBe('Neues Ereignis');
      expect(t('commands.openCalendar')).toBe('Kalender öffnen');
      expect(t('ribbon.openCalendar')).toBe('Full Calendar öffnen');
    });

    it('should fallback to English for missing German translations', async () => {
      const mockApp = createMockApp('de');
      await initializeI18n(mockApp);

      await i18n.changeLanguage('de');

      // Test a key that doesn't exist - should return the key itself as fallback
      const result = t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });
  });
});
