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

import {
  Calendar,
  EventApi,
  EventClickArg,
  EventHoveringArg,
  EventSourceInput
} from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import rrulePlugin from '@fullcalendar/rrule';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import googleCalendarPlugin from '@fullcalendar/google-calendar';
import iCalendarPlugin from '@fullcalendar/icalendar';

import { TFolder, Notice } from 'obsidian';

// There is an issue with FullCalendar RRule support around Daylight Saving Time boundaries
// which is fixed by this monkeypatch:
// https://github.com/fullcalendar/fullcalendar/issues/5273#issuecomment-1360459342
const originalExpand = rrulePlugin.recurringTypes[0].expand;
rrulePlugin.recurringTypes[0].expand = function (errd, fr, de) {
  // If the rruleSet is timezone-aware, the rrule.js library can handle it correctly.
  // Our old monkeypatch logic interferes with this.
  // We only need to apply the patch for timezone-naive rules (likely from remote ICS feeds).
  if (errd.rruleSet.tzid()) {
    return originalExpand.call(this, errd, fr, de);
  }

  // Fallback to the monkeypatch for timezone-naive rules.
  const hours = errd.rruleSet._dtstart
    ? errd.rruleSet._dtstart.getHours()
    : de.toDate(fr.start).getUTCHours();

  return errd.rruleSet.between(de.toDate(fr.start), de.toDate(fr.end), true).map((d: Date) => {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hours, d.getMinutes()));
  });
};

interface ExtraRenderProps {
  eventClick?: (info: EventClickArg) => void;
  customButtons?: {
    [key: string]: {
      text: string;
      click: () => void | Promise<void>;
    };
  };

  select?: (startDate: Date, endDate: Date, allDay: boolean, viewType: string) => Promise<void>;
  modifyEvent?: (event: EventApi, oldEvent: EventApi) => Promise<boolean>;
  eventMouseEnter?: (info: EventHoveringArg) => void;
  firstDay?: number;
  initialView?: { desktop: string; mobile: string };
  timeFormat24h?: boolean;
  openContextMenuForEvent?: (event: EventApi, mouseEvent: MouseEvent) => Promise<void>;
  toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
  forceNarrow?: boolean;
  // timeZone?: string;
}

export function renderCalendar(
  containerEl: HTMLElement,
  eventSources: EventSourceInput[],
  settings?: ExtraRenderProps
): Calendar {
  const isMobile = window.innerWidth < 500;
  const isNarrow = settings?.forceNarrow || isMobile;
  const {
    eventClick,
    select,
    modifyEvent,
    eventMouseEnter,
    openContextMenuForEvent,
    toggleTask,
    customButtons
  } = settings || {};
  const modifyEventCallback =
    modifyEvent &&
    (async ({
      event,
      oldEvent,
      revert
    }: {
      event: EventApi;
      oldEvent: EventApi;
      revert: () => void;
    }) => {
      const success = await modifyEvent(event, oldEvent);
      if (!success) {
        revert();
      }
    });

  const cal = new Calendar(containerEl, {
    customButtons: customButtons,
    // timeZone: settings?.timeZone,
    plugins: [
      // View plugins
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      // Drag + drop and editing
      interactionPlugin,
      // Remote sources
      googleCalendarPlugin,
      iCalendarPlugin,
      rrulePlugin
    ],
    googleCalendarApiKey: 'AIzaSyDIiklFwJXaLWuT_4y6I9ZRVVsPuf4xGrk',
    initialView:
      settings?.initialView?.[isNarrow ? 'mobile' : 'desktop'] ||
      (isNarrow ? 'timeGrid3Days' : 'timeGridWeek'),
    nowIndicator: true,
    scrollTimeReset: false,
    dayMaxEvents: true,

    headerToolbar: !isNarrow
      ? {
          left: 'prev,next today',
          center: 'title',
          right: 'analysis dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        }
      : !isMobile
        ? {
            right: 'today,prev,next',
            left: 'timeGrid3Days,timeGridDay,listWeek'
          }
        : false,
    footerToolbar: isMobile
      ? {
          right: 'today,prev,next',
          left: 'timeGrid3Days,timeGridDay,listWeek'
        }
      : false,

    views: {
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
    },
    firstDay: settings?.firstDay,
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
    eventClick,

    selectable: select && true,
    selectMirror: select && true,
    select:
      select &&
      (async info => {
        await select(info.start, info.end, info.allDay, info.view.type);
        info.view.calendar.unselect();
      }),

    editable: modifyEvent && true,
    eventDrop: modifyEventCallback,
    eventResize: modifyEventCallback,

    eventMouseEnter,

    eventDidMount: ({ event, el, textColor }) => {
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

    longPressDelay: 250
  });
  cal.render();
  return cal;
}
