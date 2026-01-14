/**
 * @file SettingsTab.tsx
 * @brief Implements the Full Calendar plugin's settings tab UI for Obsidian.
 *
 * @description
 * This file defines the `FullCalendarSettingTab` class, which extends Obsidian's
 * `PluginSettingTab`. It acts as an orchestrator, calling dedicated rendering
 * modules for each section of the settings UI and managing the top-level view
 * state (e.g., switching between main settings and the full changelog).
 *
 * @exports FullCalendarSettingTab
 * @exports ensureCalendarIds
 *
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../main';
import {
  App,
  DropdownComponent,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  Modal
} from 'obsidian';

import ReactModal from '../ReactModal';
import * as ReactDOM from 'react-dom/client';
import { createElement, createRef } from 'react';

import { CalendarSettingsRef } from './sections/calendars/CalendarSetting';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { CalendarInfo } from '../../types/calendar_settings';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { makeDefaultPartialCalendarSource } from '../../types/calendar_settings';

import { generateCalendarId } from '../../types/calendar_settings';
import { t } from '../../features/i18n/i18n';

// Import the new React components
import './changelogs/changelog.css';

export function addCalendarButton(
  plugin: FullCalendarPlugin,
  containerEl: HTMLElement,
  submitCallback: (setting: CalendarInfo) => void,
  listUsedDirectories?: () => string[]
) {
  let dropdown: DropdownComponent;
  const directories = plugin.app.vault
    .getAllLoadedFiles()
    .filter(f => f instanceof TFolder)
    .map(f => f.path);

  return new Setting(containerEl)
    .setName(t('settings.calendars.title'))
    .setDesc(t('settings.calendars.addCalendar'))
    .addDropdown(
      d =>
        (dropdown = d.addOptions({
          local: t('settings.calendars.types.local'),
          dailynote: t('settings.calendars.types.dailynote'),
          icloud: t('settings.calendars.types.icloud'),
          caldav: t('settings.calendars.types.caldav'),
          ical: t('settings.calendars.types.ical'),
          google: t('settings.calendars.types.google'),
          tasks: t('settings.calendars.types.tasks'),
          bases: t('settings.calendars.types.bases')
        }))
    )
    .addExtraButton(button => {
      button.setTooltip(t('settings.calendars.addCalendarTooltip'));
      button.setIcon('plus-with-circle');
      button.onClick(async () => {
        const sourceType = dropdown.getValue();

        if (sourceType === 'bases') {
          const app = plugin.app as any;
          const basesPlugin =
            app.internalPlugins?.getPluginById('bases') || app.plugins?.getPlugin('bases');
          if (!basesPlugin) {
            new Notice(t('settings.calendars.notices.enableBases'));
            return;
          }
        }

        const providerType = sourceType === 'icloud' ? 'caldav' : sourceType;

        const providerClass = await plugin.providerRegistry.getProviderForType(providerType);
        if (!providerClass) {
          new Notice(t('notices.providerNotRegistered', { providerType }));
          return;
        }
        // Provider classes expose a static getConfigurationComponent; keep a loose unknown cast locally.
        const ConfigComponent = (
          providerClass as unknown as {
            // Providers expose a static method returning a React component.
            getConfigurationComponent(): React.ComponentType<Record<string, unknown>>;
          }
        ).getConfigurationComponent();

        let modal = new ReactModal(plugin.app, async () => {
          await plugin.loadSettings();

          const usedDirectories = listUsedDirectories ? listUsedDirectories() : [];
          const directories = plugin.app.vault
            .getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .map(f => f.path);

          let headings: string[] = [];
          let { template } = getDailyNoteSettings();
          if (template) {
            if (!template.endsWith('.md')) template += '.md';
            const file = plugin.app.vault.getAbstractFileByPath(template);
            if (file instanceof TFile) {
              headings =
                plugin.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
            }
          }

          const existingCalendarColors = plugin.settings.calendarSources.map(s => s.color);

          const initialConfig = sourceType === 'icloud' ? { url: 'https://caldav.icloud.com' } : {};

          // Base props for all provider components
          // Minimal shared config component props; provider-specific components can accept additional fields.
          interface BaseConfigProps {
            plugin: FullCalendarPlugin;
            config: Record<string, unknown>;
            context: {
              allDirectories: string[];
              usedDirectories: string[];
              headings: string[];
            };
            onClose: () => void;
            onConfigChange: (c: unknown) => void;
            onSave: (finalConfigs: unknown | unknown[], accountId?: string) => void;
          }
          const componentProps: BaseConfigProps = {
            plugin: plugin, // Pass plugin for GoogleConfigComponent
            config: initialConfig,
            context: {
              allDirectories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
              usedDirectories: usedDirectories,
              headings: headings
            },
            onClose: () => modal.close(),
            onConfigChange: () => {},
            onSave: async (finalConfigs: unknown | unknown[], accountId?: string) => {
              const configs = Array.isArray(finalConfigs) ? finalConfigs : [finalConfigs];
              const existingIds = plugin.settings.calendarSources.map(s => s.id);

              for (const finalConfigRaw of configs) {
                const finalConfig = finalConfigRaw as Record<string, unknown>;

                const newSettingsId = generateCalendarId(
                  providerType as CalendarInfo['type'],
                  existingIds
                );
                existingIds.push(newSettingsId);

                const partialSource = makeDefaultPartialCalendarSource(
                  providerType as CalendarInfo['type'],
                  existingCalendarColors
                );

                // Create the full, valid CalendarInfo object first.
                const finalSource = {
                  ...partialSource,
                  ...finalConfig,
                  id: newSettingsId,
                  ...(accountId && { googleAccountId: accountId }),
                  // For Google, the config's 'id' is the calendarId for the API.
                  ...(providerType === 'google' && { calendarId: finalConfig.id as string })
                } as CalendarInfo;

                // Add the provider instance to the registry BEFORE updating the UI.
                await plugin.providerRegistry.addInstance(finalSource);

                // Now, submit the complete source to the React component.
                submitCallback(finalSource);
                existingCalendarColors.push(finalSource.color as string);
              }
              modal.close();
            }
          };

          return createElement(
            ConfigComponent,
            componentProps as unknown as Record<string, unknown>
          );
        });
        modal.open();
      });
    });
}

export class FullCalendarSettingTab extends PluginSettingTab {
  plugin: FullCalendarPlugin;
  private showFullChangelog = false;
  private calendarSettingsRef: React.RefObject<CalendarSettingsRef | null> =
    createRef<CalendarSettingsRef>();
  registry: ProviderRegistry;

  constructor(app: App, plugin: FullCalendarPlugin, registry: ProviderRegistry) {
    super(app, plugin);
    this.plugin = plugin;
    this.registry = registry;
  }

  async display(): Promise<void> {
    this.containerEl.empty();
    if (this.showFullChangelog) {
      await this._renderFullChangelog(); // This now handles its own async rendering
    } else {
      await this._renderMainSettings();
    }
  }

  public showChangelog(): void {
    this.showFullChangelog = true;
    this.display();
  }

  private async _renderFullChangelog(): Promise<void> {
    const root = ReactDOM.createRoot(this.containerEl);
    const { Changelog } = await import('./changelogs/Changelog');
    root.render(
      createElement(Changelog, {
        onBack: () => {
          this.showFullChangelog = false;
          this.display();
        }
      })
    );
  }

  private async _renderMainSettings(): Promise<void> {
    // Defer loading of heavy settings sections
    const [
      renderGeneralSettings,
      renderAppearanceSettings,
      renderWorkspaceSettings,
      renderCategorizationSettings,
      renderWhatsNew,
      renderCalendarManagement,
      renderGoogleSettings,
      renderRemindersSettings,
      renderFooter
    ] = await Promise.all([
      import('./sections/renderGeneral').then(m => m.renderGeneralSettings),
      import('./sections/renderAppearance').then(m => m.renderAppearanceSettings),
      import('../../features/workspaces/ui/renderWorkspaces').then(m => m.renderWorkspaceSettings),
      import('../../features/category/ui/renderCategorization').then(
        m => m.renderCategorizationSettings
      ),
      import('./changelogs/renderWhatsNew').then(m => m.renderWhatsNew),
      import('./sections/renderCalendars').then(m => m.renderCalendarManagement),
      import('../../providers/google/ui/renderGoogle').then(m => m.renderGoogleSettings),
      import('../../features/notifications/ui/renderReminders').then(
        m => m.renderRemindersSettings
      ),
      import('./sections/calendars/renderFooter').then(m => m.renderFooter)
    ]);

    renderGeneralSettings(this.containerEl, this.plugin, () => this.display());
    renderAppearanceSettings(this.containerEl, this.plugin, () => this.display());
    renderRemindersSettings(this.containerEl, this.plugin, () => this.display());
    renderWorkspaceSettings(this.containerEl, this.plugin, () => this.display());
    renderCategorizationSettings(this.containerEl, this.plugin, () => this.display());
    renderWhatsNew(this.containerEl, () => {
      this.showFullChangelog = true;
      this.display();
    });
    renderCalendarManagement(
      this.containerEl,
      this.plugin,
      this.calendarSettingsRef as unknown as React.RefObject<CalendarSettingsRef>
    );
    renderGoogleSettings(this.containerEl, this.plugin, () => this.display());
    this._renderInitialSetupNotice();
    renderFooter(this.containerEl);
  }

  private _renderInitialSetupNotice(): void {
    if (this.plugin.settings.calendarSources.length === 0) {
      const notice = this.containerEl.createDiv('full-calendar-initial-setup-notice');
      notice.createEl('h2', { text: t('settings.quickStart.title') });
      notice.createEl('p', {
        text: t('settings.quickStart.description')
      });
    }
  }
}

// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.
// settings module (and React) during plugin startup. Keep imports above.
// These functions remain pure and outside the class.

// ensureCalendarIds and sanitizeInitialView moved to ./utils to avoid loading this heavy
// settings module (and React) during plugin startup. Keep imports above.
// settings module (and React) during plugin startup. Keep imports above.
