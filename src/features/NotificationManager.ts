import { DateTime } from 'luxon';
import { RRule, rrulestr } from 'rrule';
import { Notice } from 'obsidian';
import { OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';
import { openFileForEvent } from '../utils/eventActions';
import FullCalendarPlugin from '../main';

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

export class NotificationManager {
  private plugin: FullCalendarPlugin;
  private intervalId: number | null = null;
  private notifiedEvents = new Set<string>();

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  public unload(): void {
    this.stop();
  }

  public update(settings: FullCalendarSettings): void {
    const shouldBeRunning = settings.enableReminders;
    const isRunning = this.intervalId !== null;

    if (shouldBeRunning && !isRunning) {
      console.log('Full Calendar: Reminders enabled, starting NotificationManager.');
      this.start();
    } else if (!shouldBeRunning && isRunning) {
      console.log('Full Calendar: Reminders disabled, stopping NotificationManager.');
      this.stop();
    }
  }

  private start() {
    if (this.intervalId !== null) {
      this.stop();
    }
    this.notifiedEvents.clear();
    this.intervalId = window.setInterval(() => this.tick(), 60 * 1000);
  }

  private stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private calculateNotificationTimes(
    event: OFCEvent,
    now: DateTime
  ): { start: DateTime | null; end: DateTime | null } {
    const fromISO = (date: string, time?: string) => {
      const dateTimeString = time ? `${date}T${time}` : date;
      // Use the event's timezone, falling back to the display timezone for safety.
      const zone = event.timezone || this.plugin.settings.displayTimezone || 'local';
      return DateTime.fromISO(dateTimeString, { zone });
    };

    if (event.type === 'single') {
      if (event.allDay) {
        const start = fromISO(event.date).startOf('day');
        return { start, end: null };
      }
      const start = fromISO(event.date, event.startTime);
      const end = event.endTime ? fromISO(event.endDate || event.date, event.endTime) : null;
      return { start, end };
    }

    if (event.type === 'recurring' || event.type === 'rrule') {
      let rule: RRule;
      try {
        if (event.type === 'recurring') {
          const dtstart = fromISO(
            event.startRecur || '1970-01-01',
            event.allDay ? undefined : event.startTime
          ).toJSDate();
          const weekdays = {
            U: RRule.SU,
            M: RRule.MO,
            T: RRule.TU,
            W: RRule.WE,
            R: RRule.TH,
            F: RRule.FR,
            S: RRule.SA
          };

          const ruleOptions: any = { dtstart, freq: RRule.WEEKLY };
          if (event.daysOfWeek) {
            ruleOptions.byweekday = event.daysOfWeek.map(c => weekdays[c as keyof typeof weekdays]);
          } else if (event.dayOfMonth) {
            ruleOptions.freq = RRule.MONTHLY;
            ruleOptions.bymonthday = event.dayOfMonth;
            if (event.month) {
              ruleOptions.freq = RRule.YEARLY;
              ruleOptions.bymonth = event.month;
            }
          }

          if (event.endRecur) {
            ruleOptions.until = fromISO(event.endRecur).endOf('day').toJSDate();
          }

          rule = new RRule(ruleOptions);
        } else {
          rule = rrulestr(event.rrule, {
            dtstart: fromISO(event.startDate, event.allDay ? undefined : event.startTime).toJSDate()
          });
        }
      } catch (e) {
        console.error(`[Full Calendar] Error parsing rrule for event "${event.title}"`, e);
        return { start: null, end: null };
      }

      // Find the next occurrence after right now.
      const nowJS = now.toJSDate();
      // FIX #1: Use the .after() method to get the next occurrence, which is the correct API.
      const nextOccurrence = rule.after(nowJS, false);

      if (!nextOccurrence) {
        return { start: null, end: null };
      }

      // We only care about the *very next* non-skipped occurrence.
      const dateStr = DateTime.fromJSDate(nextOccurrence).toISODate();
      if (dateStr && event.skipDates.includes(dateStr)) {
        // If the next one is skipped, we don't calculate further.
        // The next tick will find the subsequent one.
        return { start: null, end: null };
      }

      const start = DateTime.fromJSDate(nextOccurrence);
      let end: DateTime | null = null;
      if (!event.allDay && event.startTime && event.endTime) {
        const startTime = DateTime.fromFormat(event.startTime, 'HH:mm');
        const endTime = DateTime.fromFormat(event.endTime, 'HH:mm');
        if (startTime.isValid && endTime.isValid) {
          const duration = endTime.diff(startTime);
          end = start.plus(duration);
        }
      }
      return { start, end };
    }

    return { start: null, end: null };
  }

  private async tick() {
    if (!this.plugin.cache.initialized) return;

    const now = DateTime.now();
    const reminderLeadTime = { minutes: 10 };
    // We will not notify for events that have already started more than an hour ago.
    const recencyCutoff = { hours: 1 };

    const sources = this.plugin.cache.getAllEvents();
    for (const source of sources) {
      for (const cachedEvent of source.events) {
        const fcEvent = this.plugin.cache.getEventById(cachedEvent.id);
        if (!fcEvent) continue;

        const notificationTimes = this.calculateNotificationTimes(fcEvent, now);

        // Check Start Reminder
        if (notificationTimes.start) {
          const startNotificationTime = notificationTimes.start.minus(reminderLeadTime);
          const startNotificationId = `${cachedEvent.id}::start::${notificationTimes.start.toISODate()}`;

          const isDue = startNotificationTime <= now;
          // ADDED THIS CHECK: Is the event's actual start time in the recent past?
          const isTooLate = notificationTimes.start.plus(recencyCutoff) < now;

          if (isDue && !isTooLate && !this.notifiedEvents.has(startNotificationId)) {
            this.triggerNotification(fcEvent, cachedEvent.id, 'start');
            this.notifiedEvents.add(startNotificationId);
          }
        }

        // Check End Reminder
        if (fcEvent.endReminder && notificationTimes.end) {
          const endNotificationTime = notificationTimes.end.minus(reminderLeadTime);
          const endNotificationId = `${cachedEvent.id}::end::${notificationTimes.end.toISODate()}`;

          const isDue = endNotificationTime <= now;
          // ADDED THIS CHECK: Is the event's actual end time in the recent past?
          const isTooLate = notificationTimes.end.plus(recencyCutoff) < now;

          if (isDue && !isTooLate && !this.notifiedEvents.has(endNotificationId)) {
            this.triggerNotification(fcEvent, cachedEvent.id, 'end');
            this.notifiedEvents.add(endNotificationId);
          }
        }
      }
    }
  }

  private triggerNotification(event: OFCEvent, eventId: string, type: 'start' | 'end') {
    const title = `Event ${type === 'start' ? 'Starting' : 'Ending'} Soon`;

    let body: string;
    if (event.allDay) {
      body = `${event.title} (All-day)`;
    } else {
      const timeToDisplay = type === 'start' ? event.startTime : event.endTime;
      const formattedTime = timeToDisplay
        ? DateTime.fromFormat(timeToDisplay, 'HH:mm').toFormat('h:mm a')
        : '';
      body = `${event.title} ${type === 'start' ? 'starts' : 'ends'} at ${formattedTime}`;
    }

    try {
      const notification = new Notification(title, { body });

      notification.onclick = () => {
        // [DEBUG-CLICK] log for notification click
        console.log(`[DEBUG-CLICK] Notification for event ID ${eventId} was clicked.`);
        try {
          // This function is async, but we don't need to await it here.
          // The notification is fire-and-forget.
          openFileForEvent(this.plugin.cache, this.plugin.app, eventId);
        } catch (e) {
          if (e instanceof Error) {
            console.error('Full Calendar: Error opening note from notification:', e);
            new Notice(e.message);
          }
        }
      };
    } catch (e) {
      console.error('Full Calendar: Failed to create desktop notification.', e);
      new Notice('Full Calendar: Could not show desktop notification. Check console for errors.');
    }
  }
}
