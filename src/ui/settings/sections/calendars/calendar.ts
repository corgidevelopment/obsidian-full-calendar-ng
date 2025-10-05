/**
 * @file calendar.ts
 * @brief A wrapper for initializing and rendering the FullCalendar.js library.
 *
 * @description
 * This file provides the `renderCalendar` function, which is a factory for
 * creating a `Calendar` instance from the `@fullcalendar/core` library. It
 * encapsulates all the configuration and boilerplate needed to set up the
- * calendar, including plugins, views, toolbar settings, and interaction
 * callbacks.
 *
 * @exports renderCalendar
 * 
 * @license See LICENSE.md
 */

import type {
  Calendar,
  EventApi,
  EventClickArg,
  EventHoveringArg,
  EventSourceInput
} from '@fullcalendar/core';

import { Menu } from 'obsidian';
import type { PluginDef } from '@fullcalendar/core';
import { createDateNavigation } from '../../../../features/navigation/DateNavigation';

let didPatchRRule = false;

// Minimal shape for the rrule plugin we monkeypatch.
interface RRulePluginLike {
  recurringTypes: { expand: (...args: unknown[]) => unknown }[];
}

interface ExtraRenderProps {
  eventClick?: (info: EventClickArg) => void;
  customButtons?: {
    [key: string]: {
      text: string;
      click: (ev?: MouseEvent) => void | Promise<void>;
    };
  };

  select?: (startDate: Date, endDate: Date, allDay: boolean, viewType: string) => Promise<void>;
  modifyEvent?: (event: EventApi, oldEvent: EventApi, newResource?: string) => Promise<boolean>;
  eventMouseEnter?: (info: EventHoveringArg) => void;
  firstDay?: number;
  initialView?: { desktop: string; mobile: string };
  timeFormat24h?: boolean;
  openContextMenuForEvent?: (event: EventApi, mouseEvent: MouseEvent) => Promise<void>;
  toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
  dateRightClick?: (date: Date, mouseEvent: MouseEvent) => void;
  viewRightClick?: (mouseEvent: MouseEvent, calendar: Calendar) => void;
  forceNarrow?: boolean;
  resources?: { id: string; title: string; eventColor?: string }[];
  onViewChange?: () => void; // Add view change callback
  businessHours?: boolean | object; // Support for business hours
  drop?: (taskId: string, date: Date) => Promise<void>; // Drag-and-drop from backlog
  // timeZone?: string;

  // New granular view configuration properties
  slotMinTime?: string;
  slotMaxTime?: string;
  weekends?: boolean;
  hiddenDays?: number[];
  dayMaxEvents?: number | boolean;
}

