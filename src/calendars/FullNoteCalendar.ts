/**
 * @file FullNoteCalendar.ts
 * @brief Implements a calendar source where each event is a separate note.
 *
 * @description
 * This file defines the `FullNoteCalendar` class. In this model, each event
 * corresponds to a dedicated Markdown file within a specified directory.
 * All event data is stored in the note's YAML frontmatter. This class
 * handles the creation, parsing, and modification of these event notes.
 *
 * @see EditableCalendar.ts
 *
 * @license See LICENSE.md
 */

import { TFile, TFolder, Notice } from 'obsidian';
import { rrulestr } from 'rrule';
import { EventPathLocation } from '../core/EventStore';
import { ObsidianInterface } from '../ObsidianAdapter';
import { OFCEvent, EventLocation, validateEvent } from '../types';
import { EditableCalendar, EditableEventResponse } from './EditableCalendar';
import { FullCalendarSettings } from '../ui/settings';
import { convertEvent } from '../core/Timezone';
import { newFrontmatter, modifyFrontmatterString, replaceFrontmatter } from './frontmatter';

const basenameFromEvent = (event: OFCEvent): string => {
  switch (event.type) {
    case undefined:
    case 'single':
      return `${event.date} ${event.title}`;
    case 'recurring':
      return `(Every ${event.daysOfWeek.join(',')}) ${event.title}`;
    case 'rrule':
      return `(${rrulestr(event.rrule).toText()}) ${event.title}`;
  }
};

const filenameForEvent = (event: OFCEvent) => `${basenameFromEvent(event)}.md`;

export default class FullNoteCalendar extends EditableCalendar {
  app: ObsidianInterface;
  private _directory: string;

  constructor(
    app: ObsidianInterface,
    color: string,
    directory: string,
    settings: FullCalendarSettings
  ) {
    super(color, settings);
    this.app = app;
    this._directory = directory;
  }
  get directory(): string {
    return this._directory;
  }

  get type(): 'local' {
    return 'local';
  }

  get identifier(): string {
    return this.directory;
  }

  get name(): string {
    return this.directory;
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const metadata = this.app.getMetadata(file);
    let event = validateEvent(metadata?.frontmatter);
    if (!event) {
      return [];
    }

    let eventTimezone = event.timezone;
    const displayTimezone = this.settings.displayTimezone;

    // Auto-upgrade legacy notes that don't have a timezone.
    if (!eventTimezone && displayTimezone) {
      eventTimezone = displayTimezone;
      event.timezone = displayTimezone;
      // Write the new timezone back to the file.
      await this.app.rewrite(file, page =>
        modifyFrontmatterString(page, { timezone: displayTimezone })
      );
    }

    if (!event.title) {
      event.title = file.basename;
    }

    // If the event has a timezone and it's different from the display timezone, convert it.
    if (eventTimezone && displayTimezone && eventTimezone !== displayTimezone) {
      event = convertEvent(event, eventTimezone, displayTimezone);
    }

    return [[event, { file, lineNumber: undefined }]];
  }

  private async getEventsInFolderRecursive(folder: TFolder): Promise<EditableEventResponse[]> {
    const events = await Promise.all(
      folder.children.map(async file => {
        if (file instanceof TFile) {
          return await this.getEventsInFile(file);
        } else if (file instanceof TFolder) {
          return await this.getEventsInFolderRecursive(file);
        } else {
          return [];
        }
      })
    );
    return events.flat();
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    const eventFolder = this.app.getAbstractFileByPath(this.directory);
    if (!eventFolder) {
      throw new Error(`Cannot get folder ${this.directory}`);
    }
    if (!(eventFolder instanceof TFolder)) {
      throw new Error(`${eventFolder} is not a directory.`);
    }
    const events: EditableEventResponse[] = [];
    for (const file of eventFolder.children) {
      if (file instanceof TFile) {
        const results = await this.getEventsInFile(file);
        events.push(...results);
      }
    }
    return events;
  }

  async createEvent(event: OFCEvent): Promise<EventLocation> {
    const path = `${this.directory}/${filenameForEvent(event)}`;
    if (this.app.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }

    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Notify the user if they are creating an event in a timezone different from their system's current zone.
    if (displayTimezone !== systemTimezone) {
      new Notice(
        `Event created in ${displayTimezone}.\nYour system is currently in ${systemTimezone}.`
      );
    }

    // Add the current display timezone to the event before creating it.
    const eventToCreate = {
      ...event,
      timezone: displayTimezone
    };

    const newPage = replaceFrontmatter('', newFrontmatter(eventToCreate));
    const file = await this.app.create(path, newPage);
    return { file, lineNumber: undefined };
  }

  getNewLocation(location: EventPathLocation, event: OFCEvent): EventLocation {
    const { path, lineNumber } = location;
    if (lineNumber !== undefined) {
      throw new Error('Note calendar cannot handle inline events.');
    }
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} either doesn't exist or is a folder.`);
    }

    const parentPath = file.parent?.path ?? ''; // If file.parent is null, parentPath becomes an empty string.
    const updatedPath = `${parentPath}/${filenameForEvent(event)}`;
    return { file: { path: updatedPath }, lineNumber: undefined };
  }

  async modifyEvent(
    location: EventPathLocation,
    event: OFCEvent,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void> {
    const { path } = location;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} either doesn't exist or is a folder.`);
    }

    // The incoming `event` object has its times in the `displayTimezone`.
    // We need to convert it back to the file's native timezone before writing.
    const fileMetadata = this.app.getMetadata(file);
    const fileEvent = validateEvent(fileMetadata?.frontmatter);

    // Determine the file's native timezone. Fallback to displayTimezone if not present (for safety).
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const displayTimezone = this.settings.displayTimezone || systemTimezone;
    const fileTimezone = fileEvent?.timezone || displayTimezone;

    let eventToWrite = event;
    // Only perform conversion if the file's zone and the display zone are different.
    if (fileTimezone !== displayTimezone) {
      eventToWrite = convertEvent(event, displayTimezone, fileTimezone);
    }

    // Ensure the timezone property of the event being written matches the file's native timezone.
    eventToWrite.timezone = fileTimezone;

    // The rest of the logic determines if the file needs to be renamed.
    const newLocation = this.getNewLocation(location, eventToWrite);

    updateCacheWithLocation(newLocation);

    if (file.path !== newLocation.file.path) {
      await this.app.rename(file, newLocation.file.path);
    }
    await this.app.rewrite(file, page => modifyFrontmatterString(page, eventToWrite));

    return;
  }

  async move(
    fromLocation: EventPathLocation,
    toCalendar: EditableCalendar,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void> {
    const { path, lineNumber } = fromLocation;
    if (lineNumber !== undefined) {
      throw new Error('Note calendar cannot handle inline events.');
    }
    if (!(toCalendar instanceof FullNoteCalendar)) {
      throw new Error(
        `Event cannot be moved to a note calendar from a calendar of type ${toCalendar.type}.`
      );
    }
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    const destDir = toCalendar.directory;
    const newPath = `${destDir}/${file.name}`;
    updateCacheWithLocation({
      file: { path: newPath },
      lineNumber: undefined
    });
    await this.app.rename(file, newPath);
  }

  deleteEvent({ path, lineNumber }: EventPathLocation): Promise<void> {
    if (lineNumber !== undefined) {
      throw new Error('Note calendar cannot handle inline events.');
    }
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    return this.app.delete(file);
  }
}
