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

import { getNextColor } from '../colors';
import { CalendarSettingsRef } from './components/CalendarSetting';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { CalendarInfo } from '../../types/calendar_settings';
import { ProviderRegistry } from '../../providers/ProviderRegistry';
import { makeDefaultPartialCalendarSource } from '../../types/calendar_settings';

// Import the new section renderers
import { renderGoogleSettings } from './sections/renderGoogle';
import { renderGeneralSettings } from './sections/renderGeneral';
import { renderCalendarManagement } from './sections/renderCalendars';
import { renderCategorizationSettings } from './sections/renderCategorization';
import { renderAppearanceSettings } from './sections/renderAppearance';
import { renderWorkspaceSettings } from './sections/renderWorkspaces';

// Import the new React components
import './changelog.css';
import { renderFooter } from './components/renderFooter';
import { renderWhatsNew } from './sections/renderWhatsNew';

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
    .setName('Calendars')
    .setDesc('Add calendar')
    .addDropdown(
      d =>
        (dropdown = d.addOptions({
          local: 'Full note',
          dailynote: 'Daily Note',
          icloud: 'iCloud',
          caldav: 'CalDAV',
          ical: 'Remote (.ics format)',
          google: 'Google Calendar'
        }))
    )
    .addExtraButton(button => {
      button.setTooltip('Add Calendar');
      button.setIcon('plus-with-circle');
      button.onClick(async () => {
        const sourceType = dropdown.getValue();
        const providerType = sourceType === 'icloud' ? 'caldav' : sourceType;

        const providerClass = await plugin.providerRegistry.getProviderForType(providerType);
        if (!providerClass) {
          new Notice(`${providerType} provider is not registered.`);
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
            onSave: (finalConfigs: unknown | unknown[], accountId?: string) => {
              const configs = Array.isArray(finalConfigs) ? finalConfigs : [finalConfigs];

              configs.forEach(finalConfigRaw => {
                const finalConfig = finalConfigRaw as Record<string, unknown> & {
                  id?: string;
                  color?: string;
                  name?: string;
                };
                const partialSource = makeDefaultPartialCalendarSource(
                  providerType as CalendarInfo['type'],
                  existingCalendarColors
                );
                const finalSource = {
                  ...partialSource,
                  ...finalConfig,
                  color: finalConfig.color || partialSource.color,
                  name: finalConfig.name,
                  ...(accountId && { googleAccountId: accountId }),
                  calendarId: finalConfig.id as string
                };
                delete (finalSource as { id?: string }).id;
                submitCallback(finalSource as unknown as CalendarInfo);
                existingCalendarColors.push(finalSource.color as string);
              });
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

  private async _renderFullChangelog(): Promise<void> {
    const root = ReactDOM.createRoot(this.containerEl);
    const { Changelog } = await import('./components/Changelog');
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
      renderFooter
    ] = await Promise.all([
      import('./sections/renderGeneral').then(m => m.renderGeneralSettings),
      import('./sections/renderAppearance').then(m => m.renderAppearanceSettings),
      import('./sections/renderWorkspaces').then(m => m.renderWorkspaceSettings),
      import('./sections/renderCategorization').then(m => m.renderCategorizationSettings),
      import('./sections/renderWhatsNew').then(m => m.renderWhatsNew),
      import('./sections/renderCalendars').then(m => m.renderCalendarManagement),
      import('./sections/renderGoogle').then(m => m.renderGoogleSettings),
      import('./components/renderFooter').then(m => m.renderFooter)
    ]);

    renderGeneralSettings(this.containerEl, this.plugin, () => this.display());
    renderAppearanceSettings(this.containerEl, this.plugin, () => this.display());
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
      notice.createEl('h2', { text: 'Quick Start: Add Your First Calendar' });
      notice.createEl('p', {
        text: 'To begin, add a calendar source using the "+" button in the "Manage calendars" section.'
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
