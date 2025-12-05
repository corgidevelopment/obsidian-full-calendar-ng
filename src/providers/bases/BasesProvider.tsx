import { TFile, App, Notice, parseYaml, getAllTags, normalizePath } from 'obsidian';
import * as React from 'react';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { OFCEvent, EventLocation, CalendarInfo, validateEvent } from '../../types';
import { FCReactComponent, ProviderConfigContext, EventHandle } from '../typesProvider';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { BasesConfigComponent } from './BasesConfigComponent';

export interface BasesProviderConfig {
  type: 'bases';
  basePath: string;
  color: string;
  name: string;
}

interface BaseFilter {
  or?: (BaseFilter | string)[];
  and?: (BaseFilter | string)[];
  not?: (BaseFilter | string)[];
}

interface BaseFile {
  filters?: BaseFilter;
  views?: any[];
  properties?: any;
}

export class BasesProvider implements CalendarProvider<BasesProviderConfig> {
  static type = 'bases';
  static displayName = 'Obsidian Bases';
  static getConfigurationComponent(): FCReactComponent<any> {
    return BasesConfigComponent;
  }

  type = 'bases';
  displayName = 'Obsidian Bases';
  isRemote = false;
  loadPriority = 10; // Local priority

  config: BasesProviderConfig;
  plugin: FullCalendarPlugin;
  app: ObsidianInterface;

  constructor(config: BasesProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('BasesProvider requires an Obsidian app interface.');
    }
    this.config = config;
    this.plugin = plugin;
    this.app = app;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: false, // Read-only for now
      canEdit: false,
      canDelete: false
    };
  }

  // --- Filter Evaluation Logic ---

  evaluateFilter(filter: BaseFilter | string, file: TFile): boolean {
    if (typeof filter === 'string') {
      return this.evaluateFilterString(filter, file);
    }

    if (filter.or) {
      return filter.or.some(f => this.evaluateFilter(f, file));
    }
    if (filter.and) {
      return filter.and.every(f => this.evaluateFilter(f, file));
    }
    if (filter.not) {
      return !filter.not.some(f => this.evaluateFilter(f, file));
    }
    return true; // Default to true if empty object
  }

  evaluateFilterString(statement: string, file: TFile): boolean {
    // Very basic implementation of filter string evaluation
    // Supports: file.hasTag("tag"), file.inFolder("folder"), file.ext == "md"

    const cache = this.plugin.app.metadataCache.getFileCache(file);
    const tags = getAllTags(cache || {}) || [];

    if (statement.includes('file.hasTag')) {
      const match = statement.match(/file\.hasTag\("([^"]+)"\)/);
      if (match) {
        const tag = match[1];
        // Handle #tag format in cache vs tag format in filter
        return tags.some(t => t === tag || t === `#${tag}`);
      }
    }

    if (statement.includes('file.inFolder')) {
      const match = statement.match(/file\.inFolder\("([^"]+)"\)/);
      if (match) {
        const folder = match[1];
        return file.path.startsWith(folder);
      }
    }

    if (statement.includes('file.ext')) {
      // Simple check for markdown files
      if (statement.includes('"md"')) {
        return file.extension === 'md';
      }
    }

    return true;
  }

  // --- Event Extraction Logic ---

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    const events: [OFCEvent, EventLocation | null][] = [];

    // Check if Bases plugin is enabled
    const app = this.plugin.app as any;
    const basesPlugin =
      app.internalPlugins?.getPluginById('bases') || app.plugins?.getPlugin('bases');
    if (!basesPlugin) {
      console.warn('Bases plugin not found or disabled.');
      return [];
    }

    const baseFile = this.plugin.app.vault.getAbstractFileByPath(this.config.basePath);
    if (!(baseFile instanceof TFile)) {
      return [];
    }

    try {
      const content = await this.plugin.app.vault.read(baseFile);
      let baseData: BaseFile;
      try {
        baseData = parseYaml(content);
      } catch (e) {
        console.warn('Failed to parse Base file as YAML', e);
        return [];
      }

      const allFiles = this.plugin.app.vault.getFiles();
      const filteredFiles = allFiles.filter(file => {
        if (!baseData.filters) return true; // No filters = all files
        return this.evaluateFilter(baseData.filters, file);
      });

      for (const file of filteredFiles) {
        const eventData = this.getEventFromFile(file);
        if (eventData) {
          events.push(eventData);
        }
      }
    } catch (e) {
      console.error('Error processing Base file', e);
    }

    return events;
  }

  getEventFromFile(file: TFile): [OFCEvent, EventLocation | null] | null {
    const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!metadata) return null;

    // Heuristic to find date fields
    const date = metadata.date || metadata.start || metadata.startTime || metadata.due;
    if (!date) return null;

    const title = metadata.title || file.basename;
    const category = metadata.category || metadata.Category;
    const subCategory = metadata['sub category'] || metadata.SubCategory || metadata.subCategory;

    let finalTitle = title;
    if (category && subCategory) {
      finalTitle = `${category} - ${subCategory} - ${title}`;
    } else if (category) {
      finalTitle = `${category} - ${title}`;
    } else if (subCategory) {
      finalTitle = `${subCategory} - ${title}`;
    }

    // Construct a raw object to pass to validateEvent for standard processing
    const rawEvent = {
      ...metadata,
      title: finalTitle,
      date: date,
      type: metadata.type || 'single', // Default to single if not specified
      allDay: metadata.allDay !== undefined ? metadata.allDay : true, // Default to all day
      category: category,
      subCategory: subCategory
    };

    const validatedEvent = validateEvent(rawEvent);
    if (!validatedEvent) return null;

    // Ensure UID is set to file path for navigation/identification
    validatedEvent.uid = file.path;

    return [validatedEvent, { file: { path: file.path }, lineNumber: undefined }];
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // Return the file path as the persistent ID so we can navigate to it
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Not implemented');
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    throw new Error('Not implemented');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    throw new Error('Not implemented');
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Not implemented');
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return BasesConfigComponent as any;
  }

  getSettingsRowComponent(): FCReactComponent<{ source: Partial<CalendarInfo> }> {
    return ({ source }) => (
      <div className="setting-item-control">
        <span>
          {source.name} ({source.type})
        </span>
        <span className="fc-setting-desc">{(source as Partial<BasesProviderConfig>).basePath}</span>
      </div>
    );
  }
}
