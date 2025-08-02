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

import { Calendar, EventSourceInput, EventInput } from '@fullcalendar/core';

import './overrides.css';
import FullCalendarPlugin from '../main';
import { renderCalendar } from './calendar';
import { renderOnboarding } from './onboard';
import { PLUGIN_SLUG, CalendarInfo } from '../types';
import { UpdateViewCallback, CachedEvent } from '../core/EventCache';
import { openFileForEvent } from '../actions/eventActions';
import { isTask, toggleTask, unmakeTask } from '../actions/tasks';
import { launchCreateModal, launchEditModal } from './event_modal';
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
   * Translates event data from the `EventCache` into the `EventSourceInput`
   * format required by the FullCalendar library.
   * Also calculates the correct text color for event backgrounds.
   */
  translateSources() {
    const settings = this.plugin.settings;
    return this.plugin.cache.getAllEvents().map(
      ({ events, editable, color, id }): EventSourceInput => ({
        id,
        events: events
          .map((e: CachedEvent) => toEventInput(e.id, e.event, settings, id)) // <-- FIX 1
          .filter((e): e is EventInput => !!e), // <-- FIX 2
        editable,
        ...getCalendarColors(color)
      })
    );
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

    // Generate the list of resources for the timeline view.
    // This now builds a hierarchical structure for categories and sub-categories.
    const resources: {
      id: string;
      title: string;
      parentId?: string;
      eventColor?: string;
      extendedProps?: any;
    }[] = [];
    if (this.plugin.settings.enableAdvancedCategorization) {
      // First, add top-level resources for each category from settings.
      const categorySettings = this.plugin.settings.categorySettings || [];
      categorySettings.forEach((cat: { name: string; color: string }) => {
        resources.push({
          id: cat.name,
          title: cat.name,
          eventColor: cat.color,
          extendedProps: { isParent: true }
        });
      });

      // Build a map of categories to their sub-categories from actual events in the cache.
      const categoryMap = new Map<string, Set<string>>();
      for (const source of this.plugin.cache.getAllEvents()) {
        for (const cachedEvent of source.events) {
          const { category, subCategory } = cachedEvent.event;
          if (category) {
            if (!categoryMap.has(category)) {
              categoryMap.set(category, new Set());
            }
            // START MODIFICATION
            const sub = subCategory || '__NONE__';
            categoryMap.get(category)!.add(sub);
            // END MODIFICATION
          }
        }
      }

      // Now, create the child resources (sub-categories).
      for (const [category, subCategories] of categoryMap.entries()) {
        // Ensure the parent category exists in the resources array.
        if (!resources.find(r => r.id === category)) {
          resources.push({
            id: category,
            title: category,
            extendedProps: { isParent: true }
          });
        }

        for (const subCategory of subCategories) {
          // START MODIFICATION
          resources.push({
            id: `${category}::${subCategory}`,
            title: subCategory === '__NONE__' ? '(none)' : subCategory,
            parentId: category
          });
          // END MODIFICATION
        }
      }
    }

    const sources: EventSourceInput[] = this.translateSources();

    if (this.fullCalendarView) {
      this.fullCalendarView.destroy();
      this.fullCalendarView = null;
    }
    this.fullCalendarView = renderCalendar(calendarEl, sources, {
      // timeZone:
      //   this.plugin.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone, // <-- ADD THIS LINE
      forceNarrow: this.inSidebar,
      resources,
      enableAdvancedCategorization: this.plugin.settings.enableAdvancedCategorization,
      customButtons: {
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
            await openFileForEvent(this.plugin.cache, this.app, info.event.id);
          } else {
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
      initialView: this.plugin.settings.initialView,
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
          if (!isTask(event)) {
            menu.addItem(item =>
              item.setTitle('Turn into task').onClick(async () => {
                await this.plugin.cache.processEvent(e.id, e => toggleTask(e, false));
              })
            );
          } else {
            menu.addItem(item =>
              item.setTitle('Remove checkbox').onClick(async () => {
                await this.plugin.cache.processEvent(e.id, unmakeTask);
              })
            );
          }
          menu.addSeparator();
          menu.addItem(item =>
            item.setTitle('Go to note').onClick(() => {
              if (!this.plugin.cache) {
                return;
              }
              openFileForEvent(this.plugin.cache, this.app, e.id);
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
          // console.debug('adding event', {
          //   id,
          //   event,
          //   eventInput,
          //   calendarId
          // });
          const addedEvent = this.fullCalendarView?.addEvent(eventInput!, calendarId);
          // console.debug('event that was added', addedEvent);
        });
      } else if (payload.type == 'calendar') {
        const {
          calendar: { id, events, editable, color }
        } = payload;
        // console.debug('replacing calendar with id', payload.calendar);
        this.fullCalendarView?.getEventSourceById(id)?.remove();
        this.fullCalendarView?.addEventSource({
          id,
          // Pass settings to toEventInput
          events: events.flatMap(
            ({ id: eventId, event }: CachedEvent) =>
              toEventInput(eventId, event, settings, id) || []
          ),
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
