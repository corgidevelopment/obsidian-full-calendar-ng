import moment from 'moment';
import { TFile } from 'obsidian';
import * as React from 'react';
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
  addToHeading
} from './parser_dailyN';

import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { constructTitle } from '../../features/category/categoryParser';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { DailyNoteProviderConfig } from './typesDaily';
import { DailyNoteConfigComponent } from './DailyNoteConfigComponent';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

// Settings row component for Daily Note Provider
const DailyNoteHeadingSetting: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  // Handle both flat and nested config structures for heading
  const getHeading = (): string => {
    const flat = (source as { heading?: unknown }).heading;
    const nested = (source as { config?: { heading?: unknown } }).config?.heading;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control fc-heading-setting-control' },
    React.createElement('span', {}, 'Under heading'),
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getHeading(),
      className: 'fc-setting-input is-inline'
    }),
    React.createElement('span', { className: 'fc-heading-setting-suffix' }, 'in daily notes')
  );
};

export class DailyNoteProvider implements CalendarProvider<DailyNoteProviderConfig> {
  // Static metadata for registry
  static readonly type = 'dailynote';
  static readonly displayName = 'Daily Note';
  static getConfigurationComponent(): FCReactComponent<any> {
    return DailyNoteConfigComponent;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: DailyNoteProviderConfig;

  readonly type = 'dailynote';
  readonly displayName = 'Daily Note';
  readonly isRemote = false;
  readonly loadPriority = 120;

  constructor(
    source: DailyNoteProviderConfig,
    plugin: FullCalendarPlugin,
    app?: ObsidianInterface
  ) {
    if (!app) {
      throw new Error('DailyNoteProvider requires an Obsidian app interface.');
    }
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.type === 'single' && event.date) {
      const fullTitle = constructTitle(event.category, event.subCategory, event.title);
      const persistentId = `${event.date}::${fullTitle}`;
      const m = moment(event.date);
      const file = getDailyNote(m, getAllDailyNotes());
      if (!file || !(file instanceof TFile)) return null;
      return { persistentId, location: { path: file.path } };
    }
    return null;
  }

  public isFileRelevant(file: TFile): boolean {
    // Encapsulates the logic of checking the daily note folder.
    const { folder } = getDailyNoteSettings();
    return folder ? file.path.startsWith(folder + '/') : true;
  }

  private async _findEventLineNumber(file: TFile, persistentId: string): Promise<number> {
    const content = await this.app.read(file);
    const lines = content.split('\n');
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');

    // It's possible for a daily note file to not have a date in its title.
    // In that case, we cannot reliably parse events from it.
    if (!date) {
      throw new Error(`Could not determine date from file: ${file.path}`);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const event = getInlineEventFromLine(line, { date });
      if (event && event.type === 'single') {
        // Check for event type
        const fullTitle = constructTitle(event.category, event.subCategory, event.title);
        // Now it's safe to access event.date
        const currentId = `${event.date}::${fullTitle}`;
        if (currentId === persistentId) {
          return i; // Found it
        }
      }
    }

    throw new Error(`Could not find event with ID "${persistentId}" in file "${file.path}".`);
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    const cache = this.app.getMetadata(file);
    if (!cache) return [];
    const listItems = getListsUnderHeading(this.source.heading, cache);
    const inlineEvents = await this.app.process(file, text =>
      getAllInlineEventsFromFile(text, listItems, { date })
    );
    // The raw events are returned as-is. The EventEnhancer handles timezone conversion.
    return inlineEvents.map(({ event: rawEvent, lineNumber }) => {
      return [rawEvent, { file, lineNumber }];
    });
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    const notes = getAllDailyNotes();
    const files = Object.values(notes);
    const allEvents = await Promise.all(files.map(f => this.getEventsInFile(f)));
    return allEvents.flat();
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation]> {
    if (event.type !== 'single') {
      throw new Error('Daily Note provider can only create single events.');
    }

    const m = moment(event.date);
    let file = getDailyNote(m, getAllDailyNotes());
    if (!file) file = await createDailyNote(m);
    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading == this.source.heading);
    // if (!headingInfo) {
    //   throw new Error(`Could not find heading ${this.source.heading} in daily note ${file.path}.`);
    // }
    let lineNumber = await this.app.rewrite(file, (contents: string) => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: event, headingText: this.source.heading },
        this.plugin.settings
      );
      return [page, lineNumber] as [string, number];
    });
    return [event, { file, lineNumber }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Daily Note provider can only update events to be single events.');
    }

    if (!handle.location?.path) {
      throw new Error('DailyNoteProvider updateEvent requires a file path in the event handle.');
    }
    const { path } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const lineNumber = await this._findEventLineNumber(file, handle.persistentId);

    const oldDate = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    if (!oldDate) throw new Error(`Could not get date from file at path ${file.path}`);

    if (newEventData.date !== oldDate) {
      const m = moment(newEventData.date);
      let newFile = getDailyNote(m, getAllDailyNotes());
      if (!newFile) newFile = await createDailyNote(m);

      // First, delete the line from the old file.
      await this.app.rewrite(file, oldFileContents => {
        let lines = oldFileContents.split('\n');
        lines.splice(lineNumber, 1);
        return lines.join('\n');
      });

      // Second, add the event to the new file and get its line number.
      const metadata = await this.app.waitForMetadata(newFile);
      const headingInfo = metadata.headings?.find(h => h.heading == this.source.heading);
      // if (!headingInfo) {
      //   throw new Error(
      //     `Could not find heading ${this.source.heading} in daily note ${newFile.path}.`
      //   );
      // }

      const newLn = await this.app.rewrite(newFile, newFileContents => {
        const { page, lineNumber } = addToHeading(
          newFileContents,
          { heading: headingInfo, item: newEventData, headingText: this.source.heading },
          this.plugin.settings
        );
        return [page, lineNumber] as [string, number];
      });

      // Finally, return the authoritative new location to the cache.
      return { file: newFile, lineNumber: newLn };
    } else {
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');
        const newLine = modifyListItem(lines[lineNumber], newEventData, this.plugin.settings);
        if (!newLine) throw new Error('Did not successfully update line.');
        lines[lineNumber] = newLine;
        return lines.join('\n');
      });
      return { file, lineNumber };
    }
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    if (!handle.location?.path) {
      throw new Error('DailyNoteProvider deleteEvent requires a file path.');
    }
    const { path } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const lineNumber = await this._findEventLineNumber(file, handle.persistentId);

    await this.app.rewrite(file, (contents: string) => {
      let lines = contents.split('\n');
      lines.splice(lineNumber, 1);
      return lines.join('\n');
    });
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return DailyNoteConfigComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return DailyNoteHeadingSetting;
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const masterLocalId = this.getEventHandle(masterEvent)?.persistentId;
    if (!masterLocalId) {
      throw new Error('Could not get persistent ID for master event.');
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterLocalId
    };

    return this.createEvent(overrideEventData);
  }
}
