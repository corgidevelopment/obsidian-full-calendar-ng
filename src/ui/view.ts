/**
 * @file view.ts
 * @brief Defines the `CalendarView`, the main component for displaying the calendar.
 *
 * @description
 * This file contains the `CalendarView` class, which extends Obsidian's `ItemView`.
 * It is responsible for creating and managing the DOM element that hosts the
 * calendar, initializing FullCalendar.js, and subscribing to the `EventCache`
 * for updates. It handles all direct user interactions with the calendar and
 * translates them into actions on the `EventCache`.
 *
 * @exports CalendarView
 *
 * @see EventCache.ts
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';

import { ItemView, Menu, Notice, WorkspaceLeaf } from 'obsidian';

import type { Calendar, EventSourceInput, EventInput } from '@fullcalendar/core';

import './overrides.css';
import FullCalendarPlugin from '../main';
import { renderCalendar } from './calendar';
import { renderOnboarding } from './onboard';
import { PLUGIN_SLUG, CalendarInfo } from '../types';
import { UpdateViewCallback, CachedEvent } from '../core/EventCache';
// Lazy-import heavy modules at point of use to reduce initial load time
import { dateEndpointsToFrontmatter, fromEventApi, toEventInput } from '../core/interop';

export const FULL_CALENDAR_VIEW_TYPE = 'full-calendar-view';
export const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = 'full-calendar-sidebar-view';

export function getCalendarColors(color: string | null | undefined): {
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

export class CalendarView extends ItemView {
  plugin: FullCalendarPlugin;
  inSidebar: boolean;
  fullCalendarView: Calendar | null = null;
  callback: UpdateViewCallback | null = null;
  private timelineResources:
    | { id: string; title: string; parentId?: string; eventColor?: string; extendedProps?: any }[]
    | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin, inSidebar = false) {
    super(leaf);
    this.plugin = plugin;
    this.inSidebar = inSidebar;
  }

  getIcon(): string {
    return 'calendar-glyph';
  }

  getViewType() {
    return this.inSidebar ? FULL_CALENDAR_SIDEBAR_VIEW_TYPE : FULL_CALENDAR_VIEW_TYPE;
  }

  getDisplayText() {
    return this.inSidebar ? 'Full Calendar' : 'Calendar';
  }

  /**
   * Switch to a specific workspace by ID.
   * @param workspaceId - The workspace ID to switch to, or null for default view
   */
  async switchToWorkspace(workspaceId: string | null) {
    this.plugin.settings.activeWorkspace = workspaceId;
    await this.plugin.saveSettings();
    await this.onOpen(); // Re-render the calendar with new settings
  }

  /**
   * Get the currently active workspace settings, if any.
   */
  getActiveWorkspace() {
    if (!this.plugin.settings.activeWorkspace) return null;
    return (
      this.plugin.settings.workspaces.find(w => w.id === this.plugin.settings.activeWorkspace) ||
      null
    );
  }

  /**
   * Apply workspace settings to override default settings.
   */
  applyWorkspaceSettings(settings: any) {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return settings;

    const workspaceSettings = { ...settings };

    // Apply view overrides
    if (workspace.defaultView?.desktop || workspace.defaultView?.mobile) {
      workspaceSettings.initialView = {
        desktop: workspace.defaultView.desktop || settings.initialView?.desktop,
        mobile: workspace.defaultView.mobile || settings.initialView?.mobile
      };
    }

    // Apply business hours override
    if (workspace.businessHours !== undefined) {
      workspaceSettings.businessHours = workspace.businessHours;
    }

    return workspaceSettings;
  }

  /**
   * Filter calendar sources based on workspace settings.
   * - Normalizes IDs to strings for reliable comparisons
   * - If a selection exists but nothing matches, fall back to all sources
   */
  filterCalendarSources(sources: any[]) {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return sources;

    const selected = (workspace.visibleCalendars ?? []).map(String);
    if (selected.length === 0) return sources;
    // Support both runtime ids and legacy settings ids by mapping configured sources -> runtime ids
    const configured = this.plugin.settings.calendarSources;
    const mapSettingsToRuntime = new Map<string, string>();
    for (const s of configured) {
      // Build runtime id to match EventCache.calendars keys
      let runtimeId = '';
      switch (s.type) {
        case 'local':
          runtimeId = `local::${(s as any).directory}`;
          break;
        case 'dailynote':
          runtimeId = `dailynote::${(s as any).heading}`;
          break;
        case 'ical': {
          let url = (s as any).url as string;
          if (typeof url === 'string' && url.toLowerCase().startsWith('webcal')) {
            url = 'https' + url.slice('webcal'.length);
          }
          runtimeId = `ical::${url}`;
          break;
        }
        case 'caldav':
          runtimeId = `caldav::${(s as any).url}`;
          break;
        case 'google':
          runtimeId = `google::${(s as any).id}`;
          break;
        default:
          // fall back to existing id if any
          // @ts-ignore
          runtimeId = String((s as any).id ?? '');
      }
      // @ts-ignore
      if ((s as any).id) mapSettingsToRuntime.set(String((s as any).id), runtimeId);
    }

    const selectedSet = new Set(
      selected.map(id => mapSettingsToRuntime.get(id) || id) // normalize selection to runtime ids
    );
    const filtered = sources.filter(source => selectedSet.has(String(source.id)));

    if (filtered.length === 0) {
      console.warn(
        'Full Calendar: No sources matched visibleCalendars. Falling back to all sources.'
      );
      return sources;
    }
    return filtered;
  }

  /**
   * Filter events by category based on workspace settings.
   */
  filterEventsByCategory(events: EventInput[]): EventInput[] {
    // Only apply when advanced categorization is enabled
    if (!this.plugin.settings.enableAdvancedCategorization) {
      return events;
    }

    const workspace = this.getActiveWorkspace();
    if (!workspace?.categoryFilter) return events;

    const { mode, categories } = workspace.categoryFilter;

    // If 'show-only' mode is selected but no categories are chosen, don't apply filtering
    if (mode === 'show-only' && categories.length === 0) {
      return events;
    }

    const knownCategories = new Set(this.plugin.settings.categorySettings?.map(c => c.name) ?? []);

    return events.filter(event => {
      // Extract category from event (checking different possible formats)
      const fromExtended =
        event.extendedProps?.category || event.extendedProps?.originalEvent?.category;

      let category: string | undefined = fromExtended;

      // Only consider resourceId as a category if it clearly represents a category:
      // - contains "::" (Category::Subcategory), or
      // - exactly matches a known category name
      if (!category && typeof event.resourceId === 'string') {
        const rid = event.resourceId;
        if (rid.includes('::') || knownCategories.has(rid)) {
          category = rid;
        }
      }

      if (!category) {
        // Events without categories - include based on filter mode
        return mode === 'hide'; // If hiding categories, include uncategorized events
      }

      // For subcategories (format: "Category::Subcategory"), use the parent category
      const mainCategory = category.includes('::') ? category.split('::')[0] : category;

      if (mode === 'show-only') {
        return categories.includes(mainCategory);
      } else {
        // mode === 'hide'
        return !categories.includes(mainCategory);
      }
    });
  }

  /**
   * Get the text to display in the workspace switcher button.
   */
  getWorkspaceSwitcherText(): string {
    const activeWorkspace = this.getActiveWorkspace();
    if (!activeWorkspace) {
      return 'Workspace ▾';
    }

    // Truncate long workspace names for UI
    const name =
      activeWorkspace.name.length > 12
        ? activeWorkspace.name.substring(0, 12) + '...'
        : activeWorkspace.name;

    return `${name} ▾`;
  }

  /**
   * Show the workspace switcher dropdown menu.
   */
  showWorkspaceSwitcher(ev: MouseEvent) {
    const menu = new Menu();

    // Default view option
    menu.addItem(item => {
      item
        .setTitle('Default View')
        .setIcon(this.plugin.settings.activeWorkspace === null ? 'check' : '')
        .onClick(async () => {
          await this.switchToWorkspace(null);
        });
    });

    if (this.plugin.settings.workspaces.length > 0) {
      menu.addSeparator();

      // Workspace options
      this.plugin.settings.workspaces.forEach(workspace => {
        menu.addItem(item => {
          item
            .setTitle(workspace.name)
            .setIcon(this.plugin.settings.activeWorkspace === workspace.id ? 'check' : '')
            .onClick(async () => {
              await this.switchToWorkspace(workspace.id);
            });
        });
      });
    }

    menu.showAtMouseEvent(ev);
  }

  /**
   * Generates shadow events for parent categories in timeline views.
   * Shadow events provide visual aggregation of child subcategory events.
   */
  generateShadowEvents(mainEvents: EventInput[], forceTimeline = false): EventInput[] {
    const shadowEvents: EventInput[] = [];

    // Only generate shadow events if advanced categorization is enabled
    if (!this.plugin.settings.enableAdvancedCategorization) {
      return shadowEvents;
    }

    // Only generate shadow events if we're in a timeline view
    // During initial load, forceTimeline can be used to include shadows for timeline views
    const currentView = this.fullCalendarView?.view?.type;
    if (!forceTimeline && currentView && !currentView.includes('resourceTimeline')) {
      return shadowEvents;
    }

    for (const event of mainEvents) {
      if (event.resourceId && event.resourceId.includes('::')) {
        // This is a subcategory event, create a shadow event for the parent
        const parentCategory = event.resourceId.split('::')[0];
        const shadowEvent: EventInput = {
          ...event,
          id: `${event.id}-shadow`,
          resourceId: parentCategory,
          extendedProps: {
            ...event.extendedProps,
            isShadow: true,
            originalEventId: event.id
          },
          className: 'fc-event-shadow',
          editable: false,
          durationEditable: false,
          startEditable: false
        };
        shadowEvents.push(shadowEvent);
      }
    }

    return shadowEvents;
  }

  /**
   * Adds shadow events to the current view (for timeline views)
   */
  addShadowEventsToView() {
    if (!this.plugin.settings.enableAdvancedCategorization || !this.fullCalendarView) {
      return;
    }

    // Get all events from each source and generate shadow events
    for (const source of this.plugin.cache.getAllEvents()) {
      const { events, id: calendarId } = source;
      const settings = this.plugin.settings;

      const mainEvents = events
        .map((e: CachedEvent) => toEventInput(e.id, e.event, settings, calendarId))
        .filter((e): e is EventInput => !!e);

      const shadowEvents = this.generateShadowEvents(mainEvents, true);

      shadowEvents.forEach(shadowEvent => {
        this.fullCalendarView?.addEvent(shadowEvent, calendarId);
      });
    }
  }

  /**
   * Lazily build resources for timeline views based on current settings and cache.
   */
  private buildTimelineResources(): {
    id: string;
    title: string;
    parentId?: string;
    eventColor?: string;
    extendedProps?: any;
  }[] {
    const resources: {
      id: string;
      title: string;
      parentId?: string;
      eventColor?: string;
      extendedProps?: any;
    }[] = [];
    if (!this.plugin.settings.enableAdvancedCategorization) {
      return resources;
    }

    const categorySettings = this.plugin.settings.categorySettings || [];
    const workspace = this.getActiveWorkspace();

    const isCategoryVisible = (name: string) => {
      if (!workspace?.categoryFilter) return true;
      const { mode, categories } = workspace.categoryFilter;
      if (mode === 'show-only' && categories.length === 0) return true;
      if (mode === 'show-only') return categories.includes(name);
      return !categories.includes(name);
    };

    const filteredCategorySettings = workspace?.categoryFilter
      ? categorySettings.filter(cat => isCategoryVisible(cat.name))
      : categorySettings;

    filteredCategorySettings.forEach((cat: { name: string; color: string }) => {
      resources.push({
        id: cat.name,
        title: cat.name,
        eventColor: cat.color,
        extendedProps: { isParent: true }
      });
    });

    const categoryMap = new Map<string, Set<string>>();
    let allSources = this.plugin.cache.getAllEvents();
    allSources = this.filterCalendarSources(allSources);
    for (const source of allSources) {
      for (const cachedEvent of source.events) {
        const { category, subCategory } = cachedEvent.event;
        if (category) {
          if (!isCategoryVisible(category)) continue;
          if (!categoryMap.has(category)) categoryMap.set(category, new Set());
          const sub = subCategory || '__NONE__';
          categoryMap.get(category)!.add(sub);
        }
      }
    }

    for (const [category, subCategories] of categoryMap.entries()) {
      if (!isCategoryVisible(category)) continue;
      if (!resources.find(r => r.id === category)) {
        resources.push({ id: category, title: category, extendedProps: { isParent: true } });
      }
      for (const subCategory of subCategories) {
        resources.push({
          id: `${category}::${subCategory}`,
          title: subCategory === '__NONE__' ? '(none)' : subCategory,
          parentId: category
        });
      }
    }
    return resources;
  }

  /**
   * Removes shadow events from the current view
   */
  removeShadowEventsFromView() {
    if (!this.fullCalendarView) {
      return;
    }

    // Find and remove all shadow events
    const allEvents = this.fullCalendarView.getEvents();
    allEvents.forEach(event => {
      if (event.extendedProps.isShadow) {
        event.remove();
      }
    });
  }

  /**
   * Translates event data from the `EventCache` into the `EventSourceInput`
   * format required by the FullCalendar library.
   * Also calculates the correct text color for event backgrounds.
   */
  translateSources() {
    const settings = this.plugin.settings;
    let allSources = this.plugin.cache.getAllEvents();

    // Apply workspace filtering if active
    allSources = this.filterCalendarSources(allSources);

    const sources = allSources.map(({ events, editable, color, id }): EventSourceInput => {
      const mainEvents = events
        .map((e: CachedEvent) => toEventInput(e.id, e.event, settings, id))
        .filter((e): e is EventInput => !!e);

      // Apply workspace category filtering
      const filteredEvents = this.filterEventsByCategory(mainEvents);

      // Don't include shadow events in translateSources - they will be added
      // dynamically when switching to timeline views
      return {
        id,
        events: filteredEvents,
        editable,
        ...getCalendarColors(color)
      };
    });
    return sources;
  }

  /**
   * Called when the view is opened or re-focused.
   * This is the main rendering method. It clears any existing calendar,
   * fetches all event sources from the cache, and initializes a new FullCalendar
   * instance with all the necessary options and interaction callbacks (e.g., for
   * event clicking, dragging, and creating new events). It also registers a
   * callback with the EventCache to listen for updates.
   */
  async onOpen() {
    await this.plugin.loadSettings();
    if (!this.plugin.cache) {
      new Notice('Full Calendar event cache not loaded.');
      return;
    }
    if (!this.plugin.cache.initialized) {
      await this.plugin.cache.populate();
    }

    const container = this.containerEl.children[1];
    container.empty();
    let calendarEl = container.createEl('div');

    if (
      this.plugin.settings.calendarSources.filter((s: CalendarInfo) => s.type !== 'FOR_TEST_ONLY')
        .length === 0
    ) {
      renderOnboarding(this.plugin, calendarEl);
      return;
    }

    // Defer building timeline resources until timeline view is active

    const sources: EventSourceInput[] = this.translateSources();

    if (this.fullCalendarView) {
      this.fullCalendarView.destroy();
      this.fullCalendarView = null;
    }
    // Add view change handler to manage shadow events and lazy resources for timeline views
    let currentViewType = '';
    const handleViewChange = () => {
      const newViewType = this.fullCalendarView?.view?.type || '';
      const wasTimeline = currentViewType.includes('resourceTimeline');
      const isTimeline = newViewType.includes('resourceTimeline');

      if (wasTimeline !== isTimeline) {
        // View type changed between timeline and non-timeline
        if (isTimeline) {
          // Lazily build and apply resources the first time we enter a timeline view
          if (!this.timelineResources) {
            this.timelineResources = this.buildTimelineResources();
            this.fullCalendarView?.setOption('resources', this.timelineResources);
            this.fullCalendarView?.setOption('resourcesInitiallyExpanded', false);
          }
          // Switched to timeline view - add shadow events
          this.addShadowEventsToView();
        } else {
          // Switched from timeline view - remove shadow events
          this.removeShadowEventsFromView();
        }
      }
      currentViewType = newViewType;
    };

    // Apply workspace settings
    const workspaceSettings = this.applyWorkspaceSettings(this.plugin.settings);

    this.fullCalendarView = await renderCalendar(calendarEl, sources, {
      // timeZone:
      //   this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone, // <-- ADD THIS LINE
      forceNarrow: this.inSidebar,
      // resources added lazily when entering timeline view
      enableAdvancedCategorization: this.plugin.settings.enableAdvancedCategorization,
      onViewChange: handleViewChange,
      initialView: workspaceSettings.initialView, // Use workspace-aware initial view
      businessHours: (() => {
        // Use workspace business hours if set, otherwise use global settings
        const businessHours = workspaceSettings.businessHours || this.plugin.settings.businessHours;
        return businessHours.enabled
          ? {
              daysOfWeek: businessHours.daysOfWeek,
              startTime: businessHours.startTime,
              endTime: businessHours.endTime
            }
          : false;
      })(),
      customButtons: {
        workspace: {
          text: this.getWorkspaceSwitcherText(),
          click: (ev?: MouseEvent) => {
            if (ev) this.showWorkspaceSwitcher(ev);
          }
        },
        analysis: {
          text: 'Analysis',
          click: async () => {
            if (this.plugin.isMobile) {
              new Notice('The Chrono Analyser is only available on desktop.');
              return;
            }
            try {
              const { activateAnalysisView } = await import('../chrono_analyser/AnalysisView');
              activateAnalysisView(this.plugin.app);
            } catch (err) {
              console.error('Full Calendar: Failed to activate Chrono Analyser view', err);
              new Notice('Failed to open Chrono Analyser. Please check the console.');
            }
          }
        }
      },
      eventClick: async info => {
        try {
          if (info.jsEvent.getModifierState('Control') || info.jsEvent.getModifierState('Meta')) {
            const { openFileForEvent } = await import('../actions/eventActions');
            await openFileForEvent(this.plugin.cache, this.app, info.event.id);
          } else {
            const { launchEditModal } = await import('./event_modal');
            launchEditModal(this.plugin, info.event.id);
          }
        } catch (e) {
          if (e instanceof Error) {
            console.warn(e);
            new Notice(e.message);
          }
        }
      },
      select: async (start, end, allDay, viewType) => {
        if (viewType === 'dayGridMonth') {
          // Month view will set the end day to the next day even on a single-day event.
          // This is problematic when moving an event created in the month view to the
          // time grid to give it a time.

          // The fix is just to subtract 1 from the end date before processing.
          end.setDate(end.getDate() - 1);
        }
        const partialEvent = dateEndpointsToFrontmatter(start, end, allDay);
        try {
          if (this.plugin.settings.clickToCreateEventFromMonthView || viewType !== 'dayGridMonth') {
            const { launchCreateModal } = await import('./event_modal');
            launchCreateModal(this.plugin, partialEvent);
          } else {
            this.fullCalendarView?.changeView('timeGridDay');
            this.fullCalendarView?.gotoDate(start);
          }
        } catch (e) {
          if (e instanceof Error) {
            console.error(e);
            new Notice(e.message);
          }
        }
      },
      modifyEvent: async (newEvent, oldEvent, newResource) => {
        try {
          const originalEvent = this.plugin.cache.getEventById(oldEvent.id);
          if (!originalEvent) {
            throw new Error('Original event not found in cache.');
          }

          // ====================================================================
          // NEW LOGIC: Prevent moving child overrides to a different day.
          // ====================================================================
          if (originalEvent.type === 'single' && originalEvent.recurringEventId) {
            const oldDate = oldEvent.start ? DateTime.fromJSDate(oldEvent.start).toISODate() : null;
            const newDate = newEvent.start ? DateTime.fromJSDate(newEvent.start).toISODate() : null;

            if (oldDate && newDate && oldDate !== newDate) {
              new Notice(
                'Cannot move a recurring instance to a different day. Modify the time only or edit the main recurring event.',
                6000
              );
              return false; // Reverts the event to its original position.
            }
          }
          // ====================================================================

          // Check if the event being dragged is part of a recurring series.
          // We must check the original event from the cache, because `oldEvent` from FullCalendar
          // is just an instance and doesn't have our `type` property.
          if (originalEvent.type === 'rrule' || originalEvent.type === 'recurring') {
            // ====================================================================
            // NEW LOGIC: Prevent moving the master instance to a different day.
            // ====================================================================
            const oldDate = oldEvent.start ? DateTime.fromJSDate(oldEvent.start).toISODate() : null;
            const newDate = newEvent.start ? DateTime.fromJSDate(newEvent.start).toISODate() : null;

            if (oldDate && newDate && oldDate !== newDate) {
              new Notice(
                'Cannot move a recurring instance to a different day. You can only change the time.',
                6000
              );
              return false; // Revert the change.
            }
            // ====================================================================

            if (!oldEvent.start) {
              throw new Error('Recurring instance is missing original start date.');
            }

            // This is a recurring instance. We need to create an override.
            const instanceDate = DateTime.fromJSDate(oldEvent.start).toISODate();
            if (!instanceDate) {
              throw new Error('Could not determine instance date from recurring event.');
            }

            const modifiedEvent = fromEventApi(newEvent, newResource);

            await this.plugin.cache.modifyRecurringInstance(
              oldEvent.id,
              instanceDate,
              modifiedEvent
            );
            // Return true because we have successfully handled the modification.
            return true;
          } else {
            // This is a standard single event or an existing override.
            // Let it update normally.
            const didModify = await this.plugin.cache.updateEventWithId(
              oldEvent.id,
              fromEventApi(newEvent, newResource)
            );
            return !!didModify;
          }
        } catch (e: any) {
          console.error(e);
          new Notice(e.message);
          return false;
        }
      },

      eventMouseEnter: async info => {
        try {
          const location = this.plugin.cache.getInfoForEditableEvent(info.event.id).location;
          if (location) {
            this.app.workspace.trigger('hover-link', {
              event: info.jsEvent,
              source: PLUGIN_SLUG,
              hoverParent: calendarEl,
              targetEl: info.jsEvent.target,
              linktext: location.path,
              sourcePath: location.path
            });
          }
        } catch (e) {}
      },
      firstDay: this.plugin.settings.firstDay,
      timeFormat24h: this.plugin.settings.timeFormat24h,
      openContextMenuForEvent: async (e, mouseEvent) => {
        const menu = new Menu();
        if (!this.plugin.cache) {
          return;
        }
        const event = this.plugin.cache.getEventById(e.id);
        if (!event) {
          return;
        }

        if (this.plugin.cache.isEventEditable(e.id)) {
          const tasks = await import('../actions/tasks');
          if (!tasks.isTask(event)) {
            menu.addItem(item =>
              item.setTitle('Turn into task').onClick(async () => {
                await this.plugin.cache.processEvent(e.id, e => tasks.toggleTask(e, false));
              })
            );
          } else {
            menu.addItem(item =>
              item.setTitle('Remove checkbox').onClick(async () => {
                await this.plugin.cache.processEvent(e.id, tasks.unmakeTask);
              })
            );
          }
          menu.addSeparator();
          menu.addItem(item =>
            item.setTitle('Go to note').onClick(() => {
              if (!this.plugin.cache) {
                return;
              }
              import('../actions/eventActions').then(({ openFileForEvent }) =>
                openFileForEvent(this.plugin.cache, this.app, e.id)
              );
            })
          );
          menu.addItem(item =>
            item.setTitle('Delete').onClick(async () => {
              if (!this.plugin.cache) {
                return;
              }
              const event = this.plugin.cache.getEventById(e.id);
              // If this is a recurring event, offer to delete only this instance
              if (event && (event.type === 'recurring' || event.type === 'rrule') && e.start) {
                const instanceDate =
                  e.start instanceof Date ? e.start.toISOString().slice(0, 10) : undefined;
                await this.plugin.cache.deleteEvent(e.id, { instanceDate });
              } else {
                await this.plugin.cache.deleteEvent(e.id);
              }
              new Notice(`Deleted event "${e.title}".`);
            })
          );
        } else {
          menu.addItem(item => {
            item.setTitle('No actions available on remote events').setDisabled(true);
          });
        }

        menu.showAtMouseEvent(mouseEvent);
      },
      toggleTask: async (eventApi, isDone) => {
        const eventId = eventApi.id;
        const event = this.plugin.cache.getEventById(eventId);
        if (!event) return false;

        const isRecurringSystem =
          event.type === 'recurring' || event.type === 'rrule' || event.recurringEventId;

        if (!isRecurringSystem) {
          const { toggleTask } = await import('../actions/tasks');
          await this.plugin.cache.updateEventWithId(eventId, toggleTask(event, isDone));
          return true;
        }

        if (!eventApi.start) return false;

        const instanceDate = DateTime.fromJSDate(eventApi.start).toISODate();
        if (!instanceDate) return false;

        try {
          await this.plugin.cache.toggleRecurringInstance(eventId, instanceDate, isDone);
          return true;
        } catch (e) {
          if (e instanceof Error) {
            new Notice(e.message);
          }
          return false;
        }
      }
    });

    // // ==================== DEBUG ====================
    // if (this.fullCalendarView) {
    //   const calData = this.fullCalendarView.getCurrentData();
    //   console.log(`[DEBUG] CALENDAR VIEW onload:
    //     - FullCalendar's Internal Timezone: ${calData.dateEnv.timeZone}`);
    // }
    // // ===============================================

    // Initialize shadow events if starting in timeline view
    currentViewType = this.fullCalendarView?.view?.type || '';
    if (currentViewType.includes('resourceTimeline')) {
      if (!this.timelineResources) {
        this.timelineResources = this.buildTimelineResources();
        this.fullCalendarView?.setOption('resources', this.timelineResources);
        this.fullCalendarView?.setOption('resourcesInitiallyExpanded', false);
      }
      this.addShadowEventsToView();
    }

    // @ts-ignore
    window.fc = this.fullCalendarView;

    this.registerDomEvent(this.containerEl, 'mouseenter', () => {
      this.plugin.cache.revalidateRemoteCalendars();
    });

    if (this.callback) {
      this.plugin.cache.off('update', this.callback);
      this.callback = null;
    }
    this.callback = this.plugin.cache.on('update', payload => {
      // Get settings once to pass down to the parsers
      const settings = this.plugin.settings;
      if (payload.type === 'resync') {
        if (this.fullCalendarView) {
          this.fullCalendarView.setOption('firstDay', this.plugin.settings.firstDay);
          this.fullCalendarView.setOption(
            'eventTimeFormat',
            this.plugin.settings.timeFormat24h
              ? { hour: '2-digit', minute: '2-digit', hour12: false }
              : { hour: 'numeric', minute: '2-digit', hour12: true }
          );
        }
        this.fullCalendarView?.removeAllEventSources();
        const sources = this.translateSources();
        sources.forEach(source => this.fullCalendarView?.addEventSource(source));

        // Re-add shadow events if in timeline view
        const currentViewType = this.fullCalendarView?.view?.type || '';
        if (currentViewType.includes('resourceTimeline')) {
          this.addShadowEventsToView();
        }
        // // this.fullCalendarView?.removeAllEventSources();
        // // const sources = this.translateSources();
        // // sources.forEach(source => this.fullCalendarView?.addEventSource(source));

        // this.fullCalendarView?.batchRendering(() => {
        //   // 1. Set the new timezone on the calendar instance.
        //   const newTimezone =
        //     this.plugin.settings.displayTimezone ||
        //     Intl.DateTimeFormat().resolvedOptions().timeZone;
        //   this.fullCalendarView?.setOption('timeZone', newTimezone);

        //   // 2. Remove all old event sources.
        //   this.fullCalendarView?.removeAllEventSources();

        //   // 3. Add the newly-translated event sources.
        //   // The translateSources function will use the updated settings to convert
        //   // events to the new timezone before adding them.
        //   const sources = this.translateSources();
        //   sources.forEach(source => this.fullCalendarView?.addEventSource(source));
        // });

        // // ==================== DEBUG ====================
        // if (this.fullCalendarView) {
        //   const calData = this.fullCalendarView.getCurrentData();
        //   console.log(`[DEBUG] CALENDAR VIEW on resync:
        // - FullCalendar's Internal Timezone: ${calData.dateEnv.timeZone}`);
        // }
        // // =
        return;
      } else if (payload.type === 'events') {
        const { toRemove, toAdd } = payload;
        // console.debug('updating view from cache...', {
        //   toRemove,
        //   toAdd
        // });
        toRemove.forEach(id => {
          // Remove main event if it exists
          const mainEvent = this.fullCalendarView?.getEventById(id);
          if (mainEvent) {
            mainEvent.remove();
          } else {
            console.warn(
              `Event with id=${id} was slated to be removed but does not exist in the calendar.`
            );
          }

          // Also remove the corresponding shadow event, if it exists.
          const shadowEvent = this.fullCalendarView?.getEventById(`${id}-shadow`);
          if (shadowEvent) {
            shadowEvent.remove();
          }
        });
        toAdd.forEach(({ id, event, calendarId }) => {
          // Pass settings to toEventInput
          const eventInput = toEventInput(id, event, settings, calendarId);
          if (eventInput) {
            // Respect workspace source filtering: skip if calendar is not selected
            const workspace = this.getActiveWorkspace();
            const selected = (workspace?.visibleCalendars ?? []).map(String);
            if (selected.length > 0 && !new Set(selected).has(String(calendarId))) {
              return; // Do not add events from hidden calendars
            }

            // Apply workspace category filtering
            if (this.filterEventsByCategory([eventInput]).length === 0) {
              return; // Filtered out by category rules
            }

            // Add the main event
            const addedEvent = this.fullCalendarView?.addEvent(eventInput, calendarId);

            // Also add shadow event if this is a subcategory event and we're in timeline view
            const currentViewType = this.fullCalendarView?.view?.type || '';
            if (
              currentViewType.includes('resourceTimeline') &&
              this.plugin.settings.enableAdvancedCategorization &&
              eventInput.resourceId &&
              eventInput.resourceId.includes('::')
            ) {
              const shadowEvents = this.generateShadowEvents([eventInput], true);
              shadowEvents.forEach(shadowEvent => {
                this.fullCalendarView?.addEvent(shadowEvent, calendarId);
              });
            }
          }
        });
      } else if (payload.type == 'calendar') {
        const {
          calendar: { id, events, editable, color }
        } = payload;
        // console.debug('replacing calendar with id', payload.calendar);
        this.fullCalendarView?.getEventSourceById(id)?.remove();

        // Respect workspace source filtering: if hidden, ensure it's removed and skip re-adding
        const workspace = this.getActiveWorkspace();
        const selected = (workspace?.visibleCalendars ?? []).map(String);
        if (selected.length > 0 && !new Set(selected).has(String(id))) {
          return; // Do not re-add hidden calendar source
        }

        const mainEvents = events.flatMap(
          ({ id: eventId, event }: CachedEvent) => toEventInput(eventId, event, settings, id) || []
        );

        // Apply workspace category filtering
        const filteredMainEvents = this.filterEventsByCategory(mainEvents);

        // Only include shadow events if in timeline view
        const currentViewType = this.fullCalendarView?.view?.type || '';
        const shadowEvents = currentViewType.includes('resourceTimeline')
          ? this.generateShadowEvents(filteredMainEvents, true)
          : [];

        this.fullCalendarView?.addEventSource({
          id,
          events: [...filteredMainEvents, ...shadowEvents],
          editable,
          ...getCalendarColors(color)
        });
      }
    });
  }

  onResize(): void {
    if (this.fullCalendarView) {
      this.fullCalendarView.render();
    }
  }

  async onunload() {
    if (this.fullCalendarView) {
      this.fullCalendarView.destroy();
      this.fullCalendarView = null;
    }
    if (this.callback) {
      this.plugin.cache.off('update', this.callback);
      this.callback = null;
    }
  }
}
