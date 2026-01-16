import { rrulestr } from 'rrule';
import { DateTime } from 'luxon';
import { TFile, TFolder, normalizePath } from 'obsidian';
import * as React from 'react';

import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { constructTitle } from '../../features/category/categoryParser';
import { newFrontmatter, modifyFrontmatterString, replaceFrontmatter } from './frontmatter';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { FullNoteProviderConfig } from './typesLocal';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { FullNoteConfigComponent } from './FullNoteConfigComponent';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

// Settings row component for Full Note Provider
const FullNoteDirectorySetting: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  // Handle both flat and nested config structures for directory
  const getDirectory = (): string => {
    const flat = (source as { directory?: unknown }).directory;
    const nested = (source as { config?: { directory?: unknown } }).config?.directory;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getDirectory(),
      className: 'fc-setting-input'
    })
  );
};

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

const SUFFIX_PATTERN = '-_-_-';

type FullNoteConfigProps = {
  config: Partial<FullNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<FullNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: FullNoteProviderConfig | FullNoteProviderConfig[]) => void;
  onClose: () => void;
};

const FullNoteConfigWrapper: React.FC<FullNoteConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: FullNoteProviderConfig) => onSave(finalConfig);

  return React.createElement(FullNoteConfigComponent, {
    ...rest,
    onSave: handleSave
  });
};

/**
 * Finds an available file path in the vault. If the desired path already exists,
 * it appends a suffix (e.g., "-_-_1") until an unused path is found.
 * @param app An ObsidianInterface for interacting with the vault.
 * @param directory The directory to create the file in.
 * @param baseFilename The desired filename, without extension or suffix.
 * @returns A promise that resolves to the first available, unique file path.
 */
function findUniquePath(app: ObsidianInterface, directory: string, baseFilename: string): string {
  let path = normalizePath(`${directory}/${baseFilename}.md`);
  if (!app.getAbstractFileByPath(path)) {
    return path;
  }

  let i = 1;
  while (true) {
    const suffix = `${SUFFIX_PATTERN}${i}`;
    path = normalizePath(`${directory}/${baseFilename}${suffix}.md`);
    if (!app.getAbstractFileByPath(path)) {
      return path;
    }
    i++;
  }
}

// Provider Implementation
// =================================================================================================

export class FullNoteProvider implements CalendarProvider<FullNoteProviderConfig> {
  // Static metadata for registry
  static readonly type = 'local';
  static readonly displayName = 'Local Notes';

  static getConfigurationComponent(): FCReactComponent<FullNoteConfigProps> {
    return FullNoteConfigWrapper;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: FullNoteProviderConfig;

  readonly type = 'local';
  readonly displayName = 'Local Notes';
  readonly isRemote = false;
  readonly loadPriority = 10;

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
    // Prioritize the UID if it exists. This is the new, robust path.
    if (event.uid) {
      return { persistentId: event.uid };
    }

    // Fallback for legacy events or events created in-memory that haven't been saved yet.
    const filename = filenameForEvent(event, this.plugin.settings);
    const path = normalizePath(`${this.source.directory}/${filename}`);
    return { persistentId: path };
  }

  public isFileRelevant(file: TFile): boolean {
    const directory = this.source.directory;
    return !!directory && file.path.startsWith(directory + '/');
  }

  public getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const metadata = this.app.getMetadata(file);
    if (!metadata?.frontmatter) {
      return Promise.resolve([]);
    }

    const rawEventData = {
      ...metadata.frontmatter,
      title: (metadata.frontmatter as { title?: string }).title || file.basename
    } as Record<string, unknown>;

    const event = validateEvent(rawEventData);
    if (!event) {
      return Promise.resolve([]);
    }

    // Populate UID from the file path.
    event.uid = file.path;

    // The raw event is returned as-is. The EventEnhancer will handle timezone conversion.
    return Promise.resolve([[event, { file, lineNumber: undefined }]]);
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
    const baseFilename = basenameFromEvent(event, this.plugin.settings);
    const path = findUniquePath(this.app, this.source.directory, baseFilename);

    // The frontmatter is generated from the clean `event` object, so the title remains unsuffixed.
    const newPage = replaceFrontmatter('', newFrontmatter(event));
    const file = await this.app.create(path, newPage);

    // The authoritative event object returned to the cache must contain the
    // unique path as its UID for future updates and deletions.
    const finalEvent = { ...event, uid: file.path };
    return [finalEvent, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const oldPath = handle.persistentId;
    const file = this.app.getFileByPath(oldPath);
    if (!file) {
      throw new Error(`File ${oldPath} not found.`);
    }

    // Determine if the event's core identifiers (which make up the filename) have changed.
    const oldBaseFilename = basenameFromEvent(oldEventData, this.plugin.settings);
    const newBaseFilename = basenameFromEvent(newEventData, this.plugin.settings);

    let finalPath = oldPath;

    if (oldBaseFilename !== newBaseFilename) {
      // It's a rename. We must find a new unique path for the new base name.
      finalPath = findUniquePath(this.app, this.source.directory, newBaseFilename);
      await this.app.rename(file, finalPath);
    }

    // The `newEventData` from the cache always has a clean title.
    // Write this clean data to the frontmatter.
    await this.app.rewrite(file, page => modifyFrontmatterString(page, newEventData));

    // The location returned must have the final, potentially new, path.
    return { file: { path: finalPath }, lineNumber: undefined };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    return this.app.delete(file);
  }

  createInstanceOverride(
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

  getConfigurationComponent(): FCReactComponent<FullNoteConfigProps> {
    return FullNoteConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return FullNoteDirectorySetting;
  }
}
