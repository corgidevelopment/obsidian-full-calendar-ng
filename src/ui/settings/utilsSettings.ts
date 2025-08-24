/**
 * @file utils.ts
 * @brief Lightweight settings utilities that must be safe to import at plugin startup.
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import { FullCalendarSettings, GoogleAccount } from '../../types/settings'; // Add GoogleAccount import
import { CalendarInfo, generateCalendarId } from '../../types/calendar_settings';

/**
 * Performs all necessary migrations and sanitizations on a loaded settings object.
 * This function is pure and does not modify the plugin state directly.
 * @param settings The raw settings object loaded from data.json.
 * @returns An object containing the migrated settings and a flag indicating if they need to be saved.
 */
export function migrateAndSanitizeSettings(settings: any): {
  settings: FullCalendarSettings;
  needsSave: boolean;
} {
  let needsSave = false;
  let newSettings = { ...settings };

  // Ensure googleAccounts array exists for the migration
  if (!newSettings.googleAccounts) {
    newSettings.googleAccounts = [];
  }

  // MIGRATION 1: Global googleAuth to source-specific auth (from previous work, can be removed or kept for safety)
  const globalGoogleAuth = newSettings.googleAuth || null;
  if (globalGoogleAuth) {
    // This logic is technically superseded by the next migration,
    // but we can leave it for robustness during the transition.
    newSettings.calendarSources.forEach((s: any) => {
      if (s.type === 'google' && !s.auth) {
        s.auth = globalGoogleAuth;
      }
    });
  }

  // === FINAL MIGRATION: Move embedded auth to centralized googleAccounts ===
  const refreshTokenToAccountId = new Map<string, string>();
  newSettings.calendarSources.forEach((source: any) => {
    if (source.type === 'google' && source.auth && !source.googleAccountId) {
      needsSave = true;
      const refreshToken = source.auth.refreshToken;
      if (refreshToken) {
        if (refreshTokenToAccountId.has(refreshToken)) {
          source.googleAccountId = refreshTokenToAccountId.get(refreshToken);
        } else {
          const newAccountId = `gcal_${Math.random().toString(36).substr(2, 9)}`;
          const newAccount: GoogleAccount = {
            id: newAccountId,
            email: 'Migrated Account',
            ...source.auth
          };
          newSettings.googleAccounts.push(newAccount);
          refreshTokenToAccountId.set(refreshToken, newAccountId);
          source.googleAccountId = newAccountId;
        }
      }
      delete source.auth;
    }
  });
  if (newSettings.googleAuth) {
    delete newSettings.googleAuth;
    needsSave = true;
  }
  // === END FINAL MIGRATION ===

  // MIGRATION 2: Ensure all calendar sources have a stable ID.
  const { updated, sources } = ensureCalendarIds(newSettings.calendarSources);
  if (updated) {
    needsSave = true;
  }
  newSettings.calendarSources = sources;

  // SANITIZATION 1: Correct initial view if timeline is disabled.
  newSettings = sanitizeInitialView(newSettings);

  return { settings: newSettings, needsSave };
}

/**
 * Ensure each calendar source has a stable id. Pure and UI-free.
 */
export function ensureCalendarIds(sources: any[]): { updated: boolean; sources: CalendarInfo[] } {
  let updated = false;
  const existingIds: string[] = sources.map(s => s.id).filter(Boolean);
  const updatedSources = sources.map(source => {
    if (!source.id) {
      updated = true;
      const newId = generateCalendarId(source.type, existingIds);
      existingIds.push(newId);
      return { ...source, id: newId };
    }
    return source;
  });
  return { updated, sources: updatedSources as CalendarInfo[] };
}

/**
 * Sanitize initial view if timeline is disabled. Pure and UI-free aside from a Notice.
 */
export function sanitizeInitialView(settings: FullCalendarSettings): FullCalendarSettings {
  if (
    !settings.enableAdvancedCategorization &&
    settings.initialView.desktop.startsWith('resourceTimeline')
  ) {
    new Notice('Timeline view is disabled. Resetting default desktop view to "Week".', 5000);
    return {
      ...settings,
      initialView: {
        ...settings.initialView,
        desktop: 'timeGridWeek'
      }
    };
  }
  return settings;
}
