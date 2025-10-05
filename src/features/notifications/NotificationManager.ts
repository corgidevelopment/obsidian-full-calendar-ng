import { DateTime } from 'luxon';
import { Notice } from 'obsidian';
import { OFCEvent } from '../../chrono_analyser/data/types';
import { FullCalendarSettings } from '../../types/settings';
import { openFileForEvent } from '../../utils/eventActions';
import FullCalendarPlugin from '../../main';
import { TimeState, EnrichedOFCEvent } from '../../core/TimeEngine';

export class NotificationManager {
  private plugin: FullCalendarPlugin;
  private timeTickCallback: ((state: TimeState) => void) | null = null;
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
    const reminderLeadTime = { minutes: 10 };
    const recencyCutoff = { hours: 1 };

    // Helper function to check and trigger notifications for a single event occurrence.
    const checkAndNotify = (occurrence: EnrichedOFCEvent) => {
      const { id: sessionId, event, start, end } = occurrence;

      const startNotificationTime = start.minus(reminderLeadTime);
      const startNotificationId = `${sessionId}::start::${start.toISODate()}`;
      const startDue = startNotificationTime <= now;
      const startTooLate = start.plus(recencyCutoff) < now;
      if (startDue && !startTooLate && !this.notifiedEvents.has(startNotificationId)) {
        this.triggerNotification(event, sessionId, 'start');
        this.notifiedEvents.add(startNotificationId);
      }

      if (event.endReminder && end) {
        const endNotificationTime = end.minus(reminderLeadTime);
        const endNotificationId = `${sessionId}::end::${end.toISODate()}`;
        const endDue = endNotificationTime <= now;
        const endTooLate = end.plus(recencyCutoff) < now;
        if (endDue && !endTooLate && !this.notifiedEvents.has(endNotificationId)) {
          this.triggerNotification(event, sessionId, 'end');
          this.notifiedEvents.add(endNotificationId);
        }
      }
    };

    // Process the current event
    if (state.current) {
      checkAndNotify(state.current);
    }

    // Process all upcoming events
    for (const occurrence of state.upcoming) {
      checkAndNotify(occurrence);
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
        try {
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
