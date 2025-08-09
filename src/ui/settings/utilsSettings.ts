/**
 * @file utils.ts
 * @brief Lightweight settings utilities that must be safe to import at plugin startup.
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';
import { FullCalendarSettings } from '../../types/settings';
import { CalendarInfo, generateCalendarId } from '../../types/calendar_settings';

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

/**
 * Compute the runtime calendar ID used by Calendar/EventCache for a given source.
 * This mirrors Calendar.id = `${type}::${identifier}` without instantiating a Calendar.
 * Also normalizes special schemes like webcal -> https for ICS sources to match runtime.
 */
export function getRuntimeCalendarId(info: CalendarInfo): string {
  switch (info.type) {
    case 'local':
      return `local::${(info as Extract<CalendarInfo, { type: 'local' }>).directory}`;
    case 'dailynote':
      return `dailynote::${(info as Extract<CalendarInfo, { type: 'dailynote' }>).heading}`;
    case 'ical': {
      let url = (info as Extract<CalendarInfo, { type: 'ical' }>).url;
      // ICSCalendar converts webcal:// to https:// internally
      if (url.toLowerCase().startsWith('webcal')) {
        url = 'https' + url.slice('webcal'.length);
      }
      return `ical::${url}`;
    }
    case 'caldav':
      return `caldav::${(info as Extract<CalendarInfo, { type: 'caldav' }>).url}`;
    case 'google':
      return `google::${(info as Extract<CalendarInfo, { type: 'google' }>).id}`;
    default:
      // FOR_TEST_ONLY and any unknown types fall back to their existing id if present
      // This keeps tests and future types working without breaking filtering.
      // @ts-ignore
      return `${(info as any).type}::${(info as any).id ?? 'unknown'}`;
  }
}

/**
 * Build a lookup map from settings source id (e.g., "local_1") to runtime id (e.g., "local::path").
 */
export function buildSettingsToRuntimeIdMap(sources: CalendarInfo[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sources) {
    // @ts-ignore - CalendarInfo has id for configured sources
    if ((s as any).id) {
      // @ts-ignore
      m.set((s as any).id as string, getRuntimeCalendarId(s));
    }
  }
  return m;
}
