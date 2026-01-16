/**
 * @file WorkspaceManager.ts
 * @brief Centralizes workspace-related logic for the Full Calendar view.
 *
 * @description
 * This class acts as a middleware between the EventCache and the CalendarView.
 * It is responsible for taking the raw data from the cache and applying all
 * active workspace settings (view configurations, source filters, category filters)
 * to produce the final, ready-to-render data for the calendar.
 *
 * This decouples the complex business logic of workspaces from the view layer,
 * simplifying the CalendarView into a pure renderer.
 *
 * @license See LICENSE.md
 */

import { FullCalendarSettings, WorkspaceSettings } from '../../types/settings';
import { EventInput, EventSourceInput } from '@fullcalendar/core';
import { OFCEventSource, CachedEvent } from '../../core/EventCache';
import { toEventInput } from '../../core/interop';
import { Notice } from 'obsidian'; // Add this import

// Copied from view.ts to break circular dependency.
function getCalendarColors(color: string | null | undefined): {
  color: string;
  textColor: string;
} {
  let textVar = getComputedStyle(document.body).getPropertyValue('--text-on-accent');
  if (color) {
    const m = color.slice(1).match(color.length == 7 ? /(\S{2})/g : /(\S{1})/g);
    if (m) {
      const r = parseInt(m[0], 16),
        g = parseInt(m[1], 16),
        b = parseInt(m[2], 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness > 150) {
        textVar = 'black';
      }
    }
  }

  return {
    color: color || getComputedStyle(document.body).getPropertyValue('--interactive-accent'),
    textColor: textVar
  };
}

export class WorkspaceManager {
  private settings: FullCalendarSettings;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  /**
   * Updates the manager's internal copy of the plugin settings.
   * This should be called whenever the settings are saved.
   * @param newSettings The latest plugin settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.settings = newSettings;
  }

  // ====================================================================
  //                         CONFIGURATION METHODS
  // ====================================================================

  /**
   * Gets the active workspace object from settings.
   * @returns The active WorkspaceSettings object, or null if none is active.
   */
  public getActiveWorkspace(): WorkspaceSettings | null {
    if (!this.settings.activeWorkspace) return null;
    return this.settings.workspaces.find(w => w.id === this.settings.activeWorkspace) || null;
  }

  /**
   * Applies active workspace settings to the base calendar configuration.
   * @returns A partial settings object with workspace overrides applied.
   */
  public getCalendarConfig(): Partial<FullCalendarSettings> {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return this.settings;

    const workspaceSettings = { ...this.settings };

    // Apply view overrides
    if (workspace.defaultView?.desktop || workspace.defaultView?.mobile) {
      workspaceSettings.initialView = {
        desktop: workspace.defaultView.desktop || this.settings.initialView?.desktop,
        mobile: workspace.defaultView.mobile || this.settings.initialView?.mobile
      };
    }

    // Apply business hours override
    if (workspace.businessHours !== undefined) {
      workspaceSettings.businessHours = workspace.businessHours;
    }

    // Apply new granular view configuration overrides
    if (workspace.slotMinTime !== undefined) {
      workspaceSettings.slotMinTime = workspace.slotMinTime;
    }

    if (workspace.slotMaxTime !== undefined) {
      workspaceSettings.slotMaxTime = workspace.slotMaxTime;
    }

    if (workspace.weekends !== undefined) {
      workspaceSettings.weekends = workspace.weekends;
    }

    if (workspace.hiddenDays !== undefined) {
      workspaceSettings.hiddenDays = workspace.hiddenDays;
    }

    if (workspace.dayMaxEvents !== undefined) {
      workspaceSettings.dayMaxEvents = workspace.dayMaxEvents;
    }

    return workspaceSettings;
  }

  // ====================================================================
  //                      DATA TRANSFORMATION METHODS
  // ====================================================================

  /**
   * Filters a list of all calendar sources based on the active workspace's
   * `visibleCalendars` setting.
   * @param sources An array of all OFCEventSource objects from the cache.
   * @returns A filtered array of OFCEventSource objects.
   */
  public filterCalendarSources(sources: OFCEventSource[]): OFCEventSource[] {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return sources;

    const selected = (workspace.visibleCalendars ?? []).map(String);
    if (selected.length === 0) return sources;

    const selectedSet = new Set(selected);
    const filtered = sources.filter(source => selectedSet.has(String(source.id)));

    if (filtered.length === 0 && selected.length > 0) {
      new Notice(
        'The active workspace is filtering for calendars that are not available. Check workspace settings.',
        5000 // 5-second notice
      );
      // Do NOT fall back. An empty filter result means an empty calendar.
    }
    return filtered;
  }

  /**
   * Filters a list of events based on the active workspace's category filter.
   * @param events An array of EventInput objects for a single calendar source.
   * @returns A filtered array of EventInput objects.
   */
  private filterEventsByCategory(events: EventInput[]): EventInput[] {
    if (!this.settings.enableAdvancedCategorization) {
      return events;
    }

    const workspace = this.getActiveWorkspace();
    if (!workspace?.categoryFilter) return events;

    const { mode, categories } = workspace.categoryFilter;
    if (mode === 'show-only' && categories.length === 0) {
      return events;
    }

    const knownCategories = new Set(this.settings.categorySettings?.map(c => c.name) ?? []);

    return events.filter(event => {
      const props = event.extendedProps as
        | { category?: string; originalEvent?: { category?: string } }
        | undefined;
      const fromExtended = props?.category || props?.originalEvent?.category;
      let category: string | undefined = fromExtended;

      if (!category && typeof event.resourceId === 'string') {
        const rid = event.resourceId;
        if (rid.includes('::') || knownCategories.has(rid)) {
          category = rid;
        }
      }

      if (!category) {
        return mode === 'hide';
      }

      const mainCategory = category.includes('::') ? category.split('::')[0] : category;

      if (mode === 'show-only') {
        return categories.includes(mainCategory);
      } else {
        return !categories.includes(mainCategory);
      }
    });
  }

  /**
   * The main data transformation pipeline. Takes all sources from the cache
   * and returns a final, filtered list of EventSourceInput arrays for rendering.
   * @param allSources The complete, unfiltered list of sources from EventCache.
   * @returns An array of EventSourceInput objects ready for FullCalendar.
   */
  public getFilteredEventSources(allSources: OFCEventSource[]): EventSourceInput[] {
    const filteredSources = this.filterCalendarSources(allSources);

    const sources = filteredSources.map(({ events, editable, color, id }): EventSourceInput => {
      const mainEvents = events
        .map((e: CachedEvent) => toEventInput(e.id, e.event, this.settings))
        .filter((e): e is EventInput => !!e);

      const filteredEvents = this.filterEventsByCategory(mainEvents);

      return {
        id,
        events: filteredEvents,
        editable,
        ...getCalendarColors(color)
      };
    });
    return sources;
  }
}
