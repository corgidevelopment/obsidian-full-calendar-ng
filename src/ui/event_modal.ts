/**
 * @file event_modal.ts
 * @brief Provides functions to launch React-based modals for creating and editing events.
 *
 * @description
 * This file serves as the bridge between Obsidian's imperative UI system and
 * the declarative React world. The `launchCreateModal` and `launchEditModal`
 * functions are responsible for creating a `ReactModal` instance and mounting
 * the `EditEvent` React component within it, passing all necessary props and
 * callbacks for event submission and deletion.
 *
 * @see ReactModal.ts
 * @see components/EditEvent.tsx
 *
 * @exports launchCreateModal
 * @exports launchEditModal
 *
 * @license See LICENSE.md
 */

import { Notice, Modal, App, Setting, ButtonComponent } from 'obsidian';
import * as React from 'react';
import { EditableCalendar } from '../calendars/EditableCalendar';
import FullCalendarPlugin from '../main';
import { OFCEvent } from '../types';
import { openFileForEvent } from '../actions/eventActions';
import { EditEvent } from './components/EditEvent';
import ReactModal from './ReactModal';
import { ConfirmModal } from './modals/ConfirmModal';

export function launchCreateModal(plugin: FullCalendarPlugin, partialEvent: Partial<OFCEvent>) {
  const calendars = [...plugin.cache.calendars.entries()]
    .filter(([_, cal]) => cal instanceof EditableCalendar)
    .map(([id, cal]) => {
      return {
        id,
        type: cal.type,
        name: cal.name
      };
    });

  // MODIFICATION: Get available categories
  const availableCategories = plugin.cache.getAllCategories();

  new ReactModal(plugin.app, async closeModal =>
    React.createElement(EditEvent, {
      initialEvent: partialEvent,
      calendars,
      defaultCalendarIndex: 0,
      availableCategories,
      enableCategory: plugin.settings.enableCategoryColoring,
      submit: async (data, calendarIndex) => {
        const calendarId = calendars[calendarIndex].id;
        try {
          // Note: The data source layer is now responsible for constructing the full title.
          // The `data` object here has a clean title and category.
          await plugin.cache.addEvent(calendarId, data);
        } catch (e) {
          if (e instanceof Error) {
            new Notice('Error when creating event: ' + e.message);
            console.error(e);
          }
        }
        closeModal();
      }
    })
  ).open();
}

/**
 * @file
 * Provides the `launchEditModal` function for displaying and handling the event editing modal
 * in the FullCalendar plugin UI. This modal allows users to edit, move, or delete calendar events,
 * including handling inherited properties from recurring parent events and category selection.
 * Integrates with the plugin's cache and settings, and supports error handling and user confirmations.
 */
export function launchEditModal(plugin: FullCalendarPlugin, eventId: string) {
  const eventToEdit = plugin.cache.getEventById(eventId);
  if (!eventToEdit) {
    throw new Error("Cannot edit event that doesn't exist.");
  }
  const calId = plugin.cache.getInfoForEditableEvent(eventId).calendar.id;

  const calendars = [...plugin.cache.calendars.entries()]
    .filter(([_, cal]) => cal instanceof EditableCalendar)
    .map(([id, cal]) => {
      return {
        id,
        type: cal.type,
        name: cal.name
      };
    });

  const calIdx = calendars.findIndex(({ id }) => id === calId);
  const availableCategories = plugin.cache.getAllCategories();

  new ReactModal(plugin.app, async closeModal => {
    const onAttemptEditInherited = () => {
      new ConfirmModal(
        plugin.app,
        'Edit Parent Event?',
        'This property is inherited from the parent recurring event. Would you like to open the parent to make changes?',
        async () => {
          if (eventToEdit.type === 'single' && eventToEdit.recurringEventId) {
            const parentLocalId = eventToEdit.recurringEventId;
            const parentGlobalId = `${calId}::${parentLocalId}`;
            const parentSessionId = await plugin.cache.getSessionId(parentGlobalId);
            if (parentSessionId) {
              closeModal();
              launchEditModal(plugin, parentSessionId);
            } else {
              new Notice('Could not find the parent recurring event.');
            }
          }
        }
      ).open();
    };

    return React.createElement(EditEvent, {
      initialEvent: eventToEdit,
      calendars,
      defaultCalendarIndex: calIdx, // <-- RESTORED THIS PROP
      availableCategories,
      enableCategory: plugin.settings.enableCategoryColoring,
      submit: async (data, calendarIndex) => {
        try {
          if (calendarIndex !== calIdx) {
            await plugin.cache.moveEventToCalendar(eventId, calendars[calendarIndex].id);
          }
          await plugin.cache.updateEventWithId(eventId, data);
        } catch (e) {
          if (e instanceof Error) {
            new Notice('Error when updating event: ' + e.message);
            console.error(e);
          }
        }
        closeModal();
      },
      open: async () => {
        openFileForEvent(plugin.cache, plugin.app, eventId);
        closeModal();
      },
      deleteEvent: async () => {
        try {
          // This call now triggers the modal logic if needed.
          await plugin.cache.deleteEvent(eventId);
          // If the event was a recurring master with children, a modal will
          // open and this closeModal() might happen before the user chooses.
          // This is acceptable behavior.
          closeModal();
        } catch (e) {
          if (e instanceof Error) {
            new Notice('Error when deleting event: ' + e.message);
            console.error(e);
          }
        }
      },
      onAttemptEditInherited // Pass the new handler as a prop
    });
  }).open();
}
