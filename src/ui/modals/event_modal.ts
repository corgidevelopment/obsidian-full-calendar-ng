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

import * as React from 'react';
import ReactModal from '../ReactModal';

import { Notice } from 'obsidian';
import { OFCEvent } from '../../types';
import { EditEvent } from './EditEvent';
import FullCalendarPlugin from '../../main';
import { ConfirmModal } from './ConfirmModal';
import { openFileForEvent } from '../../utils/eventActions';

export function launchCreateModal(plugin: FullCalendarPlugin, partialEvent: Partial<OFCEvent>) {
  const calendars = plugin.providerRegistry
    .getAllSources()
    .filter(s => s.type !== 'FOR_TEST_ONLY')
    .map(info => {
      const instance = plugin.providerRegistry.getInstance(info.id);
      if (!instance) return null;
      const capabilities = instance.getCapabilities();
      if (!capabilities.canCreate) return null; // Filter for writable calendars

      return {
        id: info.id,
        type: info.type,
        name: info.name
      };
    })
    .filter((c): c is NonNullable<typeof c> => !!c);

  if (calendars.length === 0) {
    new Notice('Cannot create event: No writable calendars are available.');
    return;
  }

  // MODIFICATION: Get available categories
  const availableCategories = plugin.cache.getAllCategories();

  new ReactModal(plugin.app, async closeModal =>
    React.createElement(EditEvent, {
      initialEvent: partialEvent,
      calendars,
      defaultCalendarIndex: 0,
      availableCategories,
      enableCategory: plugin.settings.enableAdvancedCategorization,
      enableBackgroundEvents: plugin.settings.enableBackgroundEvents,
      enableReminders: plugin.settings.enableReminders,
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
  const eventDetails = plugin.cache.store.getEventDetails(eventId);
  if (!eventDetails) {
    throw new Error(`Cannot edit event with ID ${eventId} that doesn't exist in the store.`);
  }
  const calId = eventDetails.calendarId; // This is the RUNTIME ID.

  const calendars = plugin.providerRegistry
    .getAllSources()
    .filter(s => s.type !== 'FOR_TEST_ONLY')
    .map(info => {
      const instance = plugin.providerRegistry.getInstance(info.id);
      if (!instance) return null;
      const capabilities = instance.getCapabilities();
      if (!capabilities.canEdit && !capabilities.canCreate) return null;

      return {
        id: info.id,
        type: info.type,
        name: info.name
      };
    })
    .filter((c): c is NonNullable<typeof c> => !!c);

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
            const parentGlobalId = `${calId}::${parentLocalId}`; // <-- CHANGE calendarId to calId
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
      defaultCalendarIndex: calIdx,
      availableCategories,
      enableCategory: plugin.settings.enableAdvancedCategorization,
      enableBackgroundEvents: plugin.settings.enableBackgroundEvents,
      enableReminders: plugin.settings.enableReminders, // ADD THIS PROP
      submit: async (data, calendarIndex) => {
        try {
          const newCalendarSettingsId = calendars[calendarIndex].id;
          const oldCalendarSettingsId = eventDetails.calendarId;
          if (newCalendarSettingsId !== oldCalendarSettingsId) {
            new Notice('Moving events between calendars is not yet supported.');
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
          await plugin.cache.deleteEvent(eventId);
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
