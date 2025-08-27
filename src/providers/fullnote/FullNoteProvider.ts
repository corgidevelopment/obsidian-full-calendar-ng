import { rrulestr } from 'rrule';
import { DateTime } from 'luxon';
import { TFile, TFolder, normalizePath } from 'obsidian';

import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { constructTitle } from '../../features/category/categoryParser';
import { newFrontmatter, modifyFrontmatterString, replaceFrontmatter } from './frontmatter';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { FullNoteProviderConfig } from './typesLocal';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { FullNoteConfigComponent } from './FullNoteConfigComponent';
import { convertEvent } from '../../features/Timezone';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

// Helper Functions (ported from FullNoteCalendar.ts)
// =================================================================================================

function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface TitleSettingsLike {
  enableAdvancedCategorization?: boolean;
}
const basenameFromEvent = (event: OFCEvent, settings: TitleSettingsLike): string => {
  const fullTitle = settings.enableAdvancedCategorization
    ? constructTitle(event.category, event.subCategory, event.title)
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
        const monthName = DateTime.fromObject({ month: event.month }).toFormat('MMM');
        return `(Every year on ${monthName} ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      if (event.dayOfMonth) {
        return `(Every month on the ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      return `(Recurring) ${sanitizedTitle}`;
    }
    case 'rrule':
      return `(${rrulestr(event.rrule).toText()}) ${sanitizedTitle}`;
  }
};

const filenameForEvent = (event: OFCEvent, settings: TitleSettingsLike) =>
  `${basenameFromEvent(event, settings)}.md`;

// Provider Implementation
// =================================================================================================

export class FullNoteProvider implements CalendarProvider<FullNoteProviderConfig> {
  // Static metadata for registry
  static readonly type = 'local';
  static readonly displayName = 'Local Notes';
  static getConfigurationComponent(): FCReactComponent<any> {
    return FullNoteConfigComponent;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: FullNoteProviderConfig;

  readonly type = 'local';
  readonly displayName = 'Local Notes';
  readonly isRemote = false;

  constructor(source: FullNoteProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('FullNoteProvider requires an Obsidian app interface.');
    }
    this.app = app;
    this.plugin = plugin;
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    const filename = filenameForEvent(event, this.plugin.settings);
    const path = normalizePath(`${this.source.directory}/${filename}`);
    return { persistentId: path };
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const metadata = this.app.getMetadata(file);
    if (!metadata?.frontmatter) {
      return [];
    }

    const rawEventData = {
      ...metadata.frontmatter,
      title: (metadata.frontmatter as { title?: string }).title || file.basename
    } as Record<string, unknown>;

    const rawEvent = validateEvent(rawEventData);
    if (!rawEvent) {
      return [];
    }

    // The raw event is returned as-is. The EventEnhancer will handle timezone conversion.
    return [[rawEvent, { file, lineNumber: undefined }]];
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    const eventFolder = this.app.getAbstractFileByPath(this.source.directory);
    if (!eventFolder || !(eventFolder instanceof TFolder)) {
      throw new Error(`${this.source.directory} is not a valid directory.`);
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

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation]> {
    const path = normalizePath(
      `${this.source.directory}/${filenameForEvent(event, this.plugin.settings)}`
    );
    if (this.app.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }

    const newPage = replaceFrontmatter('', newFrontmatter(event));
    const file = await this.app.create(path, newPage);
    return [event, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    const newPath = normalizePath(
      `${this.source.directory}/${filenameForEvent(newEventData, this.plugin.settings)}`
    );
    if (file.path !== newPath) {
      await this.app.rename(file, newPath);
    }

    await this.app.rewrite(file, page => modifyFrontmatterString(page, newEventData));
    return { file: { path: newPath }, lineNumber: undefined };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    return this.app.delete(file);
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

    const masterFilename = masterLocalId.split('/').pop();
    if (!masterFilename) {
      throw new Error(`Could not extract filename from master event path: ${masterLocalId}`);
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterFilename
    };

    // Use the existing createEvent logic to handle file creation and timezone conversion
    return this.createEvent(overrideEventData);
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return FullNoteConfigComponent;
  }
}
