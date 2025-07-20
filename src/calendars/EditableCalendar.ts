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
import { EventPathLocation } from '../core/EventStore';
import { EventLocation, OFCEvent } from '../types';
import { FullCalendarSettings } from '../ui/settings';
import { Calendar } from './Calendar';

export type EditableEventResponse = [OFCEvent, EventLocation];

/**
 * Abstract class representing the interface for an Calendar whose source-of-truth
 * is the Obsidian Vault.
 *
 * EditableCalendar instances handle all file I/O, typically through an ObsidianInterface.
 * The EventCache will call methods on an EditableCalendar to make updates to the Vault from user action, as well
 * as to parse events from files when the files are updated outside of Full Calendar.
 */
export abstract class EditableCalendar extends Calendar {
  constructor(color: string, settings: FullCalendarSettings) {
    super(color, settings);
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
   */
  abstract createEvent(event: OFCEvent): Promise<EventLocation>;

  /**
   * Delete an event from the calendar.
   * @param location Location of event to delete.
   */
  abstract deleteEvent(location: EventPathLocation): Promise<void>;

  /**
   * Modify an event on disk.
   * Implementations of this method are responsible for all file I/O to update
   * an event. This includes modifying frontmatter, changing file content, or
   * even renaming/moving the file if the event's date or title changes.
   *
   * @param location - The current location of the event on disk.
   * @param newEvent - The new event details to be saved.
   * @param updateCacheWithLocation - A critical callback that MUST be called by the
   *        implementation *before* any file modifications are written to disk.
   *        This prevents race conditions by ensuring the in-memory cache is
   *        updated with the new potential location of the event. If the file write
   *        fails, the cache is still consistent with what's on disk.
   */
  abstract modifyEvent(
    location: EventPathLocation,
    newEvent: OFCEvent,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void>;
}
