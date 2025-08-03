/**
 * @file RecurringEventManager.ts
 * @brief Manages all complex business logic related to recurring events.
 *
 * @description
 * This class is an internal component of the EventCache and is not intended
 * to be used directly. It encapsulates the logic for handling recurring event
 * modifications, deletions, and overrides (exceptions).
 *
 * @see EventCache.ts
 *
 * @license See LICENSE.md
 */

import { Notice } from 'obsidian';

import { OFCEvent } from '../../types';
import EventCache from '../EventCache';
import { StoredEvent } from '../EventStore';
import { toggleTask } from '../../actions/tasks';
import GoogleCalendar from '../../calendars/GoogleCalendar';
import { DeleteRecurringModal } from '../../ui/modals/DeleteRecurringModal';

/**
 * Manages all complex business logic related to recurring events.
 * This class is intended for internal use by the EventCache only.
 */
export class RecurringEventManager {
  private cache: EventCache;

  constructor(cache: EventCache) {
    this.cache = cache;
  }

  /**
   * Finds all override events that are children of a given master recurring event.
   * @param masterEventId The session ID of the master recurring event.
   * @returns An array of StoredEvent objects representing the child overrides.
   */
  private findRecurringChildren(masterEventId: string): StoredEvent[] {
    const masterEventDetails = this.cache.store.getEventDetails(masterEventId);
    if (!masterEventDetails) return [];

    const { calendarId, event: masterEvent } = masterEventDetails;
    const calendar = this.cache.calendars.get(calendarId);
    if (!calendar) return [];

    // The local identifier is what's stored in the child's `recurringEventId` field.
    const masterLocalIdentifier = calendar.getLocalIdentifier(masterEvent);
    if (!masterLocalIdentifier) return [];

    return this.cache.store
      .getAllEvents()
      .filter(
        e => e.calendarId === calendar.id && e.event.recurringEventId === masterLocalIdentifier
      );
  }

  public async promoteRecurringChildren(masterEventId: string): Promise<void> {
    const children = this.findRecurringChildren(masterEventId);
    if (children.length === 0) {
      // No children to promote, just delete the master.
      await this.cache.deleteEvent(masterEventId, { force: true });
      return;
    }

    new Notice(`Promoting ${children.length} child event(s).`);
    for (const child of children) {
      await this.cache.processEvent(
        child.id,
        e => ({
          ...e,
          recurringEventId: undefined
        }),
        { silent: true }
      );
    }

    // Now delete the original master event
    await this.cache.deleteEvent(masterEventId, { force: true, silent: true });
    this.cache.flushUpdateQueue([], []);
    new Notice('Recurring event deleted and children promoted.');
  }

  public async deleteAllRecurring(masterEventId: string): Promise<void> {
    const children = this.findRecurringChildren(masterEventId);
    new Notice(`Deleting recurring event and its ${children.length} child override(s)...`);

    for (const child of children) {
      await this.cache.deleteEvent(child.id, { force: true, silent: true });
    }

    // Finally, delete the master event itself
    await this.cache.deleteEvent(masterEventId, { force: true, silent: true });
    this.cache.flushUpdateQueue([], []);
    new Notice('Successfully deleted recurring event and all children.');
  }

  /**
   * Intercepts a delete request to see if it's a recurring master with children.
   * If so, it opens a modal to ask the user how to proceed.
   * @returns `true` if the deletion was handled (modal opened), `false` otherwise.
   */
  public async handleDelete(
    eventId: string,
    event: OFCEvent,
    options?: { force?: boolean; instanceDate?: string }
  ): Promise<boolean> {
    // Check if we are "undoing" an override. This is now the full operation.
    if (event.type === 'single' && event.recurringEventId) {
      const { calendar } = this.cache.getInfoForEditableEvent(eventId);
      const masterLocalIdentifier = event.recurringEventId;
      const globalMasterIdentifier = `${calendar.id}::${masterLocalIdentifier}`;
      const masterSessionId = await this.cache.getSessionId(globalMasterIdentifier);

      if (masterSessionId) {
        // Queue an update to the parent event to remove the skipDate.
        await this.cache.processEvent(
          masterSessionId,
          e => {
            if (e.type !== 'recurring' && e.type !== 'rrule') return e;
            const dateToUnskip = event.date;
            return {
              ...e,
              skipDates: e.skipDates.filter((d: string) => d !== dateToUnskip)
            };
          },
          { silent: true }
        );
      } else {
        console.warn(
          `Master recurring event with identifier "${globalMasterIdentifier}" not found. Deleting orphan override.`
        );
      }

      // Queue the deletion of the override event itself.
      // `force: true` is critical to prevent an infinite loop.
      await this.cache.deleteEvent(eventId, { silent: true, force: true });

      // Flush both updates to the UI atomically.
      this.cache.flushUpdateQueue([], []);

      // Return true to signify that the deletion has been fully handled.
      return true;
    }

    const isRecurringMaster = event.type === 'recurring' || event.type === 'rrule';
    if (!isRecurringMaster) {
      return false;
    }

    const { calendar } = this.cache.getInfoForEditableEvent(eventId);
    const isGoogle = calendar instanceof GoogleCalendar;

    const children = this.findRecurringChildren(eventId);

    if (children.length > 0 || options?.instanceDate) {
      new DeleteRecurringModal(
        this.cache.plugin.app,
        () => this.promoteRecurringChildren(eventId),
        () => this.deleteAllRecurring(eventId),
        options?.instanceDate
          ? async () => {
              // This GENERIC logic now correctly triggers the "modifyEvent" flow.
              const updated = await this.cache.processEvent(eventId, e => {
                if (e.type !== 'recurring' && e.type !== 'rrule') return e;
                const skipDates = e.skipDates?.includes(options.instanceDate!)
                  ? e.skipDates
                  : [...(e.skipDates || []), options.instanceDate!];
                return { ...e, skipDates };
              });

              if (updated) {
                // Forcing a full calendar source re-render is necessary for recurring
                // events on "dirty" calendars, as a simple event replacement in the
                // view won't trigger a re-computation of the recurrence.
                const details = this.cache.store.getEventDetails(eventId);
                if (details) {
                  const calendarSource = this.cache
                    .getAllEvents()
                    .find(s => s.id === details.calendarId);
                  if (calendarSource) {
                    this.cache.updateCalendar(calendarSource);
                  }
                }
              }
            }
          : undefined,
        options?.instanceDate,
        isGoogle
      ).open();
      return true; // Deletion is handled by the modal, stop further processing.
    }

    return false; // No children, proceed with normal deletion.
  }

