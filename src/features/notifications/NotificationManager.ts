import { DateTime } from 'luxon';
import { Notice } from 'obsidian';
import { OFCEvent } from '../../types';
import { FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';
import { TimeState, EnrichedOFCEvent } from '../../core/TimeEngine';
import { t } from '../i18n/i18n';
import { launchReminderModal } from './ui/reminder_modal';

export class NotificationManager {
  private plugin: FullCalendarPlugin;
  private timeTickCallback: ((state: TimeState) => void) | null = null;
  // Store notified events to prevent duplicate notifications in the same session.
  // Format: `${sessionId}::${type}::${triggerTimeISO}`
  private notifiedEvents = new Set<string>();

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  public unload(): void {
    if (this.timeTickCallback) {
      this.plugin.cache.off('time-tick', this.timeTickCallback);
      this.timeTickCallback = null;
    }
  }

  public update(settings: FullCalendarSettings): void {
    const shouldBeRunning = settings.enableReminders;
    const isRunning = this.timeTickCallback !== null;

    if (shouldBeRunning && !isRunning) {
      this.notifiedEvents.clear();
      this.timeTickCallback = (state: TimeState) => this.handleTimeTick(state);
      this.plugin.cache.on('time-tick', this.timeTickCallback);
    } else if (!shouldBeRunning && isRunning) {
      if (this.timeTickCallback) {
        this.plugin.cache.off('time-tick', this.timeTickCallback);
        this.timeTickCallback = null;
      }
    }
  }

  private handleTimeTick(state: TimeState) {
    if (!this.plugin.cache.initialized) return;

    const now = DateTime.now();
    // Optimization: Only process events starting within the next 48 hours.
    const lookaheadLimit = now.plus({ hours: 48 });

    // Combine current and upcoming for processing
    const candidates = [...(state.current ? [state.current] : []), ...state.upcoming];

    for (const occurrence of candidates) {
      // Optimization check
      if (occurrence.start > lookaheadLimit) continue;

      this.checkAndNotify(occurrence, now);
    }
  }

  private checkAndNotify(occurrence: EnrichedOFCEvent, now: DateTime) {
    const { event, start } = occurrence;
    const { enableDefaultReminder, defaultReminderMinutes } = this.plugin.settings;
    const recencyCutoff = { minutes: 5 }; // Don't notify if the trigger point was more than 5 mins ago (e.g. at startup)

    // 1. Check Custom Reminder (High Priority)
    let customDefined = false;
    if (event.notify && typeof event.notify.value === 'number') {
      customDefined = true;
      const customTriggered = start.minus({ minutes: event.notify.value });
      const isDue = now >= customTriggered;
      const isTooLate = customTriggered.plus(recencyCutoff) < now;

      if (isDue && !isTooLate) {
        this.tryTrigger(occurrence, 'custom', customTriggered);
      }
    }

    // 2. Check Default Reminder (Only if no custom reminder is set)
    if (!customDefined && enableDefaultReminder) {
      const defaultTriggerTime = start.minus({ minutes: defaultReminderMinutes });
      const isDue = now >= defaultTriggerTime;
      // Avoid triggering for events way in the past if we just started up
      const isTooLate = defaultTriggerTime.plus(recencyCutoff) < now;

      if (isDue && !isTooLate) {
        this.tryTrigger(occurrence, 'default', defaultTriggerTime);
      }
    }
  }

  private tryTrigger(
    occurrence: EnrichedOFCEvent,
    type: 'default' | 'custom',
    triggerTime: DateTime
  ) {
    const { id: sessionId, event } = occurrence;
    // Deduplication key: Unique per session, type, and specific trigger instance
    const key = `${sessionId}::${type}::${triggerTime.toISO()}`;

    if (this.notifiedEvents.has(key)) return;

    this.triggerNotification(event, sessionId, type);
    this.notifiedEvents.add(key);
  }

  private triggerNotification(event: OFCEvent, eventId: string, type: 'default' | 'custom') {
    const title = t('notifications.eventStarting.title'); // "Event Starting"

    // Customize body based on type
    // Customize body based on type
    const timeStr =
      !event.allDay && event.startTime
        ? DateTime.fromFormat(event.startTime, 'HH:mm').toFormat('h:mm a')
        : '';

    let body = `${event.title}`;
    if (timeStr) body += ` at ${timeStr}`;

    if (type === 'custom') {
      const mins = event.notify?.value || 0;
      body += '\n' + t('notifications.inMinutes', { mins: mins.toString() });
    } else {
      const mins = this.plugin.settings.defaultReminderMinutes;
      body += '\n' + t('notifications.inMinutes', { mins: mins.toString() });
    }

    try {
      const notification = new Notification(title, { body });

      notification.onclick = () => {
        // Launch the interactive modal instead of just opening the file
        launchReminderModal(this.plugin, event, eventId, type);
      };
    } catch (e) {
      console.error(t('notifications.failed'), e);
      new Notice(t('notifications.errorBody'));
    }
  }
}
