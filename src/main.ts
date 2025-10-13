/**
 * @file main.ts
 * @brief Main plugin entry point for Obsidian Full Calendar.
 *
 * @description
 * This file contains the `FullCalendarPlugin` class, which is the primary
 * controller for the entire plugin. It manages the plugin's lifecycle,
 * including loading/unloading, settings management, command registration,
 * and view initialization. It serves as the central hub that wires together
 * the event cache, UI components, and Obsidian's application workspace.
 *
 * @license See LICENSE.md
 */

import { NotificationManager } from './features/notifications/NotificationManager';
import { StatusBarManager } from './features/statusbar/StatusBarManager';
import { LazySettingsTab } from './ui/settings/LazySettingsTab';
import { ensureCalendarIds, migrateAndSanitizeSettings } from './ui/settings/utilsSettings';
import { PLUGIN_SLUG } from './types';
import EventCache from './core/EventCache';
import { toEventInput } from './core/interop';
import { manageTimezone } from './features/Timezone';
import { Notice, Plugin, TFile, App } from 'obsidian';
import { initializeI18n, t } from './features/i18n/i18n';

// Heavy calendar classes are loaded lazily in the initializer map below
import type { CalendarView } from './ui/view';
import { FullCalendarSettings, DEFAULT_SETTINGS } from './types/settings';
import { ProviderRegistry } from './providers/ProviderRegistry';

// Inline the view type constants to avoid loading the heavy view module at startup
const FULL_CALENDAR_VIEW_TYPE = 'full-calendar-view';
const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = 'full-calendar-sidebar-view';

export default class FullCalendarPlugin extends Plugin {
  private _settings: FullCalendarSettings = DEFAULT_SETTINGS;

  notificationManager!: NotificationManager;
  statusBarManager!: StatusBarManager;

  get settings(): FullCalendarSettings {
    return this._settings;
  }

  set settings(newSettings: FullCalendarSettings) {
    this._settings = newSettings;
    // ALWAYS keep the provider registry in sync.
    if (this.providerRegistry) {
      this.providerRegistry.updateSources(this._settings.calendarSources);
    }
  }

  isMobile: boolean = false;
  settingsTab?: LazySettingsTab;
  providerRegistry!: ProviderRegistry;

  // To parse `data.json` file.`
  cache: EventCache = new EventCache(this);

  processFrontmatter = toEventInput;