export async function renderCalendar(
  containerEl: HTMLElement,
  eventSources: EventSourceInput[],
  settings?: ExtraRenderProps & { enableAdvancedCategorization?: boolean }
): Promise<Calendar> {
  // Lazy-load FullCalendar core and plugins only when rendering
  const [core, list, rrule, daygrid, timegrid, interaction] = await Promise.all([
    import('@fullcalendar/core'),
    import('@fullcalendar/list'),
    import('@fullcalendar/rrule'),
    import('@fullcalendar/daygrid'),
    import('@fullcalendar/timegrid'),
    import('@fullcalendar/interaction')
  ]);

  // Optionally load scheduler plugin only when needed
  const showResourceViews = !!settings?.enableAdvancedCategorization;
  const resourceTimeline = showResourceViews
    ? await import('@fullcalendar/resource-timeline')
    : null;

  // Apply RRULE monkeypatch once after plugin loads
  if (!didPatchRRule) {
    const rrulePlugin = ((rrule as unknown as { default?: RRulePluginLike }).default ||
      (rrule as unknown as RRulePluginLike)) as RRulePluginLike;
    const originalExpand = rrulePlugin.recurringTypes[0].expand;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rrulePlugin.recurringTypes[0].expand = function (errd: any, fr: any, de: any) {
      if (errd.rruleSet.tzid()) {
        return originalExpand.call(this, errd, fr, de);
      }
      const hours = errd.rruleSet._dtstart
        ? errd.rruleSet._dtstart.getHours()
        : de.toDate(fr.start).getUTCHours();
      return errd.rruleSet
        .between(de.toDate(fr.start), de.toDate(fr.end), true)
        .map(
          (d: Date) =>
            new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hours, d.getMinutes()))
        );
    };
    didPatchRRule = true;
  }

  const isMobile = window.innerWidth < 500;
  const isNarrow = settings?.forceNarrow || isMobile;
  const {
    eventClick,
    select,
    modifyEvent,
    eventMouseEnter,
    openContextMenuForEvent,
    toggleTask,
    dateRightClick,
    viewRightClick,
    customButtons,
    resources,
    onViewChange,
    businessHours,
    drop
  } = settings || {};

  // Wrap eventClick to ignore shadow events
  const wrappedEventClick =
    eventClick &&
    ((info: EventClickArg) => {
      // Ignore clicks on shadow events
      if (info.event.extendedProps.isShadow) {
        return;
      }
      return eventClick(info);
    });
  const modifyEventCallback =
    modifyEvent &&
    (async ({
      event,
      oldEvent,
      revert,
      newResource
    }: {
      event: EventApi;
      oldEvent: EventApi;
      revert: () => void;
      newResource?: { id: string };
    }) => {
      // Extract the string ID from the newResource object
      const success = await modifyEvent(event, oldEvent, newResource?.id);
      if (!success) {
        revert();
      }
    });

  // Only show resource timeline views if category coloring is enabled
  const enableAdvancedCategorization = settings?.enableAdvancedCategorization;
  // already computed showResourceViews above

  // Group the standard and timeline views together with a space.
  // This tells FullCalendar to render them as a single, connected button group.
  const viewButtonGroup = ['views', showResourceViews ? 'timeline' : null]
    .filter(Boolean)
    .join(',');

  // Add workspace and navigate buttons to the left side of toolbar when not narrow
  const leftToolbarGroup = !isNarrow
    ? 'workspace prev,next today,navigate'
    : 'prev,next today,navigate';

  // The comma between 'analysis' and the view group creates the visual separation.
  const rightToolbarGroup = [!isNarrow ? 'analysis' : null, viewButtonGroup]
    .filter(Boolean)
    .join(' ');

  const headerToolbar = !isNarrow
    ? {
        left: leftToolbarGroup,
        center: 'title',
        right: rightToolbarGroup
      }
    : false; // On narrow views (including mobile), the header is empty.

  const footerToolbar = isNarrow
    ? {
        left: 'today,navigate,prev,next',
        right: rightToolbarGroup // Analysis is already filtered out for narrow views.
      }
    : false;

  type ViewSpec = {
    type: string;
    duration?: { days?: number; weeks?: number };
    buttonText: string;
    slotMinWidth?: number;
  };
  const views: Record<string, ViewSpec> = {
    timeGridDay: {
      type: 'timeGrid',
      duration: { days: 1 },
      buttonText: isNarrow ? '1' : 'day'
    },
    timeGrid3Days: {
      type: 'timeGrid',
      duration: { days: 3 },
      buttonText: '3'
    }
  };
  if (showResourceViews) {
    views.resourceTimelineDay = {
      type: 'resourceTimeline',
      duration: { days: 1 },
      buttonText: 'Timeline Day'
    };
    views.resourceTimelineWeek = {
      type: 'resourceTimeline',
      duration: { weeks: 1 },
      buttonText: 'Timeline Week',
      slotMinWidth: 100
    };
  }

  const customButtonConfig: Record<string, { text: string; click: (ev: MouseEvent) => void }> =
    Object.assign({}, customButtons);

  // Always add the "Views" dropdown
  customButtonConfig.views = {
    text: 'View ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();

      const views = isNarrow
        ? {
            timeGrid3Days: '3 Days',
            timeGridDay: 'Day',
            listWeek: 'List'
          }
        : {
            dayGridMonth: 'Month',
            timeGridWeek: 'Week',
            timeGridDay: 'Day',
            listWeek: 'List'
          };

      for (const [viewName, viewLabel] of Object.entries(views)) {
        menu.addItem(item =>
          item.setTitle(viewLabel).onClick(() => {
            cal.changeView(viewName);
          })
        );
      }
      menu.showAtMouseEvent(ev);
    }
  };

  // Add the "Navigate" dropdown - will be configured after calendar creation
  customButtonConfig.navigate = {
    text: '▾',
    click: (ev: MouseEvent) => {
      // This will be replaced after calendar creation
    }
  };

  // Conditionally add the "Timeline" dropdown
  if (showResourceViews) {
    customButtonConfig.timeline = {
      text: 'Timeline ▾',
      click: (ev: MouseEvent) => {
        const menu = new Menu();
        menu.addItem(item =>
          item.setTitle('Timeline Week').onClick(() => {
            cal.changeView('resourceTimelineWeek');
          })
        );
        menu.addItem(item =>
          item.setTitle('Timeline Day').onClick(() => {
            cal.changeView('resourceTimelineDay');
          })
        );
        menu.showAtMouseEvent(ev);
      }
    };
  }

  // FullCalendar Premium open-source license key (GPLv3 projects)
  // See: https://fullcalendar.io/license for details
  // Narrow dynamic imports to expected shapes without pervasive any usage.
  const CalendarCtor = (core as { Calendar: typeof Calendar }).Calendar;
  const dayGridPlugin = (daygrid as { default: PluginDef }).default;
  const timeGridPlugin = (timegrid as { default: PluginDef }).default;
  const listPlugin = (list as { default: PluginDef }).default;
  const rrulePlugin = (rrule as { default: PluginDef }).default;
  const interactionPlugin = (interaction as { default: PluginDef }).default;
  const resourceTimelinePlugin = resourceTimeline
    ? (resourceTimeline as { default: PluginDef }).default
    : null;

  const cal = new CalendarCtor(containerEl, {
    schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source',
    customButtons: customButtonConfig,
    // timeZone: settings?.timeZone,
    plugins: [
      // View plugins
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      // Only include the heavy scheduler plugin when needed
      ...(showResourceViews && resourceTimelinePlugin
        ? ([resourceTimelinePlugin] as const)
        : ([] as const)),
      // Drag + drop and editing
      interactionPlugin,
      rrulePlugin
    ],
    initialView:
      settings?.initialView?.[isNarrow ? 'mobile' : 'desktop'] ||
      (isNarrow ? 'timeGrid3Days' : 'timeGridWeek'),
    nowIndicator: true,
    scrollTimeReset: false,
    dayMaxEvents: settings?.dayMaxEvents !== undefined ? settings.dayMaxEvents : true, // Use setting override or default to true
    headerToolbar,
    footerToolbar,
    // Cast at usage point to satisfy FullCalendar without polluting variable with any
    views,
    ...(showResourceViews && {
      resourceAreaHeaderContent: 'Categories',
      resources,
      resourcesInitiallyExpanded: false
    }),

    // Business hours configuration
    ...(businessHours && { businessHours }),

    // Prevent dropping events onto parent category rows
    eventAllow: (dropInfo, draggedEvent) => {
      // dropInfo.resource is the resource that the event is being dropped on
      if (dropInfo.resource?.extendedProps?.isParent) {
        return false; // Disallow drop on parent
      }
      return true; // Allow drop on children (or in non-resource views)
    },

    firstDay: settings?.firstDay,
    // New granular view configuration settings
    ...(settings?.slotMinTime !== undefined && { slotMinTime: settings.slotMinTime }),
    ...(settings?.slotMaxTime !== undefined && { slotMaxTime: settings.slotMaxTime }),
    ...(settings?.weekends !== undefined && { weekends: settings.weekends }),
    ...(settings?.hiddenDays !== undefined && { hiddenDays: settings.hiddenDays }),
    ...(settings?.timeFormat24h && {
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      },
      slotLabelFormat: {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      }
    }),
    eventSources,
    eventClick: wrappedEventClick,

    selectable: select && true,
    selectMirror: select && true,
    select:
      select &&
      (async info => {
        await select(info.start, info.end, info.allDay, info.view.type);
        info.view.calendar.unselect();
      }),

    // Handle date clicks (including right-clicks for navigation menu)
    dateClick: info => {
      // Only handle right-clicks for date navigation
      if (info.jsEvent.button === 2 && dateRightClick) {
        info.jsEvent.preventDefault();
        dateRightClick(info.date, info.jsEvent);
      }
    },

    editable: modifyEvent && true,
    eventDrop: modifyEventCallback,
    eventResize: modifyEventCallback,

    eventMouseEnter,

    eventDidMount: ({ event, el, textColor }) => {
      // Don't add context menu or checkboxes to shadow events
      if (event.extendedProps.isShadow) {
        el.addClass('fc-event-shadow');
        return;
      }

      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContextMenuForEvent && openContextMenuForEvent(event, e);
      });
      if (toggleTask) {
        if (event.extendedProps.isTask) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = !!event.extendedProps.taskCompleted;
          checkbox.onclick = async e => {
            e.stopPropagation();
            if (e.target) {
              let ret = await toggleTask(event, (e.target as HTMLInputElement).checked);
              if (!ret) {
                (e.target as HTMLInputElement).checked = !(e.target as HTMLInputElement).checked;
              }
            }
          };
          // Make the checkbox more visible against different color events.
          if (textColor == 'black') {
            checkbox.addClass('ofc-checkbox-black');
          } else {
            checkbox.addClass('ofc-checkbox-white');
          }

          if (checkbox.checked) {
            el.addClass('ofc-task-completed');
          }

          // Depending on the view, we should put the checkbox in a different spot.
          const container =
            el.querySelector('.fc-event-time') ||
            el.querySelector('.fc-event-title') ||
            el.querySelector('.fc-list-event-title');

          container?.addClass('ofc-has-checkbox');
          container?.prepend(checkbox);
        }
      }
    },

    viewDidMount: onViewChange,

    // Enable drag-and-drop from external sources (e.g., Tasks Backlog)
    droppable: drop && true,
    drop:
      drop &&
      (info => {
        // Get the task ID from the dragged element's data transfer
        const taskId = info.draggedEl.getAttribute('data-task-id');
        if (taskId) {
          drop(taskId, info.date);
        }
      }),

    longPressDelay: 250
  });

  cal.render();

  // Set up date navigation after calendar is created
  const dateNavigation = createDateNavigation(cal, containerEl);

  // Update the navigate button click handler
  const navigateButton = containerEl.querySelector('.fc-navigate-button') as HTMLButtonElement;
  if (navigateButton) {
    navigateButton.addEventListener('click', (ev: MouseEvent) => {
      dateNavigation.showNavigationMenu(ev);
    });
  }

  // Add general right-click handler to calendar container for view-level navigation
  if (viewRightClick) {
    containerEl.addEventListener('contextmenu', (event: MouseEvent) => {
      // Only handle if not handled by specific date or event right-clicks
      if (!event.defaultPrevented) {
        event.preventDefault();
        viewRightClick(event, cal);
      }
    });
  }

  return cal;
}