  /**
   * Private helper to perform the "skip and override" logic for recurring events.
   * @param masterEventId The session ID of the master recurring event.
   * @param instanceDateToSkip The date of the original instance to add to the parent's skipDates.
   * @param overrideEventData The complete OFCEvent object for the new single-instance override.
   */
  private async _createRecurringOverride(
    masterEventId: string,
    instanceDateToSkip: string,
    overrideEventData: OFCEvent
  ): Promise<void> {
    const { calendar, event: masterEvent } = this.cache.getInfoForEditableEvent(masterEventId);

    const masterLocalIdentifier = calendar.getLocalIdentifier(masterEvent);
    if (!masterLocalIdentifier) {
      throw new Error(
        `Cannot create an override for a recurring event that has no persistent local identifier.`
      );
    }

    // Destructure the master event to inherit common properties (like title, category, etc.)
    // while explicitly excluding properties that ONLY apply to recurring definitions.
    const {
      // recurring type props
      daysOfWeek,
      startRecur,
      endRecur,
      // rrule type props
      rrule,
      startDate,
      // props for both recurring types
      skipDates,
      // The rest of the properties will be inherited.
      ...parentPropsToInherit
    } = masterEvent as any; // Cast to `any` to easily destructure props from a union type.

    const finalOverrideEvent: OFCEvent = {
      ...parentPropsToInherit,
      ...overrideEventData,
      recurringEventId: masterLocalIdentifier
    };

    if (
      (masterEvent.type === 'recurring' || masterEvent.type === 'rrule') &&
      masterEvent.isTask &&
      finalOverrideEvent.type === 'single' &&
      finalOverrideEvent.completed === undefined
    ) {
      finalOverrideEvent.completed = false;
    }

    // Perform all data operations silently. The caller is responsible for flushing the queue.
    await this.cache.addEvent(calendar.id, finalOverrideEvent, { silent: true });

    // We are now calling updateEventWithId directly with the silent option.
    // This bypasses the isDirty check inside processEvent/updateEventWithId and ensures
    // the change to the master event is added to the queue.
    const masterEventToUpdate = this.cache.getEventById(masterEventId);
    if (!masterEventToUpdate) {
      throw new Error('Could not find master event to update.');
    }
    if (masterEventToUpdate.type !== 'recurring' && masterEventToUpdate.type !== 'rrule') {
      return; // Should not happen, but good to be safe.
    }

    const newMasterEvent: OFCEvent = {
      ...masterEventToUpdate,
      skipDates: masterEventToUpdate.skipDates.includes(instanceDateToSkip)
        ? masterEventToUpdate.skipDates
        : [...masterEventToUpdate.skipDates, instanceDateToSkip]
    };

    await this.cache.updateEventWithId(masterEventId, newMasterEvent, { silent: true });
  }

  /**
   * Handles the modification of a single instance of a recurring event.
   * This is triggered when a user drags or resizes an instance in the calendar view.
   * It creates an override event and adds an exception to the parent.
   * @param masterEventId The session ID of the master recurring event.
   * @param instanceDate The original date of the instance that is being modified.
   * @param newEventData The new event data for the single-instance override.
   */
  public async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    if (newEventData.type !== 'single') {
      throw new Error('Cannot create a recurring override from a non-single event.');
    }

