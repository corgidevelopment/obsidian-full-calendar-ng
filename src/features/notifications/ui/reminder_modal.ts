/**
 * @file reminder_modal.ts
 * @brief Launcher for the Reminder Modal.
 */
import * as React from 'react';
import ReactModal from '../../../ui/ReactModal';
import { ReminderModal } from './ReminderModal';
import FullCalendarPlugin from '../../../main';
import { OFCEvent } from '../../../types';
import { openFileForEvent } from '../../../utils/eventActions';
import { Notice } from 'obsidian';

export function launchReminderModal(
  plugin: FullCalendarPlugin,
  event: OFCEvent,
  eventId: string,
  type: 'default' | 'custom'
) {
  new ReactModal(plugin.app, async closeModal => {
    return React.createElement(ReminderModal, {
      event,
      type,
      defaultReminderMinutes: plugin.settings.defaultReminderMinutes,
      onDismiss: () => {
        closeModal();
      },
      onOpen: async () => {
        try {
          await openFileForEvent(plugin.cache, plugin.app, eventId);
        } catch (e) {
          new Notice('Could not open event file.');
          console.error(e);
        }
        closeModal();
      },
      onSnooze: async minutes => {
        try {
          await plugin.cache.processEvent(eventId, e => {
            if (type === 'default') {
              // Destructive Snooze: Move Start Time
              if (e.allDay) {
                new Notice('Cannot snooze start time of all-day events.');
                return e;
              }
              const { DateTime } = require('luxon');

              const oldStart = DateTime.fromFormat(e.startTime, 'HH:mm');
              if (!oldStart.isValid) return e;

              const newStart = oldStart.plus({ minutes });

              if (e.endTime) {
                const end = DateTime.fromFormat(e.endTime, 'HH:mm');
                if (end.isValid && newStart >= end) {
                  throw new Error('Cannot snooze: New start time would be after end time.');
                }
              }

              return {
                ...e,
                startTime: newStart.toFormat('HH:mm')
              };
            } else {
              // Custom Snooze: Reduce notify value
              const currentNotify = e.notify?.value || 0;
              const newNotify = Math.max(0, currentNotify - minutes);
              return {
                ...e,
                notify: { value: newNotify }
              };
            }
          });
          new Notice(`Snoozed for ${minutes} minutes.`);
        } catch (e) {
          console.error('Snooze failed', e);
          if (e instanceof Error) {
            new Notice(e.message);
          } else {
            new Notice('Failed to snooze event.');
          }
        }
        closeModal();
      }
    });
  }).open();
}
