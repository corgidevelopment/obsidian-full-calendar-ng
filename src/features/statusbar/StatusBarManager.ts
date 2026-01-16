/**
 * @file StatusBarManager.ts
 * @brief Manages the Full Calendar status bar item.
 *
 * @description
 * This class is responsible for creating, updating, and removing a status bar
 * item that displays the currently active event. It subscribes to the TimeEngine
 * via the EventCache to receive time-state updates and reactively updates the UI.
 *
 * @license See LICENSE.md
 */

import { Menu } from 'obsidian';
import { DateTime, Duration } from 'luxon';
import FullCalendarPlugin from '../../main';
import { FullCalendarSettings } from '../../types/settings';
import { TimeState } from '../../core/TimeEngine';
import { openFileForEvent } from '../../utils/eventActions';

// Helper for relative time display
function formatRelativeTime(duration: Duration, prefix: 'starts' | 'ends'): string {
  const minutes = Math.floor(duration.as('minutes'));
  const hours = Math.floor(duration.as('hours'));

  if (minutes < 1) return `${prefix} now`;
  if (minutes < 60) return `${prefix} in ${minutes}m`;
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0
      ? `${prefix} in ${hours}h`
      : `${prefix} in ${hours}h ${remainingMinutes}m`;
  }
  return `${prefix} in ${Math.floor(duration.as('days'))}d`;
}

const setCssProps = (element: HTMLElement, props: Record<string, string>): void => {
  Object.entries(props).forEach(([property, value]) => {
    element.style.setProperty(property, value);
  });
};

export class StatusBarManager {
  private plugin: FullCalendarPlugin;
  private statusBarItemEl: HTMLElement | null = null;
  private timeTickCallback: ((state: TimeState) => void) | null = null;
  private currentState: TimeState | null = null;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  public unload(): void {
    // Unsubscribe and remove the status bar item
    if (this.timeTickCallback) {
      this.plugin.cache.off('time-tick', this.timeTickCallback);
      this.timeTickCallback = null;
    }
    if (this.statusBarItemEl) {
      this.statusBarItemEl.remove();
      this.statusBarItemEl = null;
    }
  }

  public update(settings: FullCalendarSettings): void {
    const shouldBeRunning = settings.showEventInStatusBar; // Assumes this setting will be created.
    const isRunning = this.timeTickCallback !== null;

    if (shouldBeRunning && !isRunning) {
      if (!this.statusBarItemEl) {
        this.statusBarItemEl = this.plugin.addStatusBarItem();
        this.statusBarItemEl.onClickEvent(ev => this.handleClick(ev));
      }
      this.timeTickCallback = (state: TimeState) => this.handleTimeTick(state);
      this.plugin.cache.on('time-tick', this.timeTickCallback);
    } else if (!shouldBeRunning && isRunning) {
      if (this.timeTickCallback) {
        this.plugin.cache.off('time-tick', this.timeTickCallback);
        this.timeTickCallback = null;
      }
      if (this.statusBarItemEl) {
        this.statusBarItemEl.remove();
        this.statusBarItemEl = null;
      }
    }
  }

  // REPLACED handleTimeTick with enhanced relative-time version
  private handleTimeTick(state: TimeState): void {
    this.currentState = state;
    if (!this.statusBarItemEl) return;

    const now = DateTime.now();
    let newText = '';

    const currentEvent = state.current;
    const nextEvent = state.upcoming[0];

    if (currentEvent) {
      const endsIn = currentEvent.end.diff(now);
      const relativeTime = formatRelativeTime(endsIn, 'ends');
      const title = currentEvent.event.title;
      const truncatedTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;
      newText = `Event: ${truncatedTitle} (${relativeTime})`;
    } else if (nextEvent) {
      const startsIn = nextEvent.start.diff(now);
      const relativeTime = formatRelativeTime(startsIn, 'starts');
      const title = nextEvent.event.title;
      const truncatedTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;
      newText = `Next: ${truncatedTitle} (${relativeTime})`;
    }

    if (this.statusBarItemEl.textContent !== newText) {
      this.statusBarItemEl.setText(newText);
    }

    setCssProps(this.statusBarItemEl, { display: newText ? 'block' : 'none' });
  }

  private handleClick(ev: MouseEvent): void {
    if (!this.currentState) return;
    const menu = new Menu();

    if (this.currentState.current) {
      menu.addItem(item => {
        item
          .setTitle(`Go to note for "${this.currentState?.current?.event.title}"`)
          .setIcon('file-text')
          .onClick(() => {
            if (this.currentState?.current) {
              void openFileForEvent(
                this.plugin.cache,
                this.plugin.app,
                this.currentState.current.id
              );
            }
          });
      });
    }

    if (this.currentState.upcoming.length > 0) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle('Upcoming events').setDisabled(true));

      this.currentState.upcoming.slice(0, 5).forEach(eventData => {
        // Show next 5
        menu.addItem(item => {
          const time = eventData.start.toFormat('h:mm a');
          item.setTitle(`${time}: ${eventData.event.title}`).onClick(() => {
            void openFileForEvent(this.plugin.cache, this.plugin.app, eventData.id);
          });
        });
      });
    } else if (!this.currentState.current) {
      menu.addItem(item => item.setTitle('No upcoming events').setDisabled(true));
    }

    menu.showAtMouseEvent(ev);
  }
}
