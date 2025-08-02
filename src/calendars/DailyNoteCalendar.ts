/**
 * @file DailyNoteCalendar.ts
 * @brief Implements a calendar source that parses events from daily notes.
 *
 * @description
 * This file defines the `DailyNoteCalendar` class, which manages events
 * stored as list items within Obsidian's daily notes. It is responsible for
 * parsing tasks and events from a specific heading, using inline dataview-like
 * attributes (`[key:: value]`) for event properties. It also handles the
 * serialization and writing of events back into the correct daily note file.
 *
 * @see EditableCalendar.ts
 *
 * @license See LICENSE.md
 */

import moment from 'moment';
import { TFile } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import {
  getAllInlineEventsFromFile,
  getInlineEventFromLine,
  getListsUnderHeading,
  modifyListItem,
  addToHeading,
  listRegex,
  fieldRegex
} from './parsing/dailynote/parser';
import FullCalendarPlugin from '../main';
import { EventResponse } from './Calendar';
import { convertEvent } from './utils/Timezone';
import { EventPathLocation } from '../core/EventStore';
import { ObsidianInterface } from '../ObsidianAdapter';
import { FullCalendarSettings } from '../types/settings';
import { OFCEvent, EventLocation, CalendarInfo } from '../types';
import { constructTitle, parseTitle, enhanceEvent } from './parsing/categoryParser';
import { EditableCalendar, EditableEventResponse, CategoryProvider } from './EditableCalendar';

export default class DailyNoteCalendar extends EditableCalendar {
  app: ObsidianInterface;
  plugin: FullCalendarPlugin;
  heading: string;

  constructor(
    app: ObsidianInterface,
    plugin: FullCalendarPlugin,
    info: CalendarInfo,
    settings: FullCalendarSettings
  ) {
    super(info, settings);
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
    this.heading = (info as Extract<CalendarInfo, { type: 'dailynote' }>).heading;
  }

