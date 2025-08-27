import { TFile, Notice } from 'obsidian';
import { CalendarProvider, CalendarProviderCapabilities } from '../providers/Provider';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import FullCalendarPlugin from '../main';
import { ObsidianIO, ObsidianInterface } from '../ObsidianAdapter';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MILLICONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

// Keep the generic constructor loose because individual providers have distinct
// config types (FullNoteProviderConfig, DailyNoteProviderConfig, etc.). Enforcing
// a single CalendarInfo arg caused incompatibilities. We instead type the
// instance side via CalendarProvider<unknown> while still avoiding pervasive `any`.
// eslint-disable-next-line @typescript-eslint/ban-types
// NOTE: We intentionally keep the constructor param typed as `any` here.
// Each concrete provider has a distinct config type; using a union or unknown
// causes incompatibilities (construct signature variance) when dynamically
// importing modules. Keeping `any` localised here avoids leaking it elsewhere
// while preserving flexibility for heterogeneous provider configs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CalendarProviderClass = new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  plugin: FullCalendarPlugin,
  app?: ObsidianInterface
) => CalendarProvider<unknown>;

type ProviderLoader = () => Promise<{ [key: string]: CalendarProviderClass }>;

export class ProviderRegistry {
  private providers = new Map<string, ProviderLoader>();
  private instances = new Map<string, CalendarProvider<unknown>>();
  private sources: CalendarInfo[] = [];

