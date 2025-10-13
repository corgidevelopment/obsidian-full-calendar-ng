/**
 * @file i18n.ts
 * @brief Internationalization (i18n) module for Full Calendar plugin.
 *
 * @description
 * This module provides internationalization support using i18next.
 * It detects the user's Obsidian language setting and loads the appropriate
 * translation resources. If a translation is missing, it gracefully falls back to English.
 *
 * @license See LICENSE.md
 */

import i18next from 'i18next';
import { App } from 'obsidian';

// Import translation resources
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';

/**
 * Type-safe translation resources
 */
const resources = {
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  it: { translation: it },
  es: { translation: es }
};

/**
 * Available language codes
 */
export type LanguageCode = keyof typeof resources;

/**
 * Get the current Obsidian language setting
 * @param app Obsidian App instance
 * @returns The current language code (e.g., 'en', 'de', 'zh-cn')
 */
function getObsidianLanguage(app: App): string {
  const language = localStorage.getItem('language') || 'en';

  return language;
}
/**
 * Initialize the i18n system
 * @param app Obsidian App instance
 * @returns Promise that resolves when i18n is initialized
 */
export async function initializeI18n(app: App): Promise<void> {
  const detectedLanguage = getObsidianLanguage(app);

  await i18next.init({
    lng: detectedLanguage,
    fallbackLng: 'en',
    resources,
    interpolation: {
      escapeValue: false // React already escapes values
    },
    // Return key if translation is missing (helpful for debugging)
    returnNull: false,
    returnEmptyString: false
  });
}

/**
 * Get the i18next instance for translations
 * Use this in your components: i18n.t('key')
 */
export const i18n = i18next;

/**
 * Type-safe translation function
 * Usage: t('commands.newEvent')
 */
export const t = (key: string, options?: any): string => {
  return i18next.t(key, options) as string;
};