  /**
   * Activates the Full Calendar view.
   * If a calendar view is already open in a main tab, it focuses that view.
   * Otherwise, it opens a new calendar view in a new tab.
   * This prevents opening multiple duplicate calendar tabs.
   */
  async activateView() {
    const leaves = this.app.workspace
      .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
      .filter(l => (l.view as CalendarView).inSidebar === false);
    if (leaves.length === 0) {
      // if not open in main view, open a new one
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: FULL_CALENDAR_VIEW_TYPE,
        active: true
      });
    } else {
      // if already open, just focus it
      await Promise.all(leaves.map(l => (l.view as CalendarView).onOpen()));
    }
  }

  /**
   * Plugin load lifecycle method.
   * This method is called when the plugin is enabled.
   * It initializes settings, sets up the EventCache, registers the calendar
   * and sidebar views, adds the ribbon icon and commands, and sets up
   * listeners for Vault file changes (create, rename, delete).
   */
  async onload() {
    // Initialize i18n system first, before any UI is rendered
    await initializeI18n(this.app);

    this.isMobile = (this.app as App & { isMobile: boolean }).isMobile;
    this.providerRegistry = new ProviderRegistry(this);

    // Register all built-in providers in one call
    this.providerRegistry.registerBuiltInProviders();

    await this.loadSettings(); // This now handles setting and syncing
    await this.providerRegistry.initializeInstances();

    // Ensure Tasks Backlog view is available immediately if a Tasks calendar exists
    this.providerRegistry.syncBacklogManagerLifecycle();

    await manageTimezone(this);

    // Link the two singletons.
    this.providerRegistry.setCache(this.cache);
    this.providerRegistry.listenForSourceChanges();

    this.cache.reset();
    this.cache.listenForSettingsChanges(this.app.workspace);

    // Start NotificationManager after providerRegistry is initialized
    this.notificationManager = new NotificationManager(this);
    this.notificationManager.update(this.settings);
    this.statusBarManager = new StatusBarManager(this);
    this.statusBarManager.update(this.settings);
    const workspaceEvents = this.app.workspace as unknown as {
      // Keep `any` here because Obsidian's internal event system passes heterogeneous arguments.
      // Localising the unsafeness avoids polluting the rest of the codebase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: (name: string, cb: (...args: any[]) => unknown) => any;
      registerHoverLinkSource?: (id: string, def: { display: string; defaultMod: boolean }) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trigger: (name: string, ...data: any[]) => void;
    };
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        this.notificationManager.update.bind(this.notificationManager)
      )
    );
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        this.statusBarManager.update.bind(this.statusBarManager)
      )
    );
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        this.cache.updateSettings.bind(this.cache)
      )
    );

    // Respond to obsidian events
    this.registerEvent(
      this.app.metadataCache.on('changed', file => {
        this.providerRegistry.handleFileUpdate(file);
      })
    );
    // Ensure TasksPluginProvider subscribes to live updates after layout is ready
    this.app.workspace.onLayoutReady(() => {
      const tasksProvider = this.providerRegistry
        .getActiveProviders()
        .find(p => p.type === 'tasks');
      if (tasksProvider && typeof (tasksProvider as any).initialize === 'function') {
        (tasksProvider as any).initialize();
      }
    });
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) {
          // A rename is a delete at the old path.
          // The 'changed' event will pick up the creation at the new path.
          this.providerRegistry.handleFileDelete(oldPath);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', file => {
        if (file instanceof TFile) {
          this.providerRegistry.handleFileDelete(file.path);
        }
      })
    );

    window.cache = this.cache;

    this.registerView(
      FULL_CALENDAR_VIEW_TYPE,
      leaf => new (require('./ui/view').CalendarView)(leaf, this, false)
    );

    this.registerView(
      FULL_CALENDAR_SIDEBAR_VIEW_TYPE,
      leaf => new (require('./ui/view').CalendarView)(leaf, this, true)
    );

    if (!this.isMobile) {
      // Lazily import the view to avoid loading plotly on mobile.
      import('./chrono_analyser/AnalysisView')
        .then(({ AnalysisView, ANALYSIS_VIEW_TYPE }) => {
          this.registerView(ANALYSIS_VIEW_TYPE, leaf => new AnalysisView(leaf, this));
        })
        .catch(err => {
          console.error('Full Calendar: Failed to load Chrono Analyser view', err);
          new Notice(t('notices.chronoAnalyserLoadFailed'));
        });
    }

    // Register the calendar icon on left-side bar
    this.addRibbonIcon('calendar-glyph', t('ribbon.openCalendar'), async (_: MouseEvent) => {
      await this.activateView();
    });

    this.settingsTab = new LazySettingsTab(this.app, this, this.providerRegistry);
    this.addSettingTab(this.settingsTab);

    // Commands visible in the command palette
    this.addCommand({
      id: 'full-calendar-new-event',
      name: t('commands.newEvent'),
      callback: async () => {
        const { launchCreateModal } = await import('./ui/modals/event_modal');
        launchCreateModal(this, {});
      }
    });
    this.addCommand({
      id: 'full-calendar-reset',
      name: t('commands.resetCache'),
      callback: () => {
        this.cache.reset();
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
        new Notice(t('notices.cacheReset'));
      }
    });
    this.addCommand({
      id: 'full-calendar-revalidate',
      name: t('commands.revalidateRemote'),
      callback: () => {
        this.providerRegistry.revalidateRemoteCalendars(true);
      }
    });
    this.addCommand({
      id: 'full-calendar-open',
      name: t('commands.openCalendar'),
      callback: () => {
        this.activateView();
      }
    });

    if (this.isMobile) {
      this.addCommand({
        id: 'full-calendar-open-analysis-mobile-disabled',
        name: t('commands.openChronoAnalyser'),
        callback: () => {
          new Notice(t('notices.chronoAnalyserMobileDisabled'));
        }
      });
    }

    this.addCommand({
      id: 'full-calendar-open-sidebar',
      name: t('commands.openSidebar'),
      callback: () => {
        if (this.app.workspace.getLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE).length) {
          return;
        }
        const targetLeaf = this.app.workspace.getRightLeaf(false);
        if (targetLeaf) {
          targetLeaf.setViewState({
            type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE
          });
          this.app.workspace.revealLeaf(targetLeaf);
        } else {
          console.warn('Right leaf not found for calendar view!');
        }
      }
    });

    // Register view content on hover
    workspaceEvents.registerHoverLinkSource?.(PLUGIN_SLUG, {
      display: 'Full Calendar',
      defaultMod: true
    });

    this.registerObsidianProtocolHandler('full-calendar-google-auth', async params => {
      if (params.code && params.state) {
        const { exchangeCodeForToken } = await import('./providers/google/auth/auth');
        await exchangeCodeForToken(params.code, params.state, this);
        if (this.settingsTab) {
          await this.settingsTab.display();
        }
      } else {
        new Notice(t('notices.googleAuthFailed'));
        console.error('Google Auth Callback Error: Missing code or state.', params);
      }
    });
  }

  /**
   * Plugin unload lifecycle method.
   * This method is called when the plugin is disabled.
   * It cleans up by detaching all calendar and sidebar views.
   */
  onunload() {
    if (this.notificationManager) {
      this.notificationManager.unload();
    }
    if (this.statusBarManager) {
      this.statusBarManager.unload();
    }
    if (this.providerRegistry) {
      this.providerRegistry.stopListening();
    }
    if (this.cache) {
      this.cache.stopListening();
    }
    // NOTE: Per Obsidian plugin guidelines, do NOT detach leaves of custom views here.
    // Obsidian will handle stale views; detaching in onunload is considered an anti-pattern.
  }

  /**
   * Loads plugin settings from disk, merging them with default values.
   */
  async loadSettings() {
    let loadedData = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // All migration and sanitization logic is now encapsulated in this utility function.
    const { settings: migratedSettings, needsSave } = migrateAndSanitizeSettings(loadedData);

    this.settings = migratedSettings;
    this.cache.enhancer.updateSettings(this.settings);

    // Save back to disk if any migration or sanitization occurred.
    if (needsSave) {
      new Notice(t('notices.settingsUpdated'));
      await this.saveData(this.settings);
    }
  }

  /**
   * Saves the current plugin settings to disk.
   * After saving, it triggers a reset and repopulation of the event cache
   * to ensure all calendars are using the new settings.
   */
  async saveSettings() {
    // Deep copy of settings BEFORE any modifications.
    const oldSettings = JSON.parse(JSON.stringify(this.settings));

    // Create a mutable copy to work with.
    const newSettings = { ...this.settings };

    // Sanitize calendar sources before saving to ensure all have IDs.
    const { sources } = ensureCalendarIds(newSettings.calendarSources);
    newSettings.calendarSources = sources;

    // Now, assign the fully-corrected settings object in one go.
    // This triggers the setter ONCE with the final, valid data.
    this.settings = newSettings;

    await this.saveData(this.settings);

    // Publish general settings update event for all subscribers
    this.app.workspace.trigger('full-calendar:settings-updated', this.settings);

    // Compare old and new settings to determine which specific events to publish.
    const newSourcesString = JSON.stringify(this.settings.calendarSources);
    const oldSourcesString = JSON.stringify(oldSettings.calendarSources);

    if (newSourcesString !== oldSourcesString) {
      this.app.workspace.trigger('full-calendar:sources-changed');
    }

    const viewSettingsChanged =
      oldSettings.firstDay !== this.settings.firstDay ||
      oldSettings.timeFormat24h !== this.settings.timeFormat24h ||
      JSON.stringify(oldSettings.initialView) !== JSON.stringify(this.settings.initialView) ||
      oldSettings.activeWorkspace !== this.settings.activeWorkspace ||
      JSON.stringify(oldSettings.businessHours) !== JSON.stringify(this.settings.businessHours) ||
      oldSettings.enableAdvancedCategorization !== this.settings.enableAdvancedCategorization ||
      JSON.stringify(oldSettings.categorySettings) !==
        JSON.stringify(this.settings.categorySettings);

    if (viewSettingsChanged) {
      this.app.workspace.trigger('full-calendar:view-config-changed');
    }

    // This manual call is now redundant and will be removed.
    // if (this.notificationManager) {
    //   this.notificationManager.update(this.settings);
    // }
  }

  /**
   * Performs a non-blocking iteration over a list of files to apply a processor function.
   * Shows a progress notice to the user.
   * @param files The array of TFile objects to process.
   * @param processor The async function to apply to each file.
   * @param description A description of the operation for the notice.
   */
  async nonBlockingProcess(
    files: TFile[],
    processor: (file: TFile) => Promise<void>,
    description: string
  ) {
    const BATCH_SIZE = 10;
    let index = 0;
    const notice = new Notice('', 0); // Indefinite notice

    const processBatch = () => {
      // End condition
      if (index >= files.length) {
        notice.hide();
        // The calling function will show the final completion notice.
        return;
      }

      notice.setMessage(`${description}: ${index}/${files.length}`);
      const batch = files.slice(index, index + BATCH_SIZE);

      Promise.all(batch.map(processor))
        .then(() => {
          index += BATCH_SIZE;
          // Yield to the main thread before processing the next batch
          setTimeout(processBatch, 20);
        })
        .catch(err => {
          console.error('Error during bulk processing batch', err);
          notice.hide();
          new Notice(t('notices.bulkUpdateError'));
        });
    };

    processBatch();
  }
}