  // Properties from IdentifierManager and for linking singletons
  private plugin: FullCalendarPlugin;
  private cache: EventCache | null = null;
  private pkCounter = 0;
  private identifierToSessionIdMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    // initializeInstances is now called from main.ts after settings are loaded.
  }

  // Register all built-in providers in one call
  public registerBuiltInProviders(): void {
    this.register('local', () => import('./fullnote/FullNoteProvider'));
    this.register('dailynote', () => import('./dailynote/DailyNoteProvider'));
    this.register('ical', () => import('./ics/ICSProvider'));
    this.register('caldav', () => import('./caldav/CalDAVProvider'));
    this.register('google', () => import('./google/GoogleProvider'));
  }

  public register(type: string, loader: ProviderLoader): void {
    if (this.providers.has(type)) {
      console.warn(`Provider loader for type "${type}" is already registered. Overwriting.`);
    }
    this.providers.set(type, loader);
  }

  // Method to link cache
  public setCache(cache: EventCache): void {
    this.cache = cache;
  }

  public updateSources(newSources: CalendarInfo[]): void {
    this.sources = newSources;
    // Instances will be re-initialized from main.ts
  }

  public getSource(id: string): CalendarInfo | undefined {
    return this.sources.find(s => s.id === id);
  }

  public getAllSources(): CalendarInfo[] {
    return this.sources;
  }

  public getConfig(id: string): unknown | undefined {
    const source = this.getSource(id);
    if (!source) return undefined;
    return 'config' in source ? (source as Record<string, unknown>).config : undefined;
  }

  public async getProviderForType(type: string): Promise<CalendarProviderClass | undefined> {
    const loader = this.providers.get(type);
    if (!loader) {
      console.error(`Full Calendar: No provider loader found for type "${type}".`);
      return undefined;
    }
    try {
      const module = await loader();
      const ProviderClass = Object.values(module).find(
        (exported: unknown): exported is CalendarProviderClass =>
          typeof exported === 'function' && (exported as { type?: string }).type === type
      );

      if (!ProviderClass) {
        console.error(
          `Full Calendar: Could not find a provider class with type "${type}" in the loaded module.`
        );
        return undefined;
      }
      return ProviderClass;
    } catch (err) {
      console.error(`Full Calendar: Error loading provider for type "${type}".`, err);
      return undefined;
    }
  }

  public async initializeInstances(): Promise<void> {
    this.instances.clear();
    const sources = this.plugin.settings.calendarSources;

    for (const source of sources) {
      const settingsId = source.id;
      if (!settingsId) {
        console.warn('Full Calendar: Calendar source is missing an ID.', source);
        continue;
      }

      const ProviderClass = await this.getProviderForType(source.type);

      if (ProviderClass) {
        const app = new ObsidianIO(this.plugin.app);
        // Provider constructor accepts loosely typed config; pass source directly
        const instance = new ProviderClass(source, this.plugin, app);
        this.instances.set(settingsId, instance);
      } else {
        // Warning is already logged in getProviderForType
      }
    }
  }

  // Methods from IdentifierManager, adapted
  public generateId(): string {
    return `${this.pkCounter++}`;
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    if (this.identifierMapPromise) {
      await this.identifierMapPromise;
    }
    return this.identifierToSessionIdMap.get(globalIdentifier) || null;
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      console.warn(`Could not find provider instance for calendar ID ${calendarId}`);
      return null;
    }
    const handle = instance.getEventHandle(event);
    if (!handle) {
      return null;
    }
    return `${calendarId}::${handle.persistentId}`;
  }

  public buildMap(store: {
    getAllEvents(): { event: OFCEvent; calendarId: string; id: string }[];
  }): void {
    // store is EventStore
    if (!this.cache) return;
    this.identifierMapPromise = (async () => {
      this.identifierToSessionIdMap.clear();
      for (const storedEvent of store.getAllEvents()) {
        const globalIdentifier = this.getGlobalIdentifier(
          storedEvent.event,
          storedEvent.calendarId
        );
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, storedEvent.id);
        }
      }
    })();
  }

  public addMapping(event: OFCEvent, calendarId: string, sessionId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.set(globalIdentifier, sessionId);
    }
  }

  public removeMapping(event: OFCEvent, calendarId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.delete(globalIdentifier);
    }
  }

  public async fetchAllEvents(): Promise<
    { calendarId: string; event: OFCEvent; location: EventLocation | null }[]
  > {
    if (!this.cache) {
      throw new Error('Cache not set on ProviderRegistry');
    }

    const results: { calendarId: string; event: OFCEvent; location: EventLocation | null }[] = [];
    const promises = [];

    for (const [settingsId, instance] of this.instances.entries()) {
      const promise = (async () => {
        try {
          const rawEvents = await instance.getEvents();
          rawEvents.forEach(([rawEvent, location]) => {
            const event = this.cache!.enhancer.enhance(rawEvent);
            results.push({
              calendarId: settingsId,
              event,
              location
            });
          });
        } catch (e) {
          const source = this.getSource(settingsId);
          console.warn(`Full Calendar: Failed to load calendar source`, source, e);
        }
      })();
      promises.push(promise);
    }

    await Promise.allSettled(promises);
    return results;
  }

  public async createEventInProvider(
    settingsId: string,
    event: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const instance = this.instances.get(settingsId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${settingsId} not found.`);
    }
    return instance.createEvent(event);
  }

  public async updateEventInProvider(
    sessionId: string,
    calendarId: string,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    const handle = instance.getEventHandle(oldEventData);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }
    return instance.updateEvent(handle, oldEventData, newEventData);
  }

  public async deleteEventInProvider(
    sessionId: string,
    event: OFCEvent,
    calendarId: string
  ): Promise<void> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    const handle = instance.getEventHandle(event);

    if (handle) {
      await instance.deleteEvent(handle);
    } else {
      console.warn(
        `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
      );
    }
  }

  // NOTE: Keep handleFileUpdate and handleFileDelete stubs for now.
  public async handleFileUpdate(file: TFile): Promise<void> {
    if (!this.cache) return;

    // Find all *local* provider instances that might be interested in this file.
    const interestedInstances = [];
    for (const [settingsId, instance] of this.instances.entries()) {
      if (!instance.isRemote && instance.getEventsInFile) {
        const sourceInfo = this.getSource(settingsId);
        if (!sourceInfo) continue;

        let isRelevant = false;
        if (instance.type === 'local') {
          if (sourceInfo.type === 'local') {
            const directory = sourceInfo.directory;
            isRelevant = !!directory && file.path.startsWith(directory + '/');
          }
        } else if (instance.type === 'dailynote') {
          const { folder } = require('obsidian-daily-notes-interface').getDailyNoteSettings();
          isRelevant = folder ? file.path.startsWith(folder + '/') : true;
        }

        if (isRelevant) {
          interestedInstances.push({ instance, config: sourceInfo, settingsId });
        }
      }
    }

    if (interestedInstances.length === 0) {
      // No providers care about this file, so we can stop.
      await this.cache.syncFile(file, []);
      return;
    }

    // Aggregate all events from all interested providers for this one file.
    const allNewEvents: { event: OFCEvent; location: EventLocation | null; calendarId: string }[] =
      [];
    for (const { instance, settingsId } of interestedInstances) {
      const eventsFromFile = await instance.getEventsInFile!(file);
      for (const [event, location] of eventsFromFile) {
        allNewEvents.push({ event, location, calendarId: settingsId });
      }
    }

    // Push the definitive new state of the file to the cache for diffing.
    await this.cache.syncFile(file, allNewEvents);
  }

  public async handleFileDelete(path: string): Promise<void> {
    if (!this.cache) return;
    // For a delete, the new state of the file is "no events".
    // The cache will diff this against its old state and remove everything.
    // Provide a minimal file-like object; syncFile only requires a .path property via TFile shape.
    // Create minimal TFile-like object for cache sync
    await this.cache.syncFile({ path } as unknown as TFile, []);
  }

  // Add these properties for remote revalidation
  private revalidating = false;
  private lastRevalidation = 0;

  public revalidateRemoteCalendars(force = false): void {
    if (!this.cache) return;
    if (this.revalidating) {
      return;
    }
    const now = Date.now();

    if (!force && now - this.lastRevalidation < MILLICONDS_BETWEEN_REVALIDATIONS) {
      return;
    }

    const remoteInstances = Array.from(this.instances.entries()).filter(
      ([_, instance]) => instance.isRemote
    );

    if (remoteInstances.length === 0) {
      return;
    }

    this.revalidating = true;
    new Notice('Revalidating remote calendars...');

    const promises = remoteInstances.map(([settingsId, instance]) => {
      return instance
        .getEvents()
        .then(events => {
          this.cache!.syncCalendar(settingsId, events);
        })
        .catch(err => {
          const source = this.getSource(settingsId);
          const name =
            source && 'name' in source ? (source as { name: string }).name : instance.type;
          throw new Error(`Failed to revalidate calendar "${name}": ${err.message}`);
        });
    });

    Promise.allSettled(promises).then(results => {
      this.revalidating = false;
      this.lastRevalidation = Date.now();
      const errors = results.flatMap(result => (result.status === 'rejected' ? result.reason : []));
      if (errors.length > 0) {
        new Notice('One or more remote calendars failed to load. Check the console for details.');
        errors.forEach(reason => {
          console.error(`Full Calendar: Revalidation failed.`, reason);
        });
      } else {
        new Notice('Remote calendars revalidated.');
      }
    });
  }

  public getInstance(id: string): CalendarProvider<any> | undefined {
    return this.instances.get(id);
  }

  public getCapabilities(id: string): CalendarProviderCapabilities | null {
    const instance = this.instances.get(id);
    if (!instance) {
      return null;
    }
    return instance.getCapabilities();
  }

  public async createInstanceOverrideInProvider(
    calendarId: string,
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    return instance.createInstanceOverride(masterEvent, instanceDate, newEventData);
  }

  // Add pub/sub event bus logic for settings changes
  private onSourcesChanged = async (): Promise<void> => {
    if (!this.cache) return;

    // This is the "nuclear reset" logic moved from main.ts
    await this.initializeInstances();
    this.cache.reset();
    await this.cache.populate();
    this.revalidateRemoteCalendars();
    this.cache.resync();
  };

  public listenForSourceChanges(): void {
    // Obsidian's Workspace interface doesn't declare custom events; cast only the event emitter portion
    (
      this.plugin.app.workspace as unknown as {
        on: (name: string, cb: () => void) => void;
      }
    ).on('full-calendar:sources-changed', this.onSourcesChanged);
  }

  public stopListening(): void {
    (
      this.plugin.app.workspace as unknown as {
        off: (name: string, cb: () => void) => void;
      }
    ).off('full-calendar:sources-changed', this.onSourcesChanged);
  }
}