  get type(): CalendarInfo['type'] {
    return 'dailynote';
  }
  get identifier(): string {
    return this.heading;
  }
  get name(): string {
    return `Daily note under "${this.heading}"`;
  }
  get directory(): string {
    const { folder } = getDailyNoteSettings();
    if (!folder) throw new Error('Could not load daily note settings.');
    return folder;
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const date = getDateFromFile(file as any, 'day')?.format('YYYY-MM-DD');
    const cache = this.app.getMetadata(file);
    if (!cache) return [];
    const listItems = getListsUnderHeading(this.heading, cache);
    const inlineEvents = await this.app.process(file, text =>
      getAllInlineEventsFromFile(text, listItems, { date })
    );
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return inlineEvents.map(({ event: rawEvent, lineNumber }) => {
      const event = enhanceEvent(rawEvent, this.settings);
      let sourceTimezone: string;

      // If mode is 'local', the event's source is always the current system time.
      if (this.settings.dailyNotesTimezone === 'local') {
        sourceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      // In 'strict' mode, the source is what's written in the note, with system as a fallback.
      else {
        sourceTimezone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      let translatedEvent = event;
      if (sourceTimezone !== displayTimezone) {
        translatedEvent = convertEvent(event, sourceTimezone, displayTimezone);
      }
      return [translatedEvent, { file, lineNumber }];
    });
  }

  async modifyEvent(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    location: EventPathLocation | null,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void> {
    if (!location) {
      throw new Error('DailyNoteCalendar.modifyEvent requires a file location.');
    }
    if (newEvent.type !== 'single' && newEvent.type !== undefined)
      throw new Error('Cannot modify a recurring event in a daily note.');
    if (newEvent.endDate) throw new Error('Multi-day events are not supported in daily notes.');
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let eventToWrite = newEvent;
    let targetTimezone: string;
    if (this.settings.dailyNotesTimezone === 'local') {
      targetTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } else {
      const { file, lineNumber } = this.getConcreteLocation(location);
      const contents = await this.app.read(file);
      const line = contents.split('\n')[lineNumber];
      const sourceEvent = getInlineEventFromLine(line, {}); // Updated call
      targetTimezone = sourceEvent?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    if (displayTimezone !== targetTimezone && newEvent.type === 'single') {
      eventToWrite = convertEvent(newEvent, displayTimezone, targetTimezone) as typeof newEvent;
    }
    // Always stamp the event with its target timezone before writing.
    eventToWrite.timezone = targetTimezone;

    // The rest of the file modification logic remains the same...
    const { file, lineNumber } = this.getConcreteLocation(location);
    const oldDate = getDateFromFile(file as any, 'day')?.format('YYYY-MM-DD');
    if (!oldDate) throw new Error(`Could not get date from file at path ${file.path}`);

    if (eventToWrite.date !== oldDate) {
      // ... Logic to move event to a new file
      const m = moment(eventToWrite.date);
      let newFile = getDailyNote(m, getAllDailyNotes()) as TFile;
      if (!newFile) newFile = (await createDailyNote(m)) as TFile;
      await this.app.read(newFile);
      const metadata = this.app.getMetadata(newFile);
      if (!metadata) throw new Error('No metadata for file ' + newFile.path);
      const headingInfo = metadata.headings?.find(h => h.heading == this.heading);
      if (!headingInfo)
        throw new Error(`Could not find heading ${this.heading} in daily note ${newFile.path}.`);
      await this.app.rewrite(file, async oldFileContents => {
        let lines = oldFileContents.split('\n');
        lines.splice(lineNumber, 1);
        await this.app.rewrite(newFile, newFileContents => {
          const { page, lineNumber: newLn } = addToHeading(
            newFileContents,
            { heading: headingInfo, item: eventToWrite, headingText: this.heading },
            this.settings
          );
          updateCacheWithLocation({ file: newFile, lineNumber: newLn });
          return page;
        });
        return lines.join('\n');
      });
    } else {
      updateCacheWithLocation({ file, lineNumber });
      await this.app.rewrite(file, contents => {
        const lines = contents.split('\n');
        const newLine = modifyListItem(lines[lineNumber], eventToWrite, this.settings);
        if (!newLine) throw new Error('Did not successfully update line.');
        lines[lineNumber] = newLine;
        return lines.join('\n');
      });
    }
  }

  // RESTORED getEvents
  async getEvents(): Promise<EventResponse[]> {
    const notes = getAllDailyNotes();
    const files = Object.values(notes) as TFile[];
    return (await Promise.all(files.map(f => this.getEventsInFile(f)))).flat();
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation]> {
    if (event.type !== 'single' && event.type !== undefined)
      throw new Error('Cannot create a recurring event in a daily note.');

    let eventToCreate = { ...event };
    const displayTimezone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Assign a timezone if one doesn't exist.
    if (!eventToCreate.timezone) {
      if (this.settings.dailyNotesTimezone === 'strict') {
        eventToCreate.timezone = displayTimezone;
      } else {
        eventToCreate.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    }

    // Convert if the event's target timezone differs from the display timezone.
    if (eventToCreate.timezone !== displayTimezone) {
      eventToCreate = convertEvent(event, displayTimezone, eventToCreate.timezone);
    }

    const m = moment(eventToCreate.date);
    let file = getDailyNote(m, getAllDailyNotes()) as TFile;
    if (!file) file = (await createDailyNote(m)) as TFile;
    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading == this.heading);
    if (!headingInfo)
      throw new Error(`Could not find heading ${this.heading} in daily note ${file.path}.`);
    let lineNumber = await this.app.rewrite(file, contents => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: eventToCreate, headingText: this.heading },
        this.settings
      );
      return [page, lineNumber] as [string, number];
    });
    const location = { file, lineNumber };
    return [event, location];
  }

  private getConcreteLocation({ path, lineNumber }: EventPathLocation): {
    file: TFile;
    lineNumber: number;
  } {
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);
    if (!lineNumber) throw new Error(`Daily note events must have a line number.`);
    return { file, lineNumber };
  }

  async deleteEvent(event: OFCEvent, location: EventPathLocation | null): Promise<void> {
    if (!location) {
      throw new Error('DailyNoteCalendar.deleteEvent requires a file location.');
    }
    const { file, lineNumber } = this.getConcreteLocation(location);
    this.app.rewrite(file, contents => {
      let lines = contents.split('\n');
      lines.splice(lineNumber, 1);
      return lines.join('\n');
    });
  }

  public getFolderCategoryNames(): string[] {
    const dailyNoteDir = this.directory; // This helper gets the setting.
    const parentDir = dailyNoteDir
      .split('/')
      .filter(s => s)
      .pop();
    return parentDir ? [parentDir] : [];
  }