    // Check calendar type and delegate
    const { calendar, event: masterEvent } = this.cache.getInfoForEditableEvent(masterEventId);
    if (calendar instanceof GoogleCalendar) {
      const newExceptionEvent = await calendar.createInstanceOverride(
        masterEvent,
        instanceDate,
        newEventData
      );
      // Add the new exception to the cache silently. The caller is responsible for the UI update.
      await this.cache.addEvent(calendar.id, newExceptionEvent, { silent: true });

      // Now, update the in-memory master event to hide the original instance date.
      await this.cache.processEvent(
        masterEventId,
        e => {
          if (e.type !== 'recurring' && e.type !== 'rrule') return e;
          const skipDates = e.skipDates.includes(instanceDate)
            ? e.skipDates
            : [...e.skipDates, instanceDate];
          return { ...e, skipDates };
        },
        { silent: true }
      );

      return;
    }

    await this._createRecurringOverride(masterEventId, instanceDate, newEventData);

    this.cache.flushUpdateQueue([], []);
  }

  /**
   * Handles the logic for marking an instance of a recurring event as complete or not.
   * This uses the "exception and override" strategy.
   * @param eventId The ID of the event instance clicked in the UI. This could be the parent recurring event or a single-event override.
   * @param instanceDate The specific date of the instance to modify (e.g., '2023-11-20').
   * @param isDone The desired completion state.
   */
  public async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    // Get the event that was actually clicked.
    const { event: clickedEvent } = this.cache.getInfoForEditableEvent(eventId);

    if (isDone) {
      // === USE CASE: COMPLETING A TASK ===
      if (clickedEvent.type === 'single') {
        // The user clicked the checkbox on an existing, incomplete override.
        // We just need to update its status to complete.
        await this.cache.updateEventWithId(eventId, toggleTask(clickedEvent, true));
      } else {
        // The user clicked the checkbox on a master recurring instance.
        // We need to create a new, completed override.
        const overrideEvent: OFCEvent = {
          ...clickedEvent,
          type: 'single',
          date: instanceDate,
          endDate: null
        };

        await this._createRecurringOverride(eventId, instanceDate, toggleTask(overrideEvent, true));
      }
    } else {
      // === USE CASE: UN-COMPLETING A TASK ===
      // This action is only possible on an existing override.
      // The logic is to simply delete that override. Our improved `deleteEvent`
      // method will handle removing the date from the parent's skipDates array
      // and updating the view.
      new Notice('Reverting control to Main Recurring event sequence.');
      await this.cache.deleteEvent(eventId);
    }
  }

  public async updateRecurringChildren(
    calendarId: string,
    oldParentIdentifier: string,
    newParentIdentifier: string,
    newParentEvent: OFCEvent // Add new parameter
  ): Promise<void> {
    const childrenToUpdate = this.cache.store
      .getAllEvents()
      .filter(e => e.calendarId === calendarId && e.event.recurringEventId === oldParentIdentifier);

    if (childrenToUpdate.length === 0) {
      return;
    }

    new Notice(`Updating ${childrenToUpdate.length} child event(s) to match new parent title.`);

    for (const childStoredEvent of childrenToUpdate) {
      const {
        calendar: childCalendar,
        location: childLocation,
        event: childEvent
      } = this.cache.getInfoForEditableEvent(childStoredEvent.id);

      const updatedChildEvent: OFCEvent = {
        ...childEvent,
        title: newParentEvent.title, // Inherit new title
        category: newParentEvent.category, // Inherit new category
        recurringEventId: newParentIdentifier
      };

      // We pass the child's own data as the "old event"
      await childCalendar.modifyEvent(
        childEvent,
        updatedChildEvent,
        childLocation,
        newChildLocation => {
          this.cache.store.delete(childStoredEvent.id);
          this.cache.store.add({
            calendar: childCalendar,
            location: newChildLocation,
            id: childStoredEvent.id,
            event: updatedChildEvent
          });
        }
      );

      this.cache.isBulkUpdating = true;
      this.cache.updateQueue.toRemove.add(childStoredEvent.id);
      this.cache.updateQueue.toAdd.set(childStoredEvent.id, {
        id: childStoredEvent.id,
        calendarId: childCalendar.id,
        event: updatedChildEvent
      });
    }
  }

  /**
   * Intercepts an update request to see if a recurring master's identifier has changed.
   * If so, it updates all child overrides to point to the new parent identifier.
   * @returns `true` if the update was handled, `false` otherwise.
   */
  public async handleUpdate(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    calendarId: string
  ): Promise<boolean> {
    if (oldEvent.type !== 'recurring' && oldEvent.type !== 'rrule') {
      return false; // Not a recurring master, do nothing.
    }

    const calendar = this.cache.calendars.get(calendarId);
    if (!calendar) {
      return false;
    }

    const oldLocalIdentifier = calendar.getLocalIdentifier(oldEvent);
    const newLocalIdentifier = calendar.getLocalIdentifier(newEvent);

    if (oldLocalIdentifier && newLocalIdentifier && oldLocalIdentifier !== newLocalIdentifier) {
      await this.updateRecurringChildren(
        calendarId,
        oldLocalIdentifier,
        newLocalIdentifier,
        newEvent
      );
    }

    return true; // Indicate that we've handled any necessary recurring logic.
  }
}
