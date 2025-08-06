/**
 * @file EditableCalendar.ts
 * @brief Defines the abstract base class for all user-editable calendars.
 *
 * @description
 * This file contains the `EditableCalendar` abstract class, which extends
 * `Calendar`. It establishes the contract for calendars whose event data is
 * stored within the Obsidian Vault and can be created, updated, and deleted
 * by the user. This class separates read-write local calendars from
 * read-only remote calendars.
 *
 * @see FullNoteCalendar.ts
 * @see DailyNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { TFile } from 'obsidian';

import { Calendar } from './Calendar';
import { EventPathLocation } from '../core/EventStore';
import { FullCalendarSettings } from '../types/settings';
import { EventLocation, OFCEvent, CalendarInfo } from '../types';

export type EditableEventResponse = [OFCEvent, EventLocation];

/**
 * A function that determines the category for a given event, used in bulk updates.
 * This gives us flexibility to get the category from a folder name, a default string, etc.
 */
export type CategoryProvider = (event: OFCEvent, location: EventLocation) => string | undefined;

/**
 * Abstract class representing the interface for an Calendar whose source-of-truth
 * is the Obsidian Vault.
 *
 * EditableCalendar instances handle all file I/O, typically through an ObsidianInterface.
 * The EventCache will call methods on an EditableCalendar to make updates to the Vault from user action, as well
 * as to parse events from files when the files are updated outside of Full Calendar.
 */
export abstract class EditableCalendar extends Calendar {
  constructor(info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
  }

  /**
   * Directory where events for this calendar are stored.
   */
  abstract get directory(): string;

  /**
   * Returns true if this calendar sources events from the given path.
   */
  containsPath(path: string): boolean {
    return path.startsWith(this.directory);
  }

  /**
   * Get all events in a given file.
   * @param file File to parse
   */
  abstract getEventsInFile(file: TFile): Promise<EditableEventResponse[]>;

  /**
   * Create an event in this calendar.
   * @param event Event to create.
   * @returns A tuple containing the authoritative event data from the source and its location.
   */
  abstract createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]>;

  /**
   * Check if creating an event would result in a duplicate.
   * @param event Event to check for duplicates.
   * @returns True if the event would be a duplicate, false otherwise.
   */
  abstract checkForDuplicate(event: OFCEvent): Promise<boolean>;

  /**
   * Delete an event from the calendar.
   * @param event The event object being deleted.
   * @param location Location of event to delete. Can be null for remote events.
   */
  abstract deleteEvent(event: OFCEvent, location: EventPathLocation | null): Promise<void>;

  /**
   * Modify an event on disk or via an API.
   *
   * @param oldEvent - The original event data from the cache.
   * @param newEvent - The new event details to be saved.
   * @param location - The current location of the event. Can be null for remote events.
   * @param updateCacheWithLocation - A critical callback that MUST be called by the
   *        implementation to update the in-memory cache.
   * @returns A promise that resolves with an object indicating if a file-based update (`isDirty: true`) is expected to follow.
   */
  abstract modifyEvent(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    location: EventPathLocation | null,
    updateCacheWithLocation: (loc: EventLocation | null) => void
  ): Promise<{ isDirty: boolean }>;

  /**
   * Optional: Returns a list of category names that are derived from this
   * calendar's configuration, such as its folder path.
   * This is used during de-categorization to identify all possible categories to remove.
   */
  public getFolderCategoryNames(): string[] {
    return []; // Default implementation returns no names.
  }

  /**
   * Performs a bulk operation to add categories to events in this calendar.
   * @param getCategory A function that returns the desired category for a given event.
   * @param force If true, overwrites existing categories. If false, skips events that already have a category.
   */
  abstract bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void>;

  /**
   * Performs a bulk operation to remove all known categories from event titles in this calendar.
   * @param knownCategories A set of all category names to look for and remove.
   */
  abstract bulkRemoveCategories(knownCategories: Set<string>): Promise<void>;
}
