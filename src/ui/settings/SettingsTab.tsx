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
import { importCalendars } from '../../calendars/parsing/caldav/import';
import { AddCalendarSource } from '../modals/components/AddCalendarSource';
import { fetchGoogleCalendarList } from '../../calendars/parsing/google/api';
import { makeDefaultPartialCalendarSource, CalendarInfo } from '../../types/calendar_settings';

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
import { Changelog } from './components/Changelog';
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

        if (sourceType === 'google') {
          if (!plugin.settings.googleAuth?.refreshToken) {
            new Notice('Please connect your Google Account first.');
            return;
          }

          try {
            const calendars = await fetchGoogleCalendarList(plugin);
            new SelectGoogleCalendarsModal(plugin, calendars, selected => {
              selected.forEach(cal => submitCallback(cal));
            }).open();
          } catch (e: any) {
            new Notice(`Error fetching calendar list: ${e.message}`);
            console.error(e);
          }
          return;
        }

        let modal = new ReactModal(plugin.app, async () => {
          await plugin.loadSettings();
          const usedDirectories = (
            listUsedDirectories
              ? listUsedDirectories
              : () =>
                  plugin.settings.calendarSources
                    .map((s: CalendarInfo) => s.type === 'local' && s.directory)
                    .filter((s): s is string => !!s)
          )();
          let headings: string[] = [];
          let { template } = getDailyNoteSettings();

          if (template) {
            if (!template.endsWith('.md')) {
              template += '.md';
            }
            const file = plugin.app.vault.getAbstractFileByPath(template);
            if (file instanceof TFile) {
              headings =
                plugin.app.metadataCache.getFileCache(file)?.headings?.map(h => h.heading) || [];
            }
          }

          const existingCalendarColors = plugin.settings.calendarSources.map(s => s.color);

          return createElement(AddCalendarSource, {
            source: makeDefaultPartialCalendarSource(
              dropdown.getValue() as CalendarInfo['type'],
              existingCalendarColors
            ),
            directories: directories.filter(dir => usedDirectories.indexOf(dir) === -1),
            headings,
            submit: async (source: CalendarInfo) => {
              if (source.type === 'caldav') {
                try {
                  const existingIds = plugin.settings.calendarSources.map(s => s.id);
                  let sources = await importCalendars(
                    {
                      type: 'basic',
                      username: source.username,
                      password: source.password
                    },
                    source.url,
                    existingIds
                  );
                  sources.forEach(source => submitCallback(source));
                } catch (e) {
                  if (e instanceof Error) {
                    new Notice(e.message);
                  }
                }
              } else {
                submitCallback(source);
              }
              modal.close();
            }
          });
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

  constructor(app: App, plugin: FullCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    if (this.showFullChangelog) {
      this._renderFullChangelog();
    } else {
      this._renderMainSettings();
    }
  }

  private _renderFullChangelog(): void {
    const root = ReactDOM.createRoot(this.containerEl);
    root.render(
      createElement(Changelog, {
        onBack: () => {
          this.showFullChangelog = false;
          this.display();
        }
      })
    );
  }

  private _renderMainSettings(): void {
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

class SelectGoogleCalendarsModal extends Modal {
  plugin: FullCalendarPlugin;
  calendars: any[];
  onSubmit: (selected: CalendarInfo[]) => void;
  googleCalendarSelection: Set<string>;

  constructor(
    plugin: FullCalendarPlugin,
    calendars: any[],
    onSubmit: (selected: CalendarInfo[]) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.calendars = calendars;
    this.onSubmit = onSubmit;
    this.googleCalendarSelection = new Set();
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Select Google Calendars to Add' });

    const existingGoogleCalendarIds = new Set(
      this.plugin.settings.calendarSources
        .filter(s => s.type === 'google')
        .map(s => (s as Extract<CalendarInfo, { type: 'google' }>).id)
    );

    this.calendars.forEach(cal => {
      if (!cal.id || existingGoogleCalendarIds.has(cal.id)) {
        return;
      }

      new Setting(contentEl)
        .setName(cal.summary || cal.id)
        .setDesc(cal.description || '')
        .addToggle(toggle =>
          toggle.onChange(value => {
            if (value) {
              this.googleCalendarSelection.add(cal.id);
            } else {
              this.googleCalendarSelection.delete(cal.id);
            }
          })
        );
    });

    new Setting(contentEl).addButton(button =>
      button
        .setButtonText('Add Selected Calendars')
        .setCta()
        .onClick(() => {
          const existingColors = this.plugin.settings.calendarSources.map(s => s.color);

          const selectedCalendars = this.calendars
            .filter(cal => this.googleCalendarSelection.has(cal.id))
            .map(cal => {
              const newColor = getNextColor(existingColors);
              existingColors.push(newColor);

              const newCalendar: Extract<CalendarInfo, { type: 'google' }> = {
                type: 'google',
                id: cal.id,
                name: cal.summary,
                color: cal.backgroundColor || newColor
              };
              return newCalendar;
            });

          this.onSubmit(selectedCalendars);
          this.close();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