  move(from: EventPathLocation, to: EditableCalendar): Promise<EventLocation> {
    throw new Error('Method not implemented.');
  }

  async bulkAddCategories(getCategory: CategoryProvider, force: boolean): Promise<void> {
    const allNotes = Object.values(getAllDailyNotes()) as TFile[];

    const processor = async (file: TFile) => {
      await this.app.rewrite(file, content => {
        const metadata = this.app.getMetadata(file);
        if (!metadata) return content;

        const listItems = getListsUnderHeading(this.heading, metadata);
        if (listItems.length === 0) return content;

        const lines = content.split('\n');
        let modified = false;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];
          const existingEvent = getInlineEventFromLine(line, {}); // Updated call
          if (!existingEvent) continue;

          const enhancedExistingEvent = enhanceEvent(existingEvent, {
            ...this.settings,
            enableAdvancedCategorization: true
          });

          if (enhancedExistingEvent.category && !force) {
            continue; // Smart mode: skip.
          }

          const newCategory = getCategory(existingEvent, { file, lineNumber });
          if (!newCategory) {
            continue;
          }

          // **THE CRITICAL FIX IS HERE:**
          // Get the RAW title string from the line, without parsing for categories.
          const rawTitle = line.replace(listRegex, '').replace(fieldRegex, '').trim();

          // If forcing, we use this raw, un-parsed title. This is the key.
          // In your example, `rawTitle` is "Sleep - Night".
          // If not forcing (smart), we use the clean title from our parsed event.
          const titleToCategorize = force ? rawTitle : existingEvent.title;

          // The `subCategory` will be undefined here, which is correct. We are only adding a top-level category.
          const newFullTitle = constructTitle(newCategory, undefined, titleToCategorize);

          // Now parse the final result to get the components for the new event object.
          const {
            category: finalCategory,
            subCategory: finalSubCategory,
            title: finalTitle
          } = parseTitle(newFullTitle);

          const eventWithNewCategory: OFCEvent = {
            ...existingEvent,
            title: finalTitle,
            category: finalCategory,
            subCategory: finalSubCategory
          };

          const newLine = modifyListItem(line, eventWithNewCategory, this.settings);
          if (newLine) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }

        return modified ? lines.join('\n') : content;
      });
    };

    await this.plugin.nonBlockingProcess(allNotes, processor, 'Categorizing daily notes');
  }

  async bulkRemoveCategories(knownCategories: Set<string>): Promise<void> {
    // Create a new set with this calendar's specific folder categories added.
    const categoriesToRemove = new Set(knownCategories);
    for (const name of this.getFolderCategoryNames()) {
      categoriesToRemove.add(name);
    }

    const allNotes = Object.values(getAllDailyNotes()) as TFile[];

    const removalSettings: FullCalendarSettings = {
      ...this.settings,
      enableAdvancedCategorization: true
    };

    const processor = async (file: TFile) => {
      await this.app.rewrite(file, content => {
        const metadata = this.app.getMetadata(file);
        if (!metadata) return content;

        const listItems = getListsUnderHeading(this.heading, metadata);
        if (listItems.length === 0) return content;

        const lines = content.split('\n');
        let modified = false;

        for (const item of listItems) {
          const lineNumber = item.position.start.line;
          const line = lines[lineNumber];
          const eventWithCategory = getInlineEventFromLine(line, {}); // Updated call
          if (!eventWithCategory) continue;

          const event = enhanceEvent(eventWithCategory, removalSettings);
          if (!event?.category || !categoriesToRemove.has(event.category)) {
            continue;
          }

          const eventWithoutCategory: OFCEvent = { ...event, category: undefined };

          const newLine = modifyListItem(line, eventWithoutCategory, this.settings);

          if (newLine && newLine !== line) {
            lines[lineNumber] = newLine;
            modified = true;
          }
        }
        return modified ? lines.join('\n') : content;
      });
    };

    await this.plugin.nonBlockingProcess(allNotes, processor, 'De-categorizing daily notes');
  }

  public getLocalIdentifier(event: OFCEvent): string | null {
    if (event.type === 'single' && event.date) {
      const fullTitle = constructTitle(event.category, event.subCategory, event.title);
      return `${event.date}::${fullTitle}`;
    }
    return null;
  }
}
