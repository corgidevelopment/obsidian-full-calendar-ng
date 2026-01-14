import { TFile, Notice } from 'obsidian';
import { CalendarProvider, CalendarProviderCapabilities } from '../providers/Provider';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import FullCalendarPlugin from '../main';
import { ObsidianIO, ObsidianInterface } from '../ObsidianAdapter';
import { TasksBacklogManager } from './tasks/TasksBacklogManager';
import { t } from '../features/i18n/i18n';

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
  /**
   * Triggers a refresh of any open Tasks Backlog views.
   * This is called by the Tasks provider when its internal data changes.
   */
  public refreshBacklogViews(): void {
    if (this.tasksBacklogManager.getIsLoaded()) {
      this.tasksBacklogManager.refreshViews();
    }
  }
  private providers = new Map<string, ProviderLoader>();
  private instances = new Map<string, CalendarProvider<unknown>>();
  private sources: CalendarInfo[] = [];

  // Properties from IdentifierManager and for linking singletons
  private plugin: FullCalendarPlugin;
  private cache: EventCache | null = null;
  private pkCounter = 0;
  private identifierToSessionIdMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  // Tasks backlog manager for lifecycle management
  private tasksBacklogManager: TasksBacklogManager;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.tasksBacklogManager = new TasksBacklogManager(plugin);
    // initializeInstances is now called from main.ts after settings are loaded.
  }

  // Register all built-in providers in one call
  public registerBuiltInProviders(): void {
    this.register('local', () => import('./fullnote/FullNoteProvider'));
    this.register('dailynote', () => import('./dailynote/DailyNoteProvider'));
    this.register('ical', () => import('./ics/ICSProvider'));
    this.register('caldav', () => import('./caldav/CalDAVProvider'));
    this.register('google', () => import('./google/GoogleProvider'));
    this.register('tasks', () => import('./tasks/TasksPluginProvider'));
    this.register('bases', () => import('./bases/BasesProvider'));
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
    this.sources = [...newSources];
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

  public async addInstance(source: CalendarInfo): Promise<void> {
    const settingsId = source.id;
    if (!settingsId || this.instances.has(settingsId)) {
      return; // Do nothing if ID is missing or instance already exists.
    }

    const ProviderClass = await this.getProviderForType(source.type);
    if (ProviderClass) {
      const app = new ObsidianIO(this.plugin.app);
      const instance = new ProviderClass(source, this.plugin, app);
      this.instances.set(settingsId, instance);
      // Also update the internal sources list to keep it in sync.
      this.sources.push(source);

      // Call initialize() if provider supports it
      if (instance.initialize) {
        instance.initialize();
      }

      // Fetch events from the newly added provider and add them to cache
      if (this.cache && this.cache.initialized) {
        try {
          const rawEvents = await instance.getEvents();

          // Add events to cache
          for (const [rawEvent, location] of rawEvents) {
            const event = this.cache.enhancer.enhance(rawEvent);
            const id = this.generateId();
            this.cache.store.add({
              calendarId: settingsId,
              location,
              id,
              event
            });
            this.addMapping(event, settingsId, id);
          }

          // Add the provider to cache.calendars so getAllEvents() can see it
          this.cache.calendars.set(settingsId, instance);

          // Trigger cache resync to update UI
          this.cache.resync();
        } catch (error) {
          console.error(`Full Calendar: Failed to fetch events from new provider:`, error);
        }
      }
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

        // Call initialize() if provider supports it
        if (instance.initialize) {
          instance.initialize();
        } else {
        }
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

  /**
   * Fetch events from all providers using priority-based ordering.
   * Local providers (loadPriority < 100) load synchronously for immediate display.
   * Remote providers (loadPriority >= 100) load asynchronously and call onProviderComplete.
   */
  public async fetchAllByPriority(
    onProviderComplete?: (
      calendarId: string,
      events: { event: OFCEvent; location: EventLocation | null }[]
    ) => void,
    onAllComplete?: () => void
  ): Promise<{ event: OFCEvent; location: EventLocation | null; calendarId: string }[]> {
    const startTime = performance.now();
    if (!this.cache) {
      throw new Error('Cache not set on ProviderRegistry');
    }

    const results: { event: OFCEvent; location: EventLocation | null; calendarId: string }[] = [];

    // Sort all providers by loadPriority (lower number = higher priority)
    const prioritizedProviders = Array.from(this.instances.entries()).sort(
      ([, a], [, b]) => a.loadPriority - b.loadPriority
    );

    // Split providers into local (priority < 100) and remote (priority >= 100)
    const localProviders = prioritizedProviders.filter(
      ([, provider]) => provider.loadPriority < 100
    );
    const remoteProviders = prioritizedProviders.filter(
      ([, provider]) => provider.loadPriority >= 100
    );

    // Load local providers synchronously for immediate display
    for (const [settingsId, instance] of localProviders) {
      try {
        const rawEvents = await instance.getEvents();
        const events = rawEvents.map(([rawEvent, location]) => ({
          event: this.cache!.enhancer.enhance(rawEvent),
          location
        }));

        // Add to results for immediate return
        events.forEach(({ event, location }) => {
          results.push({ event, location, calendarId: settingsId });
        });

        // Don't call callback for local providers - they are handled directly by EventCache
      } catch (e) {
        const source = this.getSource(settingsId);
        console.warn(`Full Calendar: Failed to load local calendar source`, source, e);
      }
    }

    // Load remote providers asynchronously in background
    if (remoteProviders.length > 0) {
      (async () => {
        const promises = remoteProviders.map(async ([settingsId, instance]) => {
          try {
            const rawEvents = await instance.getEvents();
            const events = rawEvents.map(([rawEvent, location]) => ({
              event: this.cache!.enhancer.enhance(rawEvent),
              location
            }));

            // Call callback when this provider completes
            if (onProviderComplete) {
              onProviderComplete(settingsId, events);
            }
          } catch (e) {
            const source = this.getSource(settingsId);
            console.warn(`Full Calendar: Failed to load remote calendar source`, source, e);
          }
        });

        await Promise.all(promises);

        // All remote providers have completed
        if (onAllComplete) {
          onAllComplete();
        }
      })().catch(error => {
        console.error('Full Calendar: Error loading remote calendars:', error);
        // Still call onAllComplete even if there was an error
        if (onAllComplete) {
          onAllComplete();
        }
      });
    } else {
      // No remote providers, trigger completion immediately
      if (onAllComplete) {
        onAllComplete();
      }
    }

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

        // Delegate file relevance check to the provider itself
        const isRelevant = instance.isFileRelevant ? instance.isFileRelevant(file) : false;

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
    new Notice(t('notices.revalidatingRemotes'));

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
        new Notice(t('notices.revalidationFailed'));
        errors.forEach(reason => {
          console.error(`Full Calendar: Revalidation failed.`, reason);
        });
      } else {
        new Notice(t('notices.revalidationSuccess'));
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

    // Use the centralized backlog lifecycle management
    this.syncBacklogManagerLifecycle();

    this.cache.reset();
    await this.cache.populate();
    this.revalidateRemoteCalendars();
    // Note: resync is now triggered automatically by populate's onAllComplete callback
    // when all async providers finish loading, so we don't need to call it here

    // Refresh backlog views if they exist
    if (this.tasksBacklogManager.getIsLoaded()) {
      this.tasksBacklogManager.refreshViews();
    }
  };

  /**
   * Synchronizes the Tasks Backlog Manager lifecycle based on provider availability.
   * This method centralizes the logic for loading/unloading the backlog based on
   * whether any Tasks providers are currently configured.
   */
  public syncBacklogManagerLifecycle(): void {
    // Manage Tasks Backlog view lifecycle based on provider availability
    if (this.hasProviderOfType('tasks')) {
      if (!this.tasksBacklogManager.getIsLoaded()) {
        this.tasksBacklogManager.onload();
      }
    } else {
      if (this.tasksBacklogManager.getIsLoaded()) {
        this.tasksBacklogManager.onunload();
      }
    }
  }

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

  /**
   * The provider-facing entry point for syncing state.
   * Accepts a payload with persistent IDs, translates them to session IDs,
   * and forwards the commands to the EventCache for execution.
   */
  public async processProviderUpdates(
    calendarId: string,
    updates: {
      additions: { event: OFCEvent; location: EventLocation | null }[];
      updates: { persistentId: string; event: OFCEvent; location: EventLocation | null }[];
      deletions: string[];
    }
  ): Promise<void> {
    if (!this.cache) return;

    const { additions, updates: updateArr, deletions } = updates;

    const cachePayload = {
      additions: additions, // Additions don't need translation.
      updates: [] as { sessionId: string; event: OFCEvent; location: EventLocation | null }[],
      deletions: [] as string[]
    };

    // Translate Update persistent IDs to session IDs
    for (const update of updateArr) {
      const globalIdentifier = `${calendarId}::${update.persistentId}`;
      const sessionId = await this.getSessionId(globalIdentifier);
      if (sessionId) {
        cachePayload.updates.push({
          sessionId: sessionId,
          event: update.event,
          location: update.location
        });
      }
    }

    // Translate Deletion persistent IDs to session IDs
    for (const persistentId of deletions) {
      const globalIdentifier = `${calendarId}::${persistentId}`;
      const sessionId = await this.getSessionId(globalIdentifier);
      if (sessionId) {
        cachePayload.deletions.push(sessionId);
      }
    }

    // Forward the translated payload to the EventCache for execution.
    await this.cache.processProviderUpdates(calendarId, cachePayload);
  }

  public getActiveProviders(): CalendarProvider<unknown>[] {
    return Array.from(this.instances.values());
  }

  public hasProviderOfType(type: string): boolean {
    for (const instance of this.instances.values()) {
      if (instance.type === type) {
        return true;
      }
    }
    return false;
  }
}
