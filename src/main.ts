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

import { NotificationManager } from './features/NotificationManager'; // ADD THIS IMPORT
import { LazySettingsTab } from './ui/settings/LazySettingsTab';
import {
  ensureCalendarIds,
  sanitizeInitialView,
  migrateAndSanitizeSettings
} from './ui/settings/utilsSettings';
import { PLUGIN_SLUG } from './types';
import EventCache from './core/EventCache';
import { toEventInput } from './core/interop';
import { renderCalendar } from './ui/calendar';
import { manageTimezone } from './features/Timezone';
import { Notice, Plugin, TFile, App } from 'obsidian';

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

  renderCalendar = renderCalendar;
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
    this.isMobile = (this.app as App & { isMobile: boolean }).isMobile;
    this.providerRegistry = new ProviderRegistry(this);

    // Register all built-in providers in one call
    this.providerRegistry.registerBuiltInProviders();

    await this.loadSettings(); // This now handles setting and syncing
    await this.providerRegistry.initializeInstances();

    await manageTimezone(this);

    // Link the two singletons.
    this.providerRegistry.setCache(this.cache);

    this.cache.reset();

    // ADD: Start NotificationManager after providerRegistry is initialized
    this.notificationManager = new NotificationManager(this);
    this.notificationManager.update(this.settings);

    // Respond to obsidian events
    this.registerEvent(
      this.app.metadataCache.on('changed', file => {
        this.providerRegistry.handleFileUpdate(file);
      })
    );
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

    // @ts-ignore
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
          new Notice('Failed to load Chrono Analyser. Please check the console.');
        });
    }

    // Register the calendar icon on left-side bar
    this.addRibbonIcon('calendar-glyph', 'Open Full Calendar', async (_: MouseEvent) => {
      await this.activateView();
    });

    this.settingsTab = new LazySettingsTab(this.app, this, this.providerRegistry);
    this.addSettingTab(this.settingsTab);

    // Commands visible in the command palette
    this.addCommand({
      id: 'full-calendar-new-event',
      name: 'New Event',
      callback: async () => {
        const { launchCreateModal } = await import('./ui/event_modal');
        launchCreateModal(this, {});
      }
    });
    this.addCommand({
      id: 'full-calendar-reset',
      name: 'Reset Event Cache',
      callback: () => {
        this.cache.reset();
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
        new Notice('Full Calendar has been reset.');
      }
    });
    this.addCommand({
      id: 'full-calendar-revalidate',
      name: 'Revalidate remote calendars',
      callback: () => {
        this.providerRegistry.revalidateRemoteCalendars(true);
      }
    });
    this.addCommand({
      id: 'full-calendar-open',
      name: 'Open Calendar',
      callback: () => {
        this.activateView();
      }
    });

    if (this.isMobile) {
      this.addCommand({
        id: 'full-calendar-open-analysis-mobile-disabled',
        name: 'Open Chrono Analyser (Desktop Only)',
        callback: () => {
          new Notice(
            'The Chrono Analyser feature is only available on the desktop version of Obsidian.'
          );
        }
      });
    }

    this.addCommand({
      id: 'full-calendar-open-sidebar',
      name: 'Open in sidebar',
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
    (this.app.workspace as any).registerHoverLinkSource(PLUGIN_SLUG, {
      display: 'Full Calendar',
      defaultMod: true
    });

    this.registerObsidianProtocolHandler('full-calendar-google-auth', async params => {
      if (params.code && params.state) {
        const { exchangeCodeForToken } = await import('./providers/google/auth');
        await exchangeCodeForToken(params.code, params.state, this);
        if (this.settingsTab) {
          await this.settingsTab.display();
        }
      } else {
        new Notice('Google authentication failed. Please try again.');
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
    this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
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
      new Notice('Full Calendar has updated your calendar settings to a new format.');
      await this.saveData(this.settings);
    }
  }

  /**
   * Saves the current plugin settings to disk.
   * After saving, it triggers a reset and repopulation of the event cache
   * to ensure all calendars are using the new settings.
   */
  async saveSettings() {
    // Create a mutable copy to work with.
    const newSettings = { ...this.settings };

    // Sanitize calendar sources before saving to ensure all have IDs.
    const { sources } = ensureCalendarIds(newSettings.calendarSources);
    newSettings.calendarSources = sources;

    // Now, assign the fully-corrected settings object in one go.
    // This triggers the setter ONCE with the final, valid data.
    this.settings = newSettings;

    await this.saveData(this.settings);
    if (this.notificationManager) {
      this.notificationManager.update(this.settings);
    }

    // Any change from the settings tab that adds/removes a calendar
    // requires a full reset of the cache and providers.
    this.cache.reset();
    await this.cache.populate();
    this.providerRegistry.revalidateRemoteCalendars();
    this.cache.resync(); // Finally, update the views with the new data.
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
          new Notice('Error during bulk update. Check console for details.');
        });
    };

    processBatch();
  }
}
