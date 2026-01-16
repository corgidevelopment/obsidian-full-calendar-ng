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
import { EventDetails } from './EventDetails';
import FullCalendarPlugin from '../../main';
import { ConfirmModal } from './ConfirmModal';
import { openFileForEvent } from '../../utils/eventActions';
import { t } from '../../features/i18n/i18n';

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
    new Notice(t('modals.event.errors.createNoCalendars'));
    return;
  }

  // MODIFICATION: Get available categories
  const availableCategories = plugin.cache.getAllCategories();

  new ReactModal(plugin.app, closeModal =>
    Promise.resolve(
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
              new Notice(t('modals.event.errors.createError', { message: e.message }));
              console.error(e);
            }
          }
          closeModal();
        }
      })
    )
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

  new ReactModal(plugin.app, closeModal => {
    const onAttemptEditInherited = () => {
      new ConfirmModal(
        plugin.app,
        t('modals.event.confirmations.editParentTitle'),
        t('modals.event.confirmations.editParentMessage'),
        () => {
          void (async () => {
            if (eventToEdit.type === 'single' && eventToEdit.recurringEventId) {
              const parentLocalId = eventToEdit.recurringEventId;
              const parentGlobalId = `${calId}::${parentLocalId}`; // <-- CHANGE calendarId to calId
              const parentSessionId = await plugin.cache.getSessionId(parentGlobalId);
              if (parentSessionId) {
                closeModal();
                launchEditModal(plugin, parentSessionId);
              } else {
                new Notice(t('modals.event.errors.parentNotFound'));
              }
            }
          })();
        }
      ).open();
    };

    return Promise.resolve(
      React.createElement(EditEvent, {
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
              await plugin.cache.moveEventToCalendar(eventId, newCalendarSettingsId, data);
            } else {
              await plugin.cache.updateEventWithId(eventId, data);
            }
          } catch (e) {
            if (e instanceof Error) {
              new Notice(t('modals.event.errors.updateError', { message: e.message }));
              console.error(e);
            }
          }
          closeModal();
        },
        open: async () => {
          await openFileForEvent(plugin.cache, plugin.app, eventId);
          closeModal();
        },
        deleteEvent: async () => {
          try {
            await plugin.cache.deleteEvent(eventId);
            closeModal();
          } catch (e) {
            if (e instanceof Error) {
              new Notice(t('modals.event.errors.deleteError', { message: e.message }));
              console.error(e);
            }
          }
        },
        onAttemptEditInherited // Pass the new handler as a prop
      })
    );
  }).open();
}

export function launchEventDetailsModal(plugin: FullCalendarPlugin, eventId: string) {
  const event = plugin.cache.getEventById(eventId);
  if (!event) {
    new Notice(t('modals.event.errors.eventNotFound'));
    return;
  }
  const eventDetails = plugin.cache.store.getEventDetails(eventId);
  if (!eventDetails) {
    new Notice(t('modals.event.errors.detailsNotFound'));
    return;
  }

  const calendarId = eventDetails.calendarId;
  const calendar = plugin.providerRegistry.getSource(calendarId);
  const calendarName =
    calendar && calendar.name ? calendar.name : t('modals.event.misc.unknownCalendar');
  const location = eventDetails.location;

  new ReactModal(plugin.app, closeModal => {
    return Promise.resolve(
      React.createElement(EventDetails, {
        event,
        calendarName,
        location,
        onClose: () => closeModal(),
        onOpenNote: location
          ? () => {
              void (async () => {
                await openFileForEvent(plugin.cache, plugin.app, eventId);
                closeModal();
              })();
            }
          : undefined
      })
    );
  }).open();
}
