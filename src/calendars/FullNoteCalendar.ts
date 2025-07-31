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

import { TFile, TFolder, Notice, normalizePath } from 'obsidian';
import { rrulestr } from 'rrule';
import { EventPathLocation } from '../core/EventStore';
import { ObsidianInterface } from '../ObsidianAdapter';
import { OFCEvent, EventLocation, validateEvent } from '../types';
import { EditableCalendar, EditableEventResponse, CategoryProvider } from './EditableCalendar';
import { FullCalendarSettings } from '../types/settings';
import { CalendarInfo } from '../types';
import { convertEvent } from '../core/Timezone';
import { newFrontmatter, modifyFrontmatterString, replaceFrontmatter } from './frontmatter';
import { constructTitle, parseTitle } from '../core/categoryParser';
import FullCalendarPlugin from '../main';
import { DateTime } from 'luxon';

function sanitizeTitleForFilename(title: string): string {
  // Replace characters that are invalid in filenames on most OSes.
  // We'll replace them with a space.
  return title
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const basenameFromEvent = (event: OFCEvent, settings: FullCalendarSettings): string => {
  // Use the full, constructed title for the filename IF the feature is enabled.
  const fullTitle = settings.enableCategoryColoring
    ? constructTitle(event.category, event.title)
    : event.title;
  const sanitizedTitle = sanitizeTitleForFilename(fullTitle);
  switch (event.type) {
    case undefined:
    case 'single':
      return `${event.date} ${sanitizedTitle}`;
    case 'recurring': {
      if (event.daysOfWeek && event.daysOfWeek.length > 0) {
        return `(Every ${event.daysOfWeek.join(',')}) ${sanitizedTitle}`;
      }
      if (event.month && event.dayOfMonth) {
        // Luxon months are 1-based, matching our schema.
        const monthName = DateTime.fromObject({ month: event.month }).toFormat('MMM');
        return `(Every year on ${monthName} ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      if (event.dayOfMonth) {
        return `(Every month on the ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      // Fallback for an invalid recurring event, though schema should prevent this.
      return `(Recurring) ${sanitizedTitle}`;
    }
    case 'rrule':
      return `(${rrulestr(event.rrule).toText()}) ${sanitizedTitle}`;
  }
};

const filenameForEvent = (event: OFCEvent, settings: FullCalendarSettings) =>
  `${basenameFromEvent(event, settings)}.md`;

export default class FullNoteCalendar extends EditableCalendar {
  app: ObsidianInterface;
  plugin: FullCalendarPlugin;
  private _directory: string;

  constructor(
    app: ObsidianInterface,
    plugin: FullCalendarPlugin,
    info: CalendarInfo,
    settings: FullCalendarSettings
  ) {
    super(info, settings);
    this.app = app;
    this.plugin = plugin;
    this._directory = (info as Extract<CalendarInfo, { type: 'local' }>).directory;
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
    let frontmatter = metadata?.frontmatter;
    if (!frontmatter) {
      return [];
    }

    // MODIFICATION: Conditional Parsing for Category Coloring
    let eventData: any = { ...frontmatter };
    const rawTitle = frontmatter.title || file.basename;

    if (this.settings.enableCategoryColoring) {
      const { category, title } = parseTitle(rawTitle);
      eventData.title = title;
      eventData.category = category;
    } else {
      eventData.title = rawTitle;
    }

    let event = validateEvent(eventData);

    if (!event) {
      return [];
    }
    // END MODIFICATION

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

    // If title was not in frontmatter, it has already been set from the filename.
    // No extra step needed.

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
    const path = normalizePath(`${this.directory}/${filenameForEvent(event, this.settings)}`);
    if (this.app.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }

    // The incoming event is in the display timezone. It needs to be converted
    // to its designated source timezone before being written to disk.
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let eventToWrite = { ...event };

    // If a timezone is not present on the event, it's a new event and should be assigned the display timezone.
    if (!eventToWrite.timezone) {
      eventToWrite.timezone = displayTimezone;
    }

    // If the event's designated timezone is different from the display timezone, convert its times.
    if (eventToWrite.timezone !== displayTimezone) {
      eventToWrite = convertEvent(event, displayTimezone, eventToWrite.timezone);
    }

    const titleToWrite = this.settings.enableCategoryColoring
      ? constructTitle(eventToWrite.category, eventToWrite.title)
      : eventToWrite.title;

    const eventWithFullTitle = {
      ...eventToWrite,
      title: titleToWrite
    };
    delete (eventWithFullTitle as Partial<OFCEvent>).category;

    const newPage = replaceFrontmatter('', newFrontmatter(eventWithFullTitle));
    const file = await this.app.create(path, newPage);
    return { file, lineNumber: undefined };
  }

  getNewLocation(location: EventPathLocation, event: OFCEvent): EventLocation {
    // ... (This logic needs to pass settings to filenameForEvent)
    const { path, lineNumber } = location;
    if (lineNumber !== undefined) {
      throw new Error('Note calendar cannot handle inline events.');
    }
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} either doesn't exist or is a folder.`);
    }

    const parentPath = file.parent?.path ?? '';
    const updatedPath = normalizePath(`${parentPath}/${filenameForEvent(event, this.settings)}`);
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

    // Timezone logic remains the same...
    const fileMetadata = this.app.getMetadata(file);
    const fileEvent = validateEvent(fileMetadata?.frontmatter);
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fileTimezone = fileEvent?.timezone || displayTimezone;
    let eventToWrite = event;
    if (fileTimezone !== displayTimezone) {
      eventToWrite = convertEvent(event, displayTimezone, fileTimezone);
    }
    eventToWrite.timezone = fileTimezone;

    // MODIFICATION: Conditional Title Construction
    const titleToWrite = this.settings.enableCategoryColoring
      ? constructTitle(eventToWrite.category, eventToWrite.title)
      : eventToWrite.title;

    const eventWithFullTitle = {
      ...eventToWrite,
      title: titleToWrite
    };
    delete (eventWithFullTitle as Partial<OFCEvent>).category;

    const newLocation = this.getNewLocation(location, eventToWrite);

    updateCacheWithLocation(newLocation);

    if (file.path !== newLocation.file.path) {
      await this.app.rename(file, newLocation.file.path);
    }
    await this.app.rewrite(file, page => modifyFrontmatterString(page, eventWithFullTitle));

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

  private async getAllFiles(): Promise<TFile[]> {
    const eventFolder = this.app.getAbstractFileByPath(this.directory);
    if (!(eventFolder instanceof TFolder)) return [];

    const files: TFile[] = [];
    const walk = async (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile) {
          files.push(child);
        } else if (child instanceof TFolder) {
          await walk(child);
        }
      }
    };
    await walk(eventFolder);
    return files;
  }

  public getFolderCategoryNames(): string[] {
    const dir = this.directory.split('/').pop();
    return dir ? [dir] : [];
  }

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    const allFiles = await this.getAllFiles();
    const processor = async (file: TFile) => {
      await this.plugin.app.fileManager.processFrontMatter(file, frontmatter => {
        const event = validateEvent(frontmatter);
        if (!event || !event.title) return;

        const { category: existingCategory, title: cleanTitle } = parseTitle(event.title);

        if (existingCategory && !force) {
          return; // Smart mode: skip if category exists.
        }

        const newCategory = getCategory(event, { file, lineNumber: undefined });
        if (!newCategory) {
          return;
        }

        // CORRECTED LOGIC:
        // If forcing, we use the FULL existing title (e.g., "OldCat - Event").
        // If not forcing (smart mode), we use the clean title.
        const titleToCategorize = force ? event.title : cleanTitle;
        frontmatter.title = constructTitle(newCategory, titleToCategorize);
      });
    };

    await this.plugin.nonBlockingProcess(
      allFiles,
      processor,
      `Categorizing notes in ${this.directory}`
    );
  }

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    // Create a new set to avoid modifying the original set passed to other calendars.
    const categoriesToRemove = new Set(knownCategories);

    // Add this calendar's own folder-based categories to the set.
    for (const name of this.getFolderCategoryNames()) {
      categoriesToRemove.add(name);
    }

    const allFiles = await this.getAllFiles();
    const processor = async (file: TFile) => {
      await this.plugin.app.fileManager.processFrontMatter(file, frontmatter => {
        if (!frontmatter.title) return;

        const { category, title: cleanTitle } = parseTitle(frontmatter.title);
        // Use the expanded, local set for the check.
        if (category && categoriesToRemove.has(category)) {
          frontmatter.title = cleanTitle;
        }
      });
    };
    await this.plugin.nonBlockingProcess(
      allFiles,
      processor,
      `De-categorizing notes in ${this.directory}`
    );
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    return basenameFromEvent(event, this.settings);
  }
}
