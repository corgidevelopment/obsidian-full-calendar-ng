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
import { toggleTask } from './tasks';
import EventCache from './EventCache';
import { StoredEvent } from './EventStore';
import { OFCEvent } from '../types';
import { DeleteRecurringModal } from '../ui/modals/DeleteRecurringModal';

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
  public handleDelete(eventId: string, event: OFCEvent, options?: { force?: boolean }): boolean {
    if (options?.force) {
      return false; // If forced, don't show the modal. Let the cache handle it.
    }

    const isRecurringMaster = event.type === 'recurring' || event.type === 'rrule';
    if (!isRecurringMaster) {
      return false;
    }

    const children = this.findRecurringChildren(eventId);
    if (children.length > 0) {
      new DeleteRecurringModal(
        this.cache.plugin.app,
        () => this.promoteRecurringChildren(eventId),
        () => this.deleteAllRecurring(eventId)
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
    await this.cache.processEvent(
      masterEventId,
      e => {
        if (e.type !== 'recurring' && e.type !== 'rrule') return e;
        const skipDates = e.skipDates.includes(instanceDateToSkip)
          ? e.skipDates
          : [...e.skipDates, instanceDateToSkip];
        return { ...e, skipDates };
      },
      { silent: true }
    );
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
    await this._createRecurringOverride(masterEventId, instanceDate, newEventData);
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

      await childCalendar.modifyEvent(childLocation, updatedChildEvent, newChildLocation => {
        this.cache.store.delete(childStoredEvent.id);
        this.cache.store.add({
          calendar: childCalendar,
          location: newChildLocation,
          id: childStoredEvent.id,
          event: updatedChildEvent
        });
      });

      this.cache.isBulkUpdating = true;
      this.cache.updateQueue.toRemove.add(childStoredEvent.id);
      this.cache.updateQueue.toAdd.set(childStoredEvent.id, {
        id: childStoredEvent.id,
        calendarId: childCalendar.id,
        event: updatedChildEvent
      });
    }
  }
}
